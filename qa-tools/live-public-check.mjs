/**
 * Public (unauthenticated) checks against a real deployment.
 *
 *   API='https://script.google.com/macros/s/.../exec' node qa-tools/live-public-check.mjs
 *
 * Proves the deployment itself is reachable, correctly configured and speaking the
 * documented envelope — transport, CORS, error codes, throttling — without any
 * credential. It never authenticates, never writes, and never touches a record.
 */
const API = process.env.API
if (!API) {
  console.error('Set API=<your /exec url>')
  process.exit(2)
}

let pass = 0
const failures = []
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1
    console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`)
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`)
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Google's edge intermittently answers with an HTML interstitial; a single retry is
 * enough and keeps the suite honest about the deployment rather than about the CDN.
 */
const get = async (query, attempts = 3) => {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${API}${query}`, { redirect: 'follow' })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* left null */
    }
    last = { response, text, json }
    if (json) return last
    if (attempt < attempts) await sleepMs(2000 * attempt)
  }
  return last
}

const post = async (body, origin) => {
  const started = Date.now()
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(origin ? { Origin: origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'follow',
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* left null */
  }
  return { response, text, json, ms: Date.now() - started }
}

console.log(`Target: ${API}\n`)

/* ---------------------------------------------------------------- transport */

const health = await get('?action=health')
check('GET ?action=health returns HTTP 200', health.response.status === 200, String(health.response.status))
check('health is a JSON envelope with ok:true', health.json?.ok === true, health.text.slice(0, 80))
check('health reports the API version', /^\d+\.\d+\.\d+$/.test(health.json?.data?.version ?? ''), health.json?.data?.version)
check(
  'health lists the sheet tabs',
  Array.isArray(health.json?.data?.tabs) && health.json.data.tabs.length > 0,
  (health.json?.data?.tabs ?? []).join(', '),
)
check(
  'every logical tab exists',
  ['Users', 'Loans', 'Reservations', 'ActivityLogs', 'Settings', 'Sessions', 'Wishlists'].every((tab) =>
    (health.json?.data?.tabs ?? []).includes(tab),
  ),
  'Users, Loans, Reservations, ActivityLogs, Settings, Sessions, Wishlists',
)
check('health does not leak the spreadsheet id', !/18CGNA07/.test(health.text))
check(
  'health reports row counts',
  typeof health.json?.data?.counts?.books === 'number' && typeof health.json?.data?.counts?.users === 'number',
  JSON.stringify(health.json?.data?.counts),
)

const ping = await get('?action=ping')
check('GET ?action=ping answers', ping.json?.ok === true && ping.json?.data?.pong === true)

const badGet = await get('?action=books.list')
check(
  'GET refuses a data action',
  badGet.json?.ok === false && badGet.json?.error?.code === 'UNKNOWN_ACTION',
  badGet.json?.error?.code,
)

/* ------------------------------------------------------------------- CORS */

const cors = await post({ action: 'health', payload: {} }, 'http://localhost:5173')
const allowOrigin = cors.response.headers.get('access-control-allow-origin')
check('POST is accepted as text/plain', cors.response.status === 200, String(cors.response.status))
check('the response carries CORS headers for the browser', allowOrigin === '*' || allowOrigin !== null, String(allowOrigin))
check('POST health returns the same envelope', cors.json?.ok === true && cors.json?.data?.service === 'lumina-library-api')
check('a round trip is not hung (cold start included)', cors.ms < 30_000, `${cors.ms} ms`)

/* --------------------------------------------------------------- envelope */

const noToken = await post({ action: 'bootstrap', payload: {} })
check(
  'bootstrap without a token → UNAUTHORIZED',
  noToken.json?.ok === false && noToken.json?.error?.code === 'UNAUTHORIZED',
  noToken.json?.error?.message,
)

const junkToken = await post({ action: 'books.list', payload: {}, token: 'not-a-real-token' })
check(
  'a forged token → UNAUTHORIZED',
  junkToken.json?.ok === false && junkToken.json?.error?.code === 'UNAUTHORIZED',
  junkToken.json?.error?.message,
)

const unknown = await post({ action: 'does.not.exist', payload: {} })
check(
  'an unknown action → UNKNOWN_ACTION',
  unknown.json?.error?.code === 'UNKNOWN_ACTION',
  unknown.json?.error?.code,
)

const malformed = await post('this is not json')
check(
  'a malformed body → VALIDATION_ERROR (not a 500)',
  malformed.json?.ok === false && malformed.json?.error?.code === 'VALIDATION_ERROR',
  malformed.json?.error?.code,
)

// Fresh identifiers each run: the throttle keys on the identifier, so reusing one would
// turn this check into a RATE_LIMITED result on the second run.
const RUN = Date.now().toString(36)
const wrongPassword = await post({
  action: 'auth.login',
  payload: { identifier: `no-such-account-${RUN}@example.com`, password: 'wrong-password' },
})
check(
  'a wrong sign-in → UNAUTHORIZED with a person-readable message',
  wrongPassword.json?.ok === false &&
    wrongPassword.json?.error?.code === 'UNAUTHORIZED' &&
    /incorrect/i.test(wrongPassword.json?.error?.message ?? ''),
  wrongPassword.json?.error?.message,
)
check(
  'the sign-in error does not reveal whether the account exists',
  !/no such user|not found|unknown user/i.test(wrongPassword.json?.error?.message ?? ''),
)
check('no hash, salt or token appears in that response', !/hash|salt|token/i.test(wrongPassword.text))

/* -------------------------------------------------------------- throttling */

let throttled = null
for (let i = 0; i < 9; i += 1) {
  const attempt = await post({
    action: 'auth.login',
    payload: { identifier: `no-such-account-throttle-${RUN}@example.com`, password: `wrong-${i}` },
  })
  throttled = attempt.json?.error?.code
  if (throttled === 'RATE_LIMITED') break
}
check('repeated failed sign-ins are throttled', throttled === 'RATE_LIMITED', String(throttled))
console.log('       (deliberately used an account that does not exist — the real admin is untouched)')

/* ---------------------------------------------------------------- summary */

console.log(`\n=== SUMMARY ===`)
console.log(`Passed: ${pass}/${pass + failures.length}`)
if (failures.length) {
  console.log('Failures:')
  failures.forEach((failure) => console.log(`  · ${failure}`))
  process.exit(1)
}
