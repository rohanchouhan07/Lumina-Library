import { callApi } from './apiClient'
import { getSupabaseClient } from './supabaseClient'
import { ApiError } from '@/types/api'
import type { ApiBootstrap, ApiLoginResult, ApiUser } from '@/types/api'

export interface LoginInput {
  identifier: string
  password: string
}

/** Sign in through Supabase Auth; app roles still come from the protected profile RPC. */
export async function login(input: LoginInput): Promise<ApiLoginResult> {
  const email = input.identifier.trim().toLowerCase()
  if (!email.includes('@')) {
    throw new ApiError('VALIDATION_ERROR', 'Supabase sign-in uses your email address. Use the email address tied to your Supabase Auth account.')
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: input.password })
  if (error || !data.session) {
    throw new ApiError('UNAUTHORIZED', 'Email or password is incorrect. If this is a new account, ask the administrator to invite or activate it.')
  }
  try {
    const current = await callApi<{ user: ApiUser }>('auth.session')
    return {
      token: data.session.access_token,
      expiresAt: new Date((data.session.expires_at ?? Math.floor(Date.now() / 1000 + 3600)) * 1000).toISOString(),
      user: current.user,
    }
  } catch (sessionError) {
    await supabase.auth.signOut({ scope: 'local' })
    throw sessionError
  }
}

/** Restore Supabase Auth and obtain role-scoped application data. */
export async function restoreSession(): Promise<{ user: ApiUser; bootstrap: ApiBootstrap } | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) return null
  const bootstrap = await callApi<ApiBootstrap>('bootstrap')
  return { user: bootstrap.user, bootstrap }
}

export async function logout(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    // Remove local tokens even if Supabase's revoke endpoint cannot be reached.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
}

export async function fetchCurrentUser(): Promise<ApiUser> {
  const result = await callApi<{ user: ApiUser }>('auth.session')
  return result.user
}

/** Re-authenticate before changing the password; the password itself is sent only to Supabase Auth. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ changed: boolean; sessionsRevoked?: number }> {
  const supabase = getSupabaseClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.user.email) {
    throw new ApiError('UNAUTHORIZED', 'Sign in again before changing your password.')
  }
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: sessionData.session.user.email,
    password: currentPassword,
  })
  if (reauthError) throw new ApiError('UNAUTHORIZED', 'Your current password is incorrect.')

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
  // Supabase Auth owns session revocation. The UI deliberately does not claim that
  // other active refresh tokens were revoked unless Supabase reports that fact.
  return { changed: true, sessionsRevoked: 0 }
}

export async function hasStoredSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    return Boolean(data.session)
  } catch {
    return false
  }
}
