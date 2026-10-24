import { describe, expect, it } from 'vitest'
import { sanitizeConfig, sanitizeLibraryData, sanitizePreferences } from '@/lib/storage'
import { createSeedData, DEFAULT_CONFIG } from '@/data/seedData'
import { findDuplicateBook, findDuplicateMember, bookSchema, memberSchema } from '@/lib/validation'
import { toCsv } from '@/lib/exportUtils'

describe('storage sanitisation', () => {
  it('rejects payloads that are not objects', () => {
    expect(sanitizeLibraryData(null)).toBeNull()
    expect(sanitizeLibraryData('nope')).toBeNull()
    expect(sanitizeLibraryData({ books: [], members: [], loans: [] })).toBeNull()
  })

  it('drops orphaned loans and reservations', () => {
    const seed = createSeedData()
    const corrupted = {
      ...seed,
      loans: [
        ...seed.loans,
        { ...seed.loans[0], id: 'LN-BAD1', bookId: 'BK-MISSING' },
        { ...seed.loans[0], id: 'LN-BAD2', memberId: 'M-MISSING' },
      ],
      reservations: [...seed.reservations, { ...seed.reservations[0], id: 'RS-BAD', bookId: 'BK-MISSING' }],
    }
    const cleaned = sanitizeLibraryData(corrupted)
    expect(cleaned).not.toBeNull()
    expect(cleaned!.loans.some((loan) => loan.id === 'LN-BAD1')).toBe(false)
    expect(cleaned!.loans.some((loan) => loan.id === 'LN-BAD2')).toBe(false)
    expect(cleaned!.reservations.some((reservation) => reservation.id === 'RS-BAD')).toBe(false)
  })

  it('repairs active loan overflow beyond the copy count', () => {
    const seed = createSeedData()
    const book = { ...seed.books[0], id: 'BK-ONLY', totalCopies: 1 }
    const baseLoan = { ...seed.loans[0] }
    const cleaned = sanitizeLibraryData({
      ...seed,
      books: [book],
      members: seed.members,
      loans: [
        { ...baseLoan, id: 'LN-A', bookId: 'BK-ONLY', issuedAt: '2026-01-01T10:00:00.000Z', status: 'active', returnedAt: null },
        { ...baseLoan, id: 'LN-B', bookId: 'BK-ONLY', issuedAt: '2026-02-01T10:00:00.000Z', status: 'active', returnedAt: null },
      ],
      reservations: [],
    })
    expect(cleaned).not.toBeNull()
    const active = cleaned!.loans.filter((loan) => loan.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('LN-A')
  })

  it('coerces invalid config values back to safe defaults', () => {
    const config = sanitizeConfig({ loanDurationDays: -4, maxRenewals: 'x', finePerDay: 12.5, libraryName: '' })
    expect(config.loanDurationDays).toBeGreaterThanOrEqual(1)
    expect(config.maxRenewals).toBe(DEFAULT_CONFIG.maxRenewals)
    expect(config.finePerDay).toBe(12.5)
    expect(config.libraryName).toBe(DEFAULT_CONFIG.libraryName)
  })

  it('falls back to default preferences for unknown values', () => {
    const prefs = sanitizePreferences({ density: 'huge', motion: 'reduced', accent: 'pink' })
    expect(prefs.density).toBe('comfortable')
    expect(prefs.motion).toBe('reduced')
    expect(prefs.accent).toBe('blue')
  })
})

describe('validation', () => {
  it('accepts a valid book payload', () => {
    const result = bookSchema.safeParse({
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
      isbn: '978-0134494166',
      publisher: 'Prentice Hall',
      year: 2017,
      category: 'Programming',
      description: '',
      shelf: 'CS-A-02',
      totalCopies: 3,
      tags: 'architecture',
    })
    expect(result.success).toBe(true)
  })

  it('rejects impossible copy counts and years', () => {
    const invalid = bookSchema.safeParse({
      title: 'X',
      author: 'Y',
      isbn: '',
      publisher: 'Z',
      year: 1200,
      category: 'Programming',
      description: '',
      shelf: 'A',
      totalCopies: 0,
      tags: '',
    })
    expect(invalid.success).toBe(false)
  })

  it('rejects malformed member emails', () => {
    const result = memberSchema.safeParse({
      name: 'Test Student',
      email: 'not-an-email',
      department: 'Computer Science',
      role: 'student',
      status: 'active',
      phone: '',
      borrowingLimit: '',
      notes: '',
    })
    expect(result.success).toBe(false)
  })

  it('detects duplicate members by email case-insensitively', () => {
    const members = [{ id: 'M-1', email: 'Riya.Sharma@lumina.edu' }]
    expect(findDuplicateMember(members, 'riya.sharma@LUMINA.edu')?.id).toBe('M-1')
    expect(findDuplicateMember(members, 'riya.sharma@lumina.edu', 'M-1')).toBeUndefined()
  })

  it('detects duplicate books by normalised ISBN', () => {
    const books = [{ id: 'BK-1', isbn: '978-0132350884', title: 'Clean Code', author: 'Robert C. Martin' }]
    expect(findDuplicateBook(books, { isbn: '9780132350884', title: 'Other', author: 'Other' })?.id).toBe('BK-1')
  })
})

describe('legacy spreadsheet metadata sanitisation', () => {
  it('drops Google Sheets sync fields from stored book records', () => {
    const base = createSeedData()
    const legacy = {
      ...base,
      books: [{ ...base.books[0], syncSource: 'sheet', syncUpdatedAt: '2026-10-23T10:00:00.000Z', sheetRow: 12 }],
    }
    const cleaned = sanitizeLibraryData(JSON.parse(JSON.stringify(legacy)))
    expect(cleaned?.books[0]).not.toHaveProperty('syncSource')
    expect(cleaned?.books[0]).not.toHaveProperty('syncUpdatedAt')
    expect(cleaned?.books[0]).not.toHaveProperty('sheetRow')
  })
})

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv(
      [{ title: 'Code, Crafted', note: 'He said "hello"', body: 'line1\nline2' }],
      [
        { key: 'title', label: 'Title', value: (row) => row.title },
        { key: 'note', label: 'Note', value: (row) => row.note },
        { key: 'body', label: 'Body', value: (row) => row.body },
      ],
    )
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('Title,Note,Body')
    expect(row).toBe('"Code, Crafted","He said ""hello""","line1\nline2"'.replace('\n', '\n'))
  })

  it('keeps a stable header even with no rows', () => {
    const csv = toCsv<{ a: string }>([], [{ key: 'a', label: 'Column A', value: (row) => row.a }])
    expect(csv).toBe('Column A')
  })
})
