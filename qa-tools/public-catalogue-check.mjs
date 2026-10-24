/**
 * Signed-out public pages must never look broken.
 *
 *   BASE_URL=http://localhost:5173 node qa-tools/public-catalogue-check.mjs
 *
 * Three states are checked, all without signing in:
 *   1. the landing page shows either live counters or an honest "sign in" note — never four
 *      silent zeroes with no explanation;
 *   2. /catalog either lists real titles or invites a sign-in (never a bare "no matches");
 *   3. an individual /books/:id deep link resolves when the catalogue is readable.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

const text = () => page.evaluate(() => document.body.innerText)
const waitFor = async (predicate, timeoutMs = 90_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await sleep(500)
  }
  return false
}

try {
  /* --------------------------------------------------------------- landing page */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // Wait for a *terminal* state, not the first paint: the live call can take ~10 s cold.
  const settled = await waitFor(
    async () => /Live figures from the library spreadsheet|Sign in to see live figures|Derived from the seeded/i.test(await text()),
    60_000,
  )
  check('the landing page settles (no eternal spinner)', settled)

  const landing = await text()
  const honest = /Sign in to see live figures|Live figures from the library spreadsheet|seeded demo dataset/i.test(landing)
  check('the landing page explains where its numbers come from', honest, landing.match(/Live figures[^\n]*|Sign in to see[^\n]*|Derived from the seeded[^\n]*/)?.[0] ?? '')
  check('the landing page does not print four unexplained zeroes', !/Total book copies\n\s*0\n[\s\S]{0,80}Registered members\n\s*0[\s\S]{0,80}Books issued now\n\s*0/.test(landing) || /Sign in to load/i.test(landing))

  const liveNumbers = /Live figures from the library spreadsheet/.test(landing)
  await page.screenshot({ path: '/home/user/qa-screens/public-landing.png', fullPage: false })

  /* --------------------------------------------------------------- catalogue */
  await page.goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // Wait for a stable terminal state: books listed (N>0), an explicit sign-in prompt, or a
  // settled "no titles" only after the header stopped saying "Reading the live catalogue".
  const catalogSettled = await waitFor(async () => {
    const body = await text()
    if (/Reading the live catalogue|Loading the catalogue/i.test(body)) return false
    if (/Sign in to browse the live catalogue/i.test(body)) return true
    const count = body.match(/(\d+)\s+titles across/i)
    if (count && Number(count[1]) > 0) return true
    return /No titles match/i.test(body)
  }, 60_000)
  check('the catalogue page settles', catalogSettled)
  const catalog = await text()
  if (process.env.DEBUG_CATALOG) {
    console.log('--- catalog text ---')
    console.log(catalog.slice(0, 700))
    console.log('--- end ---')
  }
  const catalogHasBooks =
    /titles across|View details|copies available today/i.test(catalog) &&
    !/No titles match|Sign in to browse the live catalogue/i.test(catalog)
  const catalogAsksToSignIn = /Sign in to browse the live catalogue/i.test(catalog)
  check(
    'signed out, the catalogue either lists titles or asks for a sign-in',
    catalogHasBooks || catalogAsksToSignIn,
    catalogHasBooks ? 'listing titles' : 'sign-in prompt',
  )
  await page.screenshot({ path: '/home/user/qa-screens/public-catalog.png', fullPage: false })

  if (catalogHasBooks) {
    /* ----------------------------------------------------------- a book deep link */
    // Catalogue cards open a dialog rather than navigating, so grab the first book id from
    // whatever the card exposes (link, data attribute, or the "View details" button).
    const bookHref = await page.evaluate(() => {
      const anchor = [...document.querySelectorAll('a[href*="/books/"]')][0]
      if (anchor) return anchor.getAttribute('href')
      const card = document.querySelector('[data-book-id]')
      if (card) return `/books/${card.getAttribute('data-book-id')}`
      const heading = [...document.querySelectorAll('button')].find((b) => /view details|open/i.test(b.innerText || ''))
      const id = heading?.getAttribute('data-book-id') || heading?.dataset?.bookId
      return id ? `/books/${id}` : null
    })
    if (bookHref) {
      await page.goto(`${BASE}${bookHref}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      const detail = await waitFor(async () => /availability|copies|about this book/i.test(await text()))
      const body = await text()
      check('a public book deep link resolves', detail && !/not in the catalogue/i.test(body), bookHref)
    } else {
      check('a public book deep link resolves', false, 'no book links found on /catalog')
    }
  } else if (process.env.SAMPLE_BOOK_ID) {
    await page.goto(`${BASE}/books/${process.env.SAMPLE_BOOK_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const detail = await waitFor(async () => /availability|copies|about this book/i.test(await text()), 60_000)
    check('a public book deep link resolves', detail && !/not in the catalogue/i.test(await text()), process.env.SAMPLE_BOOK_ID)
  }

  check(
    'the public pages report whether this build reads the sheet',
    /Live library|Demo/.test(landing),
    landing.match(/(Live library|Demo)/)?.[0] ?? '',
  )
  check('no console errors while signed out', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  console.log(`\nMode: ${liveNumbers ? 'live catalogue reachable without a session' : 'signed-out fallback shown'}`)
} catch (error) {
  check('suite completed without throwing', false, String(error).slice(0, 220))
} finally {
  await browser.close()
}

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY ===`)
console.log(`Passed: ${results.length - failures.length}/${results.length}`)
if (failures.length) {
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
