/**
 * Live proof of the 2.2.0 password rules on a real account — using the desk account, never the admin.
 *
 *   LIB_ID=LIB-QA LIB_PASSWORD=Desk@2026 node qa-tools/live-password-rotation.mjs
 *
 * 1. open two sessions for the same account
 * 2. rotate the password from session A
 * 3. session A keeps working, session B is revoked, the old password is dead
 * 4. the new password signs in
 * 5. rotate straight back, so the account ends where it started
 */
const API = process.env.API || ''
if (!API) {
  console.error('Set API to your deployed /exec URL.')
  process.exit(2)
}
const LIB_ID = process.env.LIB_ID || 'LIB-QA'
const LIB_PASSWORD = process.env.LIB_PASSWORD || 'Desk@2026'
const TEMP = process.env.TEMP_PASSWORD || 'DeskTemp@2026'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const call = async (action, payload = {}, token) => {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, token }),
    redirect: 'follow',
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: text.slice(0, 120) } }
  }
}

const login = (password) => call('auth.login', { identifier: LIB_ID, password })

const first = await login(LIB_PASSWORD)
check('the desk account signs in', first.ok, first.data?.user?.role ?? first.error?.code)
if (!first.ok) process.exit(1)

const tokenA = first.data.token
const second = await login(LIB_PASSWORD)
check('a second concurrent session opens', second.ok)
const tokenB = second.data?.token

const rotated = await call('auth.changePassword', { currentPassword: LIB_PASSWORD, newPassword: TEMP }, tokenA)
check('the password rotates from session A', rotated.ok, JSON.stringify(rotated.data ?? rotated.error))
check(
  'the response reports how many other sessions were revoked',
  typeof rotated.data?.sessionsRevoked === 'number' && rotated.data.sessionsRevoked >= 1,
  String(rotated.data?.sessionsRevoked),
)

const stillA = await call('auth.session', {}, tokenA)
check('session A survives the change (the caller is not logged out)', stillA.ok)

const deadB = await call('auth.session', {}, tokenB)
check('session B was revoked', !deadB.ok, deadB.error?.code)

const oldPassword = await login(LIB_PASSWORD)
check('the old password no longer works', !oldPassword.ok, oldPassword.error?.code)

const newPassword = await login(TEMP)
check('the new password works', newPassword.ok)

const wrongCurrent = await call(
  'auth.changePassword',
  { currentPassword: 'not-the-password', newPassword: 'Whatever@2026' },
  newPassword.data?.token,
)
check('a wrong current password is refused', !wrongCurrent.ok, wrongCurrent.error?.code)

const restored = await call(
  'auth.changePassword',
  { currentPassword: TEMP, newPassword: LIB_PASSWORD },
  newPassword.data?.token,
)
check('the account is restored to its original password', restored.ok)

const finalLogin = await login(LIB_PASSWORD)
check('the original password works again', finalLogin.ok)

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY ===`)
console.log(`Passed: ${results.length - failures.length}/${results.length}`)
if (failures.length) {
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
