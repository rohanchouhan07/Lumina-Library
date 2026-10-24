/** Shared API response contract retained from the prior backend; Supabase RPC now implements it. */

export type ApiRole = 'ADMIN' | 'LIBRARIAN' | 'FACULTY' | 'STUDENT'
export type ApiAccountStatus = 'ACTIVE' | 'INACTIVE'
export type ApiLoanStatus = 'ACTIVE' | 'RETURNED'
export type ApiReservationStatus = 'PENDING' | 'READY' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED'
export type ApiBookStatus = 'ACTIVE' | 'ARCHIVED'

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'CONFIG_ERROR'
  | 'UNKNOWN_ACTION'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NOT_CONFIGURED'
  | 'MALFORMED_RESPONSE'

/** Normalised error the UI can render without knowing the transport. */
export class ApiError extends Error {
  code: ApiErrorCode
  status?: number
  retriable: boolean

  constructor(code: ApiErrorCode, message: string, options: { status?: number; retriable?: boolean } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status
    this.retriable = options.retriable ?? RETRIABLE.has(code)
  }
}

const RETRIABLE = new Set<ApiErrorCode>(['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'RATE_LIMITED'])

export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: { code: ApiErrorCode; message: string }
}

/** A user exactly as the server exposes it — no hash, salt or token material. */
export interface ApiUser {
  userId: string
  name: string
  email: string
  institutionalId: string
  role: ApiRole
  department: string
  accountStatus: ApiAccountStatus
  phone?: string
  borrowingLimit?: number | null
  createdAt?: string
  updatedAt?: string
}

/** users.list adds circulation counters for the admin table. */
export interface ApiUserSummary extends ApiUser {
  activeLoans?: number
  activeHolds?: number
  outstandingFine?: number
}

export interface ApiBook {
  bookId: string
  title: string
  author: string
  isbn: string
  publisher: string
  year: number
  category: string
  description: string
  coverImageUrl?: string
  shelfLocation: string
  totalCopies: number
  availableCopies: number
  copiesOnLoan: number
  recordStatus: ApiBookStatus
  createdAt: string
  updatedAt: string
}

export interface ApiLoan {
  loanId: string
  bookId: string
  bookTitle: string
  userId: string
  userName: string
  issuedBy: string
  issueDate: string
  dueDate: string
  returnDate: string | null
  loanStatus: ApiLoanStatus
  renewalCount: number
  fineAmount: number
  overdueDays: number
  createdAt: string
  updatedAt: string
}

export interface ApiReservation {
  reservationId: string
  bookId: string
  bookTitle: string
  userId: string
  userName: string
  reservationDate: string
  queuePosition: number
  reservationStatus: ApiReservationStatus
  expiryDate: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiActivity {
  activityId: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  timestamp: string
  summary: string
}

export interface ApiDashboardStats {
  scope: 'LIBRARY' | 'SELF'
  totals: {
    titles: number
    copies: number
    availableCopies: number
    members: number
    students: number
    faculty: number
    admins: number
    activeLoans: number
    overdue: number
    activeHolds: number
    simulatedFines: number
  }
  mine: {
    activeLoans: number
    overdue: number
    holds: number
    simulatedFines: number
    borrowLimit: number
  }
}

export interface ApiAnalytics {
  scope: 'LIBRARY' | 'SELF'
  range: { from: string; to: string }
  issued: number
  returned: number
  series: { month: string; issued: number; returned: number }[]
  categories: { category: string; loans: number }[]
  topBooks: { bookId: string; title: string; author: string; loans: number }[]
}

export interface ApiSettings {
  [key: string]: string
}

export interface ApiLoginResult {
  token: string
  expiresAt: string
  user: ApiUser
}

/** Everything the app needs after sign-in, already scoped to the caller's role. */
export interface ApiBootstrap {
  user: ApiUser
  role: ApiRole
  scope: 'ALL' | 'SELF'
  books: ApiBook[]
  users: ApiUserSummary[]
  loans: ApiLoan[]
  reservations: ApiReservation[]
  settings: ApiSettings
  activity: ApiActivity[]
  wishlist: { bookId: string; createdAt: string }[]
  stats: ApiDashboardStats
  serverTime: string
}

export interface ApiHealth {
  service: string
  version: string
  counts?: Record<string, number>
  time: string
}

export interface ApiWishlistToggle {
  bookId: string
  saved: boolean
}
