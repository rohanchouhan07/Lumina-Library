import { API_TIMEOUT_MS, IS_API_CONFIGURED } from '@/config/env'
import { ApiError, type ApiEnvelope } from '@/types/api'
import { clearSupabaseSession, getSupabaseClient } from './supabaseClient'

/** All dashboard requests use this one Supabase RPC boundary. */
const READ_ACTIONS = new Set([
  'health', 'ping', 'bootstrap', 'auth.session', 'books.list', 'books.get', 'users.list', 'users.me',
  'loans.list', 'reservations.list', 'wishlist.list', 'settings.get', 'reports.dashboard',
  'reports.analytics', 'activity.list', 'system.diagnostics', 'catalogue.public',
])

const EDGE_USER_ACTIONS = new Set(['users.create', 'users.update', 'users.setStatus', 'users.resetPassword'])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type RequestOptions = { anonymous?: boolean; timeoutMs?: number }

export function isBackendConfigured(): boolean {
  return IS_API_CONFIGURED
}

function fromSupabaseError(error: { message?: string; code?: string; status?: number; name?: string }): ApiError {
  const message = error.message ?? 'The Supabase request could not be completed.'
  const code = String(error.code ?? '')
  const status = Number(error.status ?? 0)
  if (status === 401 || code === 'PGRST301' || /jwt expired|invalid jwt|not authenticated/i.test(message)) {
    return new ApiError('UNAUTHORIZED', 'Your session has expired. Sign in again.', { status: status || undefined })
  }
  if (status === 403 || code === '42501') return new ApiError('FORBIDDEN', message, { status: status || undefined })
  if (status === 404 || code === 'PGRST202') {
    return new ApiError('CONFIG_ERROR', 'The Supabase lumina_api RPC or manage-user function is not deployed yet.', { status: status || undefined })
  }
  if (status === 409 || code === '23505') return new ApiError('CONFLICT', message, { status: status || undefined })
  if (status === 429) return new ApiError('RATE_LIMITED', 'Supabase is rate-limiting this request. Please retry in a moment.', { status })
  if (status >= 500) return new ApiError('SERVER_ERROR', 'Supabase could not complete this request. Please retry.', { status })
  if (error.name?.includes('Fetch') || /failed to fetch|network|timeout/i.test(message)) {
    return new ApiError('NETWORK_ERROR', 'Could not reach Supabase. Check the project URL and your internet connection.')
  }
  return new ApiError('SERVER_ERROR', message, { status: status || undefined })
}

function unwrap<T>(value: unknown): T {
  const envelope = value as ApiEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') {
    throw new ApiError('MALFORMED_RESPONSE', 'Supabase returned an unexpected response. Check that the migrations are installed.')
  }
  if (!envelope.ok || envelope.error) {
    const code = envelope.error?.code ?? 'SERVER_ERROR'
    const message = envelope.error?.message ?? 'The request could not be completed.'
    if (code === 'UNAUTHORIZED') void clearSupabaseSession()
    throw new ApiError(code as ConstructorParameters<typeof ApiError>[0], message)
  }
  return envelope.data as T
}

async function callOnce<T>(action: string, payload: Record<string, unknown>, options: RequestOptions): Promise<T> {
  if (!IS_API_CONFIGURED) {
    throw new ApiError('NOT_CONFIGURED', 'Create a Supabase project, then add its URL and public key to the app settings.')
  }
  const supabase = getSupabaseClient()
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    if (EDGE_USER_ACTIONS.has(action)) {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action, payload },
        signal: controller.signal,
        timeout: timeoutMs,
        // The SDK supplies the current user JWT. This function uses its server-only
        // secret key internally; no privileged key is bundled into the app.
      })
      if (error) {
        const functionError = error as { message?: string; code?: string; status?: number; name?: string; context?: { status?: number } }
        throw fromSupabaseError({ ...functionError, status: functionError.context?.status ?? functionError.status })
      }
      return unwrap<T>(data)
    }

    // `anonymous` remains part of the transport contract, but Supabase sends only
    // its public key when signed out; after sign-in the SDK attaches the Auth JWT.
    void options.anonymous
    const rpc = supabase.rpc('lumina_api', {
      p_action: action,
      p_payload: payload,
    }).abortSignal(controller.signal)
    const { data, error } = await rpc
    if (error) throw fromSupabaseError(error as { message?: string; code?: string; status?: number; name?: string })
    return unwrap<T>(data)
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'Supabase took too long to respond. Please retry.')
    if (error instanceof ApiError) throw error
    throw fromSupabaseError(error as { message?: string; code?: string; status?: number; name?: string })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Maintains the same application-facing action contract while moving transport
 * from Google Apps Script to Supabase RPC + Auth. Writes are never auto-retried.
 */
export async function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await callOnce<T>(action, payload, options)
  } catch (error) {
    const retriable = error instanceof ApiError && ['NETWORK_ERROR', 'MALFORMED_RESPONSE'].includes(error.code)
    if (!retriable || !READ_ACTIONS.has(action)) throw error
    await sleep(600)
    return callOnce<T>(action, payload, options)
  }
}

export interface HealthProbe {
  ok: boolean
  message: string
  latencyMs?: number
  details?: unknown
}

/** Admin-facing connection check: does Supabase answer the live RPC? */
export async function probeBackend(): Promise<HealthProbe> {
  if (!IS_API_CONFIGURED) return { ok: false, message: 'Supabase is not configured — running on local demo data.' }
  const started = performance.now()
  try {
    const data = await callApi<{ service: string; version: string; time: string }>('health', {}, { anonymous: true })
    return {
      ok: true,
      message: `${data.service} v${data.version} responded`,
      latencyMs: Math.round(performance.now() - started),
      details: data,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'Health check failed.',
      latencyMs: Math.round(performance.now() - started),
    }
  }
}

export { ApiError }

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please retry.'
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'UNAUTHORIZED'
}
