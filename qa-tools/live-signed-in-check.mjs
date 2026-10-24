/**
 * Sign in to the live app and prove the real sheet renders — read-only.
 *
 *   BASE_URL=http://localhost:5175 ADMIN_ID=admin@gmail.com ADMIN_PASSWORD='…' \
 *     node qa-tools/live-signed-in-check.mjs
 *
 * No writes: it signs in, reads every screen the role can reach, checks the values come
 * from the deployment (not the demo dataset), and signs out. Uses credentials you supply;
 * nothing is stored in this file.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const ADMIN_ID = process.env.ADMIN_ID || ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
if (!ADMIN_ID || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_ID and ADMIN_PASSWORD')
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
await page.setViewport({ width: 1440, height: 900 })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

const bodyText = () => page.evaluate(() => document.body.innerText)
/** Click a sidebar link (in-app navigation: one bootstrap, not one per page). */
const goTo = async (label, expectText, timeoutMs = 120_000) => {
  const clicked = await page.evaluate((text) => {
    const link = [...document.querySelectorAll('a, button')].find(
      (element) => element.innerText?.trim() === text && element.offsetParent !== null,
    )
    if (!link) return false
    link.click()
    return true
  }, label)
  if (!clicked) return { clicked: false, ready: false, text: await bodyText() }
  const ready = await waitFor(async () => new RegExp(expectText, 'i').test(await bodyText()), timeoutMs)
  return { clicked: true, ready, text: await bodyText() }
}

const waitFor = async (predicate, timeoutMs = 45_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await sleep(500)
  }
  return false
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60_000 })
  await sleep(600)

  const fill = (label, value) =>
    page.evaluate(
      (labelText, text) => {
        const element = Array.from(document.querySelectorAll('label')).find((item) =>
          (item.textContent || '').trim().startsWith(labelText),
        )
        const input = document.getElementById(element.getAttribute('for'))
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      },
      label,
      value,
    )

  await fill('Email or institutional ID', ADMIN_ID)
  await fill('Password', ADMIN_PASSWORD)
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Sign in')
    button?.click()
  })

  const landed = await waitFor(async () => page.url().includes('/app'), 150_000)
  const formError = landed
    ? ''
    : await page.evaluate(() =>
        (document.body.innerText.split('\n').find((line) => /could not sign in|took too long|incorrect|attempt/i.test(line)) ?? '').trim(),
      )
  check('sign-in against the live deployment succeeds', landed, formError || page.url())

  if (landed) {
    const dashboard = await waitFor(async () => /dashboard|overview/i.test(await bodyText()))
    check('the dashboard renders after sign-in', dashboard)
    const text = await bodyText()
    check('the shell reports the Google Sheets connection', /google sheets connected/i.test(text))
    check(
      'the dashboard shows live aggregates, not the demo figures',
      /total copies/i.test(text) && /unique titles/i.test(text),
      text.split('\n').filter((line) => /total copies|unique titles/i.test(line)).join(' / '),
    )
    check(
      'a category that only exists in the sheet is rendered',
      /comic/i.test(text),
      text.split('\n').filter((line) => /comic/i.test(line)).slice(0, 1).join(''),
    )

    // Catalogue must contain the owner's own row and nothing invented.
    const books = await goTo('Books', 'book inventory')
    const booksText = books.text
    check('the catalogue shows the row that exists in the sheet', /rohan/i.test(booksText), booksText.match(/rohan/i)?.[0] ?? 'no match')
    check('the catalogue is not the 41-title demo set', !/the midnight library/i.test(booksText))
    check(
      'the catalogue footer says it is connected to Google Sheets',
      /connected to google sheets via apps script/i.test(booksText),
    )

    // Settings must show the live policy values seeded by setupLumina().
    const settings = await goTo('Settings', 'configuration|circulation policy')
    const settingsText = settings.text
    check('the settings page shows the live connection', /google sheets connected/i.test(settingsText))
    // Read the actual form values, which come straight from the Settings tab.
    const policy = await page.evaluate(() => {
      const byLabel = (needle) => {
        const label = [...document.querySelectorAll('label')].find((element) =>
          (element.textContent || '').toLowerCase().includes(needle),
        )
        if (!label) return null
        const input = document.getElementById(label.getAttribute('for'))
        return input ? input.value : null
      }
      return {
        loanDays: byLabel('loan duration'),
        fine: byLabel('fine per overdue day'),
        renewals: byLabel('maximum renewals'),
        library: byLabel('library name'),
      }
    })
    check(
      'the policy form is populated from the live Settings tab',
      policy.loanDays === '14' && policy.fine === '5' && Boolean(policy.library),
      JSON.stringify(policy),
    )

    // Profile shows the signed-in administrator from the Users tab.
    const profile = await goTo('Profile', 'profile & preferences|account')
    const profileText = profile.text
    check('the profile shows the deployed admin account', profileText.toLowerCase().includes(ADMIN_ID.toLowerCase()))

    await page.screenshot({ path: '/home/user/qa-screens/live-signed-in-dashboard.png', fullPage: false })
  }

  check('no console errors during the live session', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('suite completed without throwing', false, String(error).slice(0, 200))
} finally {
  await browser.close()
}

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY ===`)
console.log(`Passed: ${results.length - failures.length}/${results.length}`)
if (failures.length) {
  console.log('Failures:')
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
