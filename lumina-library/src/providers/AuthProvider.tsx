import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DemoSession, Member, PermissionKey, Preferences, Role } from '@/types'
import { clearSession, loadSession, saveSession } from '@/lib/storage'
import { can as canForRole, ROLE_META } from '@/lib/permissions'
import { DEFAULT_PREFERENCES } from '@/data/seedData'
import { IS_API_CONFIGURED } from '@/config/env'
import type { ApiUser } from '@/types/api'
import { ApiError } from '@/types/api'
import * as authService from '@/services/authService'
import { describeApiError, isSessionExpired, setSessionToken } from '@/services/apiClient'
import { mapRole, toMember } from '@/services/mappers'
import { useLibrary } from './LibraryProvider'

export type AuthMode = 'live' | 'demo'

export type LoginResult = { ok: true } | { ok: false; error: string }

export interface LiveLoginInput {
  identifier: string
  password: string
  remember: boolean
}

interface AuthContextValue {
  /** 'live' = credentials verified by the Apps Script backend, 'demo' = offline seeded demo. */
  mode: AuthMode
  /** True while restoring a stored session / finishing a live sign-in. */
  booting: boolean
  session: DemoSession | null
  member: Member | null
  role: Role | null
  isAuthenticated: boolean
  preferences: Preferences
  can: (permission: PermissionKey) => boolean
  /** Live mode: email/ID + password. Demo mode: pick a demo seat. */
  loginWithPassword: (input: LiveLoginInput) => Promise<LoginResult>
  loginWithDemoSeat: (role: Role, memberId: string) => LoginResult
  logout: () => Promise<void>
  /** True for a short window after an explicit sign-out (used by route guards). */
  justLoggedOut: () => boolean
  /** Demo seats offered by the offline demo. Empty in live mode. */
  demoAccounts: Member[]
  setPreferences: (patch: Partial<Preferences>) => void
  /** Last authentication error, for inline display. */
  authError: string | null
  clearAuthError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, setActor, updatePreferences, loadForSession, setActiveUserId, mode: dataMode } = useLibrary()
  const mode: AuthMode = dataMode
  const [session, setSession] = useState<DemoSession | null>(() => (IS_API_CONFIGURED ? null : loadSession()))
  const [liveUser, setLiveUser] = useState<ApiUser | null>(null)
  const [booting, setBooting] = useState(IS_API_CONFIGURED)
  const [authError, setAuthError] = useState<string | null>(null)
  const logoutAtRef = useRef(0)

  /** The signed-in member: backend user in live mode, seeded member in demo mode. */
  const member = useMemo<Member | null>(() => {
    if (IS_API_CONFIGURED) return liveUser ? toMember(liveUser) : null
    if (!session) return null
    return data.members.find((item) => item.id === session.memberId) ?? null
  }, [session, liveUser, data.members])

  // Keep the activity-log actor in sync with the signed-in member.
  useEffect(() => {
    setActor(member?.name ?? 'System')
  }, [member?.name, setActor])

  // Demo mode only: drop a stored session whose profile disappeared (reset/import).
  useEffect(() => {
    if (IS_API_CONFIGURED) return
    if (session && !member) {
      clearSession()
      setSession(null)
    }
  }, [session, member])

  /** Restore a backend session on reload — the server is the source of truth. */
  useEffect(() => {
    if (!IS_API_CONFIGURED) return
    let cancelled = false
    const restore = async () => {
      try {
        const restored = await authService.restoreSession()
        if (cancelled) return
        if (restored) {
          setLiveUser(restored.user)
          await loadForSession(restored.bootstrap, restored.user)
        }
      } catch (error) {
        // Expired/invalid token: clear it and let the login screen take over.
        if (error instanceof ApiError && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')) {
          setSessionToken(null)
        } else if (!isSessionExpired(error)) {
          setAuthError(describeApiError(error))
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
    // Runs once per mount: session restore must not loop when the user object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loginWithPassword = useCallback<AuthContextValue['loginWithPassword']>(
    async (input) => {
      setAuthError(null)
      try {
        const result = await authService.login(input)
        // Same session, now role-scoped: this is what the signed-in UI renders.
        const scoped = await authService.restoreSession()
        if (!scoped) throw new Error('The session could not be established. Please retry.')
        setLiveUser(scoped.user)
        await loadForSession(scoped.bootstrap, scoped.user)
        setSession({
          role: mapRole(result.user.role),
          memberId: result.user.userId,
          name: result.user.name,
          email: result.user.email,
          enteredAt: new Date().toISOString(),
        })
        return { ok: true }
      } catch (error) {
        const message = describeApiError(error)
        setAuthError(message)
        setSessionToken(null)
        setLiveUser(null)
        return { ok: false, error: message }
      }
    },
    [loadForSession],
  )

  /** Offline demo seats — never available when a backend is configured. */
  const loginWithDemoSeat = useCallback<AuthContextValue['loginWithDemoSeat']>(
    (role, memberId) => {
      if (IS_API_CONFIGURED) {
        return { ok: false, error: 'This build is connected to the library server — sign in with your credentials.' }
      }
      const target = data.members.find((item) => item.id === memberId)
      if (!target) return { ok: false, error: 'That demo profile could not be found.' }
      if (target.status !== 'active') return { ok: false, error: 'This demo profile is inactive. Pick another account.' }
      if (target.role !== role) return { ok: false, error: 'That profile does not match the selected role.' }

      const next: DemoSession = {
        role,
        memberId: target.id,
        name: target.name,
        email: target.email,
        enteredAt: new Date().toISOString(),
      }
      try {
        saveSession(next)
        setSession(next)
        return { ok: true }
      } catch {
        setSession(next)
        return { ok: true }
      }
    },
    [data.members],
  )

  const logout = useCallback(async () => {
    logoutAtRef.current = Date.now()
    if (IS_API_CONFIGURED) {
      await authService.logout()
      setLiveUser(null)
      setSession(null)
      setActiveUserId(null)
      setAuthError(null)
      return
    }
    clearSession()
    setSession(null)
  }, [setActiveUserId])

  const justLoggedOut = useCallback(() => Date.now() - logoutAtRef.current < 2000, [])

  const role = useMemo<Role | null>(() => {
    if (IS_API_CONFIGURED) return liveUser ? mapRole(liveUser.role) : null
    return member?.role ?? session?.role ?? null
  }, [liveUser, member, session])

  const preferences = useMemo<Preferences>(() => {
    if (!member) return DEFAULT_PREFERENCES
    return data.preferences[member.id] ?? DEFAULT_PREFERENCES
  }, [data.preferences, member])

  const setPreferences = useCallback<AuthContextValue['setPreferences']>(
    (patch) => {
      if (!member) return
      void updatePreferences(member.id, patch)
    },
    [member, updatePreferences],
  )

  const demoAccounts = useMemo(
    () => (IS_API_CONFIGURED ? [] : data.members.filter((item) => item.status === 'active')),
    [data.members],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      booting,
      session,
      member,
      role,
      isAuthenticated: Boolean(member),
      preferences,
      can: (permission) => canForRole(role, permission),
      loginWithPassword,
      loginWithDemoSeat,
      logout,
      justLoggedOut,
      demoAccounts,
      setPreferences,
      authError,
      clearAuthError: () => setAuthError(null),
    }),
    [
      authError,
      booting,
      demoAccounts,
      justLoggedOut,
      liveUser,
      loginWithDemoSeat,
      loginWithPassword,
      logout,
      member,
      mode,
      preferences,
      role,
      session,
      setPreferences,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export { ROLE_META }
