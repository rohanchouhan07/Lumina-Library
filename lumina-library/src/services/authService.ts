import { callApi, getSessionToken, setSessionToken } from './apiClient'
import type { ApiBootstrap, ApiLoginResult, ApiUser } from '@/types/api'

export interface LoginInput {
  identifier: string
  password: string
  remember: boolean
}

/** Authenticate against the backend. The role always comes from the server response. */
export async function login(input: LoginInput): Promise<ApiLoginResult> {
  const result = await callApi<ApiLoginResult>(
    'auth.login',
    { identifier: input.identifier.trim(), password: input.password, remember: input.remember },
    { anonymous: true },
  )
  setSessionToken(result.token, input.remember)
  return result
}

/** Restore a session after a reload: validates the stored token with the server. */
export async function restoreSession(): Promise<{ user: ApiUser; bootstrap: ApiBootstrap } | null> {
  const token = getSessionToken()
  if (!token) return null
  const bootstrap = await callApi<ApiBootstrap>('bootstrap')
  return { user: bootstrap.user, bootstrap }
}

export async function logout(): Promise<void> {
  try {
    await callApi<{ loggedOut: boolean }>('auth.logout')
  } catch {
    // Even if the server cannot be reached, the local token must be discarded.
  } finally {
    setSessionToken(null)
  }
}

export async function fetchCurrentUser(): Promise<ApiUser> {
  return callApi<ApiUser>('auth.session')
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ changed: boolean; sessionsRevoked?: number }> {
  return callApi<{ changed: boolean; sessionsRevoked?: number }>('auth.changePassword', {
    currentPassword,
    newPassword,
  })
}

export function hasStoredSession(): boolean {
  return Boolean(getSessionToken())
}
