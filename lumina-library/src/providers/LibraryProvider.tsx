import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type {
  ActivityEntry,
  ActivityKind,
  Book,
  LibraryConfig,
  LibraryData,
  Loan,
  Member,
  Preferences,
  Reservation,
} from '@/types'
import {
  clearSession,
  isStorageAvailable,
  loadLibraryData,
  resetLibraryData,
  saveLibraryData,
  STORAGE_KEYS,
} from '@/lib/storage'
import {
  advanceReservations,
  canIssue,
  canRenew,
  canReserve,
  fail,
  getLibraryStats,
  loanFineAtReturn,
  memberActiveLoans,
  memberOutstandingFines,
  ok,
  type LibraryStats,
  type OperationResult,
} from '@/features/library/engine'
import { addDaysISO, nowISO } from '@/lib/dateUtils'
import { findDuplicateBook, findDuplicateMember } from '@/lib/validation'
import { createId, makeId } from '@/lib/utils'
import { DEFAULT_PREFERENCES, DEFAULT_CONFIG, emptyLibraryData } from '@/data/seedData'
import { IS_API_CONFIGURED } from '@/config/env'
import { callApi, describeApiError } from '@/services/apiClient'
import { toBook, toLibraryData, toMember, toLoan, toReservation, fromConfig, toApiRole } from '@/services/mappers'
import * as booksService from '@/services/booksService'
import * as usersService from '@/services/usersService'
import * as loansService from '@/services/loansService'
import * as reservationsService from '@/services/reservationsService'
import * as settingsService from '@/services/settingsService'
import * as wishlistService from '@/services/wishlistService'
import { ApiError } from '@/types/api'
import type { ApiBook, ApiBootstrap, ApiUser } from '@/types/api'

export interface BookInput {
  title: string
  author: string
  isbn: string
  publisher: string
  year: number
  category: string
  description: string
  shelf: string
  totalCopies: number
  tags: string[]
}

export interface MemberInput {
  name: string
  email: string
  /** Institution-issued ID; required by the backend, optional in the offline demo. */
  institutionalId?: string
  /** Required when creating accounts against the backend; ignored in demo mode. */
  password?: string
  department: string
  role: Member['role']
  status: Member['status']
  phone?: string
  notes?: string
  borrowingLimit?: number
}

export type DataMode = 'live' | 'demo'

export interface PublicCatalogueStats {
  titles: number
  copies: number
  available: number
  onLoan: number
  members: number
}

export type PublicCatalogueState =
  | { status: 'idle' }
  | { status: 'loading' }
  /**
   * `books` keeps the raw catalogue rows so decorative previews can quote real availability
   * (availableCopies vs totalCopies) without inventing loan records. Still title-level only.
   */
  | { status: 'ready'; stats: PublicCatalogueStats; books: ApiBook[]; fetchedAt: string }
  /**
   * `unsupported` — the deployment predates `catalogue.public` (2.2.0 and older): signing in is
   * the only way to see figures. `failed` — anything else (throttle, offline, bad envelope):
   * the visitor gets a Retry button instead of a silent row of zeroes.
   */
  | { status: 'unavailable'; reason: 'unsupported' | 'failed'; message: string }

interface LibraryContextValue {
  data: LibraryData
  stats: LibraryStats
  storageOk: boolean
  recovered: boolean
  actor: string
  setActor: (name: string) => void
  /** 'live' = Supabase Auth + PostgreSQL; 'demo' = local seeded demo data. */
  mode: DataMode
  /** Live-mode status. Always false/idle in demo mode. */
  loading: boolean
  syncing: boolean
  lastSyncedAt: string | null
  dataError: string | null
  /** Re-read everything from the backend (no-op in demo mode). */
  refresh: () => Promise<OperationResult<void>>
  clearDataError: () => void
  /** The signed-in member's id, used to scope wishlists in live mode. */
  setActiveUserId: (userId: string | null) => void
  /**
   * Live mode, signed out: the public catalogue read through `catalogue.public`.
   * `null` until the call lands, `'unavailable'` when the deployment predates the action.
   */
  publicCatalogue: PublicCatalogueState
  /** Re-request the signed-out catalogue (used by the landing page's Retry control). */
  retryPublicCatalogue: () => void
  /** Live mode: adopt a bootstrap payload fetched during sign-in. */
  loadForSession: (payload: ApiBootstrap, user: ApiUser) => Promise<void>
  addBook: (input: BookInput) => Promise<OperationResult<Book>>
  updateBook: (id: string, input: BookInput) => Promise<OperationResult<Book>>
  setBookArchived: (id: string, archived: boolean) => Promise<OperationResult<Book>>
  deleteBook: (id: string) => Promise<OperationResult<void>>
  addMember: (input: MemberInput) => Promise<OperationResult<Member>>
  updateMember: (id: string, input: MemberInput) => Promise<OperationResult<Member>>
  toggleMemberStatus: (id: string) => Promise<OperationResult<Member>>
  updateProfile: (id: string, input: Pick<MemberInput, 'name' | 'email' | 'phone' | 'department'>) => Promise<OperationResult<Member>>
  issueLoan: (input: { bookId: string; memberId: string; days?: number }) => Promise<OperationResult<Loan>>
  returnLoan: (loanId: string) => Promise<OperationResult<{ fine: number; daysLate: number }>>
  renewLoan: (loanId: string) => Promise<OperationResult<Loan>>
  createReservation: (bookId: string, memberId: string) => Promise<OperationResult<Reservation>>
  cancelReservation: (reservationId: string) => Promise<OperationResult<Reservation>>
  toggleWishlist: (memberId: string, bookId: string) => Promise<OperationResult<boolean>>
  updatePreferences: (memberId: string, patch: Partial<Preferences>) => Promise<OperationResult<Preferences>>
  updateConfig: (config: LibraryConfig) => Promise<OperationResult<LibraryConfig>>
  resetDemoData: () => Promise<OperationResult<void>>
  refreshFromStorage: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

function makeActivity(
  kind: ActivityKind,
  message: string,
  actor: string,
  ids: { bookId?: string; memberId?: string } = {},
): ActivityEntry {
  return {
    id: createId('AC'),
    at: nowISO(),
    kind,
    message,
    actor,
    bookId: ids.bookId,
    memberId: ids.memberId,
  }
}

function withActivity(data: LibraryData, entries: ActivityEntry[]): LibraryData {
  if (entries.length === 0) return data
  return { ...data, activity: [...entries, ...data.activity].slice(0, 400) }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const mode: DataMode = IS_API_CONFIGURED ? 'live' : 'demo'
  const initial = useMemo(
    () =>
      mode === 'live'
        ? { data: emptyLibraryData(), recovered: false }
        : loadLibraryData(),
    [mode],
  )
  const [data, setData] = useState<LibraryData>(initial.data)
  const [recovered, setRecovered] = useState(initial.recovered)
  const [storageOk, setStorageOk] = useState(() => isStorageAvailable())
  const [actor, setActor] = useState('System')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [publicCatalogue, setPublicCatalogue] = useState<PublicCatalogueState>({ status: 'idle' })
  const dataRef = useRef(data)
  dataRef.current = data
  const activeUserRef = useRef<string | null>(null)
  activeUserRef.current = activeUserId

  const stats = useMemo(() => getLibraryStats(data), [data])

  /**
   * Single write path for demo mode: persist first, then update React state, so
   * a failed save never desyncs. In live mode Supabase is the source of truth,
   * so nothing is written to localStorage as authority.
   */
  const commit = useCallback((next: LibraryData): OperationResult<LibraryData> => {
    try {
      if (mode === 'demo') saveLibraryData(next)
      setStorageOk(true)
      setData(next)
      dataRef.current = next
      return ok(next)
    } catch (error) {
      setStorageOk(false)
      return fail(error instanceof Error ? error.message : 'Could not save changes to local storage.')
    }
  }, [mode])

  /**
   * Pull the whole (role-scoped) dataset from the backend and adopt it.
   * This is the only path that changes `data` in live mode, so what the UI shows
   * is always what the role-scoped database snapshot contains.
   */
  const applyBootstrap = useCallback((payload: ApiBootstrap, userId: string) => {
    const next = toLibraryData({
      books: payload.books,
      users: payload.users,
      loans: payload.loans,
      reservations: payload.reservations,
      activity: payload.activity,
      settings: payload.settings,
      wishlist: payload.wishlist,
      sessionUserId: userId,
      fallbackConfig: DEFAULT_CONFIG,
      fallbackPreferences: { [userId]: DEFAULT_PREFERENCES },
    })
    setData(next)
    dataRef.current = next
    setLastSyncedAt(payload.serverTime || new Date().toISOString())
    setDataError(null)
    setStorageOk(true)
  }, [])

  const refresh = useCallback(async (): Promise<OperationResult<void>> => {
    if (mode !== 'live') return ok(undefined)
    const userId = activeUserRef.current
    if (!userId) return fail('No active session to refresh.')
    setSyncing(true)
    try {
      const payload = await callApi<ApiBootstrap>('bootstrap')
      applyBootstrap(payload, userId)
      return ok(undefined)
    } catch (error) {
      // Never fake success: surface the failure and keep the last known data.
      const message = describeApiError(error)
      setDataError(message)
      return fail(message)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }, [applyBootstrap, mode])

  /** Adopt a freshly signed-in session: load that user's scoped dataset. */
  const loadForSession = useCallback(
    async (payload: ApiBootstrap, user: ApiUser) => {
      setActiveUserId(user.userId)
      activeUserRef.current = user.userId
      setLoading(true)
      applyBootstrap(payload, user.userId)
      setLoading(false)
    },
    [applyBootstrap],
  )


  /**
   * Bounded background refresh: a fixed two-minute cadence while the tab is
   * visible. This is polling, not real-time sync, and the UI says so.
   */
  useEffect(() => {
    if (mode !== 'live') return
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!activeUserRef.current) return
      void refresh()
    }, 120_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeUserRef.current) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mode, refresh])

  /**
   * Every live-mode write goes through here: call the API, then re-read the
   * backend so the UI matches the database. Failures are surfaced, never faked.
   */
  const liveWrite = useCallback(
    async <T,>(request: () => Promise<T>): Promise<OperationResult<T>> => {
      try {
        const value = await request()
        await refresh()
        return ok(value)
      } catch (error) {
        const message = describeApiError(error)
        setDataError(message)
        return fail(message)
      }
    },
    [refresh],
  )

  /** Runs reservation policy after circulation changes and records the resulting events. */
  const applyReservationPolicy = useCallback(
    (state: LibraryData, actorName: string): LibraryData => {
      const { reservations, changed } = advanceReservations(state)
      if (changed.length === 0) return { ...state, reservations }
      const entries = changed.map(({ reservation, event }) => {
        const book = state.books.find((b) => b.id === reservation.bookId)
        const member = state.members.find((m) => m.id === reservation.memberId)
        return makeActivity(
          event === 'ready' ? 'reservation.ready' : 'reservation.expired',
          event === 'ready'
            ? `Hold ready for pickup — “${book?.title ?? 'title'}” reserved by ${member?.name ?? 'member'}`
            : `Hold expired for “${book?.title ?? 'title'}” (${member?.name ?? 'member'})`,
          actorName,
          { bookId: reservation.bookId, memberId: reservation.memberId },
        )
      })
      return withActivity({ ...state, reservations }, entries)
    },
    [],
  )

  /**
   * Live mode, signed out: the public site still needs a catalogue.
   *
   * `catalogue.public` returns title-level rows plus four counters and nothing personal.
   * If the deployment predates that action (2.2.0 and older answer UNKNOWN_ACTION) we say so
   * instead of pretending the library is empty — the pages then invite the visitor to sign in.
   */
  const [publicAttempt, setPublicAttempt] = useState(0)
  const retryPublicCatalogue = useCallback(() => setPublicAttempt((attempt) => attempt + 1), [])

  useEffect(() => {
    if (mode !== 'live' || activeUserId) return
    let cancelled = false
    setPublicCatalogue({ status: 'loading' })
    callApi<{ books: ApiBook[]; stats: PublicCatalogueStats; serverTime: string }>('catalogue.public')
      .then((payload) => {
        if (cancelled) return
        const books = (payload.books || []).map((book) => toBook(book))
        setData((previous) => ({ ...previous, books }))
        setPublicCatalogue({
          status: 'ready',
          stats: payload.stats,
          books: payload.books || [],
          fetchedAt: payload.serverTime || new Date().toISOString(),
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // An old deployment answers UNKNOWN_ACTION; that is permanent until it is redeployed,
        // so it gets different copy from a transient network or throttle failure.
        const code = error instanceof ApiError ? error.code : ''
        const unsupported = code === 'UNKNOWN_ACTION' || code === 'NOT_CONFIGURED'
        setPublicCatalogue({
          status: 'unavailable',
          reason: unsupported ? 'unsupported' : 'failed',
          message: describeApiError(error),
        })
      })
    return () => {
      cancelled = true
    }
  }, [mode, activeUserId, publicAttempt])

  // Cross-tab consistency: adopt changes written by another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.data || !event.newValue) return
      const loaded = loadLibraryData()
      setData(loaded.data)
      dataRef.current = loaded.data
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* ------------------------------- Books -------------------------------- */

  const addBook = useCallback<LibraryContextValue['addBook']>(
    async (input) => {
      if (mode === 'live') {
        return liveWrite(async () => toBook(await booksService.createBook(input)))
      }
      const current = dataRef.current
      const duplicate = findDuplicateBook(current.books, input)
      if (duplicate)
        return fail(`A matching record already exists (“${duplicate.title}”, ${duplicate.id}). Update it instead.`)
      const book: Book = {
        ...input,
        id: makeId('BK', current.books),
        status: 'active',
        addedAt: nowISO(),
        coverSeed: Math.floor(Math.random() * 900) + 100,
      }
      const next = withActivity(
        { ...current, books: [book, ...current.books] },
        [
          makeActivity('book.created', `Added “${book.title}” (${book.totalCopies} copies)`, actor, {
            bookId: book.id,
          }),
        ],
      )
      const result = commit(next)
      return result.ok ? ok(book) : result
    },
    [actor, commit],
  )

  const updateBook = useCallback<LibraryContextValue['updateBook']>(
    async (id, input) => {
      if (mode === 'live') {
        return liveWrite(async () => toBook(await booksService.updateBook(id, input)))
      }
      const current = dataRef.current
      const existing = current.books.find((book) => book.id === id)
      if (!existing) return fail('That book could not be found — it may have been removed.')
      const duplicate = findDuplicateBook(current.books, input, id)
      if (duplicate) return fail(`Another record already uses those details (“${duplicate.title}”).`)

      const activeCopies = current.loans.filter((loan) => loan.bookId === id && loan.status === 'active').length
      if (input.totalCopies < activeCopies)
        return fail(
          `Copy count cannot be lower than the ${activeCopies} copies currently on loan. Process returns first.`,
        )

      const updated: Book = { ...existing, ...input }
      const next = withActivity(
        { ...current, books: current.books.map((book) => (book.id === id ? updated : book)) },
        [makeActivity('book.updated', `Updated details for “${updated.title}”`, actor, { bookId: id })],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  const setBookArchived = useCallback<LibraryContextValue['setBookArchived']>(
    async (id, archived) => {
      if (mode === 'live') {
        return liveWrite(async () => toBook(await booksService.setBookArchived(id, archived)))
      }
      const current = dataRef.current
      const book = current.books.find((item) => item.id === id)
      if (!book) return fail('That book could not be found.')
      if (archived) {
        const active = current.loans.filter((loan) => loan.bookId === id && loan.status === 'active').length
        if (active > 0)
          return fail(`“${book.title}” still has ${active} active loan(s). Return them before archiving.`)
      }
      const updated: Book = {
        ...book,
        status: archived ? 'archived' : 'active',
      }
      const next = withActivity(
        { ...current, books: current.books.map((item) => (item.id === id ? updated : item)) },
        [
          makeActivity(
            'book.archived',
            `${archived ? 'Archived' : 'Restored'} “${book.title}”`,
            actor,
            { bookId: id },
          ),
        ],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  const deleteBook = useCallback<LibraryContextValue['deleteBook']>(
    async (id) => {
      if (mode === 'live') {
        // The backend allows this only for titles with no circulation history;
        // otherwise it answers CONFLICT and we surface that message verbatim.
        return liveWrite(async () => {
          await booksService.deleteBook(id)
          return undefined as void
        })
      }
      const current = dataRef.current
      const book = current.books.find((item) => item.id === id)
      if (!book) return fail('That book could not be found.')
      const hasHistory =
        current.loans.some((loan) => loan.bookId === id) ||
        current.reservations.some((reservation) => reservation.bookId === id)
      if (hasHistory)
        return fail(
          `“${book.title}” has circulation history and cannot be deleted. Archive it instead to keep records intact.`,
        )
      const next = withActivity(
        {
          ...current,
          books: current.books.filter((item) => item.id !== id),
          wishlists: Object.fromEntries(
            Object.entries(current.wishlists).map(([memberId, list]) => [
              memberId,
              list.filter((bookId) => bookId !== id),
            ]),
          ),
        },
        [makeActivity('book.deleted', `Deleted “${book.title}” from the catalogue`, actor, { bookId: id })],
      )
      const result = commit(next)
      return result.ok ? ok(undefined) : result
    },
    [actor, commit],
  )

  /* ------------------------------ Members -------------------------------- */

  const addMember = useCallback<LibraryContextValue['addMember']>(
    async (input) => {
      if (mode === 'live') {
        if (!input.password) {
          return fail('A password is required when creating an account against the library backend.')
        }
        return liveWrite(async () =>
          toMember(
            await usersService.createUser({
              name: input.name,
              email: input.email,
              institutionalId: input.institutionalId?.trim() || input.email,
              role: toApiRole(input.role),
              department: input.department,
              phone: input.phone,
              borrowingLimit: input.borrowingLimit ?? null,
              accountStatus: input.status === 'active' ? 'ACTIVE' : 'INACTIVE',
              password: input.password,
            }),
          ),
        )
      }
      const current = dataRef.current
      const duplicate = findDuplicateMember(current.members, input.email)
      if (duplicate) return fail(`“${duplicate.name}” (${duplicate.id}) already uses this email address.`)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email)) return fail('Enter a valid email address.')

      const member: Member = {
        ...input,
        id: makeId('M', current.members, 4),
        status: input.status,
        joinedAt: nowISO(),
      }
      const next = withActivity(
        { ...current, members: [member, ...current.members] },
        [makeActivity('member.created', `Registered new member ${member.name} (${member.role})`, actor, {
          memberId: member.id,
        })],
      )
      const result = commit(next)
      return result.ok ? ok(member) : result
    },
    [actor, commit],
  )

  const updateMember = useCallback<LibraryContextValue['updateMember']>(
    async (id, input) => {
      if (mode === 'live') {
        return liveWrite(async () =>
          toMember(
            await usersService.updateUser(id, {
              name: input.name,
              email: input.email,
              institutionalId:
                input.institutionalId?.trim() ||
                dataRef.current.members.find((member) => member.id === id)?.institutionalId ||
                input.email,
              role: toApiRole(input.role),
              department: input.department,
              phone: input.phone,
              borrowingLimit: input.borrowingLimit ?? null,
              accountStatus: input.status === 'active' ? 'ACTIVE' : 'INACTIVE',
              ...(input.password ? { password: input.password } : {}),
            }),
          ),
        )
      }
      const current = dataRef.current
      const existing = current.members.find((member) => member.id === id)
      if (!existing) return fail('That member could not be found.')
      const duplicate = findDuplicateMember(current.members, input.email, id)
      if (duplicate) return fail(`“${duplicate.name}” (${duplicate.id}) already uses this email address.`)
      if (existing.status === 'active' && input.status === 'inactive') {
        const active = memberActiveLoans(current, id).length
        if (active > 0)
          return fail(`${existing.name} still has ${active} book(s) on loan. Process returns before deactivating.`)
      }
      const updated: Member = { ...existing, ...input }
      const next = withActivity(
        { ...current, members: current.members.map((member) => (member.id === id ? updated : member)) },
        [makeActivity('member.updated', `Updated member record for ${updated.name}`, actor, { memberId: id })],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  const toggleMemberStatus = useCallback<LibraryContextValue['toggleMemberStatus']>(
    async (id) => {
      if (mode === 'live') {
        const member = dataRef.current.members.find((item) => item.id === id)
        if (!member) return fail('That member could not be found.')
        const nextStatus = member.status === 'active' ? 'INACTIVE' : 'ACTIVE'
        return liveWrite(async () => toMember(await usersService.setUserStatus(id, nextStatus)))
      }
      const current = dataRef.current
      const member = current.members.find((item) => item.id === id)
      if (!member) return fail('That member could not be found.')
      const nextStatus: Member['status'] = member.status === 'active' ? 'inactive' : 'active'
      if (nextStatus === 'inactive') {
        const active = memberActiveLoans(current, id).length
        if (active > 0)
          return fail(`${member.name} still has ${active} book(s) on loan. Process returns before deactivating.`)
      }
      const updated: Member = { ...member, status: nextStatus }
      const next = withActivity(
        { ...current, members: current.members.map((item) => (item.id === id ? updated : item)) },
        [
          makeActivity(
            'member.status',
            `${nextStatus === 'active' ? 'Activated' : 'Deactivated'} membership for ${member.name}`,
            actor,
            { memberId: id },
          ),
        ],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  const updateProfile = useCallback<LibraryContextValue['updateProfile']>(
    async (id, input) => {
      if (mode === 'live') {
        return liveWrite(async () =>
          toMember(await usersService.updateOwnProfile({ name: input.name, phone: input.phone, department: input.department })),
        )
      }
      const current = dataRef.current
      const existing = current.members.find((member) => member.id === id)
      if (!existing) return fail('That profile could not be found.')
      const duplicate = findDuplicateMember(current.members, input.email, id)
      if (duplicate) return fail('That email address is already used by another member.')
      const updated: Member = { ...existing, ...input }
      const next = withActivity(
        { ...current, members: current.members.map((member) => (member.id === id ? updated : member)) },
        [makeActivity('member.updated', `${updated.name} updated their profile details`, actor, { memberId: id })],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  /* ---------------------------- Circulation ------------------------------ */

  const issueLoan = useCallback<LibraryContextValue['issueLoan']>(
    async ({ bookId, memberId, days }) => {
      const current = dataRef.current
      const book = current.books.find((item) => item.id === bookId)
      const member = current.members.find((item) => item.id === memberId)
      if (!book) return fail('Select a book that exists in the catalogue.')
      if (!member) return fail('Select a member who is registered in the library.')

      const eligibility = canIssue(current, book, member)
      if (!eligibility.ok) return fail(eligibility.error)

      const issuedAt = nowISO()
      const loanDays = days && days > 0 ? days : current.config.loanDurationDays
      const loan: Loan = {
        id: makeId('LN', current.loans, 4),
        bookId,
        memberId,
        issuedAt,
        dueAt: addDaysISO(issuedAt, loanDays),
        returnedAt: null,
        renewals: 0,
        status: 'active',
        fineAmount: null,
        issuedBy: actor,
      }

      // A member borrowing a title they had reserved fulfils that reservation.
      const reservations = current.reservations.map((reservation) =>
        reservation.bookId === bookId &&
        reservation.memberId === memberId &&
        (reservation.status === 'pending' || reservation.status === 'ready')
          ? { ...reservation, status: 'fulfilled' as const, fulfilledAt: issuedAt }
          : reservation,
      )

      let next: LibraryData = withActivity(
        { ...current, loans: [loan, ...current.loans], reservations },
        [
          makeActivity(
            'loan.issued',
            `Issued “${book.title}” to ${member.name} — due ${new Date(loan.dueAt).toLocaleDateString('en-IN')}`,
            actor,
            { bookId, memberId },
          ),
        ],
      )
      next = applyReservationPolicy(next, actor)
      const result = commit(next)
      return result.ok ? ok(loan) : result
    },
    [actor, applyReservationPolicy, commit],
  )

  const returnLoan = useCallback<LibraryContextValue['returnLoan']>(
    async (loanId) => {
      if (mode === 'live') {
        return liveWrite(async () => {
          const result = await loansService.returnLoan(loanId)
          return { fine: result.fine, daysLate: result.daysLate }
        })
      }
      const current = dataRef.current
      const loan = current.loans.find((item) => item.id === loanId)
      if (!loan) return fail('That loan record could not be found.')
      if (loan.status === 'returned') return fail('This loan has already been returned.')

      const returnedAt = nowISO()
      const fine = loanFineAtReturn(loan, returnedAt, current.config)
      const daysLate = Math.round(fine / Math.max(1, current.config.finePerDay))
      const book = current.books.find((item) => item.id === loan.bookId)
      const member = current.members.find((item) => item.id === loan.memberId)

      const updatedLoan: Loan = {
        ...loan,
        status: 'returned',
        returnedAt,
        fineAmount: fine,
      }

      let next: LibraryData = withActivity(
        {
          ...current,
          loans: current.loans.map((item) => (item.id === loanId ? updatedLoan : item)),
        },
        [
          makeActivity(
            'loan.returned',
            `Returned “${book?.title ?? 'book'}” from ${member?.name ?? 'member'}${
              fine > 0 ? ` — ₹${fine} demo fine (${daysLate} day${daysLate === 1 ? '' : 's'} late)` : ' — on time'
            }`,
            actor,
            { bookId: loan.bookId, memberId: loan.memberId },
          ),
        ],
      )
      next = applyReservationPolicy(next, actor)
      const result = commit(next)
      return result.ok ? ok({ fine, daysLate }) : result
    },
    [actor, applyReservationPolicy, commit],
  )

  const renewLoan = useCallback<LibraryContextValue['renewLoan']>(
    async (loanId) => {
      if (mode === 'live') {
        return liveWrite(async () => toLoan(await loansService.renewLoan(loanId)))
      }
      const current = dataRef.current
      const loan = current.loans.find((item) => item.id === loanId)
      if (!loan) return fail('That loan record could not be found.')
      const eligibility = canRenew(current, loan)
      if (!eligibility.ok) return fail(eligibility.error)

      const extendedDue = addDaysISO(loan.dueAt, current.config.renewalExtensionDays)
      const updated: Loan = { ...loan, dueAt: extendedDue, renewals: loan.renewals + 1 }
      const book = current.books.find((item) => item.id === loan.bookId)
      const member = current.members.find((item) => item.id === loan.memberId)

      const next = withActivity(
        { ...current, loans: current.loans.map((item) => (item.id === loanId ? updated : item)) },
        [
          makeActivity(
            'loan.renewed',
            `Renewed “${book?.title ?? 'book'}” for ${member?.name ?? 'member'} until ${new Date(extendedDue).toLocaleDateString('en-IN')}`,
            actor,
            { bookId: loan.bookId, memberId: loan.memberId },
          ),
        ],
      )
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [actor, commit],
  )

  /* ---------------------------- Reservations ----------------------------- */

  const createReservation = useCallback<LibraryContextValue['createReservation']>(
    async (bookId, memberId) => {
      if (mode === 'live') {
        return liveWrite(async () => toReservation(await reservationsService.createReservation(bookId, memberId)))
      }
      const current = dataRef.current
      const book = current.books.find((item) => item.id === bookId)
      const member = current.members.find((item) => item.id === memberId)
      if (!book) return fail('That title could not be found.')
      if (!member) return fail('That member could not be found.')
      const eligibility = canReserve(current, book, member)
      if (!eligibility.ok) return fail(eligibility.error)

      const availableNow = book.totalCopies -
        current.loans.filter((loan) => loan.bookId === bookId && loan.status === 'active').length
      const createdAt = nowISO()
      const reservation: Reservation = {
        id: makeId('RS', current.reservations, 4),
        bookId,
        memberId,
        createdAt,
        status: availableNow > 0 ? 'ready' : 'pending',
        readyAt: availableNow > 0 ? createdAt : null,
        expiresAt:
          availableNow > 0 ? addDaysISO(createdAt, current.config.reservationHoldDays) : null,
        fulfilledAt: null,
        cancelledAt: null,
      }

      let next: LibraryData = withActivity(
        { ...current, reservations: [reservation, ...current.reservations] },
        [
          makeActivity(
            availableNow > 0 ? 'reservation.ready' : 'reservation.created',
            availableNow > 0
              ? `Copy of “${book.title}” held for ${member.name} — collect within ${current.config.reservationHoldDays} days`
              : `Reservation placed for “${book.title}” by ${member.name}`,
            actor,
            { bookId, memberId },
          ),
        ],
      )
      next = applyReservationPolicy(next, actor)
      const result = commit(next)
      if (!result.ok) return result
      const saved = result.value.reservations.find((item) => item.id === reservation.id)
      return ok(saved ?? reservation)
    },
    [actor, applyReservationPolicy, commit],
  )

  const cancelReservation = useCallback<LibraryContextValue['cancelReservation']>(
    async (reservationId) => {
      if (mode === 'live') {
        return liveWrite(async () => toReservation(await reservationsService.cancelReservation(reservationId)))
      }
      const current = dataRef.current
      const reservation = current.reservations.find((item) => item.id === reservationId)
      if (!reservation) return fail('That reservation could not be found.')
      if (reservation.status === 'cancelled') return fail('This reservation is already cancelled.')
      if (reservation.status === 'fulfilled') return fail('This reservation was already fulfilled by a loan.')
      if (reservation.status === 'expired') return fail('This reservation already expired.')

      const cancelled: Reservation = {
        ...reservation,
        status: 'cancelled',
        cancelledAt: nowISO(),
      }
      const book = current.books.find((item) => item.id === reservation.bookId)
      const member = current.members.find((item) => item.id === reservation.memberId)

      let next: LibraryData = withActivity(
        {
          ...current,
          reservations: current.reservations.map((item) =>
            item.id === reservationId ? cancelled : item,
          ),
        },
        [
          makeActivity(
            'reservation.cancelled',
            `Cancelled reservation for “${book?.title ?? 'title'}” (${member?.name ?? 'member'})`,
            actor,
            { bookId: reservation.bookId, memberId: reservation.memberId },
          ),
        ],
      )
      next = applyReservationPolicy(next, actor)
      const result = commit(next)
      return result.ok ? ok(cancelled) : result
    },
    [actor, applyReservationPolicy, commit],
  )

  /* ---------------------------- Preferences ------------------------------ */

  const toggleWishlist = useCallback<LibraryContextValue['toggleWishlist']>(
    async (memberId, bookId) => {
      if (mode === 'live') {
        return liveWrite(async () => (await wishlistService.toggleWishlist(bookId)).saved)
      }
      const current = dataRef.current
      const existing = current.wishlists[memberId] ?? []
      const has = existing.includes(bookId)
      const nextList = has ? existing.filter((id) => id !== bookId) : [...existing, bookId]
      const next: LibraryData = {
        ...current,
        wishlists: { ...current.wishlists, [memberId]: nextList },
      }
      const result = commit(next)
      return result.ok ? ok(!has) : result
    },
    [commit],
  )

  const updatePreferences = useCallback<LibraryContextValue['updatePreferences']>(
    async (memberId, patch) => {
      const current = dataRef.current
      const existing = current.preferences[memberId] ?? DEFAULT_PREFERENCES
      const updated: Preferences = { ...existing, ...patch }
      const next: LibraryData = {
        ...current,
        preferences: { ...current.preferences, [memberId]: updated },
      }
      const result = commit(next)
      return result.ok ? ok(updated) : result
    },
    [commit],
  )

  const updateConfig = useCallback<LibraryContextValue['updateConfig']>(
    async (config) => {
      if (mode === 'live') {
        return liveWrite(async () => {
          await settingsService.updateSettings(fromConfig(config))
          return config
        })
      }
      const current = dataRef.current
      const next = withActivity(
        { ...current, config },
        [makeActivity('config.updated', 'Library circulation policy updated', actor)],
      )
      const result = commit(next)
      return result.ok ? ok(config) : result
    },
    [actor, commit],
  )

  const resetDemoData = useCallback<LibraryContextValue['resetDemoData']>(async () => {
    try {
      const seeded = resetLibraryData()
      setData(seeded)
      dataRef.current = seeded
      setRecovered(false)
      setStorageOk(true)
      // Session is a demo convenience — keep it, but drop it if the member no longer exists.
      try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.session)
        if (raw) {
          const session = JSON.parse(raw) as { memberId?: string }
          if (!session.memberId || !seeded.members.some((m) => m.id === session.memberId)) {
            clearSession()
          }
        }
      } catch {
        clearSession()
      }
      return ok(undefined)
    } catch (error) {
      setStorageOk(false)
      return fail(error instanceof Error ? error.message : 'Could not reset demo data.')
    }
  }, [])

  const refreshFromStorage = useCallback(() => {
    const loaded = loadLibraryData()
    setData(loaded.data)
    dataRef.current = loaded.data
    setRecovered(loaded.recovered)
  }, [])

  const value = useMemo<LibraryContextValue>(
    () => ({
      data,
      stats,
      publicCatalogue,
      retryPublicCatalogue,
      storageOk,
      recovered,
      actor,
      setActor,
      addBook,
      updateBook,
      setBookArchived,
      deleteBook,
      addMember,
      updateMember,
      toggleMemberStatus,
      updateProfile,
      issueLoan,
      returnLoan,
      renewLoan,
      createReservation,
      cancelReservation,
      toggleWishlist,
      updatePreferences,
      updateConfig,
      resetDemoData,
      refreshFromStorage,
      mode,
      loading,
      syncing,
      lastSyncedAt,
      dataError,
      refresh,
      clearDataError: () => setDataError(null),
      setActiveUserId,
      loadForSession,
    }),
    [
      data,
      stats,
      publicCatalogue,
      storageOk,
      recovered,
      actor,
      addBook,
      updateBook,
      setBookArchived,
      deleteBook,
      addMember,
      updateMember,
      toggleMemberStatus,
      updateProfile,
      issueLoan,
      returnLoan,
      renewLoan,
      createReservation,
      cancelReservation,
      toggleWishlist,
      updatePreferences,
      updateConfig,
      resetDemoData,
      refreshFromStorage,
      mode,
      loading,
      syncing,
      lastSyncedAt,
      dataError,
      refresh,
      loadForSession,
    ],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used inside LibraryProvider')
  return context
}

export function useMemberFines(memberId: string | undefined) {
  const { data } = useLibrary()
  return useMemo(() => (memberId ? memberOutstandingFines(data, memberId) : 0), [data, memberId])
}
