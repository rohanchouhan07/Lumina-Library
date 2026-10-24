/**
 * Create a real LIBRARIAN in the live sheet, through the real Members form, then sign in as it.
 *
 *   node qa-tools/live-librarian-check.mjs
 *
 * Environment:
 *   BASE_URL        default http://localhost:5173 (live config, port 5173)
 *   ADMIN_ID        default admin@gmail.com
 *   ADMIN_PASSWORD  required — the current admin password (never hardcoded here)
 *   LIB_EMAIL / LIB_ID / LIB_PASSWORD   defaults librarian.qa@lumina.test / LIB-QA / Desk@2026
 *
 * Leaves the librarian ACTIVE so the owner can look at it, and prints how to deactivate it.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const ADMIN_ID = process.env.ADMIN_ID || 'admin@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const LIB_EMAIL = process.env.LIB_EMAIL || 'librarian.qa@lumina.test'
const LIB_ID = process.env.LIB_ID || 'LIB-QA'
const LIB_NAME = process.env.LIB_NAME || 'Nisha Verma (Desk QA)'
const LIB_PASSWORD = process.env.LIB_PASSWORD || 'Desk@2026'

if (!ADMIN_PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the current admin password.')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

const bodyText = () => page.evaluate(() => document.body.innerText)
const waitFor = async (predicate, timeoutMs = 90_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await sleep(500)
  }
  return false
}

const fill = (labelText, value) =>
  page.evaluate(
    (needle, text) => {
      const label = [...document.querySelectorAll('label')].find((element) =>
        (element.textContent || '').trim().startsWith(needle),
      )
      if (!label) return false
      const input = document.getElementById(label.getAttribute('for'))
      if (!input) return false
      if (input.tagName === 'SELECT') {
        input.value = text
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return input.value === text
      }
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    labelText,
    value,
  )

const signIn = async (identifier, password) => {
  // Navigate first: storage is not reachable from about:blank.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    for (const key of ['lumina.session.token.v1', 'lumina.session.remember.v1']) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  })
  if (page.url().includes('/app')) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await waitFor(() =>
    page.evaluate(() =>
      [...document.querySelectorAll('label')].some((label) =>
        (label.textContent || '').trim().startsWith('Email or institutional ID'),
      ),
    ),
  )
  await fill('Email or institutional ID', identifier)
  await fill('Password', password)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Sign in')?.click()
  })
  return waitFor(async () => page.url().includes('/app'))
}

try {
  /* ---------------------------------------------------------------- admin creates the librarian */
  const adminIn = await signIn(ADMIN_ID, ADMIN_PASSWORD)
  check('admin signs in with the new password', adminIn, page.url())

  await page.goto(`${BASE}/app/members`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const membersUp = await waitFor(async () => /register member/i.test(await bodyText()))
  check('the Members screen loads with live data', membersUp)

  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((element) =>
      /register member/i.test(element.innerText || ''),
    )
    button?.click()
    return Boolean(button)
  })
  check('the Register member dialog opens', opened)
  await sleep(900)

  await fill('Full name', LIB_NAME)
  await fill('Email', LIB_EMAIL)
  await fill('Institutional ID', LIB_ID)
  const roleSet = await fill('Role', 'librarian')
  check('the Role select accepts "librarian" (2.2.0 only)', roleSet)
  await fill('Department', 'Library')
  await fill('Initial password', LIB_PASSWORD)
  await sleep(300)
  await page.screenshot({ path: '/home/user/qa-screens/live-librarian-form.png' })

  const submitted = await page.evaluate(() => {
    const scope = document.querySelector('[role="dialog"]') ?? document
    const buttons = [...scope.querySelectorAll('button')].filter((element) => /^Register member$/i.test(element.innerText?.trim() || ''))
    const target = buttons[buttons.length - 1]
    target?.click()
    return Boolean(target)
  })
  check('the form submits', submitted)

  const created = await waitFor(async () => {
    const text = await bodyText()
    return new RegExp(LIB_EMAIL.replace('.', '\\.')).test(text)
  })
  const afterCreate = await bodyText()
  const validationError = afterCreate
    .split('\n')
    .find((line) => /VALIDATION_ERROR|already|required|invalid|must/i.test(line))
  check(
    'the librarian is created and listed',
    created && !validationError,
    validationError || `${LIB_ID} · librarian`,
  )
  await page.screenshot({ path: '/home/user/qa-screens/live-members-with-librarian.png' })

  /* ---------------------------------------------------------------- the librarian signs in */
  const libIn = await signIn(LIB_ID, LIB_PASSWORD)
  check('the librarian signs in with their institutional ID', libIn, page.url())
  if (libIn) {
    const dashboard = await waitFor(async () => /welcome back|dashboard|overview/i.test(await bodyText()))
    const text = await bodyText()
    check('the librarian lands on a staff dashboard', dashboard)
    check('the sidebar offers Members', /members/i.test(text))
    check('the sidebar offers Circulation', /circulation/i.test(text))
    check('the sidebar offers Reports', /reports/i.test(text))
    await page.screenshot({ path: '/home/user/qa-screens/live-librarian-dashboard.png' })

    await page.goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const settingsReady = await waitFor(async () => /circulation policy/i.test(await bodyText()))
    const settings = await bodyText()
    check('settings render for the librarian', settingsReady)
    check(
      'the librarian sees policy as Admins only',
      /admins only/i.test(settings) && /managed by library administrators/i.test(settings),
    )

    await page.goto(`${BASE}/app/members`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const canRegister = await waitFor(async () => /register member/i.test(await bodyText()))
    check('the librarian can register members', canRegister)

    await page.goto(`${BASE}/app/books`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const booksUp = await waitFor(async () => /add book/i.test(await bodyText()))
    check('the librarian can add books', booksUp)
    await page.screenshot({ path: '/home/user/qa-screens/live-librarian-books.png' })
  }

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('suite completed without throwing', false, String(error).slice(0, 220))
} finally {
  await browser.close()
}

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY ===`)
console.log(`Passed: ${results.length - failures.length}/${results.length}`)
console.log(`\nLibrarian left ACTIVE: ${LIB_NAME} <${LIB_EMAIL}> · ${LIB_ID} · role LIBRARIAN`)
console.log('Deactivate it later in Members ▸ (row) ▸ Deactivate, or leave it as a real desk account.')
if (failures.length) {
  console.log('Failures:')
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
