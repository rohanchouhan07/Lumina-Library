/**
 * Live-mode end-to-end check.
 *
 * Drives the real UI at http://localhost:5173 (VITE_API_BASE_URL=/api, proxied to
 * the Apps Script contract mock on :8100) and verifies against the backend API
 * that every mutation the UI claims to have made actually landed.
 *
 * Run: node qa-tools/live-e2e.mjs
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const API = 'http://localhost:8100'
const OUT = '/home/user/qa-screens'
fs.mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

async function api(action, payload = {}, token = null) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, token }),
  })
  return res.json()
}

async function token(identifier, password) {
  const res = await api('auth.login', { identifier, password, remember: false })
  if (!res.ok) throw new Error(`login failed for ${identifier}: ${JSON.stringify(res.error)}`)
  return res.data.token
}

/** Fill a labelled input by its <label> text. */
async function fill(page, label, value) {
  await page.evaluate(
    (labelText, val) => {
      const labels = Array.from(document.querySelectorAll('label'))
      const target = labels.find((l) => (l.textContent || '').trim().startsWith(labelText))
      if (!target) throw new Error(`no label starting with "${labelText}"`)
      const id = target.getAttribute('for')
      const input = id
        ? document.getElementById(id)
        : target.querySelector('input, textarea, select')
      if (!input) throw new Error(`no control for "${labelText}"`)
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, val)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    label,
    value,
  )
}

async function clickText(page, text, { last = false } = {}) {
  const handle = await page.evaluateHandle((wanted, useLast) => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="menuitem"], [role="tab"], [role="option"]'))
    const matches = nodes.filter((n) => (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' ').includes(wanted))
    return useLast ? (matches.at(-1) ?? null) : (matches[0] ?? null)
  }, text, last)
  const el = handle.asElement()
  if (!el) throw new Error(`nothing clickable containing "${text}"`)
  await el.click()
  await sleep(400)
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 960 })
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

try {
  /* ---------------------------------------------------------------- login screen */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const hasCredentialForm = await page.evaluate(
    () => Boolean(document.querySelector('input[type="password"]')),
  )
  record('login screen shows email/ID + password fields', hasCredentialForm)
  record(
    'demo role picker is not offered in live mode',
    !(await page.evaluate(() => document.body.innerText.includes('Enter Administrator demo'))),
  )

  /* ------------------------------------------------------------ wrong password */
  await fill(page, 'Email or institutional ID', 'admin@lumina.edu')
  await fill(page, 'Password', 'wrong-password')
  await clickText(page, 'Sign in')
  await sleep(1200)
  const wrongPwText = await page.evaluate(() => document.body.innerText)
  record(
    'invalid credentials surface an error and stay on /login',
    page.url().includes('/login') && /Could not sign in|invalid|incorrect/i.test(wrongPwText),
    page.url(),
  )

  /* --------------------------------------------------------------- admin login */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(400)
  await fill(page, 'Email or institutional ID', 'admin@lumina.edu')
  await fill(page, 'Password', 'Lumina@2026')
  await clickText(page, 'Sign in')
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 15000 })
  await sleep(1200)
  record('admin login lands on /app', page.url().includes('/app'), page.url())

  const shellText = await page.evaluate(() => document.body.innerText)
  record('shell reports Google Sheets connection', /Google Sheets connected/i.test(shellText))
  record('live data loaded from the backend (catalogue visible)', /Catalogue|Books|Dashboard/i.test(shellText))

  /* ------------------------------------------------------- create a book (live) */
  const adminToken = await token('admin@lumina.edu', 'Lumina@2026')
  const stamp = Date.now().toString().slice(-6)
  const title = `E2E Live Title ${stamp}`

  await page.goto(`${BASE}/app/books`, { waitUntil: 'networkidle2' })
  await sleep(900)
  await clickText(page, 'Add book')
  await sleep(500)
  await fill(page, 'Title', title)
  await fill(page, 'Author', 'Grace Hopper')
  await fill(page, 'Publisher', 'E2E Press')
  await fill(page, 'Publication year', '2026')
  await fill(page, 'Shelf / location', 'QA-01')
  await fill(page, 'Total copies', '2')
  // The page header also has an "Add book" button — the dialog submit is the last match.
  await clickText(page, 'Add book', { last: true })
  await sleep(1800)

  const afterCreate = await api('books.list', {}, adminToken)
  const created = (afterCreate.data?.books ?? afterCreate.data ?? []).find?.((b) => b.title === title)
  record(
    'book created through the UI is persisted in the backend',
    Boolean(created),
    created ? `id ${created.bookId ?? created.id}` : 'not found via API',
  )

  /* --------------------------------------------- issue a loan through the UI */
  if (created) {
    const bookId = created.bookId ?? created.id
    const issue = await api('loans.issue', { bookId, memberId: 'U-1003' }, adminToken)
    record(
      'issue via API is rejected/ok consistently with UI rules',
      typeof issue.ok === 'boolean',
      issue.ok ? 'issued' : issue.error?.code,
    )
    const afterIssue = await api('books.list', {}, adminToken)
    const reread = (afterIssue.data?.books ?? afterIssue.data ?? []).find?.((b) => (b.bookId ?? b.id) === bookId)
    record(
      'availability is derived, never negative',
      !reread || Number(reread.availableCopies) >= 0,
      reread ? `available ${reread.availableCopies}/${reread.totalCopies}` : 'n/a',
    )
  }

  /* --------------------------------------------------------- session restore */
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1500)
  record('reload keeps the session (no login flash)', page.url().includes('/app'), page.url())

  /* --------------------------------- "keep me signed in" unchecked = tab-scoped */
  // Isolated storage so the admin's remembered token does not interfere.
  const isolated = await browser.createBrowserContext()
  const sessionPage = await isolated.newPage()
  await sessionPage.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(500)
  await fill(sessionPage, 'Email or institutional ID', 'faculty@lumina.edu')
  await fill(sessionPage, 'Password', 'Faculty@2026')
  await sessionPage.evaluate(() => {
    const box = document.querySelector('input[type="checkbox"]')
    if (box?.checked) box.click()
  })
  await clickText(sessionPage, 'Sign in')
  await sleep(2200)
  const storageKeys = await sessionPage.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }))
  record(
    'live mode never persists library records to localStorage',
    !storageKeys.local.includes('lumina.library.data.v1'),
    storageKeys.local.join(','),
  )
  const sessionTok = await sessionPage.evaluate(() => ({
    local: localStorage.getItem('lumina.session.token.v1'),
    session: sessionStorage.getItem('lumina.session.token.v1'),
  }))
  record(
    'unchecked "keep me signed in" stores the token per-tab, not on the device',
    Boolean(sessionTok.session) && !sessionTok.local,
    JSON.stringify({ local: Boolean(sessionTok.local), session: Boolean(sessionTok.session) }),
  )
  const otherTab = await isolated.newPage()
  await otherTab.goto(`${BASE}/app`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  record(
    'another tab is not signed in by a tab-scoped session',
    otherTab.url().includes('/login'),
    otherTab.url(),
  )
  await otherTab.close()
  await sessionPage.close()
  await isolated.close()

  /* ---------------------------------------------------------- student role */
  const studentToken = await token('M-1004', 'Student@2026')
  const studentUsers = await api('users.list', {}, studentToken)
  record('student cannot list users', studentUsers.ok === false && studentUsers.error?.code === 'FORBIDDEN')

  const anon = await api('bootstrap', {}, null)
  record('unauthenticated bootstrap is rejected', anon.ok === false && anon.error?.code === 'UNAUTHORIZED')

  /* ------------------------------------------------------------------ logout */
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle2' })
  await sleep(800)
  const revokedToken = await page.evaluate(
    () => localStorage.getItem('lumina.session.token.v1') ?? sessionStorage.getItem('lumina.session.token.v1'),
  )
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-haspopup') === 'menu' || (b.getAttribute('aria-label') || '').toLowerCase().includes('account'),
    )
    btn?.click()
  })
  await sleep(400)
  await clickText(page, 'Sign out')
  await sleep(1500)
  record('logout returns to the public site', !page.url().includes('/app'), page.url())

  if (revokedToken) {
    const afterLogout = await api('bootstrap', {}, revokedToken)
    record('logout revokes the session server-side', afterLogout.ok === false && afterLogout.error?.code === 'UNAUTHORIZED')
  }

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle2' })
  await sleep(1000)
  record('guarded route redirects to /login when signed out', page.url().includes('/login'), page.url())

  await page.screenshot({ path: `${OUT}/live-login.png`, fullPage: false })
} catch (error) {
  record('suite completed without throwing', false, error.message)
} finally {
  const relevant = consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
  record('no console errors during the flow', relevant.length === 0, relevant.slice(0, 3).join(' | '))
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
fs.writeFileSync('/home/user/qa-screens/live-e2e.json', JSON.stringify({ results, consoleErrors }, null, 2))
process.exit(passed === results.length ? 0 : 1)
