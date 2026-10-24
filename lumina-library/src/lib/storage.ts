import type {
  ActivityEntry,
  Book,
  DemoSession,
  LibraryConfig,
  LibraryData,
  Loan,
  Member,
  Preferences,
  Reservation,
  Role,
} from '@/types'
import { DEFAULT_CONFIG, DEFAULT_PREFERENCES, DATA_VERSION, createSeedData } from '@/data/seedData'

export const STORAGE_KEYS = {
  data: 'lumina.library.data.v1',
  session: 'lumina.library.session.v1',
  lastRoute: 'lumina.library.lastRoute.v1',
} as const

const ROLES: Role[] = ['admin', 'librarian', 'faculty', 'student']

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

/** In-memory mirror used when the browser blocks Web Storage (private mode, sandboxed iframes). */
const memoryStore = new Map<string, string>()

function localStorageSafe(): Storage | null {
  try {
    const storage = window.localStorage
    // Merely touching localStorage throws when storage is blocked for the origin.
    const probe = '__lumina_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

export function isStorageAvailable(): boolean {
  return localStorageSafe() !== null
}

function readRaw(key: string): string | null {
  const storage = localStorageSafe()
  if (storage) {
    try {
      const value = storage.getItem(key)
      if (value !== null) return value
    } catch {
      /* fall through to the memory mirror */
    }
  }
  return memoryStore.get(key) ?? null
}

/**
 * Persists a value. When the browser blocks storage, writes fall back to an in-memory
 * mirror so the demo stays fully interactive for the session (with a visible warning
 * in the UI). A genuine quota failure is still surfaced because data would be lost.
 */
function writeRaw(key: string, value: string): void {
  const storage = localStorageSafe()
  if (storage) {
    try {
      storage.setItem(key, value)
      return
    } catch (error) {
      const quotaExceeded =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      if (quotaExceeded) {
        throw new StorageError('Local storage is full — the demo could not save changes.')
      }
      // Blocked write (e.g. Safari private mode): continue with the memory mirror.
    }
  }
  memoryStore.set(key, value)
}

export function removeKey(key: string): void {
  memoryStore.delete(key)
  const storage = localStorageSafe()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    /* no-op: nothing else we can do if storage is blocked */
  }
}

/* -------------------------------------------------------------------------- */
/* Validation / sanitisation                                                   */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function sanitizeBook(raw: unknown): Book | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const title = str(raw.title)
  if (!id || !title) return null
  return {
    id,
    isbn: str(raw.isbn),
    title,
    author: str(raw.author, 'Unknown author'),
    publisher: str(raw.publisher, '—'),
    year: num(raw.year, new Date().getFullYear()),
    category: str(raw.category, 'General'),
    description: str(raw.description),
    shelf: str(raw.shelf, '—'),
    totalCopies: Math.max(1, Math.round(num(raw.totalCopies, 1))),
    status: raw.status === 'archived' ? 'archived' : 'active',
    addedAt: str(raw.addedAt, new Date().toISOString()),
    coverSeed: num(raw.coverSeed, 1),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
  }
}

function sanitizeMember(raw: unknown): Member | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  const role = ROLES.includes(raw.role as Role) ? (raw.role as Role) : 'student'
  return {
    id,
    name,
    email: str(raw.email),
    department: str(raw.department, 'General'),
    role,
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    joinedAt: str(raw.joinedAt, new Date().toISOString()),
    phone: optionalString(raw.phone),
    borrowingLimit: typeof raw.borrowingLimit === 'number' ? raw.borrowingLimit : undefined,
    notes: optionalString(raw.notes),
  }
}

function sanitizeLoan(raw: unknown): Loan | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const bookId = str(raw.bookId)
  const memberId = str(raw.memberId)
  if (!id || !bookId || !memberId) return null
  const returnedAt = typeof raw.returnedAt === 'string' ? raw.returnedAt : null
  return {
    id,
    bookId,
    memberId,
    issuedAt: str(raw.issuedAt, new Date().toISOString()),
    dueAt: str(raw.dueAt, new Date().toISOString()),
    returnedAt,
    renewals: Math.max(0, Math.round(num(raw.renewals, 0))),
    status: returnedAt ? 'returned' : 'active',
    fineAmount: typeof raw.fineAmount === 'number' ? raw.fineAmount : returnedAt ? 0 : null,
    issuedBy: str(raw.issuedBy, 'system'),
    notes: optionalString(raw.notes),
  }
}

const RESERVATION_STATUSES = ['pending', 'ready', 'fulfilled', 'cancelled', 'expired'] as const

function sanitizeReservation(raw: unknown): Reservation | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const bookId = str(raw.bookId)
  const memberId = str(raw.memberId)
  if (!id || !bookId || !memberId) return null
  const status = RESERVATION_STATUSES.includes(raw.status as Reservation['status'])
    ? (raw.status as Reservation['status'])
    : 'pending'
  return {
    id,
    bookId,
    memberId,
    createdAt: str(raw.createdAt, new Date().toISOString()),
    status,
    readyAt: typeof raw.readyAt === 'string' ? raw.readyAt : null,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
    fulfilledAt: typeof raw.fulfilledAt === 'string' ? raw.fulfilledAt : null,
    cancelledAt: typeof raw.cancelledAt === 'string' ? raw.cancelledAt : null,
  }
}

function sanitizeActivity(raw: unknown): ActivityEntry | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const message = str(raw.message)
  if (!id || !message) return null
  return {
    id,
    at: str(raw.at, new Date().toISOString()),
    kind: str(raw.kind, 'book.updated') as ActivityEntry['kind'],
    message,
    actor: str(raw.actor, 'System'),
    bookId: optionalString(raw.bookId),
    memberId: optionalString(raw.memberId),
  }
}

export function sanitizeConfig(raw: unknown): LibraryConfig {
  if (!isRecord(raw)) return { ...DEFAULT_CONFIG }
  const merged = { ...DEFAULT_CONFIG }
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof LibraryConfig)[]) {
    const fallback = DEFAULT_CONFIG[key]
    const value = raw[key]
    if (typeof fallback === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      ;(merged[key] as number) = Math.max(0, value)
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean') {
      ;(merged[key] as boolean) = value
    } else if (typeof fallback === 'string' && typeof value === 'string' && value.trim()) {
      ;(merged[key] as string) = value
    }
  }
  merged.loanDurationDays = Math.max(1, Math.round(merged.loanDurationDays))
  merged.maxRenewals = Math.max(0, Math.round(merged.maxRenewals))
  merged.renewalExtensionDays = Math.max(1, Math.round(merged.renewalExtensionDays))
  merged.reservationHoldDays = Math.max(1, Math.round(merged.reservationHoldDays))
  return merged
}

export function sanitizePreferences(raw: unknown): Preferences {
  if (!isRecord(raw)) return { ...DEFAULT_PREFERENCES }
  const prefs = { ...DEFAULT_PREFERENCES }
  if (raw.density === 'compact' || raw.density === 'comfortable') prefs.density = raw.density
  if (raw.motion === 'full' || raw.motion === 'reduced') prefs.motion = raw.motion
  if (raw.defaultCatalogView === 'grid' || raw.defaultCatalogView === 'list')
    prefs.defaultCatalogView = raw.defaultCatalogView
  if (raw.accent === 'blue' || raw.accent === 'violet' || raw.accent === 'cyan') prefs.accent = raw.accent
  prefs.emailNotices = bool(raw.emailNotices, prefs.emailNotices)
  prefs.dueSoonReminders = bool(raw.dueSoonReminders, prefs.dueSoonReminders)
  prefs.newArrivalAlerts = bool(raw.newArrivalAlerts, prefs.newArrivalAlerts)
  return prefs
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/**
 * Normalises any parsed value into a valid dataset, or returns null when it is too
 * corrupted to repair. Unknown/legacy fields are dropped rather than trusted.
 */
export function sanitizeLibraryData(raw: unknown): LibraryData | null {
  if (!isRecord(raw)) return null
  if (!Array.isArray(raw.books) || !Array.isArray(raw.members) || !Array.isArray(raw.loans)) return null

  const books = dedupeById(raw.books.map(sanitizeBook).filter((b): b is Book => b !== null))
  const members = dedupeById(raw.members.map(sanitizeMember).filter((m): m is Member => m !== null))
  if (books.length === 0 || members.length === 0) return null

  const bookIds = new Set(books.map((b) => b.id))
  const memberIds = new Set(members.map((m) => m.id))

  const loans = dedupeById(raw.loans.map(sanitizeLoan).filter((l): l is Loan => l !== null)).filter(
    (loan) => bookIds.has(loan.bookId) && memberIds.has(loan.memberId),
  )

  // Repair impossible availability: if active loans exceed copies, keep the oldest N active.
  const activeByBook = new Map<string, Loan[]>()
  for (const loan of loans) {
    if (loan.status === 'active') {
      const list = activeByBook.get(loan.bookId) ?? []
      list.push(loan)
      activeByBook.set(loan.bookId, list)
    }
  }
  const forcedReturns = new Set<string>()
  for (const [bookId, activeLoans] of activeByBook) {
    const book = books.find((b) => b.id === bookId)
    if (!book) continue
    if (activeLoans.length > book.totalCopies) {
      const overflow = [...activeLoans]
        .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime())
        .slice(book.totalCopies)
      overflow.forEach((loan) => forcedReturns.add(loan.id))
    }
  }
  const repairedLoans = loans.map((loan) =>
    forcedReturns.has(loan.id)
      ? { ...loan, status: 'returned' as const, returnedAt: loan.returnedAt ?? new Date().toISOString() }
      : loan,
  )

  const reservations = dedupeById(
    (Array.isArray(raw.reservations) ? raw.reservations : [])
      .map(sanitizeReservation)
      .filter((r): r is Reservation => r !== null)
      .filter((r) => bookIds.has(r.bookId) && memberIds.has(r.memberId)),
  )

  const activity = (
    Array.isArray(raw.activity) ? raw.activity : []
  )
    .map(sanitizeActivity)
    .filter((a): a is ActivityEntry => a !== null)
    .slice(0, 400)

  const wishlists: Record<string, string[]> = {}
  if (isRecord(raw.wishlists)) {
    for (const [memberId, list] of Object.entries(raw.wishlists)) {
      if (!memberIds.has(memberId) || !Array.isArray(list)) continue
      wishlists[memberId] = list.filter((id): id is string => typeof id === 'string' && bookIds.has(id))
    }
  }

  const preferences: Record<string, Preferences> = {}
  if (isRecord(raw.preferences)) {
    for (const [memberId, prefs] of Object.entries(raw.preferences)) {
      if (!memberIds.has(memberId)) continue
      preferences[memberId] = sanitizePreferences(prefs)
    }
  }

  return {
    version: DATA_VERSION,
    books,
    members,
    loans: repairedLoans,
    reservations,
    activity,
    config: sanitizeConfig(raw.config),
    wishlists,
    preferences,
  }
}

/* -------------------------------------------------------------------------- */
/* Data read / write                                                           */
/* -------------------------------------------------------------------------- */

export function loadLibraryData(): { data: LibraryData; recovered: boolean } {
  const raw = readRaw(STORAGE_KEYS.data)
  if (!raw) {
    const seeded = createSeedData()
    saveLibraryData(seeded)
    return { data: seeded, recovered: false }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    const sanitized = sanitizeLibraryData(parsed)
    if (!sanitized) throw new Error('invalid dataset')
    return { data: sanitized, recovered: false }
  } catch {
    // Preserve the unreadable payload for debugging, then start fresh with seed data.
    try {
      const storage = localStorageSafe()
      if (storage) storage.setItem(`lumina.library.corrupt.${Date.now()}`, raw.slice(0, 200000))
    } catch {
      /* ignore backup failure */
    }
    const seeded = createSeedData()
    saveLibraryData(seeded)
    return { data: seeded, recovered: true }
  }
}

export function saveLibraryData(data: LibraryData): void {
  writeRaw(STORAGE_KEYS.data, JSON.stringify(data))
}

export function resetLibraryData(): LibraryData {
  const seeded = createSeedData()
  saveLibraryData(seeded)
  return seeded
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

function sanitizeSession(raw: unknown): DemoSession | null {
  if (!isRecord(raw)) return null
  if (!ROLES.includes(raw.role as Role)) return null
  const memberId = str(raw.memberId)
  if (!memberId) return null
  return {
    role: raw.role as Role,
    memberId,
    name: str(raw.name),
    email: str(raw.email),
    enteredAt: str(raw.enteredAt, new Date().toISOString()),
  }
}

export function loadSession(): DemoSession | null {
  const raw = readRaw(STORAGE_KEYS.session)
  if (!raw) return null
  try {
    return sanitizeSession(JSON.parse(raw))
  } catch {
    removeKey(STORAGE_KEYS.session)
    return null
  }
}

export function saveSession(session: DemoSession): void {
  writeRaw(STORAGE_KEYS.session, JSON.stringify(session))
}

export function clearSession(): void {
  removeKey(STORAGE_KEYS.session)
  removeKey(STORAGE_KEYS.lastRoute)
}

export function saveLastRoute(route: string): void {
  try {
    writeRaw(STORAGE_KEYS.lastRoute, route)
  } catch {
    /* non-critical */
  }
}

export function loadLastRoute(): string | null {
  return readRaw(STORAGE_KEYS.lastRoute)
}
