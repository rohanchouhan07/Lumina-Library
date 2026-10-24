import type { Book, LibraryData } from '@/types'
import { getAvailability } from '@/features/library/engine'
import { SHEET_OWNED_FIELDS } from './mapping'

/**
 * Pure reasoning about how sheet rows and website rows combine.
 *
 * Conflict policy (chosen by the product owner): **the sheet wins**. A row that
 * exists in the sheet overwrites the matching website record field by field.
 * Website-only records are kept — deleting a row from the sheet must never
 * destroy borrowing history, so removal is an explicit action in the app.
 */

/** Only the fields the sheet owns take part in change detection. */
export function bookFingerprint(book: Book): string {
  const source = SHEET_OWNED_FIELDS.map((field) => String(book[field] ?? '')).join('\u0001')
  return `${book.id}\u0002${source}`
}

export interface MergeResult {
  books: Book[]
  added: Book[]
  updated: Book[]
  unchanged: number
  keptLocalOnly: Book[]
}

/**
 * Apply sheet rows on top of the local catalogue.
 * `now` is injectable so tests are deterministic.
 */
export function mergeSheetBooks(local: Book[], incoming: Book[], now: string = new Date().toISOString()): MergeResult {
  const byId = new Map(local.map((book) => [book.id, book]))
  const added: Book[] = []
  const updated: Book[] = []
  let unchanged = 0
  const seen = new Set<string>()

  incoming.forEach((row) => {
    seen.add(row.id)
    const existing = byId.get(row.id)
    if (!existing) {
      const created: Book = { ...row, tags: row.tags ?? ['google-sheet'], syncSource: 'sheet', syncUpdatedAt: now }
      byId.set(row.id, created)
      added.push(created)
      return
    }
    const patched: Book = {
      ...existing,
      title: row.title,
      author: row.author,
      isbn: row.isbn,
      publisher: row.publisher,
      year: row.year,
      category: row.category,
      description: row.description,
      shelf: row.shelf,
      totalCopies: row.totalCopies,
      status: row.status,
      sheetRow: row.sheetRow,
    }
    if (bookFingerprint(patched) === bookFingerprint(existing)) {
      unchanged += 1
      byId.set(row.id, { ...existing, sheetRow: row.sheetRow })
      return
    }
    const merged: Book = {
      ...patched,
      // The row said "Website" only if the site itself wrote it last.
      syncSource: row.syncSource ?? 'sheet',
      syncUpdatedAt: row.syncUpdatedAt ?? now,
    }
    byId.set(row.id, merged)
    updated.push(merged)
  })

  const keptLocalOnly = local.filter((book) => !seen.has(book.id))
  const ordered: Book[] = []
  const emitted = new Set<string>()
  local.forEach((book) => {
    const next = byId.get(book.id)
    if (next && !emitted.has(next.id)) {
      ordered.push(next)
      emitted.add(next.id)
    }
  })
  added.forEach((book) => {
    if (!emitted.has(book.id)) {
      ordered.push(book)
      emitted.add(book.id)
    }
  })

  return { books: ordered, added, updated, unchanged, keptLocalOnly }
}

/**
 * Website-side changes that still need to reach the sheet: anything whose
 * fingerprint differs from the last successful sync snapshot.
 */
export function pendingPushes(books: Book[], snapshot: Map<string, string>): Book[] {
  return books.filter((book) => {
    // A row whose last change came *from* the sheet must never be pushed back:
    // echoing it would overwrite the sheet with the value we just read.
    if (book.syncSource === 'sheet') return false
    return snapshot.get(book.id) !== bookFingerprint(book)
  })
}

/** Snapshot of what the sheet currently holds, used to detect later local edits. */
export function snapshotBooks(books: Book[]): Map<string, string> {
  return new Map(books.map((book) => [book.id, bookFingerprint(book)]))
}

export interface DerivedRow extends Record<string, string | number> {
  'Book ID': string
  'Copies on loan': number
  'Available copies': number
  Status: string
}

/**
 * Availability is derived from loans, never stored. This is what the site
 * writes back so the sheet's derived columns never drift.
 */
export function derivedRows(books: Book[], data: LibraryData): DerivedRow[] {
  return books.map((book) => {
    const availability = getAvailability(book, data)
    return {
      'Book ID': book.id,
      'Copies on loan': availability.onLoan,
      'Available copies': availability.available,
      Status: book.status === 'archived' ? 'Archived' : 'Active',
    }
  })
}

/** Books that differ from the sheet only because of a website edit. */
export function websiteEditedCount(books: Book[], snapshot: Map<string, string>): number {
  return pendingPushes(books, snapshot).length
}
