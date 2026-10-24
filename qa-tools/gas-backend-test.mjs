/**
 * Executes the REAL Apps Script backend source (google-sheets/backend/*.gs) in a
 * Node VM with faked Google globals, against a workbook that mimics the live
 * spreadsheet: a legacy tab with the 13 real catalogue columns and the BK101 row,
 * plus an empty second tab.
 *
 *   node qa-tools/gas-backend-test.mjs
 *
 * What this proves: tab preservation, header appending, setup/verify behaviour,
 * the whole request pipeline (routing, auth, roles, validation, locking,
 * circulation rules, settings, reservations, activity log) and that no existing
 * cell is destroyed.
 *
 * What it cannot prove: the Google runtime, OAuth scopes, Web-app deployment and
 * real network latency. Those need the deployed /exec URL.
 */
import { createHarness, LEGACY_BOOK_HEADERS, LEGACY_BOOK_ROW } from './gas-harness.mjs'

const results = []
const record = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status.padEnd(4)} — ${name}${detail ? ` :: ${detail}` : ''}`)
}
const check = (name, ok, detail = '') => record(ok ? 'PASS' : 'FAIL', name, detail)

const harness = createHarness({
  sheets: [
    { name: 'Sheet1', rows: [LEGACY_BOOK_HEADERS, LEGACY_BOOK_ROW] },
    { name: 'Sheet2', rows: [] },
  ],
  properties: {
    SPREADSHEET_ID: '18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s',
    SEED_ADMIN_EMAIL: 'admin@lumina.edu',
  },
})

const beforeBooks = harness.sheet('Sheet1').grid()

/* ------------------------------------------------------------------- setup */

const dryRun = harness.sandbox.setupLumina(true)
check('setupLumina(true) is a dry run', /dry run/i.test(dryRun) && harness.tabNames().length === 2, harness.tabNames().join(','))
check('dry run creates nothing', !harness.tabNames().includes('Users'))

const setupLog = harness.sandbox.setupLumina()
check('setupLumina() reuses the legacy tab instead of creating a second Books tab', /Reused|append/i.test(setupLog) && harness.tabNames().filter((n) => n === 'Books').length === 0, harness.tabNames().join(','))
check('setup creates every missing tab', ['Users', 'Loans', 'Reservations', 'ActivityLogs', 'Settings', 'Sessions', 'Wishlists'].every((name) => harness.tabNames().includes(name)), harness.tabNames().join(','))
check('the empty legacy tab is left alone', harness.sheet('Sheet2').getLastRow() === 0)

const afterBooks = harness.sheet('Sheet1').grid()
check('existing catalogue rows are untouched', JSON.stringify(afterBooks[1]) === JSON.stringify(beforeBooks[1]), JSON.stringify(afterBooks[1]))
check(
  'the 13 legacy columns keep their order',
  LEGACY_BOOK_HEADERS.every((header, index) => afterBooks[0][index] === header),
  afterBooks[0].slice(0, 13).join(' | '),
)
check(
  'missing columns are appended to the right, not inserted',
  afterBooks[0].length > 13 && afterBooks[0].slice(13).includes('Description') && afterBooks[0].includes('Cover image URL'),
  afterBooks[0].slice(13).join(' | '),
)
check('a second setup run is idempotent', (() => {
  const rowsBefore = harness.sheet('Sheet1').getLastRow()
  const usersBefore = harness.sheet('Users').getLastRow()
  harness.sandbox.setupLumina()
  return harness.sheet('Sheet1').getLastRow() === rowsBefore && harness.sheet('Users').getLastRow() === usersBefore
})())

const verify = harness.sandbox.verifyLuminaSetup()
const verifyFailures = verify.split('\n').filter((line) => /FAIL/.test(line))
check(
  'verifyLuminaSetup fails nothing and warns about the incomplete placeholder row',
  verifyFailures.length === 0 && /WARN[^\n]*BK101/.test(verify),
  verifyFailures.join(' | ') || 'no warning reported',
)
check('verify checks write permission', /Spreadsheet is writable/.test(verify))

/* ------------------------------------------------------------------- health */

const health = harness.get({ action: 'health' })
check('GET ?action=health works', health.ok && health.data.service === 'lumina-library-api', health.data?.version)
check('health hides the spreadsheet id', !JSON.stringify(health.data).includes('18CGNA07'))
check('GET ?action=ping responds', harness.get({ action: 'ping' }).data?.pong === true)
check('GET rejects other actions', harness.get({ action: 'books.list' }).error?.code === 'UNKNOWN_ACTION')

/* --------------------------------------------------------------------- auth */

const adminPassword = harness.props.get('SEED_ADMIN_PASSWORD')
check('setupLumina stored a generated admin password', Boolean(adminPassword) && adminPassword.length >= 8)

const badLogin = harness.post('auth.login', { identifier: 'admin@lumina.edu', password: 'nope' })
check('wrong password → UNAUTHORIZED', badLogin.error?.code === 'UNAUTHORIZED')

const adminLogin = harness.post('auth.login', { identifier: 'admin@lumina.edu', password: adminPassword })
check('admin signs in', adminLogin.ok && adminLogin.data?.user?.role === 'ADMIN', adminLogin.ok ? adminLogin.data.user.userId : `${adminLogin.error?.code}: ${adminLogin.error?.message}`)
const adminToken = adminLogin.data.token
const adminId = adminLogin.data.user.userId

const usersSheet = harness.sheet('Users').grid()
check('the password is stored as a hash, never plaintext', usersSheet[1].join('|').includes('Password hash') === false && !usersSheet[1].some((cell) => String(cell) === adminPassword))
check('a salt and iteration count are stored', usersSheet[0].includes('Password salt') && usersSheet[0].includes('Hash iterations'))

const sessionSheet = harness.sheet('Sessions').grid()
check('only a hash of the session token is stored', !JSON.stringify(sessionSheet).includes(adminToken))

/* ---------------------------------------------------------------- bootstrap */

const boot = harness.post('bootstrap', {}, adminToken)
check('bootstrap is library-scoped for an admin', boot.ok && boot.data.scope === 'ALL')
check('the legacy row is visible to the app', boot.ok && boot.data.books.some((book) => book.bookId === 'BK101'), boot.data?.books?.map((b) => b.bookId).join(','))
check('bootstrap never leaks password material', !/passwordHash|Password salt|"hash"/i.test(JSON.stringify(boot.data)))
check('settings were seeded', boot.ok && boot.data.settings.fine_per_day === '5', boot.data?.settings?.fine_per_day)

/* ------------------------------------------------------------- book writes */

const created = harness.post('books.create', { title: 'Harness Title', author: 'Ada Lovelace', publisher: 'QA', year: 2026, category: 'Testing', shelf: 'H-01', totalCopies: 2 }, adminToken)
check('admin creates a book', created.ok && created.data.book.title === 'Harness Title', created.data?.book?.bookId)
const bookId = created.data?.book?.bookId
const bookRow = harness.sheet('Sheet1').grid().find((row) => row[0] === bookId)
check('the new book is a real row in the legacy tab', Boolean(bookRow) && bookRow[1] === 'Harness Title', bookRow ? bookRow.slice(0, 5).join(' | ') : 'missing')
check('the legacy row is still in place after the write', harness.sheet('Sheet1').grid().some((row) => row[0] === 'BK101'))

check('duplicate title → CONFLICT', harness.post('books.create', { title: 'Harness Title', author: 'x', totalCopies: 1 }, adminToken).error?.code === 'CONFLICT')
check('missing title → VALIDATION_ERROR', harness.post('books.create', { author: 'x', totalCopies: 1 }, adminToken).error?.code === 'VALIDATION_ERROR')
check('zero copies → VALIDATION_ERROR', harness.post('books.create', { title: 'Zero', author: 'x', totalCopies: 0 }, adminToken).error?.code === 'VALIDATION_ERROR')
check('impossible year → VALIDATION_ERROR', harness.post('books.create', { title: 'Y', author: 'x', totalCopies: 1, year: 1200 }, adminToken).error?.code === 'VALIDATION_ERROR')

const updated = harness.post('books.update', { bookId, title: 'Harness Title v2', author: 'Ada Lovelace', publisher: 'QA', year: 2026, category: 'Testing', shelf: 'H-02', totalCopies: 3 }, adminToken)
check('admin updates a book', updated.ok && updated.data.book.totalCopies === 3 && updated.data.book.shelfLocation === 'H-02')

/* --------------------------------------------------------------- accounts */

const createdUser = harness.post('users.create', { name: 'Harness Student', email: 'harness.student@lumina.edu', institutionalId: 'M-9001', role: 'STUDENT', department: 'QA', password: 'Harness@2026', accountStatus: 'ACTIVE' }, adminToken)
check('admin creates a student account', createdUser.ok, createdUser.data?.user?.userId)
check('a created account never returns a hash', !/hash|salt/i.test(JSON.stringify(createdUser.data)))
check('duplicate email → CONFLICT', harness.post('users.create', { name: 'dup', email: 'harness.student@lumina.edu', institutionalId: 'M-9002', role: 'STUDENT', password: 'Harness@2026' }, adminToken).error?.code === 'CONFLICT')
check('duplicate institutional ID → CONFLICT', harness.post('users.create', { name: 'dup', email: 'other@lumina.edu', institutionalId: 'M-9001', role: 'STUDENT', password: 'Harness@2026' }, adminToken).error?.code === 'CONFLICT')

const studentId = createdUser.data?.user?.userId
const studentLogin = harness.post('auth.login', { identifier: 'M-9001', password: 'Harness@2026' })
check('the new student can sign in with their institutional ID', studentLogin.ok && studentLogin.data.user.role === 'STUDENT')
const studentToken = studentLogin.data?.token

const studentBoot = harness.post('bootstrap', {}, studentToken)
check('student bootstrap is self-scoped', studentBoot.ok && studentBoot.data.scope === 'SELF' && studentBoot.data.users.length === 1)
check('student cannot create books', harness.post('books.create', { title: 'nope', author: 'x', totalCopies: 1 }, studentToken).error?.code === 'FORBIDDEN')
check('student cannot list users', harness.post('users.list', {}, studentToken).error?.code === 'FORBIDDEN')
check('student cannot read diagnostics', harness.post('system.diagnostics', {}, studentToken).error?.code === 'FORBIDDEN')
check('student cannot process returns', harness.post('loans.return', { loanId: 'LN-0001' }, studentToken).error?.code === 'FORBIDDEN')
check('student cannot change policy', harness.post('settings.update', { settings: { fine_per_day: '1' } }, studentToken).error?.code === 'FORBIDDEN')
const createdFaculty = harness.post(
  'users.create',
  { name: 'Faculty One', email: 'faculty.one@lumina.edu', institutionalId: 'F-9001', role: 'FACULTY', department: 'Science', password: 'Faculty@2026' },
  adminToken,
)
const facultyToken = harness.post('auth.login', { identifier: 'faculty.one@lumina.edu', password: 'Faculty@2026' }).data?.token
check('faculty cannot create books', createdFaculty.ok && harness.post('books.create', { title: 'nope2', author: 'x', totalCopies: 1 }, facultyToken).error?.code === 'FORBIDDEN')
check('faculty cannot change policy', harness.post('settings.update', { settings: { fine_per_day: '1' } }, facultyToken).error?.code === 'FORBIDDEN')
check('faculty sees only their own records', harness.post('bootstrap', {}, facultyToken).data?.scope === 'SELF')

/* ------------------------------------------------------------------- librarian */

const createdLibrarian = harness.post(
  'users.create',
  { name: 'Desk Librarian', email: 'librarian@lumina.edu', institutionalId: 'LIB-001', role: 'LIBRARIAN', department: 'Library', password: 'Librarian@2026' },
  adminToken,
)
check('an admin can create a LIBRARIAN account', createdLibrarian.ok && createdLibrarian.data?.user?.role === 'LIBRARIAN', createdLibrarian.error?.code)
const librarianToken = harness.post('auth.login', { identifier: 'librarian@lumina.edu', password: 'Librarian@2026' }).data?.token
check('the librarian can sign in', Boolean(librarianToken))
check('the librarian sees the whole library', harness.post('bootstrap', {}, librarianToken).data?.scope === 'ALL')
check('the librarian can list members', harness.post('users.list', {}, librarianToken).ok)
check('the librarian can add a book', harness.post('books.create', { title: 'Librarian Shelf Check', author: 'Desk', totalCopies: 1 }, librarianToken).ok)
check('the librarian can update a book', harness.post('books.update', { bookId: bookId, title: 'Harness Title v2', author: 'Harness Author', totalCopies: 3 }, librarianToken).ok)
check('the librarian cannot change policy', harness.post('settings.update', { settings: { fine_per_day: '1' } }, librarianToken).error?.code === 'FORBIDDEN')
check('the librarian cannot read diagnostics', harness.post('system.diagnostics', {}, librarianToken).error?.code === 'FORBIDDEN')
check('the librarian cannot delete a title (admin only)', harness.post('books.delete', { bookId: 'BK-nope' }, librarianToken).error?.code === 'FORBIDDEN')
check(
  'the librarian cannot create an administrator',
  harness
    .post('users.create', { name: 'Sneaky Admin', email: 'sneaky@lumina.edu', institutionalId: 'ADM-999', role: 'ADMIN', password: 'Sneaky@2026' }, librarianToken)
    .error?.code === 'FORBIDDEN',
)
check("the librarian cannot reset an administrator's password", harness.post('users.resetPassword', { userId: 'U-0001', newPassword: 'Hijack@2026' }, librarianToken).error?.code === 'FORBIDDEN')
check("the librarian cannot deactivate the administrator", harness.post('users.setStatus', { userId: 'U-0001', accountStatus: 'INACTIVE' }, librarianToken).error?.code === 'FORBIDDEN')
check(
  'the librarian can register a student',
  harness.post('users.create', { name: 'Desk Member', email: 'desk.member@lumina.edu', institutionalId: 'M-DESK', role: 'STUDENT', password: 'DeskMember@2026' }, librarianToken).ok,
)
check(
  'the librarian can register a faculty member',
  harness.post('users.create', { name: 'Desk Faculty', email: 'desk.faculty@lumina.edu', institutionalId: 'F-DESK', role: 'FACULTY', password: 'DeskFaculty@2026' }, librarianToken).ok,
)

/* -------------------------------------------------------------- circulation */

const issued = harness.post('loans.issue', { bookId, userId: studentId }, adminToken)
check('staff issue a copy to a student', issued.ok && issued.data.loan.loanStatus === 'ACTIVE', issued.data?.loan?.loanId)
const loanId = issued.data?.loan?.loanId

const afterIssue = harness.post('books.get', { bookId }, adminToken)
check('availability decrements', afterIssue.data.book.availableCopies === 2 && afterIssue.data.book.totalCopies === 3, `${afterIssue.data.book.availableCopies}/${afterIssue.data.book.totalCopies}`)

const sheetRow = harness.sheet('Sheet1').grid().find((row) => row[0] === bookId)
const headers = harness.sheet('Sheet1').grid()[0]
const onLoanCell = sheetRow[headers.indexOf('Copies on loan')]
check('the derived "Copies on loan" column is written back to the sheet', Number(onLoanCell) === 1, String(onLoanCell))

check('the same member cannot hold two copies', harness.post('loans.issue', { bookId, userId: studentId }, adminToken).error?.code === 'CONFLICT')
check('a student cannot exceed their borrowing limit', (() => {
  // student limit is 4 by default; fill it and then try one more
  const extra = []
  for (let i = 0; i < 4; i += 1) {
    const extraBook = harness.post('books.create', { title: `Limit Probe ${i}`, author: 'x', totalCopies: 1 }, adminToken)
    if (extraBook.ok) extra.push(extraBook.data.book.bookId)
  }
  let lastError = null
  extra.forEach((id) => {
    const result = harness.post('loans.issue', { bookId: id, userId: studentId }, adminToken)
    if (!result.ok) lastError = result.error.code
  })
  return lastError === 'CONFLICT'
})())

const renewed = harness.post('loans.renew', { loanId }, adminToken)
check('a loan can be renewed within the policy', renewed.ok && renewed.data.loan.renewalCount === 1, renewed.ok ? `renewals=${renewed.data.loan.renewalCount}` : renewed.error?.code)
check(
  'the renewed loan still carries its title and member name',
  Boolean(renewed.data?.loan?.bookTitle) && Boolean(renewed.data?.loan?.userName),
  `${renewed.data?.loan?.bookTitle} / ${renewed.data?.loan?.userName}`,
)

const returned = harness.post('loans.return', { loanId }, adminToken)
check('returning a loan computes a fine of 0 when on time', returned.ok && returned.data.fine === 0, String(returned.data?.fine))
check(
  'the returned loan carries its title and member name',
  Boolean(returned.data?.loan?.bookTitle) && Boolean(returned.data?.loan?.userName),
  `${returned.data?.loan?.bookTitle} / ${returned.data?.loan?.userName}`,
)
check('double return → CONFLICT', harness.post('loans.return', { loanId }, adminToken).error?.code === 'CONFLICT')
check('renewing a returned loan → CONFLICT', harness.post('loans.renew', { loanId }, adminToken).error?.code === 'CONFLICT')

const afterReturn = harness.post('books.get', { bookId }, adminToken)
check('availability is restored after a return', afterReturn.data.book.availableCopies === 3)

/* ------------------------------------------------------------- reservations */

const held = harness.post('reservations.create', { bookId, userId: studentId }, adminToken)
check('a reservation can be created', held.ok, held.data?.reservation?.reservationStatus)
check(
  'the reservation carries the book title and member name',
  Boolean(held.data?.reservation?.bookTitle) && Boolean(held.data?.reservation?.userName),
  `${held.data?.reservation?.bookTitle} / ${held.data?.reservation?.userName}`,
)
check('duplicate reservation → CONFLICT', harness.post('reservations.create', { bookId, userId: studentId }, adminToken).error?.code === 'CONFLICT')
const cancelledHold = held.ok ? harness.post('reservations.cancel', { reservationId: held.data.reservation.reservationId }, adminToken) : null
check('a reservation can be cancelled', Boolean(cancelledHold?.ok))
check(
  'the cancelled reservation still carries its title',
  Boolean(cancelledHold?.data?.reservation?.bookTitle),
  JSON.stringify(cancelledHold?.data?.reservation?.bookTitle),
)

// Ownership: a student may only cancel their own hold.
const other = harness.post(
  'users.create',
  { name: 'Other Student', email: 'other.student@lumina.edu', institutionalId: 'M-7777', role: 'STUDENT', password: 'Other@2026' },
  adminToken,
).data?.user
const otherHold = harness.post('reservations.create', { bookId, userId: other?.userId }, adminToken)
check(
  "a student cannot cancel another member's hold",
  otherHold.ok &&
    harness.post('reservations.cancel', { reservationId: otherHold.data.reservation.reservationId }, studentToken).error?.code === 'FORBIDDEN',
)
check(
  'a student can cancel their own hold',
  otherHold.ok &&
    harness.post('reservations.cancel', { reservationId: otherHold.data.reservation.reservationId }, harness.post('auth.login', { identifier: 'M-7777', password: 'Other@2026' }).data?.token).ok,
)

/* --------------------------------------------------------- delete guardrails */

check('a title with loan history cannot be deleted', harness.post('books.delete', { bookId }, adminToken).error?.code === 'CONFLICT')
const deletable = harness.post('books.create', { title: 'Deletable Title', author: 'x', totalCopies: 1 }, adminToken)
const deleted = harness.post('books.delete', { bookId: deletable.data.book.bookId }, adminToken)
check('a title with no history can be deleted', deleted.ok && deleted.data.deleted === true)
check('the deleted row is gone from the sheet', !harness.sheet('Sheet1').grid().some((row) => row[0] === deletable.data.book.bookId))

/* ---------------------------------------------------------------- wishlist */

check('wishlist toggle on', harness.post('wishlist.toggle', { bookId }, studentToken).data?.saved === true)
check('wishlist toggle off', harness.post('wishlist.toggle', { bookId }, studentToken).data?.saved === false)

/* ----------------------------------------------------------------- settings */

check('unknown policy keys are rejected', harness.post('settings.update', { settings: { nope: '1' } }, adminToken).error?.code === 'VALIDATION_ERROR')
check('an admin can change policy', harness.post('settings.update', { settings: { fine_per_day: '7' } }, adminToken).data?.settings?.fine_per_day === '7')
check('the policy change is written to the Settings tab', harness.sheet('Settings').grid().some((row) => row[0] === 'fine_per_day' && row[1] === '7'))

/* ------------------------------------------------------------ deactivation */

harness.post('users.setStatus', { userId: studentId, accountStatus: 'INACTIVE' }, adminToken)
check('a deactivated account cannot sign in', harness.post('auth.login', { identifier: 'M-9001', password: 'Harness@2026' }).error?.code === 'FORBIDDEN')
const deactivatedBootstrap = harness.post('bootstrap', {}, studentToken)
check(
  'deactivation immediately kills live sessions',
  !deactivatedBootstrap.ok && ['UNAUTHORIZED', 'FORBIDDEN'].includes(deactivatedBootstrap.error?.code),
  deactivatedBootstrap.error?.code || 'still authorised',
)
check('an admin cannot deactivate themselves', harness.post('users.setStatus', { userId: adminId, accountStatus: 'INACTIVE' }, adminToken).error?.code === 'CONFLICT')
harness.post('users.setStatus', { userId: studentId, accountStatus: 'ACTIVE' }, adminToken)

/* ------------------------------------------------------------ injection/log */

const injection = harness.post('books.create', { title: '=HYPERLINK("http://evil","x")', author: '+cmd', totalCopies: 1 }, adminToken)
check('formula injection is neutralised in the sheet', injection.ok && String(harness.sheet('Sheet1').grid().at(-1)[1]).startsWith("'="), injection.ok ? String(injection.data.book.title).slice(0, 20) : injection.error?.code)

const activity = harness.post('activity.list', { limit: 50 }, adminToken)
check('the activity log records operations', activity.ok && activity.data.activity.length > 5, `${activity.data?.activity?.length} entries`)
check('the activity log never contains secrets', !/password|token|hash/i.test(JSON.stringify(activity.data)))

const diagnostics = harness.post('system.diagnostics', {}, adminToken)
check('admin diagnostics report every table as ok', diagnostics.ok && Object.values(diagnostics.data.tables).every((table) => table.ok === true))
check('diagnostics expose no secrets', !/passwordHash|Password salt/i.test(JSON.stringify(diagnostics.data)))

/* ------------------------------------------------------------- logout/limits */

harness.post('auth.logout', {}, adminToken)
/* ------------------------------------------------- password change + rotation */

const secondSession = harness.post('auth.login', { identifier: 'librarian@lumina.edu', password: 'Librarian@2026' }).data?.token
const changed = harness.post(
  'auth.changePassword',
  { currentPassword: 'Librarian@2026', newPassword: 'Librarian@2027' },
  librarianToken,
)
check('a user can change their own password', changed.ok && changed.data.changed === true, changed.error?.code)
check('changing a password revokes the other live sessions', changed.data?.sessionsRevoked >= 1, `${changed.data?.sessionsRevoked} revoked`)
check('the session that changed the password keeps working', harness.post('users.me', {}, librarianToken).ok)
check('an older session for the same account stops working', harness.post('users.me', {}, secondSession).error?.code === 'UNAUTHORIZED')
check('the new password signs in', harness.post('auth.login', { identifier: 'librarian@lumina.edu', password: 'Librarian@2027' }).ok)
check('the old password no longer signs in', harness.post('auth.login', { identifier: 'librarian@lumina.edu', password: 'Librarian@2026' }).error?.code === 'UNAUTHORIZED')
check('a wrong current password is refused', harness.post('auth.changePassword', { currentPassword: 'nope-nope', newPassword: 'Whatever@2027' }, librarianToken).error?.code === 'UNAUTHORIZED')

check('logout revokes the token', harness.post('bootstrap', {}, adminToken).error?.code === 'UNAUTHORIZED')
// Login throttling — uses a throwaway account so the real admin is never locked out.
// The logout check above already revoked `adminToken`, so sign in again first.
const freshAdmin = harness.post('auth.login', { identifier: 'admin@lumina.edu', password: adminPassword }).data?.token
const throttleCreate = harness.post(
  'users.create',
  { name: 'Throttle Test', email: 'throttle@lumina.edu', institutionalId: 'M-8888', role: 'STUDENT', password: 'Throttle@2026' },
  freshAdmin,
)
const throttled = throttleCreate.ok
const attempts = []
for (let i = 0; i < 8; i += 1) {
  attempts.push(harness.post('auth.login', { identifier: 'throttle@lumina.edu', password: `wrong-${i}` }).error?.code)
}
const ninth = harness.post('auth.login', { identifier: 'throttle@lumina.edu', password: 'wrong-final' })
check(
  'eight failed sign-ins are throttled (RATE_LIMITED)',
  throttled && attempts.every((code) => code === 'UNAUTHORIZED') && ninth.error?.code === 'RATE_LIMITED',
  `create=${throttled} codes=${attempts.map((c) => c ?? 'null').join(',')} ninth=${ninth.error?.code}`,
)
check(
  'the throttle also blocks the correct password during the window',
  harness.post('auth.login', { identifier: 'throttle@lumina.edu', password: 'Throttle@2026' }).error?.code === 'RATE_LIMITED',
)

check('a malformed body is rejected cleanly', (() => {
  const output = harness.sandbox.doPost({ parameter: {}, postData: { contents: 'not json' } })
  return JSON.parse(output.getContent()).error?.code === 'VALIDATION_ERROR'
})())
check('an unknown action is rejected', harness.post('does.not.exist').error?.code === 'UNKNOWN_ACTION')

/* ------------------------------------------------------------- final sheet audit */

const finalBooks = harness.sheet('Sheet1').grid()
const originalRow = finalBooks.find((row) => row[0] === 'BK101')
// Identity columns must be untouched; the two derived columns (indices 9, 10) are
// recalculated by design so the spreadsheet never shows stale availability.
const identityColumns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12]
check(
  'the original BK101 row keeps every identity column',
  originalRow && identityColumns.every((index) => String(originalRow[index]) === String(LEGACY_BOOK_ROW[index])),
  originalRow ? originalRow.slice(0, 3).join(' | ') : 'row missing',
)
check(
  'BK101 availability columns were recomputed as non-negative numbers',
  originalRow && [originalRow[9], originalRow[10]].every((value) => Number(value) >= 0 && value !== ''),
  `onLoan=${originalRow?.[9]} available=${originalRow?.[10]}`,
)
check('no row was deleted from the catalogue', finalBooks.length >= beforeBooks.length)
const errorLogs = harness.logs.filter(([level]) => level === 'error')
check('failed requests are logged with a code', errorLogs.length > 0 && errorLogs.every(([, line]) => /code=/.test(line)), `${errorLogs.length} entries`)
check('log lines never contain a token, password or hash', errorLogs.every(([, line]) => !/[A-Fa-f0-9]{32,}|@2026|Student@|Harness@/.test(line)))

/* ------------------------------------------------------------------- summary */

const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL')
console.log('')
console.log(`=== SUMMARY ===\nPassed: ${passed}/${results.length}`)
if (failed.length) {
  console.log('Failures:')
  failed.forEach((item) => console.log(`  · ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`))
}
process.exit(failed.length === 0 ? 0 : 1)
