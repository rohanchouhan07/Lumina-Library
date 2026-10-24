/**
 * Public, build-time configuration.
 * Only NON-SECRET values belong here — Vite inlines them into the bundle.
 * The API base URL is a public Apps Script Web App URL; it holds no key.
 */
const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

/** Base URL of the Apps Script Web App, or '' when the app runs in offline demo mode. */
export const API_BASE_URL = rawBase.replace(/\/+$/, '')

/** True when a backend is configured — the app then requires real credentials. */
export const IS_API_CONFIGURED = API_BASE_URL.length > 0

/** Request timeout for normal calls. */
export const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30000)

/** Where the session token is kept: sessionStorage by default, localStorage when "remember me". */
export const SESSION_STORAGE_KEY = 'lumina.session.token.v1'
export const REMEMBER_STORAGE_KEY = 'lumina.session.remember.v1'

/**
 * Optional demo credentials hint shown on the login screen.
 * Never the authentication mechanism: the backend decides who you are.
 * Leave empty in a real deployment.
 */
export const SHOW_DEMO_HINTS = (import.meta.env.VITE_SHOW_DEMO_HINTS ?? 'false') === 'true'
