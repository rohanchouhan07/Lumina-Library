/**
 * Prove the browser can talk to a real Apps Script deployment — no credentials needed.
 *
 *   BASE_URL=http://localhost:5175 node qa-tools/live-deploy-check.mjs
 *
 * Confirms the live login screen is served, that the app's own fetch reaches /exec
 * (CORS + redirect + text/plain all working from a page origin), that a wrong password
 * surfaces the server's message instead of a false success, and that nothing leaks into
 * console errors. Read-only: it never signs in, so it never writes a row.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const consoleErrors = []
const apiCalls = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('response', (response) => {
  const url = response.url()
  if (/script\.google\.com|script\.googleusercontent\.com/.test(url)) {
    apiCalls.push({ url, status: response.status() })
  }
})

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60_000 })
  await sleep(800)

  /* ------------------------------------------------- live login screen renders */

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('label')].map((label) => (label.textContent || '').trim()),
  )
  check(
    'the live sign-in form renders (email/ID + password)',
    labels.some((label) => label.startsWith('Email or institutional ID')) && labels.some((label) => label.startsWith('Password')),
    labels.join(' | ').slice(0, 90),
  )
  const demoCards = await page.evaluate(() =>
    [...document.querySelectorAll('[role="radio"]')].length,
  )
  check('demo role picker is absent in live mode', demoCards === 0, `${demoCards} role radios`)
  const bodyText = await page.evaluate(() => document.body.innerText)
  check('the page does not claim to be an offline demo', !/offline demo access/i.test(bodyText))
  check(
    'the page labels the auth as prototype-grade',
    /prototype-grade authentication|not a production identity provider/i.test(bodyText),
  )

  /* --------------------------------------- the app's own request reaches /exec */

  const fill = async (label, value) => {
    await page.evaluate(
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
  }

  // A fresh throwaway identifier each run: the throttle keys on the identifier, so a
  // repeated address would show RATE_LIMITED instead of the "incorrect password" path.
  await fill('Email or institutional ID', `no-such-account-${Date.now()}@example.com`)
  await fill('Password', 'wrong-password-demo')
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Sign in')
    button?.click()
  })

  // Apps Script cold start + redirect chain; give it room.
  let sawApi = false
  for (let i = 0; i < 30; i += 1) {
    await sleep(1000)
    if (apiCalls.length > 0) {
      sawApi = true
      break
    }
  }
  check(
    'the browser reached the Apps Script deployment',
    sawApi,
    apiCalls.map((call) => `${call.status} ${call.url.slice(0, 60)}…`).join(' | ') || 'no request observed',
  )
  check(
    'the request was not blocked by CORS',
    sawApi && apiCalls.every((call) => call.status < 400),
    apiCalls.map((call) => call.status).join(','),
  )

  await sleep(2500)
  const afterText = await page.evaluate(() => document.body.innerText)
  check(
    'a wrong password surfaces the server error, not a success screen',
    /could not sign in|incorrect/i.test(afterText) && !/dashboard/i.test(afterText),
    afterText.split('\n').find((line) => /incorrect|could not sign in/i.test(line)) ?? afterText.slice(0, 80),
  )
  check('the user stays on /login', page.url().includes('/login'), page.url())
  check('no token was stored for a failed sign-in', await page.evaluate(() => {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i))
    for (let i = 0; i < sessionStorage.length; i += 1) keys.push(sessionStorage.key(i))
    return !keys.some((key) => /session|token/i.test(key))
  }))
  check(
    'no console errors during the round trip',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | '),
  )

  await page.screenshot({ path: '/home/user/qa-screens/live-deployment-login.png', fullPage: false })
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
