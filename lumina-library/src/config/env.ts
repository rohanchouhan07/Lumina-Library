/**
 * Public, build-time Supabase configuration.
 *
 * These two values are intentionally public in a browser build. Database tables
 * have no direct anon/authenticated policies: the public key cannot read them
 * without the Supabase Auth JWT + the role checks inside lumina_api(). NEVER put
 * a service-role/secret key in VITE_* variables or frontend source.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
export const SUPABASE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
).trim()

/** The app is live only after both public Supabase settings are present. */
export const IS_API_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

/** Used by the Settings → Connection card; the key itself is deliberately hidden. */
export const API_BASE_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/rpc/lumina_api` : ''

/** Request budget for non-password operations. */
export const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30000)

/** Optional demo credentials hint shown on the login screen; never the auth mechanism. */
export const SHOW_DEMO_HINTS = (import.meta.env.VITE_SHOW_DEMO_HINTS ?? 'false') === 'true'
