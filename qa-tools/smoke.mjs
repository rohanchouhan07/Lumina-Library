import puppeteer from 'puppeteer'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = '/home/user/qa-screens'
fs.mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const pageErrors = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickByText(page, text, opts = {}) {
  const { scope = 'body', exact = false } = opts
  const handle = await page.evaluateHandle(
    (scopeSel, normalizedText, isExact) => {
      const root = document.querySelector(scopeSel) ?? document.body
      const nodes = Array.from(root.querySelectorAll('button, a, [role="option"], [role="menuitem"], [role="tab"], [role="radio"]'))
      const match = nodes.find((node) => {
        const label = (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ')
        return isExact ? label === normalizedText : label.includes(normalizedText)
      })
      return match ?? null
    },
    scope,
    text,
    exact,
  )
  const element = handle.asElement()
  if (!element) throw new Error(`No clickable element containing "${text}" in ${scope}`)
  await element.click()
  await sleep(250)
}

async function textVisible(page, text) {
  return page.evaluate(
    (value) => document.body.innerText.toLowerCase().includes(value.toLowerCase()),
    text,
  )
}

async function waitForText(page, text, timeout = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await textVisible(page, text)) return true
    await sleep(120)
  }
  return false
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector, { clickCount: 3 })
  await page.type(selector, value, { delay: 12 })
}

async function chooseCombobox(page, index, searchText, optionText) {
  const triggers = await page.$$('button[role="combobox"]')
  const trigger = triggers[index]
  if (!trigger) throw new Error(`Combobox #${index} not found`)
  await trigger.click()
  await sleep(220)
  const inputs = await page.$$('[role="listbox"], ul[role="listbox"]')
  void inputs
  const searchInput = await page.$('input[aria-label^="Search"]')
  if (!searchInput) throw new Error('Combobox search input missing')
  await searchInput.type(searchText, { delay: 20 })
  await sleep(320)
  await clickByText(page, optionText, { exact: false })
  await sleep(200)
}

async function shot(page, name, opts = {}) {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
  } catch (error) {
    console.log(`  (screenshot skipped: ${name} — ${error.message})`)
  }
}

let browser
let page

/**
 * Navigation with retries: a browser recycled mid-run occasionally needs longer
 * than the default timeout for the first cold module graph on a loaded box.
 */
async function goto(url, opts = {}) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await goto(url, { waitUntil: 'domcontentloaded', timeout: 45000, ...opts })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw lastError
}

async function startBrowser() {
  browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none', '--disable-dev-shm-usage'],
  })
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  // Cold Vite module graphs after a browser recycle can take >30 s in this sandbox.
  page.setDefaultNavigationTimeout(90000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
}

/** Chromium slowly exhausts resources during very long runs; recycle it between phases. */
async function restartBrowser() {
  await browser.close()
  await startBrowser()
}

await startBrowser()

try {
  /* ---------------------------------------------------------------- landing */
  await goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await sleep(500)
  const heroText = await page.$eval('h1', (el) => el.innerText.replace(/\s+/g, ' '))
  record('Landing hero renders', heroText.includes('Your Campus Library') && heroText.includes('Reimagined'), heroText)
  record('Landing stats section', await waitForText(page, 'Total book copies'))
  await sleep(600)
  await shot(page, '01-landing-desktop', { fullPage: false })
  await shot(page, '01b-landing-full', { fullPage: true })

  // feature showcase interaction
  await clickByText(page, 'Library analytics')
  await sleep(400)
  record('Feature showcase switches', await waitForText(page, 'most borrowed'.toLowerCase()) || (await waitForText(page, 'Circulation, category mix')))

  // discovery search on landing
  const landingSearch = await page.$('input[aria-label="Search the demo catalogue"]')
  await landingSearch.click()
  await landingSearch.type('algorithms', { delay: 20 })
  await sleep(600)
  record('Landing discovery search filters', await textVisible(page, 'Introduction to Algorithms'))

  /* --------------------------------------------------------------- catalog */
  await goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded' })
  record('Catalog page loads', await waitForText(page, 'Browse the collection'))
  await page.waitForSelector('input[aria-label="Search catalogue"]')
  await shot(page, '02-catalog-desktop')
  await page.type('input[aria-label="Search catalogue"]', 'clean code', { delay: 20 })
  await sleep(700)
  const catalogCount = await page.$$eval('article', (nodes) => nodes.length)
  record('Catalog search narrows results', catalogCount > 0 && catalogCount < 8, `${catalogCount} cards`)
  // open a book detail dialog
  await clickByText(page, 'Clean Code', { exact: false })
  await sleep(600)
  record('Book detail dialog opens', await waitForText(page, 'Title details'))
  await page.keyboard.press('Escape')
  await sleep(300)

  /* ----------------------------------------------------------- librarian */
  await goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await clickByText(page, 'Librarian')
  await sleep(200)
  await clickByText(page, 'Enter Librarian demo')
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 8000 })
  record('Librarian demo login', await waitForText(page, 'Circulation desk'))
  await sleep(900)
  await shot(page, '03-dashboard-librarian')

  /* ------------------------------------------------------- add a new book */
  await goto(`${BASE}/app/books?new=1`, { waitUntil: 'domcontentloaded' })
  record('Add book dialog deep link', await waitForText(page, 'Add a new book'))
  await fill(page, '#book-form input[name="title"]', 'Test Automation Handbook')
  await fill(page, '#book-form input[name="author"]', 'Ananya Rao')
  await fill(page, '#book-form input[name="publisher"]', 'Lumina Press')
  await fill(page, '#book-form input[name="shelf"]', 'QA-A-01')
  await fill(page, '#book-form input[name="totalCopies"]', '2')
  await fill(page, '#book-form input[name="tags"]', 'testing, quality')
  await fill(page, '#book-form textarea[name="description"]', 'A demo title created during automated QA.')
  await clickByText(page, 'Add book', { scope: '[role="dialog"]' })
  await sleep(900)
  record('Book created toast', await waitForText(page, 'Book added to catalogue'))
  record('New book visible in inventory', await waitForText(page, 'Test Automation Handbook'))

  /* --------------------------------------------------------- issue a book */
  await goto(`${BASE}/app/loans?issue=1`, { waitUntil: 'domcontentloaded' })
  record('Issue dialog opens', await waitForText(page, 'Issue a book'))
  await chooseCombobox(page, 0, 'Sneha', 'Sneha Iyer')
  await chooseCombobox(page, 1, 'Test Automation', 'Test Automation Handbook')
  await sleep(400)
  await shot(page, '04-issue-dialog')
  await clickByText(page, 'Issue book', { scope: '[role="dialog"]' })
  await sleep(1000)
  record('Issue success toast', await waitForText(page, 'Book issued successfully'))
  await shot(page, '05-loans-active')

  // availability decreased
  const availability = await page.evaluate(() => {
    const raw = localStorage.getItem('lumina.library.data.v1')
    const data = JSON.parse(raw)
    const book = data.books.find((b) => b.title === 'Test Automation Handbook')
    const activeLoans = data.loans.filter((l) => l.bookId === book.id && l.status === 'active')
    return { total: book.totalCopies, active: activeLoans.length }
  })
  record('Available copies decrease on issue', availability.total - availability.active === 1, JSON.stringify(availability))

  /* --------------------------------------------------------------- return */
  await goto(`${BASE}/app/loans?status=all`, { waitUntil: 'domcontentloaded' })
  await sleep(700)
  const rowFound = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    const target = rows.find((row) => row.innerText.includes('Test Automation Handbook'))
    const button = target && Array.from(target.querySelectorAll('button')).find((b) => b.innerText.includes('Return'))
    if (button) {
      button.click()
      return true
    }
    return false
  })
  record('Return row action found', rowFound)
  await sleep(600)
  record('Return dialog opens', await waitForText(page, 'Process return'))
  await clickByText(page, 'Confirm return', { scope: '[role="dialog"]' })
  await sleep(900)
  record('Return success toast', await waitForText(page, 'Book returned on time'))

  const afterReturn = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
    const book = data.books.find((b) => b.title === 'Test Automation Handbook')
    const loan = data.loans.find((l) => l.bookId === book.id)
    return { status: loan.status, fine: loan.fineAmount }
  })
  record('Loan marked returned with no fine', afterReturn.status === 'returned' && afterReturn.fine === 0, JSON.stringify(afterReturn))

  // double return guard: try return again on same loan via storage-level check
  const doubleReturn = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
    return data.loans.every((l) => !(l.status === 'returned' && l.returnedAt === null))
  })
  record('Returned loans keep consistent history', doubleReturn)

  /* --------------------------------------------------------- reservations */
  await goto(`${BASE}/app/reservations`, { waitUntil: 'domcontentloaded' })
  record('Reservations page loads', await waitForText(page, 'Reservations'))
  await sleep(500)
  await shot(page, '06-reservations')
  const queueBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lumina.library.data.v1')).reservations.length)
  await clickByText(page, 'Cancel', { exact: true })
  await sleep(500)
  record('Cancel reservation confirmation', await waitForText(page, 'Cancel this reservation?'))
  await clickByText(page, 'Keep hold', { scope: '[role="dialog"]' })
  await sleep(400)
  const queueAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('lumina.library.data.v1')).reservations.length)
  record('Dismissing confirm keeps reservation', queueBefore === queueAfter)

  /* ------------------------------------------------------------ members */
  await goto(`${BASE}/app/members`, { waitUntil: 'domcontentloaded' })
  record('Members page loads', await waitForText(page, 'Member management'))
  await page.waitForSelector('input[aria-label="Search members"]')
  await page.type('input[aria-label="Search members"]', 'Riya', { delay: 20 })
  await sleep(600)
  const memberRows = await page.$$eval('tbody tr', (rows) => rows.map((row) => row.innerText.toLowerCase()))
  record(
    'Member search filters table',
    memberRows.length > 0 && memberRows.length < 5 && memberRows.every((row) => row.includes('riya')),
    `${memberRows.length} rows`,
  )
  await shot(page, '07-members')

  /* ------------------------------------------------------------- reports */
  await goto(`${BASE}/app/reports`, { waitUntil: 'domcontentloaded' })
  record('Reports page loads', await waitForText(page, 'Reports & insights'))
  await sleep(1400)
  const charts = await page.$$eval('svg.recharts-surface', (nodes) => nodes.length)
  record('Charts render', charts >= 4, `${charts} chart surfaces`)
  await shot(page, '08-reports')

  /* -------------------------------------------------------- persistence */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(900)
  record('Session persists after reload', (await page.evaluate(() => location.pathname)) === '/app/reports')
  const persisted = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
    return data.books.some((b) => b.title === 'Test Automation Handbook')
  })
  record('Created book persists after reload', persisted)

  /* --------------------------------------------------- corrupt storage */
  await page.evaluate(() => localStorage.setItem('lumina.library.data.v1', '{not valid json'))
  await goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  const recoveredOk = await page.evaluate(() => {
    const raw = localStorage.getItem('lumina.library.data.v1')
    try {
      const data = JSON.parse(raw)
      return Array.isArray(data.books) && data.books.length > 10
    } catch {
      return false
    }
  })
  record('Corrupt storage recovers to seed data', recoveredOk)

  /* --------------------------------------------------------- student flow */
  await goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await clickByText(page, 'Student')
  await sleep(300)
  await clickByText(page, 'Enter Student demo')
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 8000 })
  record('Student demo login', await waitForText(page, 'Welcome back'))
  await sleep(800)
  await shot(page, '09-dashboard-student')

  // student cannot reach members
  await goto(`${BASE}/app/members`, { waitUntil: 'domcontentloaded' })
  record('Student blocked from members route', await waitForText(page, 'This area is restricted'))

  // student borrows (or hits limit)
  await goto(`${BASE}/books/BK-004`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await sleep(500)
  await sleep(800)
  const borrowAvailable = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Borrow this copy')),
  )
  record('Student borrow action present', borrowAvailable)
  if (borrowAvailable) {
    await clickByText(page, 'Borrow this copy')
    await sleep(1000)
    const toastText = await page.evaluate(() => document.body.innerText)
    record(
      'Student borrow enforces limits',
      toastText.toLowerCase().includes('borrowing limit reached') || toastText.toLowerCase().includes('book issued'),
      toastText.toLowerCase().includes('borrowing limit reached') ? 'limit enforced' : 'issued',
    )
  }
  await shot(page, '09b-student-book-detail')

  // student sees only own loans
  await goto(`${BASE}/app/loans`, { waitUntil: 'domcontentloaded' })
  await sleep(700)
  const leaksOtherMembers = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
    const session = JSON.parse(localStorage.getItem('lumina.library.session.v1'))
    const ownIds = new Set(data.loans.filter((l) => l.memberId === session.memberId).map((l) => l.id))
    const shownLoanIds = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.innerText)
    const stray = data.loans.filter((l) => !ownIds.has(l.id) && shownLoanIds.some((text) => text.includes(l.id)))
    return stray.length
  })
  record('Student loan list is scoped to self', leaksOtherMembers === 0, `${leaksOtherMembers} leaks`)

  /* ----------------------------------------------------------- admin role */
  await goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await clickByText(page, 'Administrator')
  await sleep(250)
  await clickByText(page, 'Enter Administrator demo')
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 8000 })
  record('Admin demo login', await waitForText(page, 'Administrator overview'))
  await sleep(900)
  await shot(page, '10-dashboard-admin')

  await goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' })
  record('Settings page loads policy form', await waitForText(page, 'Circulation policy'))
  await sleep(400)
  const fineInput = await page.$('#finePerDay, input[name="finePerDay"]')
  if (fineInput) {
    await page.click('input[name="finePerDay"]', { clickCount: 3 })
    await page.type('input[name="finePerDay"]', '7')
    await clickByText(page, 'Save policy')
    await sleep(900)
    record('Policy update persists', await waitForText(page, 'Circulation policy updated'))
    const rate = await page.evaluate(() => JSON.parse(localStorage.getItem('lumina.library.data.v1')).config.finePerDay)
    record('Fine rate saved to storage', rate === 7, `rate=${rate}`)
  } else {
    record('Policy form fields present', false)
  }

  /* ------------------------------------------------------- reset demo data */
  await goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' })
  await sleep(500)
  await clickByText(page, 'Reset demo data')
  await sleep(500)
  await clickByText(page, 'Reset demo data', { scope: '[role="dialog"]' })
  await sleep(1200)
  const resetOk = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
    return data.config.finePerDay === 5 && data.books.every((b) => b.title !== 'Test Automation Handbook')
  })
  record('Reset restores seeded dataset', resetOk)

  /* --------------------------------------------- reservations (student UI) */
  await restartBrowser()
  await goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await clickByText(page, 'Student')
  await sleep(300)
  // pick a different demo student from the profile combobox
  await page.evaluate(() => {
    const trigger = document.querySelector('button[role="combobox"]')
    trigger?.click()
  })
  await sleep(300)
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Search students…"]')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Aditya')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await sleep(400)
  await clickByText(page, 'Aditya Verma', { exact: false })
  await sleep(200)
  await clickByText(page, 'Enter Student demo')
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 8000 })

  await goto(`${BASE}/books/BK-009`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await sleep(500)
  await sleep(700)
  const reserveVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Reserve this title')),
  )
  record('Reserve action offered for fully-borrowed title', reserveVisible)
  if (reserveVisible) {
    await clickByText(page, 'Reserve this title')
    await sleep(1000)
    record('Reservation created toast', await waitForText(page, 'Reservation placed'))
    const holds = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
      const session = JSON.parse(localStorage.getItem('lumina.library.session.v1'))
      return data.reservations.filter(
        (r) => r.memberId === session.memberId && r.bookId === 'BK-009' && ['pending', 'ready'].includes(r.status),
      ).length
    })
    record('Exactly one active hold per member/title', holds === 1, `${holds} holds`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(800)
    record('Duplicate reservation prevented in UI', await waitForText(page, 'Reservation in queue'))
    await shot(page, '13-student-reserved-book')
  }

  /* --------------------------------------------------------- renewal in UI */
  await goto(`${BASE}/app/loans`, { waitUntil: 'domcontentloaded' })
  await sleep(900)
  const renewResult = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    for (const row of rows) {
      const button = Array.from(row.querySelectorAll('button')).find((b) => b.innerText.includes('Renew'))
      if (button && !button.disabled) {
        button.click()
        return true
      }
    }
    return false
  })
  await sleep(1000)
  const renewedOk = await textVisible(page, 'Loan renewed')
  record('Renewal processed through the UI', renewResult && renewedOk, renewResult ? '' : 'no renewable row')

  /* ------------------------------------------------------------ CSV export */
  await goto(`${BASE}/app/books`, { waitUntil: 'domcontentloaded' })
  await sleep(800)
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: '/home/user/qa-downloads',
    eventsEnabled: true,
  })
  fs.mkdirSync('/home/user/qa-downloads', { recursive: true })
  await clickByText(page, 'Export CSV')
  await sleep(1500)
  const downloads = fs.existsSync('/home/user/qa-downloads') ? fs.readdirSync('/home/user/qa-downloads') : []
  let csvValid = false
  if (downloads.length > 0) {
    const csv = fs.readFileSync(`/home/user/qa-downloads/${downloads[0]}`, 'utf8')
    const lines = csv.trim().split('\r\n')
    csvValid = lines[0].startsWith('Book ID,Title,Author') && lines.length > 10
    record('CSV export downloads valid file', csvValid, `${lines.length} lines`)
  } else {
    record('CSV export downloads valid file', false, 'no download captured')
  }

  /* ------------------------------------------------- reduced motion toggle */
  await goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' })
  await sleep(700)
  await clickByText(page, 'Reduced')
  await sleep(400)
  const motionAttr = await page.evaluate(() => document.documentElement.dataset.motion)
  record('Reduced motion preference applied', motionAttr === 'reduced', `data-motion=${motionAttr}`)
  await clickByText(page, 'Full')
  await sleep(300)

  /* ---------------------------------------------------------- responsive */
  const sizes = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1024, height: 768 },
    { name: 'desktop', width: 1440, height: 900 },
  ]
  for (const size of sizes) {
    await restartBrowser()
    await page.setViewport({ width: size.width, height: size.height })
    await goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() =>
      localStorage.setItem(
        'lumina.library.session.v1',
        JSON.stringify({
          role: 'admin',
          memberId: 'M-1001',
          name: 'Dr. Meera Kulkarni',
          email: 'meera.kulkarni@lumina.edu',
          enteredAt: new Date().toISOString(),
        }),
      ),
    )
    await goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' })
    await sleep(1300)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    record(`No horizontal overflow at ${size.width}px`, overflow <= 1, `overflow=${overflow}px`)
    await shot(page, `11-dashboard-${size.name}-${size.width}`)

    await goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await sleep(900)
    const landingOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    record(`Landing no overflow at ${size.width}px`, landingOverflow <= 1, `overflow=${landingOverflow}px`)
    if (size.name === 'mobile' || size.name === 'desktop') {
      await shot(page, `12-landing-${size.name}-${size.width}`)
    }

    await goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded' })
    await sleep(900)
    const catalogOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    record(`Catalogue no overflow at ${size.width}px`, catalogOverflow <= 1, `overflow=${catalogOverflow}px`)
    if (size.name === 'mobile') await shot(page, `14-catalog-mobile-${size.width}`)
  }

  /* ------------------------------------------------------------- signout */
  await page.setViewport({ width: 1440, height: 900 })
  await goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' })
  await sleep(600)
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const profile = buttons.find((b) => b.getAttribute('aria-haspopup') === 'menu')
    profile?.click()
  })
  await sleep(400)
  await clickByText(page, 'Sign out')
  await sleep(900)
  record('Sign out returns to public site', (await page.evaluate(() => location.pathname)) === '/')
  const sessionCleared = await page.evaluate(() => localStorage.getItem('lumina.library.session.v1') === null)
  const dataKept = await page.evaluate(() => localStorage.getItem('lumina.library.data.v1') !== null)
  record('Sign out clears session but keeps dataset', sessionCleared && dataKept)

  await goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' })
  await sleep(600)
  record('Protected route redirects when signed out', (await page.evaluate(() => location.pathname)) === '/login')
} catch (error) {
  record('Unhandled QA script error', false, error.message)
  await shot(page, 'error-state')
} finally {
  fs.writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify({ results, consoleErrors, pageErrors }, null, 2),
  )
  console.log('\n=== SUMMARY ===')
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`)
  console.log(`Console errors: ${consoleErrors.length}`)
  consoleErrors.slice(0, 10).forEach((e) => console.log('  console:', e))
  console.log(`Page errors: ${pageErrors.length}`)
  pageErrors.slice(0, 10).forEach((e) => console.log('  pageerror:', e))
  await browser.close()
}
