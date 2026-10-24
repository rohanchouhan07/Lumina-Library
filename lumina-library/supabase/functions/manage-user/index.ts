// Supabase Edge Function: authenticated staff-only account administration.
// Deploy from Supabase Dashboard → Edge Functions → Create function: manage-user.
// The Supabase secret/service-role key is read only in this server runtime.
// NEVER expose it as a VITE_* variable or paste it into chat.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const failure = (code: string, message: string, status = 200) =>
  json({ ok: false, error: { code, message } }, status)

const allowedRoles = new Set(['ADMIN', 'LIBRARIAN', 'FACULTY', 'STUDENT'])
const allowedStatuses = new Set(['ACTIVE', 'INACTIVE'])
const safeText = (value: unknown, max: number, fallback = '') => String(value ?? fallback).trim().slice(0, max)

/**
 * supabase-js uses its configured key as an Authorization fallback when a
 * client has no Auth session. New `sb_secret_` keys are opaque API keys, not
 * JWTs, and must be sent only in `apikey`. Strip only the exact secret-key
 * fallback; preserve user JWTs and legacy service_role JWTs.
 */
function createAdminFetch(apiKey: string): typeof fetch {
  if (!apiKey.startsWith('sb_secret_')) return fetch
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (headers.get('Authorization') === `Bearer ${apiKey}`) headers.delete('Authorization')
    return fetch(input, { ...init, headers })
  }
}

function publicUser(profile: Record<string, unknown>) {
  return {
    userId: profile.user_code,
    name: profile.full_name,
    email: profile.email,
    institutionalId: profile.institutional_id,
    role: profile.role,
    department: profile.department,
    accountStatus: profile.account_status,
    phone: profile.phone,
    borrowingLimit: profile.borrowing_limit,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return failure('UNKNOWN_ACTION', 'Use POST for account administration.', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  // New key dictionaries are the current Supabase Edge Runtime variables. Keep
  // legacy fallbacks only for older projects during the API-key transition.
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  const anonKey = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return failure('CONFIG_ERROR', 'The manage-user function is missing its Supabase runtime configuration.', 500)
  }

  const authorization = req.headers.get('Authorization') ?? ''
  const jwt = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return failure('UNAUTHORIZED', 'Sign in as a library staff member first.', 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createAdminFetch(serviceKey) },
  })

  try {
    const { data: userResult, error: authError } = await callerClient.auth.getUser(jwt)
    if (authError || !userResult.user) return failure('UNAUTHORIZED', 'Your session is invalid or expired.', 401)

    const { data: actor, error: actorError } = await admin
      .from('profiles')
      .select('id,user_code,full_name,email,institutional_id,role,department,phone,account_status,borrowing_limit')
      .eq('id', userResult.user.id)
      .maybeSingle()
    if (actorError || !actor) return failure('UNAUTHORIZED', 'This login has no library profile.', 401)
    if (actor.account_status !== 'ACTIVE') return failure('FORBIDDEN', 'This library account is inactive.', 403)
    if (!['ADMIN', 'LIBRARIAN'].includes(actor.role)) return failure('FORBIDDEN', 'Only library staff can manage accounts.', 403)

    const body = await req.json().catch(() => null) as { action?: string; payload?: Record<string, unknown> } | null
    const action = String(body?.action ?? '')
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}

    if (action === 'users.create') {
      const name = safeText(payload.name, 120)
      const email = safeText(payload.email, 254).toLowerCase()
      const institutionalId = safeText(payload.institutionalId, 40)
      const password = String(payload.password ?? '')
      const role = safeText(payload.role, 16).toUpperCase()
      const status = safeText(payload.accountStatus, 16, 'ACTIVE').toUpperCase()
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || institutionalId.length < 2) {
        return failure('VALIDATION_ERROR', 'Name, valid email and institutional ID are required.')
      }
      if (password.length < 8) return failure('VALIDATION_ERROR', 'Use a password of at least 8 characters.')
      if (!allowedRoles.has(role) || !allowedStatuses.has(status)) return failure('VALIDATION_ERROR', 'The role or account status is invalid.')
      if (actor.role !== 'ADMIN' && role === 'ADMIN') return failure('FORBIDDEN', 'Only an administrator can create administrator accounts.', 403)
      const borrowingLimit = payload.borrowingLimit === '' || payload.borrowingLimit == null
        ? null
        : Number(payload.borrowingLimit)
      if (borrowingLimit !== null && (!Number.isInteger(borrowingLimit) || borrowingLimit < 0 || borrowingLimit > 50)) {
        return failure('VALIDATION_ERROR', 'Borrowing limit must be an integer from 0 to 50.')
      }

      // Check the profile's unique keys before Auth inserts auth.users. The
      // auth.users trigger creates the profile in the same transaction; without
      // this preflight, a reused institutional ID becomes the opaque Auth error
      // "Database error creating new user" rather than a useful conflict.
      const [emailCheck, institutionalIdCheck] = await Promise.all([
        admin.from('profiles').select('id').eq('email', email).maybeSingle(),
        admin.from('profiles').select('id').eq('institutional_id', institutionalId).maybeSingle(),
      ])
      if (emailCheck.error || institutionalIdCheck.error) {
        console.error('manage-user profile uniqueness check failed', {
          emailCode: emailCheck.error?.code ?? null,
          institutionalIdCode: institutionalIdCheck.error?.code ?? null,
        })
        return failure('SERVER_ERROR', 'Could not check for an existing email or institutional ID. Please retry.')
      }
      if (emailCheck.data || institutionalIdCheck.data) {
        return failure('CONFLICT', 'An account with this email or institutional ID already exists. Use unique account details.')
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, institutional_id: institutionalId },
      })
      if (createError || !created.user) {
        const code = String(createError?.code ?? '')
        const status = Number(createError?.status ?? 0)
        if (['email_exists', 'user_already_exists'].includes(code)) {
          return failure('CONFLICT', 'An Auth account already uses this email address.')
        }
        if (status >= 500 || code === 'unexpected_failure' || /database error creating new user/i.test(createError?.message ?? '')) {
          // Do not log the email, password, metadata, or raw request. The SQLSTATE
          // in Supabase Postgres Logs is needed to diagnose trigger/constraint errors.
          console.error('manage-user Auth user creation failed', { code: code || 'unknown', status })
          return failure(
            'SERVER_ERROR',
            'Supabase Auth could not save this account. Check Supabase Postgres Logs for the underlying trigger or constraint error.',
          )
        }
        return failure('VALIDATION_ERROR', createError?.message ?? 'The Auth account could not be created.')
      }

      const profilePatch = {
        full_name: name,
        email,
        institutional_id: institutionalId,
        role,
        department: safeText(payload.department, 120),
        phone: safeText(payload.phone, 30),
        account_status: status,
        borrowing_limit: borrowingLimit,
      }
      const { data: profile, error: profileError } = await admin
        .from('profiles').update(profilePatch).eq('id', created.user.id).select('*').single()
      if (profileError || !profile) {
        // Roll back the Auth account too if the matching library profile cannot be saved.
        await admin.auth.admin.deleteUser(created.user.id)
        return failure('CONFLICT', profileError?.message ?? 'The library profile could not be created.')
      }
      await admin.from('activity_log').insert({ actor_user_id: actor.id, action: 'user.created', entity_type: 'user', entity_id: profile.user_code, summary: `Created ${role} account` })
      return json({ ok: true, data: { user: publicUser(profile) } })
    }

    const userCode = safeText(payload.userId, 40)
    if (!userCode) return failure('VALIDATION_ERROR', 'Member ID is required.')
    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('*')
      .eq('user_code', userCode)
      .maybeSingle()
    if (targetError || !target) return failure('NOT_FOUND', 'That account does not exist.')
    if (actor.role !== 'ADMIN' && target.role === 'ADMIN') return failure('FORBIDDEN', 'Only an administrator can manage an administrator account.', 403)

    if (action === 'users.update') {
      const nextRole = safeText(payload.role, 16, target.role).toUpperCase()
      if (!allowedRoles.has(nextRole)) return failure('VALIDATION_ERROR', 'The role is invalid.')
      if (actor.role !== 'ADMIN' && nextRole === 'ADMIN') return failure('FORBIDDEN', 'Only an administrator can assign the ADMIN role.', 403)

      const nextEmail = safeText(payload.email, 254, String(target.email)).toLowerCase()
      const nextName = safeText(payload.name, 120, String(target.full_name))
      const nextInstitutionalId = safeText(payload.institutionalId, 40, String(target.institutional_id))
      const nextDepartment = safeText(payload.department, 120, String(target.department ?? ''))
      const nextPhone = safeText(payload.phone, 30, String(target.phone ?? ''))
      const nextStatus = payload.accountStatus ? String(payload.accountStatus).toUpperCase() : String(target.account_status)
      const borrowingLimit = payload.borrowingLimit === '' || payload.borrowingLimit == null
        ? null
        : Number(payload.borrowingLimit)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) || nextName.length < 2 || nextInstitutionalId.length < 2) {
        return failure('VALIDATION_ERROR', 'Name, valid email and institutional ID are required.')
      }
      if (!allowedStatuses.has(nextStatus)) return failure('VALIDATION_ERROR', 'The account status is invalid.')
      if (target.id === actor.id && nextStatus === 'INACTIVE') return failure('CONFLICT', 'You cannot deactivate your own account.')
      if (borrowingLimit !== null && (!Number.isInteger(borrowingLimit) || borrowingLimit < 0 || borrowingLimit > 50)) {
        return failure('VALIDATION_ERROR', 'Borrowing limit must be an integer from 0 to 50.')
      }
      if (payload.password && String(payload.password).length < 8) return failure('VALIDATION_ERROR', 'Use a password of at least 8 characters.')

      const { data: emailDuplicate } = await admin.from('profiles').select('id').eq('email', nextEmail).neq('id', target.id).maybeSingle()
      const { data: idDuplicate } = await admin.from('profiles').select('id').eq('institutional_id', nextInstitutionalId).neq('id', target.id).maybeSingle()
      if (emailDuplicate || idDuplicate) return failure('CONFLICT', 'That email or institutional ID is already assigned to another account.')

      const patch = {
        full_name: nextName,
        email: nextEmail,
        institutional_id: nextInstitutionalId,
        role: nextRole,
        department: nextDepartment,
        phone: nextPhone,
        borrowing_limit: borrowingLimit,
        account_status: nextStatus,
      }
      const { data: profile, error: profileError } = await admin.from('profiles').update(patch).eq('id', target.id).select('*').single()
      if (profileError || !profile) return failure('CONFLICT', 'The library profile could not be updated. Check for a duplicate email or institutional ID.')

      const authChanges: { email?: string; email_confirm?: boolean; password?: string } = {}
      if (nextEmail !== target.email) {
        authChanges.email = nextEmail
        authChanges.email_confirm = true
      }
      if (payload.password) authChanges.password = String(payload.password)
      if (Object.keys(authChanges).length) {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.id, authChanges)
        if (authUpdateError) {
          await admin.from('profiles').update({
            full_name: target.full_name,
            email: target.email,
            institutional_id: target.institutional_id,
            role: target.role,
            department: target.department,
            phone: target.phone,
            borrowing_limit: target.borrowing_limit,
            account_status: target.account_status,
          }).eq('id', target.id)
          return failure('CONFLICT', 'The profile update was rolled back because Supabase Auth could not update the account.')
        }
      }
      await admin.from('activity_log').insert({ actor_user_id: actor.id, action: 'user.updated', entity_type: 'user', entity_id: target.user_code, summary: 'Updated member account' })
      return json({ ok: true, data: { user: publicUser(profile) } })
    }

    if (action === 'users.setStatus') {
      const accountStatus = safeText(payload.accountStatus, 16).toUpperCase()
      if (!allowedStatuses.has(accountStatus)) return failure('VALIDATION_ERROR', 'The account status is invalid.')
      if (target.id === actor.id && accountStatus === 'INACTIVE') return failure('CONFLICT', 'You cannot deactivate your own account.')
      const { data: profile, error } = await admin.from('profiles').update({ account_status: accountStatus }).eq('id', target.id).select('*').single()
      if (error || !profile) return failure('SERVER_ERROR', error?.message ?? 'The account status could not be changed.')
      await admin.from('activity_log').insert({ actor_user_id: actor.id, action: 'user.status', entity_type: 'user', entity_id: target.user_code, summary: `${accountStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'} member account` })
      return json({ ok: true, data: { user: publicUser(profile) } })
    }

    if (action === 'users.resetPassword') {
      const newPassword = String(payload.newPassword ?? '')
      if (newPassword.length < 8) return failure('VALIDATION_ERROR', 'Use a password of at least 8 characters.')
      const { error } = await admin.auth.admin.updateUserById(target.id, { password: newPassword })
      if (error) return failure('SERVER_ERROR', error.message)
      await admin.from('activity_log').insert({ actor_user_id: actor.id, action: 'user.password_reset', entity_type: 'user', entity_id: target.user_code, summary: 'Reset member password' })
      return json({ ok: true, data: { reset: true } })
    }

    return failure('UNKNOWN_ACTION', `Unknown account action: ${action.slice(0, 60)}`)
  } catch (error) {
    // Keep auth tokens/passwords out of logs and user-facing exceptions.
    console.error('manage-user request failed')
    return failure('SERVER_ERROR', error instanceof Error ? error.message : 'Account administration failed.', 500)
  }
})
