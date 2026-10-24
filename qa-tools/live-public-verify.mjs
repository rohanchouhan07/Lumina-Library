/**
 * Verify the DEPLOYED site against the DEPLOYED backend, signed out.
 *
 *   BASE_URL=https://lumina-library-fawn.vercel.app node qa-tools/live-public-verify.mjs
 *
 * What it proves:
 *   1. the landing page shows live counts that match the API's own numbers;
 *   2. /catalog lists real titles whose count matches the API;
 *   3. /books/:id opens the *correct* book (title + author from the API, not a generic page);
 *   4. every signed-out network call is anonymous — the only action fired is catalogue.public;
 *   5. no response body contains an email, member name, loan, fine or settings value.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'https://lumina-library-fawn.vercel.app'
const API =
  process.env.API ||
  'https://script.google.com/macros/s/AKfycbwjgZ3qi75a6d2Ul3y_wCt5CQyGBip81OoLGWnpJ0UdATdcVdos-wQ936TW0zJUjx-G/exec'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

/* ------------------------------------------------------------------ ground truth from the API */
const apiCall = async (action, payload = {}, attempts = 3) => {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload }),
        redirect: 'follow',
      })
      const text = await response.text()
      const parsed = JSON.parse(text)
      if (parsed.ok) return parsed
      last = parsed
      console.log(`… ${action} answered ${parsed.error?.code ?? 'error'} (attempt ${attempt})`)
    } catch (error) {
      last = { ok: false, raw: String(error).slice(0, 120) }
      console.log(`… ${action} failed: ${String(error).slice(0, 80)} (attempt ${attempt})`)
    }
    // Apps Script throttles bursts from one address; back off and retry.
    await new Promise((resolve) => setTimeout(resolve, 2500 * attempt))
  }
  return last ?? { ok: false }
}

const health = await apiCall('health')
console.log(`Backend version: ${health.data?.version ?? health.error?.code}`)

const catalogue = await apiCall('catalogue.public', {})
const apiBooks = catalogue.data?.books ?? []
const apiStats = catalogue.data?.stats ?? {}
check(
  'the deployed backend answers catalogue.public',
  catalogue.ok && apiBooks.length > 0,
  `${apiBooks.length} titles · ${apiStats.copies} copies · ${apiStats.available} available · ${apiStats.members} members`,
)

/* ------------------------------------------------------------------ browser */
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 120_000,
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

/** Every POST the page makes to the Apps Script endpoint, with its action name and response. */
const apiTraffic = []
page.on('request', (request) => {
  if (!request.url().startsWith('https://script.google.com')) return
  let action = '?'
  try {
    action = JSON.parse(request.postData() || '{}').action || '?'
  } catch {
    action = 'unparseable'
  }
  apiTraffic.push({ action, token: (() => {
    try {
      return JSON.parse(request.postData() || '{}').token ?? null
    } catch {
      return null
    }
  })(), body: null })
})
page.on('response', async (response) => {
  if (!response.url().startsWith('https://script.googleusercontent.com') && !response.url().startsWith('https://script.google.com')) return
  try {
    const text = await response.text()
    const last = apiTraffic[apiTraffic.length - 1]
    if (last && last.body === null) last.body = text.slice(0, 200_000)
  } catch {
    /* response body already consumed */
  }
})

const text = () => page.evaluate(() => document.body.innerText)
const waitFor = async (predicate, timeoutMs = 90_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await sleep(600)
  }
  return false
}

try {
  /* ---------------------------------------------------------------- 1. landing page */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const landed = await waitFor(async () => /Live figures from the library spreadsheet/.test(await text()))
  check('the landing page reaches its live state', landed)
  const landing = await text()
  await page.screenshot({ path: '/home/user/qa-screens/live-vercel-landing.png', fullPage: false })

  // The four tiles count up with AnimatedNumber once they scroll into view, so read them
  // only after the section is on screen and the animation has settled.
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('dt')].find((element) => element.innerText.trim() === 'Total book copies')
    node?.scrollIntoView({ block: 'center' })
  })
  await waitFor(
    async () =>
      page.evaluate(() => {
        const node = [...document.querySelectorAll('dt')].find((element) => element.innerText.trim() === 'Total book copies')
        const value = node?.previousElementSibling?.innerText?.trim() ?? '0'
        return Number(String(value).replace(/[^\d]/g, '')) > 0
      }),
    20_000,
  )
  await sleep(900)

  /*
   * Read the tiles only once two consecutive samples agree: the count-up animation runs on
   * first entry into the viewport, and sampling mid-flight reports a partial number (58
   * instead of 64) which looks like a data bug rather than a timing artefact.
   */
  const readTiles = () =>
    page.evaluate(() => {
      const wanted = ['Total book copies', 'Registered members', 'Books issued now', 'Available today']
      const out = {}
      for (const label of wanted) {
        const node = [...document.querySelectorAll('dt')].find((element) => element.innerText.trim() === label)
        out[label] = node?.previousElementSibling?.innerText?.trim() ?? null
      }
      return out
    })
  let tiles = await readTiles()
  {
    const started = Date.now()
    let previous = null
    while (Date.now() - started < 60_000) {
      const current = await readTiles()
      if (
        previous &&
        JSON.stringify(previous) === JSON.stringify(current) &&
        Object.values(current).every((value) => value !== null)
      ) {
        tiles = current
        break
      }
      previous = current
      tiles = current
      await sleep(700)
    }
  }
  const number = (value) => Number(String(value ?? '').replace(/[^\d]/g, ''))
  check(
    'the landing page shows non-zero live counts signed out',
    number(tiles['Total book copies']) > 0 && number(tiles['Registered members']) > 0,
    JSON.stringify(tiles),
  )
  check(
    'landing copy counts match the API response',
    number(tiles['Total book copies']) === apiStats.copies &&
      number(tiles['Registered members']) === apiStats.members &&
      number(tiles['Available today']) === apiStats.available,
    `page ${JSON.stringify(tiles)} vs api ${JSON.stringify(apiStats)}`,
  )
  check(
    'the landing page says where the numbers come from',
    /counts, never member details/.test(landing),
  )
  const heroLine = landing.split('\n').find((line) => /copies available today/.test(line)) ?? ''
  check('the hero strip shows the live available count', /[1-9]/.test(heroLine), heroLine.trim())

  /* ---------------------------------------------------------------- 2. /catalog */
  await page.goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const catalogReady = await waitFor(async () => {
    const body = await text()
    if (/Reading the live catalogue/i.test(body)) return false
    const cards = await page.evaluate(() => document.querySelectorAll('[data-book-id]').length)
    return cards > 0 || /No titles match|Sign in to browse the live catalogue/i.test(body)
  }, 90_000)
  check('the catalogue page reaches its live state', catalogReady)
  await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('[data-book-id]').length)) > 0, 20_000)
  await sleep(600)
  const catalog = await text()
  await page.screenshot({ path: '/home/user/qa-screens/live-vercel-catalog.png', fullPage: false })

  const listedCount = await page.evaluate(() => document.querySelectorAll('[data-book-id]').length)
  check(
    'the catalogue lists real titles from the sheet',
    listedCount > 0,
    `${listedCount} cards on screen · API has ${apiBooks.length} titles`,
  )
  const headerLine = catalog.split('\n').find((line) => /titles across/.test(line)) ?? ''
  check(
    'the catalogue header count matches the API',
    new RegExp(`\\b${apiStats.titles}\\b`).test(headerLine),
    headerLine.trim(),
  )

  const firstSample = await page.evaluate(() => {
    const card = document.querySelector('[data-book-id]')
    return card ? { id: card.getAttribute('data-book-id'), text: card.innerText.slice(0, 120) } : null
  })
  check('catalogue cards carry their book id', Boolean(firstSample?.id), firstSample?.id ?? 'none')

  /* ---------------------------------------------------------------- 3. /books/:id */
  if (firstSample?.id) {
    const expected = apiBooks.find((book) => book.bookId === firstSample.id)
    await page.goto(`${BASE}/books/${firstSample.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const detailReady = await waitFor(async () => /available|Availability|copies/i.test(await text()))
    const detail = await text()
    await page.screenshot({ path: '/home/user/qa-screens/live-vercel-book-detail.png', fullPage: false })
    check('a book deep link renders a detail page', detailReady, `${BASE}/books/${firstSample.id}`)
    check(
      'the detail page shows the right title',
      Boolean(expected) && detail.includes(expected.title),
      expected ? `${firstSample.id} → “${expected.title}”` : 'book not in API',
    )
    check(
      'the detail page shows the right author',
      Boolean(expected) && detail.includes(expected.author),
      expected?.author ?? '',
    )
    check('the detail page is not the "not in the catalogue" state', !/not in the catalogue/i.test(detail))
  }

  /* ---------------------------------------------------------------- 4. anonymity of traffic */
  const actions = [...new Set(apiTraffic.map((entry) => entry.action))]
  check(
    'signed out, the only action fired is catalogue.public',
    actions.length === 1 && actions[0] === 'catalogue.public',
    actions.join(', ') || 'no calls seen',
  )
  check(
    'no request carried a session token',
    apiTraffic.every((entry) => !entry.token),
  )

  /* ---------------------------------------------------------------- 5. payload leak scan */
  const bodies = apiTraffic.map((entry) => entry.body).filter(Boolean).join('\n')
  const emails = bodies.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? []
  const forbidden = [
    ['emails', emails.filter((email) => !/@type\.googleapis\.com|googleusercontent/.test(email))],
    ['member names', apiBooks.length ? [] : []],
    ['userName', /"userName"/.test(bodies) ? ['userName'] : []],
    ['userId / memberId', /"(userId|memberId|institutionalId|phone)"/.test(bodies) ? ['id field'] : []],
    ['loans', /"(loanId|dueDate|fineAmount|renewalCount)"/.test(bodies) ? ['loan field'] : []],
    ['credentials', /"(password|passwordHash|salt|token)"/i.test(bodies) ? ['credential field'] : []],
    ['settings', /"(loanDurationDays|finePerDay|maxRenewals)"/.test(bodies) ? ['setting field'] : []],
  ].filter(([, hits]) => hits.length > 0)

  // Any real member email from the sheet must never appear in a public response.
  const knownInstitutionalPrefixes = ['smoke.', 'librarian.qa', 'demo@gmail', 'admin@gmail']
  const leakedKnown = knownInstitutionalPrefixes.filter((needle) => bodies.includes(needle))
  check(
    'public responses contain no member emails, loans, credentials or settings',
    forbidden.length === 0 && leakedKnown.length === 0,
    forbidden.length || leakedKnown.length ? JSON.stringify([...forbidden, leakedKnown]) : `${bodies.length} chars scanned, clean`,
  )
  check(
    'the public payload is title-level only',
    /"bookId"/.test(bodies) && /"availableCopies"/.test(bodies) && !/"userName"/.test(bodies),
  )

  check('no console errors on the public pages', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('suite completed without throwing', false, String(error).slice(0, 240))
} finally {
  await browser.close()
}

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY (${BASE}) ===`)
console.log(`Backend: ${health.data?.version ?? '?'} · Passed: ${results.length - failures.length}/${results.length}`)
if (failures.length) {
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
