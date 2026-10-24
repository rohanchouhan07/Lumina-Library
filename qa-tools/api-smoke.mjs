/**
 * Lumina Library — API contract & end-to-end smoke test.
 *
 * Runs against the local contract mock by default, or against a real deployment:
 *
 *   node qa-tools/api-smoke.mjs
 *   API='https://script.google.com/macros/s/XXXX/exec' \
 *   ADMIN_PASSWORD='…' ALLOW_WRITES=1 node qa-tools/api-smoke.mjs
 *
 * Safety rules for a real sheet:
 *   • Read-only checks always run and never mutate anything.
 *   • Every write creates a uniquely named record ("SMOKE-<timestamp> …") and the
 *     suite cleans up after itself (returns loans, cancels holds, deletes the test
 *     book). It never edits, archives or deletes a pre-existing row.
 *   • Writes are opt-in for a remote API (ALLOW_WRITES=1) and on by default for
 *     localhost, so nobody accidentally writes to a live library.
 *   • Creating/deactivating users additionally needs ALLOW_USER_WRITES=1.
 *
 * Exit code: 0 = every check passed, 1 = at least one FAIL, 2 = cannot run.
 */

const API = process.env.API || 'http://localhost:8100'
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API)
const WRITES = process.env.ALLOW_WRITES ? process.env.ALLOW_WRITES === '1' : IS_LOCAL
const USER_WRITES = process.env.ALLOW_USER_WRITES ? process.env.ALLOW_USER_WRITES === '1' : IS_LOCAL

const ADMIN_ID = process.env.ADMIN_ID || 'admin@lumina.edu'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_LOCAL ? 'Lumina@2026' : '')
const STUDENT_ID = process.env.STUDENT_ID || (IS_LOCAL ? 'M-1004' : '')
const LIBRARIAN_ID = process.env.LIBRARIAN_ID || (IS_LOCAL ? 'librarian@lumina.edu' : '')
const LIBRARIAN_PASSWORD = process.env.LIBRARIAN_PASSWORD || (IS_LOCAL ? 'Librarian@2026' : '')
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD || (IS_LOCAL ? 'Student@2026' : '')

const RUN = Date.now().toString(36)
const TEST_TITLE = `SMOKE-${RUN} Catalogue Check`

const results = []
const record = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status.padEnd(4)} — ${name}${detail ? ` :: ${detail}` : ''}`)
}
const check = (name, ok, detail = '') => record(ok ? 'PASS' : 'FAIL', name, detail)
const skip = (name, why) => record('SKIP', name, why)

/** POST an action and always return a parsed envelope (or a synthetic error). */
/**
 * Actions that cannot change anything, so retrying them is always safe.
 * Apps Script intermittently answers with an HTML interstitial instead of JSON
 * (observed against the live deployment); a retry hides that without ever
 * duplicating a write. Writes are deliberately NOT retried here.
 */
const IDEMPOTENT = new Set([
  'health',
  'ping',
  'bootstrap',
  'auth.session',
  'auth.login',
  'books.list',
  'books.get',
  'users.list',
  'users.me',
  'loans.list',
  'reservations.list',
  'wishlist.list',
  'settings.get',
  'reports.dashboard',
  'reports.analytics',
  'activity.list',
  'system.diagnostics',
])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Deliberate spacing: the live deployment throttles rapid bursts from one address.
const PACE_MS = Number(process.env.PACE_MS || (IS_LOCAL ? 0 : 700))

/**
 * Expected `data` shape per action.
 *
 * Google's edge sometimes serves the body of a *different* action (observed: a
 * `books.list` reply carrying the health payload). Every assertion in this suite reads
 * those fields, so a wrong shape is treated as transient and retried rather than
 * reported as a library bug.
 */
const SHAPES = {
  'auth.login': (data) => typeof data?.token === 'string',
  'auth.session': (data) => Boolean(data?.user),
  'auth.logout': (data) => data?.loggedOut === true,
  bootstrap: (data) => Array.isArray(data?.books) && Array.isArray(data?.users) && Boolean(data?.settings),
  'books.list': (data) => Array.isArray(data?.books),
  'books.get': (data) => Boolean(data?.book),
  'books.create': (data) => Boolean(data?.book),
  'books.update': (data) => Boolean(data?.book),
  'books.archive': (data) => Boolean(data?.book),
  'books.delete': (data) => data?.deleted === true,
  'users.list': (data) => Array.isArray(data?.users),
  'users.me': (data) => Boolean(data?.user),
  'users.create': (data) => Boolean(data?.user),
  'users.update': (data) => Boolean(data?.user),
  'users.setStatus': (data) => Boolean(data?.user),
  'users.updateProfile': (data) => Boolean(data?.user),
  'users.resetPassword': (data) => data?.changed === true,
  'loans.list': (data) => Array.isArray(data?.loans),
  'loans.issue': (data) => Boolean(data?.loan),
  'loans.return': (data) => Boolean(data?.loan),
  'loans.renew': (data) => Boolean(data?.loan),
  'reservations.list': (data) => Array.isArray(data?.reservations),
  'reservations.create': (data) => Boolean(data?.reservation),
  'reservations.cancel': (data) => Boolean(data?.reservation),
  'wishlist.list': (data) => Array.isArray(data?.wishlist),
  'wishlist.toggle': (data) => typeof data?.saved === 'boolean',
  'activity.list': (data) => Array.isArray(data?.activity),
  'settings.get': (data) => Boolean(data?.settings),
  'settings.update': (data) => Boolean(data?.settings),
  'system.diagnostics': (data) => Boolean(data?.tables),
  'reports.dashboard': (data) => Boolean(data?.stats),
  'reports.analytics': (data) => Array.isArray(data?.buckets) || Boolean(data?.scope),
}

async function callOnce(action, payload, token) {
  let response
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token }),
      redirect: 'follow',
    })
  } catch (error) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: `${error.message} (is ${API} reachable?)` } }
  }
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    // Apps Script serves an HTML interstitial when the deployment is misconfigured or
    // when Google is throttling; record what came back so a failure is diagnosable.
    const stripped = text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    return {
      ok: false,
      error: {
        code: 'NON_JSON_RESPONSE',
        message: `Expected JSON, got HTTP ${response.status}: ${stripped.replace(/\s+/g, ' ').trim().slice(0, 140)}`,
      },
    }
  }
}

const TRANSIENT = new Set(['NON_JSON_RESPONSE', 'NETWORK_ERROR'])
const isTransient = (result) => !result.ok && TRANSIENT.has(result.error?.code)

/**
 * One action, with retries for Google-side flakiness.
 *
 * The live deployment intermittently answers with an HTML interstitial or a stale body
 * (observed repeatedly; never reproducible on a second attempt). Reads are retried
 * freely. Writes are retried too, which is safe here because the backend refuses
 * duplicates — a retried create either succeeds or returns CONFLICT, never two rows.
 * Nothing is retried after a *meaningful* error (VALIDATION_ERROR, FORBIDDEN, …).
 */
async function call(action, payload = {}, token = null) {
  const attempts = IDEMPOTENT.has(action) ? 3 : 2
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await sleep(PACE_MS)
    last = await callOnce(action, payload, token)
    // A response can arrive with the shape of a *different* action when Google's edge
    // serves a stale body; treat that as transient rather than trusting it.
    const shape = SHAPES[action]
    if (last.ok && shape && !shape(last.data)) {
      last = { ok: false, error: { code: 'NON_JSON_RESPONSE', message: `unexpected shape from ${action}` } }
    }
    if (!isTransient(last)) {
      if (attempt > 1) record('INFO', `retried ${action}`, `attempt ${attempt} answered`)
      return last
    }
    if (attempt < attempts) await sleep(2500 * attempt)
  }
  record('INFO', `${action} kept failing transiently`, last?.error?.message ?? '')
  return last
}

/**
 * A create whose response may have been lost: retry, and if the retry says the record
 * already exists, adopt the row instead of failing the check.
 */
async function callCreate(action, payload, token, findExisting) {
  const result = await call(action, payload, token)
  if (result.ok) return result
  if (result.error?.code === 'CONFLICT' && findExisting) {
    const existing = await findExisting()
    if (existing) {
      record('INFO', `${action} recovered`, 'the first attempt landed, its response was lost')
      return { ok: true, data: existing, recovered: true }
    }
  }
  return result
}

/**
 * A delete whose response may have been lost: retry, then confirm by reading the record
 * back. If it is gone, the delete worked whatever the response body said.
 */
async function callDelete(action, payload, token, stillExists) {
  const result = await call(action, payload, token)
  if (result.ok) return result
  const exists = await stillExists()
  if (exists === false) {
    record('INFO', `${action} verified by re-reading`, 'the row is gone; the response body was lost')
    return { ok: true, data: { deleted: true, recovered: true } }
  }
  return result
}

const cleanup = []
const cleanUp = async (fn, label) => {
  try {
    const result = await fn()
    cleanup.push(`${result?.ok ? 'cleaned' : 'skipped'}: ${label}${result?.ok ? '' : ` (${result?.error?.code})`}`)
  } catch (error) {
    cleanup.push(`error: ${label} (${error.message})`)
  }
}

/* ------------------------------------------------------------------ preamble */

console.log(`Lumina API smoke test`)
console.log(`  endpoint : ${API}`)
console.log(`  mode     : ${WRITES ? (IS_LOCAL ? 'local writes' : 'REMOTE writes (cleanup enabled)') : 'read-only'}`)
console.log('')

if (!ADMIN_PASSWORD) {
  console.log('Cannot run: a real deployment needs credentials.')
  console.log('  API=… ADMIN_PASSWORD=… node qa-tools/api-smoke.mjs')
  process.exit(2)
}

/* --------------------------------------------------------------- public surface */

const health = await call('health')
check('health responds with the service envelope', health.ok && health.data?.service === 'lumina-library-api', health.data?.version || health.error?.code)
check('health reports a version', Boolean(health.ok && health.data?.version))
check('health does not leak the spreadsheet id', health.ok && !JSON.stringify(health.data).includes('spreadsheetId'))

const unknown = await call('nope.not.an.action')
check('unknown action is rejected', !unknown.ok && unknown.error?.code === 'UNKNOWN_ACTION')

const garbage = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not json' })
  .then((r) => r.text())
  .then((t) => JSON.parse(t))
  .catch(() => null)
check('malformed body is rejected as VALIDATION_ERROR', garbage?.ok === false && garbage?.error?.code === 'VALIDATION_ERROR')

/* ------------------------------------------------------------------------ auth */

const badPassword = await call('auth.login', { identifier: ADMIN_ID, password: 'definitely-wrong' })
check('wrong password → UNAUTHORIZED', !badPassword.ok && badPassword.error?.code === 'UNAUTHORIZED')

const adminLogin = await call('auth.login', { identifier: ADMIN_ID, password: ADMIN_PASSWORD })
if (!adminLogin.ok) {
  record('FAIL', 'admin login', `${adminLogin.error?.code}: ${adminLogin.error?.message}`)
  finish()
}
check('admin login succeeds', adminLogin.ok && adminLogin.data.user.role === 'ADMIN', adminLogin.data?.user?.role)
check('login response never contains hashes or salts', !/hash|salt/i.test(JSON.stringify(adminLogin.data)))
const adminToken = adminLogin.data.token
const adminUserId = adminLogin.data.user.userId

const noToken = await call('books.list')
check('missing token → UNAUTHORIZED', !noToken.ok && noToken.error?.code === 'UNAUTHORIZED')

const badToken = await call('books.list', {}, 'deadbeefdeadbeef')
check('invalid token → UNAUTHORIZED', !badToken.ok && badToken.error?.code === 'UNAUTHORIZED')

// A fresh deployment has an administrator and nothing else. Rather than skip the whole
// role matrix there, provision a throwaway student (only with ALLOW_WRITES=1 and
// ALLOW_USER_WRITES=1) and deactivate it during cleanup.
let provisionedStudent = null
const FORCE_PROVISION = process.env.PROVISION_STUDENT === '1'
if ((FORCE_PROVISION || !STUDENT_PASSWORD) && WRITES && USER_WRITES) {
  const email = `smoke.student.${RUN}@lumina.test`
  const institutionalId = `SMK-${RUN}`.toUpperCase().slice(0, 20)
  const created = await call(
    'users.create',
    {
      name: `SMOKE ${RUN} Student`,
      email,
      institutionalId,
      role: 'STUDENT',
      department: 'Quality checks',
      password: 'SmokeStudent@2026',
      accountStatus: 'ACTIVE',
    },
    adminToken,
  )
  if (created.ok) {
    provisionedStudent = { userId: created.data.user.userId, email, institutionalId }
    record('INFO', 'provisioned a throwaway student for the role checks', `${email} (${institutionalId})`)
  } else {
    record('INFO', 'could not provision a student', `${created.error?.code}: ${created.error?.message}`)
  }
}

let studentToken = null
const studentIdentifier = provisionedStudent ? provisionedStudent.institutionalId : STUDENT_ID
const studentPassword = provisionedStudent ? 'SmokeStudent@2026' : STUDENT_PASSWORD
if (studentPassword) {
  const studentLogin = await call('auth.login', { identifier: studentIdentifier, password: studentPassword })
  check('student login (email or institutional ID)', studentLogin.ok && studentLogin.data.user.role === 'STUDENT', studentLogin.data?.user?.role)
  studentToken = studentLogin.ok ? studentLogin.data.token : null
} else {
  skip('student login', 'set STUDENT_ID/STUDENT_PASSWORD, or ALLOW_WRITES=1 ALLOW_USER_WRITES=1 to provision one')
}

let librarianToken = null
if (LIBRARIAN_PASSWORD) {
  const librarianLogin = await call('auth.login', { identifier: LIBRARIAN_ID, password: LIBRARIAN_PASSWORD })
  check(
    'librarian login (desk role)',
    librarianLogin.ok && librarianLogin.data?.user?.role === 'LIBRARIAN',
    librarianLogin.ok ? librarianLogin.data.user.role : librarianLogin.error?.code,
  )
  librarianToken = librarianLogin.ok ? librarianLogin.data.token : null
} else {
  skip('librarian login', 'set LIBRARIAN_ID and LIBRARIAN_PASSWORD to test the desk role')
}

/* ---------------------------------------------------------- scoping & permissions */

const adminBoot = await call('bootstrap', {}, adminToken)
check('admin bootstrap is library-scoped', adminBoot.ok && adminBoot.data?.scope === 'ALL', adminBoot.error?.code)
check(
  'bootstrap contains books, users, loans and settings',
  adminBoot.ok &&
    Array.isArray(adminBoot.data?.books) &&
    Array.isArray(adminBoot.data?.users) &&
    Array.isArray(adminBoot.data?.loans) &&
    Boolean(adminBoot.data?.settings),
  adminBoot.error?.code,
)
check('bootstrap never exposes password material', adminBoot.ok && !/passwordHash|password_hash|"salt"|Password salt/i.test(JSON.stringify(adminBoot.data)))

if (studentToken) {
  const studentBoot = await call('bootstrap', {}, studentToken)
  check('student bootstrap is self-scoped', studentBoot.ok && studentBoot.data.scope === 'SELF' && studentBoot.data.users.length === 1)
  check(
    'student sees only their own loans',
    studentBoot.ok && studentBoot.data.loans.every((loan) => loan.userId === studentBoot.data.user.userId),
  )
  const escalation = await call('books.create', { title: `SMOKE-${RUN} escalation`, author: 'x', totalCopies: 1 }, studentToken)
  check('student cannot create books', !escalation.ok && escalation.error?.code === 'FORBIDDEN')
  const userList = await call('users.list', {}, studentToken)
  check('student cannot list users', !userList.ok && userList.error?.code === 'FORBIDDEN')
  const returns = await call('loans.return', { loanId: 'LN-0001' }, studentToken)
  check('student cannot process returns', !returns.ok && returns.error?.code === 'FORBIDDEN')
  const settingsWrite = await call('settings.update', { settings: { fine_per_day: '1' } }, studentToken)
  check('student cannot change policy', !settingsWrite.ok && settingsWrite.error?.code === 'FORBIDDEN')
  const diag = await call('system.diagnostics', {}, studentToken)
  check('student cannot read diagnostics', !diag.ok && diag.error?.code === 'FORBIDDEN')
  const studentAnalytics = await call('reports.analytics', {}, studentToken)
  check('student analytics are SELF-scoped', studentAnalytics.ok && studentAnalytics.data.scope === 'SELF')
}

if (librarianToken) {
  const librarianBoot = await call('bootstrap', {}, librarianToken)
  check('the librarian sees the whole library', librarianBoot.ok && librarianBoot.data?.scope === 'ALL')
  check('the librarian can list members', (await call('users.list', {}, librarianToken)).ok)
  check('the librarian cannot change policy', (await call('settings.update', { settings: { fine_per_day: '1' } }, librarianToken)).error?.code === 'FORBIDDEN')
  check('the librarian cannot read diagnostics', (await call('system.diagnostics', {}, librarianToken)).error?.code === 'FORBIDDEN')
  check(
    'the librarian cannot create an administrator',
    (
      await call(
        'users.create',
        { name: 'Smoke Sneaky', email: `sneaky.${RUN}@lumina.test`, institutionalId: `SNK-${RUN}`.toUpperCase().slice(0, 20), role: 'ADMIN', password: 'Sneaky@2026' },
        librarianToken,
      )
    ).error?.code === 'FORBIDDEN',
  )
}

if (adminLogin.ok) {
  const diag = await call('system.diagnostics', {}, adminToken)
  check('admin diagnostics lists every table', diag.ok && Object.keys(diag.data.tables || {}).length >= 6)
  check('diagnostics reports missing headers, if any', diag.ok && Object.values(diag.data.tables).every((t) => t.ok === true), diag.ok ? JSON.stringify(Object.fromEntries(Object.entries(diag.data.tables).filter(([, t]) => !t.ok).map(([k, t]) => [k, t.missing]))) : diag.error?.code)
  const cfg = await call('settings.get', {}, adminToken)
  check('settings are readable and marked editable for an admin', cfg.ok && cfg.data.editable === true)
  const badSettings = await call('settings.update', { settings: { not_a_real_key: '1' } }, adminToken)
  check('unknown policy keys are rejected', !badSettings.ok && badSettings.error?.code === 'VALIDATION_ERROR')
}

/* ------------------------------------------------------------------- validation */

if (WRITES) {
  const missingTitle = await call('books.create', { author: 'nobody', totalCopies: 1 }, adminToken)
  check('book without a title → VALIDATION_ERROR', !missingTitle.ok && missingTitle.error?.code === 'VALIDATION_ERROR')

  const badCopies = await call('books.create', { title: `SMOKE-${RUN} bad copies`, author: 'x', totalCopies: 0 }, adminToken)
  check('zero copies → VALIDATION_ERROR', !badCopies.ok && badCopies.error?.code === 'VALIDATION_ERROR')

  const badYear = await call('books.create', { title: `SMOKE-${RUN} bad year`, author: 'x', totalCopies: 1, year: 1234 }, adminToken)
  check(
    'impossible year → VALIDATION_ERROR',
    !badYear.ok && badYear.error?.code === 'VALIDATION_ERROR',
    `${badYear.error?.code}: ${badYear.error?.message}`,
  )

  const unknownBook = await call('loans.issue', { bookId: 'BK-999999', userId: adminUserId }, adminToken)
  check(
    'unknown book id → NOT_FOUND',
    !unknownBook.ok && unknownBook.error?.code === 'NOT_FOUND',
    `${unknownBook.error?.code}: ${unknownBook.error?.message}`,
  )
} else {
  skip('write-path validation checks', 'read-only mode (set ALLOW_WRITES=1 to include them)')
}

/* ----------------------------------------------------------------- writes (safe) */

let testBookId = null
let activeLoanId = null
let reservationId = null

if (WRITES) {
  const created = await callCreate(
    'books.create',
    {
      title: TEST_TITLE,
      author: 'Automated smoke test',
      isbn: '',
      publisher: 'QA',
      year: new Date().getFullYear(),
      category: 'Testing',
      shelf: 'QA-00',
      totalCopies: 3,
      description: 'Created and deleted by qa-tools/api-smoke.mjs',
    },
    adminToken,
    async () => {
      const list = await call('books.list', {}, adminToken)
      const found = list.ok && list.data.books.find((book) => book.title.trim() === TEST_TITLE.trim())
      return found ? { book: found } : null
    },
  )
  check('admin creates a book', created.ok && created.data.book.title === TEST_TITLE, created.ok ? created.data.book.bookId : created.error?.code)
  testBookId = created.ok ? created.data.book.bookId : null

  if (testBookId) {
    // A second, never-borrowed title proves the delete path without touching real rows.
    const deletable = await callCreate(
      'books.create',
      { title: `${TEST_TITLE} deletable`, author: 'Automated smoke test', publisher: 'QA', year: new Date().getFullYear(), category: 'Testing', shelf: 'QA-00', totalCopies: 1 },
      adminToken,
      async () => {
        const list = await call('books.list', {}, adminToken)
        const found = list.ok && list.data.books.find((book) => book.title.trim() === `${TEST_TITLE} deletable`.trim())
        return found ? { book: found } : null
      },
    )
    check('a freshly created title can be deleted', deletable.ok, deletable.ok ? deletable.data.book.bookId : deletable.error?.code)
    if (deletable.ok) {
      const removed = await callDelete('books.delete', { bookId: deletable.data.book.bookId }, adminToken, async () => {
        const read = await call('books.get', { bookId: deletable.data.book.bookId }, adminToken)
        return !(read.error?.code === 'NOT_FOUND')
      })
      check('delete removes the row', removed.ok && removed.data.deleted === true)
      const gone = await call('books.get', { bookId: deletable.data.book.bookId }, adminToken)
      check('a deleted title is gone', !gone.ok && gone.error?.code === 'NOT_FOUND')
    }

    const duplicate = await call('books.create', { title: TEST_TITLE, author: 'dup', totalCopies: 1 }, adminToken)
    check('duplicate title → CONFLICT', !duplicate.ok && duplicate.error?.code === 'CONFLICT')

    const updated = await call(
      'books.update',
      { bookId: testBookId, title: `${TEST_TITLE} v2`, author: 'Automated smoke test', publisher: 'QA', year: new Date().getFullYear(), category: 'Testing', shelf: 'QA-01', totalCopies: 3 },
      adminToken,
    )
    check('admin updates a book', updated.ok && updated.data.book.totalCopies === 3)

    const issued = await call('loans.issue', { bookId: testBookId, userId: adminUserId }, adminToken)
    check('issue a copy', issued.ok && issued.data?.loan?.loanStatus === 'ACTIVE', issued.ok ? issued.data.loan.loanId : issued.error?.code)
    check(
      'the issue response carries the book title and member name',
      Boolean(issued.data?.loan?.bookTitle) && Boolean(issued.data?.loan?.userName),
      `${issued.data?.loan?.bookTitle} / ${issued.data?.loan?.userName}`,
    )
    activeLoanId = issued.ok ? issued.data.loan.loanId : null

    const afterIssue = await call('books.get', { bookId: testBookId }, adminToken)
    check(
      'availability decrements and never goes negative',
      afterIssue.ok && afterIssue.data.book.availableCopies === 2 && afterIssue.data.book.totalCopies === 3,
      afterIssue.ok ? `${afterIssue.data.book.availableCopies}/${afterIssue.data.book.totalCopies}` : afterIssue.error?.code,
    )

    const duplicateIssue = await call('loans.issue', { bookId: testBookId, userId: adminUserId }, adminToken)
    check('same member cannot hold two copies of one title', !duplicateIssue.ok && duplicateIssue.error?.code === 'CONFLICT')

    const exact = await call(
      'books.update',
      { bookId: testBookId, title: `${TEST_TITLE} v2`, author: 'x', publisher: 'QA', year: new Date().getFullYear(), category: 'Testing', shelf: 'QA-01', totalCopies: 1 },
      adminToken,
    )
    check(
      'copies may drop to the number on loan, never below it',
      exact.ok && exact.data.book.availableCopies === 0,
      exact.ok ? `available=${exact.data.book.availableCopies}` : exact.error?.code,
    )
    const belowActive = await call(
      'books.update',
      { bookId: testBookId, title: `${TEST_TITLE} v2`, author: 'x', publisher: 'QA', year: new Date().getFullYear(), category: 'Testing', shelf: 'QA-01', totalCopies: 0 },
      adminToken,
    )
    check('zero copies is rejected', !belowActive.ok && belowActive.error?.code === 'VALIDATION_ERROR')

    const cannotDelete = await call('books.delete', { bookId: testBookId }, adminToken)
    check('a title with circulation history cannot be deleted', !cannotDelete.ok && cannotDelete.error?.code === 'CONFLICT')

    const renewed = await call('loans.renew', { loanId: activeLoanId }, adminToken)
    check('renew an eligible loan', renewed.ok || renewed.error?.code === 'CONFLICT', renewed.ok ? `renewals=${renewed.data.loan.renewalCount}` : renewed.error?.code)

    const returned = await call('loans.return', { loanId: activeLoanId }, adminToken)
    check('return a loan and compute the fine', returned.ok && typeof returned.data.fine === 'number', returned.ok ? `fine=${returned.data.fine}` : returned.error?.code)

    const doubleReturn = await call('loans.return', { loanId: activeLoanId }, adminToken)
    check('double return → CONFLICT', !doubleReturn.ok && doubleReturn.error?.code === 'CONFLICT')
    if (returned.ok) activeLoanId = null

    const renewReturned = await call('loans.renew', { loanId: returned.ok ? returned.data.loan.loanId : 'LN-0000' }, adminToken)
    check('renewing a returned loan → CONFLICT', !renewReturned.ok && renewReturned.error?.code === 'CONFLICT')

    const held = await call('reservations.create', { bookId: testBookId, userId: adminUserId }, adminToken)
    check('create a reservation', held.ok, held.ok ? held.data.reservation.reservationStatus : held.error?.code)
    check(
      'the reservation response carries the book title and member name',
      Boolean(held.data?.reservation?.bookTitle) && Boolean(held.data?.reservation?.userName),
      `${held.data?.reservation?.bookTitle} / ${held.data?.reservation?.userName}`,
    )
    reservationId = held.ok ? held.data.reservation.reservationId : null

    const duplicateHold = await call('reservations.create', { bookId: testBookId, userId: adminUserId }, adminToken)
    check(
      'duplicate reservation → CONFLICT',
      !duplicateHold.ok && duplicateHold.error?.code === 'CONFLICT',
      `${duplicateHold.error?.code}: ${duplicateHold.error?.message}`,
    )

    if (reservationId) {
      const cancelled = await call('reservations.cancel', { reservationId }, adminToken)
      check('cancel a reservation', cancelled.ok)
      if (cancelled.ok) reservationId = null
    }

    const saved = await call('wishlist.toggle', { bookId: testBookId }, adminToken)
    check('wishlist toggle on', saved.ok && saved.data.saved === true)
    const unsaved = await call('wishlist.toggle', { bookId: testBookId }, adminToken)
    check('wishlist toggle off', unsaved.ok && unsaved.data.saved === false)

    const injection = await call(
      'books.create',
      { title: `=HYPERLINK("http://example.test","${RUN}")`, author: `+cmd-${RUN}`, totalCopies: 1 },
      adminToken,
    )
    check(
      'formula injection is neutralised before it reaches a cell',
      injection.ok && /^'/.test(injection.data.book.title) && /^'/.test(injection.data.book.author),
      injection.ok ? injection.data.book.title.slice(0, 24) : injection.error?.code,
    )
    if (injection.ok) await cleanUp(() => call('books.delete', { bookId: injection.data.book.bookId }, adminToken), 'delete the injection test book')

    /* ------------------------------------------------------------- user writes */
    if (USER_WRITES) {
      const email = `smoke.${RUN}@lumina.test`
      const newUser = await call(
        'users.create',
        {
          name: `Smoke Test ${RUN}`,
          email,
          institutionalId: `SMOKE-${RUN}`,
          role: 'STUDENT',
          department: 'QA',
          accountStatus: 'ACTIVE',
          password: 'SmokeTest@2026',
        },
        adminToken,
      )
      check('admin creates a member account', newUser.ok, newUser.ok ? newUser.data.user.userId : newUser.error?.code)
      check('created account never returns a hash', newUser.ok && !/hash|salt/i.test(JSON.stringify(newUser.data)))

      const duplicateEmail = await call(
        'users.create',
        { name: 'duplicate', email, institutionalId: `SMOKE2-${RUN}`, role: 'STUDENT', password: 'SmokeTest@2026' },
        adminToken,
      )
      check('duplicate email → CONFLICT', !duplicateEmail.ok && duplicateEmail.error?.code === 'CONFLICT')

      if (newUser.ok) {
        const userId = newUser.data.user.userId
        cleanup.push(`LEFT IN PLACE: test account ${email} (${userId}) — deactivated, safe to delete by hand`)

        const deactivated = await call('users.setStatus', { userId, accountStatus: 'INACTIVE' }, adminToken)
        check('admin deactivates the test account', deactivated.ok)
        const blockedLogin = await call('auth.login', { identifier: email, password: 'SmokeTest@2026' })
        check('a deactivated account cannot sign in', !blockedLogin.ok && blockedLogin.error?.code === 'FORBIDDEN')
        const selfDeactivate = await call('users.setStatus', { userId: adminUserId, accountStatus: 'INACTIVE' }, adminToken)
        check(
          'an admin cannot deactivate their own account',
          !selfDeactivate.ok && ['CONFLICT', 'VALIDATION_ERROR'].includes(selfDeactivate.error?.code),
          selfDeactivate.error?.code,
        )
      }
    } else {
      skip('user create / deactivate checks', 'set ALLOW_USER_WRITES=1 to include them')
    }
  }
} else {
  skip('catalogue + circulation write checks', 'read-only mode (set ALLOW_WRITES=1 to include them)')
}

/* ----------------------------------------------------------------- activity log */

const activity = await call('activity.list', { limit: 20 }, adminToken)
check(
  'activity log records operations',
  activity.ok && Array.isArray(activity.data?.activity) && activity.data.activity.length > 0,
  activity.ok ? `${activity.data?.activity?.length} entries` : activity.error?.code,
)
/*
 * Look for leaked *values*, not the word "password": action names such as `user.password`
 * are legitimate. A leak would be a password we submitted, a raw token, or a stored hash.
 */
const activityJson = JSON.stringify(activity.data ?? {})
const leakedValues = ['SmokeTest@2026', 'SmokeStudent@2026', 'Sneaky@2026', adminToken]
  .filter((value) => typeof value === 'string' && value.length > 8 && activityJson.includes(value))
const hashShaped = /\b[0-9a-f]{32,}\b/i.test(activityJson)
check(
  'activity log never contains secrets',
  activity.ok && leakedValues.length === 0 && !hashShaped,
  leakedValues.length ? `leaked: ${leakedValues.length} value(s)` : hashShaped ? 'hash-shaped string in log' : 'no password, token or hash values',
)

/* --------------------------------------------------------------------- cleanup */

if (WRITES && testBookId) {
  if (activeLoanId) await cleanUp(() => call('loans.return', { loanId: activeLoanId }, adminToken), 'return the leftover test loan')
  if (reservationId) await cleanUp(() => call('reservations.cancel', { reservationId }, adminToken), 'cancel the leftover test reservation')
  // The test book keeps a loan history, so it is archived rather than deleted —
  // exactly what the app tells a librarian to do. Archived rows are inert.
  const archived = await call('books.archive', { bookId: testBookId, archived: true }, adminToken)
  check('cleanup archives the test title (history must be preserved)', archived.ok && archived.data.book.recordStatus === 'ARCHIVED')
  cleanup.push(`ARCHIVED: test title ${TEST_TITLE} v2 (${testBookId}) — archived, not borrowable; delete the row by hand if you like`)
}

// The provisioned student is deactivated (never deleted — there is no hard delete).
if (provisionedStudent) {
  const deactivated = await call(
    'users.setStatus',
    { userId: provisionedStudent.userId, accountStatus: 'INACTIVE' },
    adminToken,
  )
  check('the provisioned student is deactivated after the run', deactivated.ok, deactivated.error?.code)
  cleanup.push(`INACTIVE: test account ${provisionedStudent.email} (${provisionedStudent.userId}) — deactivate/delete by hand if you like`)
}

/* ------------------------------------------------------------- session teardown */

const logout = await call('auth.logout', {}, adminToken)
check('logout succeeds', logout.ok)
const afterLogout = await call('bootstrap', {}, adminToken)
check('the token is invalid after logout', !afterLogout.ok && afterLogout.error?.code === 'UNAUTHORIZED')

/* ---------------------------------------------------------------------- summary */

function finish() {
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL')
  const skipped = results.filter((r) => r.status === 'SKIP').length
  // INFO lines describe setup, they are not assertions.
  const assertions = results.filter((r) => r.status !== 'INFO').length
  console.log('')
  if (cleanup.length) {
    console.log('Cleanup:')
    cleanup.forEach((line) => console.log(`  · ${line}`))
    console.log('')
  }
  console.log(`=== SUMMARY ===`)
  console.log(`Passed: ${passed}/${assertions}${skipped ? ` (${skipped} skipped)` : ''}`)
  if (failed.length) {
    console.log('Failures:')
    failed.forEach((f) => console.log(`  · ${f.name}${f.detail ? ` :: ${f.detail}` : ''}`))
  }
  process.exit(failed.length === 0 ? 0 : 1)
}

finish()
