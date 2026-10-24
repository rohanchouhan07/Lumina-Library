import { describe, expect, it } from 'vitest'
import type { Book, LibraryData, Loan, Member, Reservation } from '@/types'
import {
  advanceReservations,
  canIssue,
  canRenew,
  canReserve,
  getAvailability,
  getLibraryStats,
  loanFine,
  loanFineAtReturn,
  memberOutstandingFines,
  reservationQueuePosition,
} from '@/features/library/engine'
import { createSeedData } from '@/data/seedData'
import { addDaysISO, isoDaysFromNow, nowISO } from '@/lib/dateUtils'

/* ---------------------------------- helpers -------------------------------- */

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'BK-T01',
    isbn: '978-0000000001',
    title: 'Test Book',
    author: 'Test Author',
    publisher: 'Test Press',
    year: 2020,
    category: 'Computer Science',
    description: '',
    shelf: 'T-01',
    totalCopies: 2,
    status: 'active',
    addedAt: isoDaysFromNow(-100),
    coverSeed: 1,
    tags: [],
    ...overrides,
  }
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'M-T01',
    name: 'Test Student',
    email: 'test.student@lumina.edu',
    department: 'Computer Science',
    role: 'student',
    status: 'active',
    joinedAt: isoDaysFromNow(-200),
    ...overrides,
  }
}

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'LN-T01',
    bookId: 'BK-T01',
    memberId: 'M-T01',
    issuedAt: isoDaysFromNow(-5),
    dueAt: isoDaysFromNow(9),
    returnedAt: null,
    renewals: 0,
    status: 'active',
    fineAmount: null,
    issuedBy: 'tester',
    ...overrides,
  }
}

function makeData(overrides: Partial<LibraryData> = {}): LibraryData {
  const base = createSeedData()
  return {
    ...base,
    books: [makeBook()],
    members: [makeMember()],
    loans: [],
    reservations: [],
    activity: [],
    wishlists: {},
    preferences: {},
    ...overrides,
  }
}

/* -------------------------------- availability ----------------------------- */

describe('availability', () => {
  it('derives available copies from active loans', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' })] })
    const availability = getAvailability(data.books[0], data)
    expect(availability.total).toBe(2)
    expect(availability.onLoan).toBe(1)
    expect(availability.available).toBe(1)
    expect(availability.state).toBe('limited')
  })

  it('reports unavailable when every copy is on loan', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' }), makeLoan({ id: 'LN-2' })] })
    expect(getAvailability(data.books[0], data).available).toBe(0)
    expect(getAvailability(data.books[0], data).state).toBe('unavailable')
  })

  it('ignores returned loans when counting copies out', () => {
    const data = makeData({
      loans: [makeLoan({ id: 'LN-1', status: 'returned', returnedAt: isoDaysFromNow(-1), fineAmount: 0 })],
    })
    expect(getAvailability(data.books[0], data).available).toBe(2)
  })
})

/* ---------------------------------- issuing -------------------------------- */

describe('issue eligibility', () => {
  it('allows an active member to borrow an available copy', () => {
    const data = makeData()
    expect(canIssue(data, data.books[0], data.members[0]).ok).toBe(true)
  })

  it('blocks issue when no copies remain', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' }), makeLoan({ id: 'LN-2' })] })
    const result = canIssue(data, data.books[0], data.members[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('No copies available')
  })

  it('blocks inactive memberships', () => {
    const data = makeData({ members: [makeMember({ status: 'inactive' })] })
    const result = canIssue(data, data.books[0], data.members[0])
    expect(result.ok).toBe(false)
  })

  it('enforces the student borrowing limit', () => {
    const books = [1, 2, 3, 4, 5].map((n) => makeBook({ id: `BK-${n}`, totalCopies: 1 }))
    const loans = books.slice(0, 4).map((book, index) => makeLoan({ id: `LN-${index}`, bookId: book.id }))
    const target = makeBook({ id: 'BK-T99', totalCopies: 1 })
    const data = makeData({ books: [...books, target], loans })
    const result = canIssue(data, target, data.members[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Borrowing limit')
  })

  it('blocks a member from holding two copies of the same title', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' })] })
    const result = canIssue(data, data.books[0], data.members[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('already has a copy')
  })

  it('blocks archived titles', () => {
    const data = makeData({ books: [makeBook({ status: 'archived' })] })
    expect(canIssue(data, data.books[0], data.members[0]).ok).toBe(false)
  })
})

/* --------------------------------- renewal --------------------------------- */

describe('renewal rules', () => {
  it('allows renewal under the limit', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' })] })
    expect(canRenew(data, data.loans[0]).ok).toBe(true)
  })

  it('blocks renewal once the renewal limit is reached', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1', renewals: 2 })] })
    const result = canRenew(data, data.loans[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Renewal limit')
  })

  it('blocks renewal of overdue loans', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1', dueAt: isoDaysFromNow(-3) })] })
    expect(canRenew(data, data.loans[0]).ok).toBe(false)
  })

  it('blocks renewal when another member is waiting', () => {
    const reservation: Reservation = {
      id: 'RS-1',
      bookId: 'BK-T01',
      memberId: 'M-OTHER',
      createdAt: isoDaysFromNow(-1),
      status: 'pending',
      readyAt: null,
      expiresAt: null,
      fulfilledAt: null,
      cancelledAt: null,
    }
    const data = makeData({
      loans: [makeLoan({ id: 'LN-1' })],
      members: [makeMember(), makeMember({ id: 'M-OTHER', email: 'other@lumina.edu' })],
      reservations: [reservation],
    })
    const result = canRenew(data, data.loans[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('waiting')
  })

  it('blocks renewal of returned loans', () => {
    const data = makeData({
      loans: [makeLoan({ id: 'LN-1', status: 'returned', returnedAt: isoDaysFromNow(-1), fineAmount: 0 })],
    })
    expect(canRenew(data, data.loans[0]).ok).toBe(false)
  })
})

/* ----------------------------------- fines --------------------------------- */

describe('fine calculation', () => {
  it('charges nothing for on-time returns', () => {
    const loan = makeLoan({ dueAt: isoDaysFromNow(5) })
    expect(loanFineAtReturn(loan, nowISO(), makeData().config)).toBe(0)
  })

  it('charges the configured rate per overdue day at return', () => {
    const config = { ...makeData().config, finePerDay: 5 }
    const loan = makeLoan({ dueAt: isoDaysFromNow(-4) })
    expect(loanFineAtReturn(loan, nowISO(), config)).toBe(20)
  })

  it('accrues fines for active overdue loans', () => {
    const data = makeData({ loans: [makeLoan({ id: 'LN-1', dueAt: isoDaysFromNow(-3) })] })
    expect(loanFine(data.loans[0], data.config)).toBe(15)
    expect(memberOutstandingFines(data, 'M-T01')).toBe(15)
  })

  it('uses the recorded amount for returned loans', () => {
    const loan = makeLoan({ dueAt: isoDaysFromNow(-30), status: 'returned', returnedAt: isoDaysFromNow(-25), fineAmount: 25 })
    expect(loanFine(loan, makeData().config)).toBe(25)
  })

  it('sums active and historical fines per member', () => {
    const data = makeData({
      loans: [
        makeLoan({ id: 'LN-1', dueAt: isoDaysFromNow(-2) }),
        makeLoan({
          id: 'LN-2',
          bookId: 'BK-OTHER',
          dueAt: isoDaysFromNow(-10),
          status: 'returned',
          returnedAt: isoDaysFromNow(-8),
          fineAmount: 10,
        }),
      ],
    })
    expect(memberOutstandingFines(data, 'M-T01')).toBe(10 + 10)
  })
})

/* -------------------------------- reservations ----------------------------- */

describe('reservations', () => {
  it('prevents duplicate active reservations for the same title', () => {
    const reservation: Reservation = {
      id: 'RS-1',
      bookId: 'BK-T01',
      memberId: 'M-T01',
      createdAt: isoDaysFromNow(-1),
      status: 'pending',
      readyAt: null,
      expiresAt: null,
      fulfilledAt: null,
      cancelledAt: null,
    }
    const data = makeData({
      loans: [makeLoan({ id: 'LN-1' }), makeLoan({ id: 'LN-2' })],
      reservations: [reservation],
    })
    const result = canReserve(data, data.books[0], data.members[0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('already have an active reservation')
  })

  it('allows a new reservation after the previous one was cancelled', () => {
    const reservation: Reservation = {
      ...{
        id: 'RS-1',
        bookId: 'BK-T01',
        memberId: 'M-T01',
        createdAt: isoDaysFromNow(-6),
        readyAt: null,
        expiresAt: null,
        fulfilledAt: null,
      },
      status: 'cancelled',
      cancelledAt: isoDaysFromNow(-2),
    }
    const data = makeData({
      members: [makeMember(), makeMember({ id: 'M-OTHER', email: 'other@lumina.edu' })],
      // Both copies are held by another member, which is exactly when a hold is useful.
      loans: [makeLoan({ id: 'LN-1', memberId: 'M-OTHER' }), makeLoan({ id: 'LN-2', memberId: 'M-OTHER' })],
      reservations: [reservation],
    })
    expect(canReserve(data, data.books[0], data.members[0]).ok).toBe(true)
  })

  it('promotes the oldest pending hold when a copy frees up', () => {
    const reservations: Reservation[] = [
      {
        id: 'RS-OLD',
        bookId: 'BK-T01',
        memberId: 'M-A',
        createdAt: isoDaysFromNow(-3),
        status: 'pending',
        readyAt: null,
        expiresAt: null,
        fulfilledAt: null,
        cancelledAt: null,
      },
      {
        id: 'RS-NEW',
        bookId: 'BK-T01',
        memberId: 'M-B',
        createdAt: isoDaysFromNow(-1),
        status: 'pending',
        readyAt: null,
        expiresAt: null,
        fulfilledAt: null,
        cancelledAt: null,
      },
    ]
    // One copy on loan out of two → one copy is free, so one hold can be promoted.
    const data = makeData({ loans: [makeLoan({ id: 'LN-1' })], reservations })
    const { reservations: next, changed } = advanceReservations(data)
    expect(changed.filter((entry) => entry.event === 'ready')).toHaveLength(1)
    expect(next.find((r) => r.id === 'RS-OLD')?.status).toBe('ready')
    expect(next.find((r) => r.id === 'RS-NEW')?.status).toBe('pending')
  })

  it('expires a ready hold whose window has elapsed', () => {
    const reservations: Reservation[] = [
      {
        id: 'RS-1',
        bookId: 'BK-T01',
        memberId: 'M-A',
        createdAt: isoDaysFromNow(-6),
        status: 'ready',
        readyAt: isoDaysFromNow(-5),
        expiresAt: addDaysISO(nowISO(), -1),
        fulfilledAt: null,
        cancelledAt: null,
      },
    ]
    const data = makeData({ reservations })
    const { reservations: next } = advanceReservations(data)
    expect(next[0].status).toBe('expired')
  })

  it('reports queue position with ready holds first', () => {
    const reservations: Reservation[] = [
      {
        id: 'RS-1',
        bookId: 'BK-T01',
        memberId: 'M-A',
        createdAt: isoDaysFromNow(-4),
        status: 'pending',
        readyAt: null,
        expiresAt: null,
        fulfilledAt: null,
        cancelledAt: null,
      },
      {
        id: 'RS-2',
        bookId: 'BK-T01',
        memberId: 'M-B',
        createdAt: isoDaysFromNow(-2),
        status: 'ready',
        readyAt: isoDaysFromNow(-1),
        expiresAt: addDaysISO(nowISO(), 2),
        fulfilledAt: null,
        cancelledAt: null,
      },
    ]
    const data = makeData({ reservations })
    expect(reservationQueuePosition(data, reservations[1])).toBe(1)
    expect(reservationQueuePosition(data, reservations[0])).toBe(2)
  })
})

/* ---------------------------------- stats ---------------------------------- */

describe('library statistics', () => {
  it('derives aggregates from the seeded dataset', () => {
    const data = createSeedData()
    const stats = getLibraryStats(data)
    expect(stats.totalTitles).toBe(data.books.length)
    expect(stats.totalCopies).toBeGreaterThan(0)
    expect(stats.activeLoans).toBeGreaterThan(0)
    expect(stats.availableCopies).toBe(stats.totalCopies - stats.activeLoans)
    expect(stats.categoryCounts.length).toBeGreaterThan(3)
  })

  it('never reports negative availability even with inconsistent input', () => {
    const data = makeData({
      books: [makeBook({ totalCopies: 1 })],
      loans: [makeLoan({ id: 'LN-1' }), makeLoan({ id: 'LN-2' })],
    })
    expect(getLibraryStats(data).availableCopies).toBe(0)
    expect(getAvailability(data.books[0], data).available).toBe(0)
  })
})
