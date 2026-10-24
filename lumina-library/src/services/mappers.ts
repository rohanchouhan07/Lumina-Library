import type {
  ActivityEntry,
  ActivityKind,
  Book,
  LibraryConfig,
  LibraryData,
  Loan,
  Member,
  Reservation,
  Role,
} from '@/types'
import type { ApiActivity, ApiBook, ApiLoan, ApiReservation, ApiRole, ApiSettings, ApiUser } from '@/types/api'

/** Backend role → the role names the UI already understands. */
export function mapRole(role: ApiRole): Role {
  if (role === 'ADMIN') return 'admin'
  if (role === 'LIBRARIAN') return 'librarian'
  if (role === 'FACULTY') return 'faculty'
  return 'student'
}

/** UI role → the role name the backend stores. */
export function toApiRole(role: Role): ApiRole {
  if (role === 'admin') return 'ADMIN'
  if (role === 'librarian') return 'LIBRARIAN'
  if (role === 'faculty') return 'FACULTY'
  return 'STUDENT'
}

/** Stable small hash so a server id always yields the same cover artwork. */
function seedFromId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash) % 900) + 100
}

export function toBook(book: ApiBook): Book {
  return {
    id: book.bookId,
    isbn: book.isbn || '',
    title: book.title,
    author: book.author || 'Unknown author',
    publisher: book.publisher || '—',
    year: Number(book.year) || 0,
    category: book.category || 'General',
    description: book.description || '',
    shelf: book.shelfLocation || '—',
    totalCopies: Math.max(1, Number(book.totalCopies) || 1),
    status: book.recordStatus === 'ARCHIVED' ? 'archived' : 'active',
    addedAt: book.createdAt || new Date().toISOString(),
    coverSeed: seedFromId(book.bookId),
    tags: [],
    coverImageUrl: book.coverImageUrl || undefined,
  }
}

export function toMember(user: ApiUser): Member {
  return {
    id: user.userId,
    name: user.name,
    email: user.email,
    institutionalId: user.institutionalId || undefined,
    department: user.department || '',
    role: mapRole(user.role),
    status: user.accountStatus === 'ACTIVE' ? 'active' : 'inactive',
    joinedAt: user.createdAt || new Date().toISOString(),
    phone: user.phone || undefined,
    borrowingLimit: user.borrowingLimit ?? undefined,
  }
}

export function toLoan(loan: ApiLoan): Loan {
  return {
    id: loan.loanId,
    bookId: loan.bookId,
    memberId: loan.userId,
    issuedAt: loan.issueDate,
    dueAt: loan.dueDate,
    returnedAt: loan.loanStatus === 'RETURNED' ? (loan.returnDate ?? loan.updatedAt) : null,
    renewals: Number(loan.renewalCount) || 0,
    status: loan.loanStatus === 'RETURNED' ? 'returned' : 'active',
    fineAmount: loan.loanStatus === 'RETURNED' ? Number(loan.fineAmount) || 0 : null,
    issuedBy: loan.issuedBy,
  }
}

const RESERVATION_STATUS: Record<string, Reservation['status']> = {
  PENDING: 'pending',
  READY: 'ready',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
}

export function toReservation(reservation: ApiReservation): Reservation {
  return {
    id: reservation.reservationId,
    bookId: reservation.bookId,
    memberId: reservation.userId,
    createdAt: reservation.reservationDate,
    status: RESERVATION_STATUS[reservation.reservationStatus] ?? 'pending',
    readyAt: reservation.reservationStatus === 'READY' ? reservation.updatedAt : null,
    expiresAt: reservation.expiryDate,
    fulfilledAt: reservation.reservationStatus === 'FULFILLED' ? reservation.updatedAt : null,
    cancelledAt: reservation.reservationStatus === 'CANCELLED' ? reservation.updatedAt : null,
  }
}

const ACTIVITY_KIND: Record<string, ActivityKind> = {
  'book.created': 'book.created',
  'book.deleted': 'book.deleted',
  'book.updated': 'book.updated',
  'book.archived': 'book.archived',
  'book.restored': 'book.updated',
  'user.created': 'member.created',
  'user.updated': 'member.updated',
  'user.status': 'member.status',
  'user.profile': 'member.updated',
  'user.password': 'member.updated',
  'user.password_reset': 'member.updated',
  'loan.issued': 'loan.issued',
  'loan.returned': 'loan.returned',
  'loan.renewed': 'loan.renewed',
  'reservation.created': 'reservation.created',
  'reservation.cancelled': 'reservation.cancelled',
  'reservation.ready': 'reservation.ready',
  'reservation.fulfilled': 'reservation.fulfilled',
  'reservation.expired': 'reservation.expired',
  'settings.updated': 'config.updated',
}

export function toActivity(entry: ApiActivity, users: Member[]): ActivityEntry {
  const actor = users.find((member) => member.id === entry.actorUserId)
  return {
    id: entry.activityId,
    at: entry.timestamp,
    kind: ACTIVITY_KIND[entry.action] ?? 'book.updated',
    message: entry.summary,
    actor: actor?.name ?? (entry.actorUserId === 'SYSTEM' ? 'System' : entry.actorUserId),
    bookId: entry.entityType === 'book' ? entry.entityId : undefined,
    memberId: entry.entityType === 'user' ? entry.entityId : undefined,
  }
}

/** Backend settings (snake_case strings) → the typed library policy. */
export function toConfig(settings: ApiSettings, fallback: LibraryConfig): LibraryConfig {
  const num = (key: string, defaultValue: number) => {
    const value = Number(settings[key])
    return Number.isFinite(value) && value >= 0 ? value : defaultValue
  }
  const bool = (key: string, defaultValue: boolean) => {
    const value = settings[key]
    if (value === undefined) return defaultValue
    return String(value).toLowerCase() === 'true'
  }
  return {
    libraryName: settings.library_name || fallback.libraryName,
    loanDurationDays: num('loan_duration_days', fallback.loanDurationDays),
    maxRenewals: num('max_renewals', fallback.maxRenewals),
    renewalExtensionDays: num('renewal_extension_days', fallback.renewalExtensionDays),
    finePerDay: num('fine_per_day', fallback.finePerDay),
    studentBorrowLimit: num('student_borrow_limit', fallback.studentBorrowLimit),
    staffBorrowLimit: num('faculty_borrow_limit', fallback.staffBorrowLimit),
    reservationHoldDays: num('reservation_hold_days', fallback.reservationHoldDays),
    allowStudentSelfCheckout: bool('allow_self_checkout', fallback.allowStudentSelfCheckout),
    blockIssueOnUnpaidFines: bool('block_issue_on_unpaid_fines', fallback.blockIssueOnUnpaidFines),
    fineBlockThreshold: num('fine_block_threshold', fallback.fineBlockThreshold),
  }
}

/** Typed policy → the flat string map the backend stores in the Settings tab. */
export function fromConfig(config: LibraryConfig): ApiSettings {
  return {
    library_name: config.libraryName,
    loan_duration_days: String(config.loanDurationDays),
    max_renewals: String(config.maxRenewals),
    renewal_extension_days: String(config.renewalExtensionDays),
    fine_per_day: String(config.finePerDay),
    student_borrow_limit: String(config.studentBorrowLimit),
    faculty_borrow_limit: String(config.staffBorrowLimit),
    reservation_hold_days: String(config.reservationHoldDays),
    allow_self_checkout: String(config.allowStudentSelfCheckout),
    block_issue_on_unpaid_fines: String(config.blockIssueOnUnpaidFines),
    fine_block_threshold: String(config.fineBlockThreshold),
  }
}

/** Combine a bootstrap payload into the shape the existing UI consumes. */
export function toLibraryData(input: {
  books: ApiBook[]
  users: ApiUser[]
  loans: ApiLoan[]
  reservations: ApiReservation[]
  activity: ApiActivity[]
  settings: ApiSettings
  wishlist: { bookId: string }[]
  sessionUserId: string
  fallbackConfig: LibraryConfig
  fallbackPreferences: LibraryData['preferences']
}): LibraryData {
  const members = input.users.map(toMember)
  return {
    version: 2,
    books: input.books.map(toBook),
    members,
    loans: input.loans.map(toLoan),
    reservations: input.reservations.map(toReservation),
    activity: input.activity.map((entry) => toActivity(entry, members)),
    config: toConfig(input.settings, input.fallbackConfig),
    wishlists: { [input.sessionUserId]: input.wishlist.map((item) => item.bookId) },
    preferences: input.fallbackPreferences,
  }
}
