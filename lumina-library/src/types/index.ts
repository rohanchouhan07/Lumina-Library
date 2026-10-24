/**
 * Core domain types for Lumina Library.
 * All records are plain, serialisable JSON so the whole dataset can live in localStorage.
 */

export type Role = 'admin' | 'librarian' | 'faculty' | 'student'

export type MemberRole = Role

export type MemberStatus = 'active' | 'inactive'

export type BookStatus = 'active' | 'archived'

export type LoanStatus = 'active' | 'returned'

export type ReservationStatus = 'pending' | 'ready' | 'fulfilled' | 'cancelled' | 'expired'

export type ActivityKind =
  | 'book.created'
  | 'book.updated'
  | 'book.archived'
  | 'book.deleted'
  | 'member.created'
  | 'member.updated'
  | 'member.status'
  | 'loan.issued'
  | 'loan.returned'
  | 'loan.renewed'
  | 'reservation.created'
  | 'reservation.cancelled'
  | 'reservation.ready'
  | 'reservation.fulfilled'
  | 'reservation.expired'
  | 'config.updated'
  | 'data.reset'
  | 'sheet.sync'

export interface Book {
  id: string
  isbn: string
  title: string
  author: string
  publisher: string
  year: number
  category: string
  description: string
  shelf: string
  totalCopies: number
  status: BookStatus
  addedAt: string
  /** Visual seed used by the procedural cover generator. */
  coverSeed: number
  tags: string[]
  /** Optional real cover image supplied by the backend. */
  coverImageUrl?: string
  /** Which side produced the last change while Google Sheets sync is on. */
  syncSource?: BookSyncSource
  /** ISO timestamp of the last synced change. */
  syncUpdatedAt?: string
  /** 1-based sheet row this record was read from, when known. */
  sheetRow?: number
}

/** Where a book record last changed: the website UI or the Google Sheet. */
export type BookSyncSource = 'website' | 'sheet'

export interface Member {
  id: string
  name: string
  email: string
  /** Institution-issued ID (also accepted at sign-in). Server-owned in live mode. */
  institutionalId?: string
  department: string
  role: MemberRole
  status: MemberStatus
  joinedAt: string
  phone?: string
  /** Overrides the role default when set. */
  borrowingLimit?: number
  notes?: string
}

export interface Loan {
  id: string
  bookId: string
  memberId: string
  issuedAt: string
  dueAt: string
  returnedAt: string | null
  renewals: number
  status: LoanStatus
  /** Demo fine recorded at return time (₹). Null while the loan is active. */
  fineAmount: number | null
  issuedBy: string
  notes?: string
}

export interface Reservation {
  id: string
  bookId: string
  memberId: string
  createdAt: string
  status: ReservationStatus
  /** When a copy was allocated to this reservation. */
  readyAt: string | null
  /** Hold expiry for a ready reservation. */
  expiresAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
}

export interface ActivityEntry {
  id: string
  at: string
  kind: ActivityKind
  message: string
  actor: string
  bookId?: string
  memberId?: string
}

export interface LibraryConfig {
  libraryName: string
  loanDurationDays: number
  maxRenewals: number
  renewalExtensionDays: number
  finePerDay: number
  studentBorrowLimit: number
  staffBorrowLimit: number
  reservationHoldDays: number
  allowStudentSelfCheckout: boolean
  blockIssueOnUnpaidFines: boolean
  fineBlockThreshold: number
}

export interface Preferences {
  density: 'comfortable' | 'compact'
  motion: 'full' | 'reduced'
  emailNotices: boolean
  dueSoonReminders: boolean
  newArrivalAlerts: boolean
  defaultCatalogView: 'grid' | 'list'
  accent: 'blue' | 'violet' | 'cyan'
}

/** Root persisted dataset. Everything the app mutates lives here. */
export interface LibraryData {
  version: number
  books: Book[]
  members: Member[]
  loans: Loan[]
  reservations: Reservation[]
  activity: ActivityEntry[]
  config: LibraryConfig
  /** memberId -> bookId[] */
  wishlists: Record<string, string[]>
  /** memberId -> memberIds (demo only, unused by UI beyond profile) */
  preferences: Record<string, Preferences>
}

export interface DemoSession {
  role: Role
  memberId: string
  name: string
  email: string
  enteredAt: string
}

export type PermissionKey =
  | 'books.view'
  | 'books.create'
  | 'books.update'
  | 'books.archive'
  | 'books.delete'
  | 'members.viewAll'
  | 'members.create'
  | 'members.update'
  | 'members.toggleStatus'
  | 'loans.viewAll'
  | 'loans.issue'
  | 'loans.return'
  | 'loans.renewAny'
  | 'loans.selfServe'
  | 'reservations.viewAll'
  | 'reservations.create'
  | 'reservations.cancelAny'
  | 'reports.view'
  | 'reports.export'
  | 'settings.manage'
  | 'data.reset'
  | 'activity.view'
  | 'users.manage'
  | 'system.view'

export interface AppError {
  code: string
  message: string
}
