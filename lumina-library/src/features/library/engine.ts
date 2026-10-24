import type {
  Book,
  BookStatus,
  LibraryConfig,
  LibraryData,
  Loan,
  Member,
  Reservation,
} from '@/types'
import { addDaysISO, daysUntil, nowISO, overdueDays, overdueDaysAt } from '@/lib/dateUtils'

export type AvailabilityState = 'available' | 'limited' | 'unavailable' | 'archived'

export interface Availability {
  total: number
  available: number
  onLoan: number
  reserved: number
  state: AvailabilityState
}

export type OperationResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export const ok = <T>(value: T): OperationResult<T> => ({ ok: true, value })
export const fail = (error: string): OperationResult<never> => ({ ok: false, error })

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

export function activeLoansForBook(loans: Loan[], bookId: string, status: BookStatus = 'active'): Loan[] {
  void status
  return loans.filter((loan) => loan.bookId === bookId && loan.status === 'active')
}

export function getAvailability(book: Book, data: LibraryData): Availability {
  const total = Math.max(1, book.totalCopies)
  const onLoan = activeLoansForBook(data.loans, book.id).length
  const available = Math.max(0, total - onLoan)
  const reserved = data.reservations.filter(
    (r) => r.bookId === book.id && (r.status === 'pending' || r.status === 'ready'),
  ).length
  let state: AvailabilityState
  if (book.status === 'archived') state = 'archived'
  else if (available === 0) state = 'unavailable'
  else if (available <= Math.max(1, Math.floor(total * 0.34))) state = 'limited'
  else state = 'available'
  return { total, available, onLoan, reserved, state }
}

export function getAvailableCopies(book: Book, data: LibraryData): number {
  return getAvailability(book, data).available
}

/* -------------------------------------------------------------------------- */
/* Loans and fines                                                            */
/* -------------------------------------------------------------------------- */

export function isLoanOverdue(loan: Loan): boolean {
  if (loan.status !== 'active') return false
  return overdueDays(loan.dueAt) > 0
}

/** Fine accrued so far for an active loan, or the recorded fine for a returned loan. */
export function loanFine(loan: Loan, config: LibraryConfig): number {
  if (loan.status === 'returned') return loan.fineAmount ?? 0
  const days = overdueDays(loan.dueAt)
  return days * config.finePerDay
}

export function loanFineAtReturn(loan: Loan, returnedAt: string, config: LibraryConfig): number {
  return overdueDaysAt(loan.dueAt, returnedAt) * config.finePerDay
}

export function memberActiveLoans(data: LibraryData, memberId: string): Loan[] {
  return data.loans.filter((loan) => loan.memberId === memberId && loan.status === 'active')
}

export function memberLoanHistory(data: LibraryData, memberId: string): Loan[] {
  return data.loans.filter((loan) => loan.memberId === memberId)
}

/** Simulated, unpaid demo fine balance for a member (accrued + recorded on return). */
export function memberOutstandingFines(data: LibraryData, memberId: string): number {
  return memberLoanHistory(data, memberId)
    .filter((loan) => loan.status === 'active' || (loan.fineAmount ?? 0) > 0)
    .reduce((total, loan) => total + loanFine(loan, data.config), 0)
}

export function memberBorrowLimit(member: Member, config: LibraryConfig): number {
  if (member.borrowingLimit && member.borrowingLimit > 0) return member.borrowingLimit
  return member.role === 'student' ? config.studentBorrowLimit : config.staffBorrowLimit
}

export function canIssue(data: LibraryData, book: Book, member: Member): OperationResult<void> {
  if (book.status === 'archived') return fail('Archived titles cannot be issued. Restore the title first.')
  if (member.status !== 'active') return fail('This membership is inactive. Reactivate it before issuing.')
  if (getAvailableCopies(book, data) <= 0)
    return fail('No copies available right now. Place a reservation instead.')

  const limit = memberBorrowLimit(member, data.config)
  const active = memberActiveLoans(data, member.id)
  if (active.length >= limit)
    return fail(`Borrowing limit reached — ${limit} of ${limit} books are already on loan for this member.`)

  if (active.some((loan) => loan.bookId === book.id))
    return fail('This member already has a copy of this title on loan.')

  if (data.config.blockIssueOnUnpaidFines) {
    const fines = memberOutstandingFines(data, member.id)
    if (fines >= data.config.fineBlockThreshold)
      return fail(
        `Outstanding demo fines (₹${fines}) exceed the ₹${data.config.fineBlockThreshold} block threshold.`,
      )
  }
  return ok(undefined)
}

export function canRenew(data: LibraryData, loan: Loan): OperationResult<void> {
  if (loan.status !== 'active') return fail('Returned loans cannot be renewed.')
  if (loan.renewals >= data.config.maxRenewals)
    return fail(`Renewal limit reached — this loan has already been renewed ${loan.renewals} time(s).`)
  if (overdueDays(loan.dueAt) > 0)
    return fail('Overdue loans must be returned before they can be renewed.')

  const waiting = data.reservations.filter(
    (r) => r.bookId === loan.bookId && r.memberId !== loan.memberId && (r.status === 'pending' || r.status === 'ready'),
  )
  if (waiting.length > 0)
    return fail('Another member is waiting for this title, so this loan cannot be renewed.')
  return ok(undefined)
}

/* -------------------------------------------------------------------------- */
/* Reservations                                                               */
/* -------------------------------------------------------------------------- */

export const ACTIVE_RESERVATION_STATUSES: Reservation['status'][] = ['pending', 'ready']

export function isReservationActive(reservation: Reservation): boolean {
  return ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
}

export function activeReservationsFor(data: LibraryData, memberId?: string): Reservation[] {
  return data.reservations.filter(
    (r) => isReservationActive(r) && (!memberId || r.memberId === memberId),
  )
}

export function canReserve(data: LibraryData, book: Book, member: Member): OperationResult<void> {
  if (book.status === 'archived') return fail('Archived titles cannot be reserved.')
  if (member.status !== 'active') return fail('Only active memberships can place reservations.')
  const duplicate = data.reservations.find(
    (r) => r.bookId === book.id && r.memberId === member.id && isReservationActive(r),
  )
  if (duplicate) return fail('You already have an active reservation for this title.')
  const alreadyBorrowed = memberActiveLoans(data, member.id).some((loan) => loan.bookId === book.id)
  if (alreadyBorrowed) return fail('You already have this title on loan.')
  return ok(undefined)
}

/** 1-based queue position among active reservations for a title (ready holds count ahead). */
export function reservationQueuePosition(data: LibraryData, reservation: Reservation): number {
  const queue = data.reservations
    .filter((r) => r.bookId === reservation.bookId && isReservationActive(r))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ready' ? -1 : 1
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  const index = queue.findIndex((r) => r.id === reservation.id)
  return index < 0 ? 0 : index + 1
}

/**
 * Reservation policy (documented for the demo):
 * 1. A ready hold that passes its expiry date becomes `expired`.
 * 2. While a title has free copies, the oldest pending hold is promoted to `ready`
 *    with a hold window of `config.reservationHoldDays`.
 * 3. A `ready` hold is fulfilled when the member borrows that title.
 */
export function advanceReservations(data: LibraryData): {
  reservations: Reservation[]
  changed: { reservation: Reservation; event: 'ready' | 'expired' }[]
} {
  const now = nowISO()
  const changed: { reservation: Reservation; event: 'ready' | 'expired' }[] = []

  let reservations = data.reservations.map((reservation) => {
    if (reservation.status === 'ready' && reservation.expiresAt && reservation.expiresAt < now) {
      const expired: Reservation = { ...reservation, status: 'expired' }
      changed.push({ reservation: expired, event: 'expired' })
      return expired
    }
    return reservation
  })

  const activeState: LibraryData = { ...data, reservations }
  for (const book of data.books) {
    const availability = getAvailability(book, activeState)
    const readyForBook = () =>
      reservations.filter((r) => r.bookId === book.id && r.status === 'ready').length
    let slots = availability.available - readyForBook()
    if (slots <= 0) continue

    const pending = reservations
      .filter((r) => r.bookId === book.id && r.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    for (const reservation of pending) {
      if (slots <= 0) break
      slots -= 1
      const ready: Reservation = {
        ...reservation,
        status: 'ready',
        readyAt: now,
        expiresAt: addDaysISO(now, data.config.reservationHoldDays),
      }
      reservations = reservations.map((r) => (r.id === reservation.id ? ready : r))
      changed.push({ reservation: ready, event: 'ready' })
    }
  }

  return { reservations, changed }
}

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                 */
/* -------------------------------------------------------------------------- */

export interface LibraryStats {
  totalCopies: number
  totalTitles: number
  activeTitles: number
  archivedTitles: number
  totalMembers: number
  activeMembers: number
  students: number
  activeLoans: number
  overdueLoans: number
  dueToday: number
  dueSoon: number
  availableCopies: number
  pendingReservations: number
  readyReservations: number
  outstandingFines: number
  returnedLoans: number
  onTimeReturns: number
  categoryCounts: { category: string; titles: number; copies: number }[]
  utilisation: number
}

export function getLibraryStats(data: LibraryData): LibraryStats {
  const activeBooks = data.books.filter((b) => b.status === 'active')
  const totalCopies = activeBooks.reduce((sum, book) => sum + book.totalCopies, 0)
  const activeLoans = data.loans.filter((loan) => loan.status === 'active')
  const onLoan = activeLoans.length
  const overdueLoans = activeLoans.filter(isLoanOverdue)
  const dueToday = activeLoans.filter((loan) => daysUntil(loan.dueAt) === 0)
  const dueSoon = activeLoans.filter((loan) => {
    const days = daysUntil(loan.dueAt)
    return days >= 1 && days <= 3
  })

  const categoryMap = new Map<string, { titles: number; copies: number }>()
  for (const book of activeBooks) {
    const entry = categoryMap.get(book.category) ?? { titles: 0, copies: 0 }
    entry.titles += 1
    entry.copies += book.totalCopies
    categoryMap.set(book.category, entry)
  }

  const returned = data.loans.filter((loan) => loan.status === 'returned')
  const onTimeReturns = returned.filter((loan) => (loan.fineAmount ?? 0) === 0).length

  const outstandingFines = data.members.reduce(
    (sum, member) => sum + memberOutstandingFines(data, member.id),
    0,
  )

  return {
    totalCopies,
    totalTitles: data.books.length,
    activeTitles: activeBooks.length,
    archivedTitles: data.books.length - activeBooks.length,
    totalMembers: data.members.length,
    activeMembers: data.members.filter((m) => m.status === 'active').length,
    students: data.members.filter((m) => m.role === 'student').length,
    activeLoans: onLoan,
    overdueLoans: overdueLoans.length,
    dueToday: dueToday.length,
    dueSoon: dueSoon.length,
    availableCopies: Math.max(0, totalCopies - onLoan),
    pendingReservations: data.reservations.filter((r) => r.status === 'pending').length,
    readyReservations: data.reservations.filter((r) => r.status === 'ready').length,
    outstandingFines,
    returnedLoans: returned.length,
    onTimeReturns,
    categoryCounts: [...categoryMap.entries()]
      .map(([category, entry]) => ({ category, ...entry }))
      .sort((a, b) => b.copies - a.copies),
    utilisation: totalCopies ? Math.round((onLoan / totalCopies) * 100) : 0,
  }
}

export function mostBorrowedBooks(data: LibraryData, limit = 6) {
  const counts = new Map<string, number>()
  for (const loan of data.loans) counts.set(loan.bookId, (counts.get(loan.bookId) ?? 0) + 1)
  return [...counts.entries()]
    .map(([bookId, count]) => ({ book: data.books.find((b) => b.id === bookId), count }))
    .filter((entry): entry is { book: Book; count: number } => Boolean(entry.book))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function monthlyCirculation(data: LibraryData, months: { key: string; label: string }[]) {
  return months.map(({ key, label }) => {
    const issued = data.loans.filter((loan) => loan.issuedAt.slice(0, 7) === key).length
    const returned = data.loans.filter(
      (loan) => loan.returnedAt && loan.returnedAt.slice(0, 7) === key,
    ).length
    const overdue = data.loans.filter((loan) => {
      const dueKey = loan.dueAt.slice(0, 7)
      const isLate =
        loan.status === 'active'
          ? overdueDays(loan.dueAt) > 0
          : loan.returnedAt
            ? new Date(loan.returnedAt) > new Date(loan.dueAt)
            : false
      return dueKey === key && isLate
    }).length
    return { month: label, key, issued, returned, overdue }
  })
}
