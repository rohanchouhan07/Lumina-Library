import { createClient } from '@supabase/supabase-js'
import type { SupportedStorage, SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/types/api'
import { IS_API_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config/env'

let client: SupabaseClient | null = null

function sessionStorageValue(method: 'getItem' | 'setItem' | 'removeItem', key: string, value?: string) {
  try {
    const target = window.sessionStorage
    if (method === 'getItem') return target.getItem(key)
    if (method === 'setItem' && value !== undefined) target.setItem(key, value)
    if (method === 'removeItem') target.removeItem(key)
  } catch {
    // Restricted browser storage: the Auth SDK will surface a session error if needed.
  }
  return null
}

/**
 * Supabase Auth keeps its short-lived access/refresh session in sessionStorage
 * only. This app deliberately does not persist authentication tokens in
 * localStorage; closing the browser tab clears the session.
 */
const authStorage: SupportedStorage = {
  getItem(key) {
    return sessionStorageValue('getItem', key)
  },
  setItem(key, value) {
    sessionStorageValue('setItem', key, value)
  },
  removeItem(key) {
    sessionStorageValue('removeItem', key)
  },
}

/**
 * New opaque publishable keys belong in `apikey`, not as bearer tokens. The
 * SDK uses its key as the Authorization fallback while signed out, so remove
 * only that exact fallback for `sb_publishable_` keys. Keep legacy anon JWTs
 * working, and never remove a real user's Auth JWT.
 */
const supabaseFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  if (
    SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') &&
    headers.get('Authorization') === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  ) {
    headers.delete('Authorization')
  }
  return fetch(input, { ...init, headers })
}

export function getSupabaseClient(): SupabaseClient {
  if (!IS_API_CONFIGURED) {
    throw new ApiError(
      'NOT_CONFIGURED',
      'Supabase is not configured yet. Add VITE_SUPABASE_URL and the public publishable/anon key.',
    )
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: supabaseFetch },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: authStorage,
      },
    })
  }
  return client
}

/** Clear the current tab's Supabase session after an authorization failure. */
export async function clearSupabaseSession() {
  if (!IS_API_CONFIGURED || !client) return
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    // The invalid token is unusable even if Supabase's revoke endpoint is offline.
  }
}
