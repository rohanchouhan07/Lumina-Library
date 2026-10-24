/**
 * The landing page statistics must show live numbers — or an explicit failure state, never
 * a silent row of zeroes.
 *
 *   BASE_URL=http://localhost:5174 node qa-tools/landing-stats-check.mjs
 *   BASE_URL=https://lumina-library-fawn.vercel.app node qa-tools/landing-stats-check.mjs
 *
 * Checks, signed out throughout:
 *   1. the three hero figures (titles / members / on loan) equal the API's own numbers;
 *   2. the four "at a glance" tiles equal the API's numbers too;
 *   3. no hardcoded placeholder statistics survive anywhere on the page (the old "41 titles");
 *   4. a failing catalogue request produces dashes plus a Retry control, not zeroes;
 *   5. clicking Retry recovers once the request is allowed through again.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const API = process.env.API || (BASE.includes('vercel') || BASE.includes('5173')
  ? 'https://script.google.com/macros/s/AKfycbwjgZ3qi75a6d2Ul3y_wCt5CQyGBip81OoLGWnpJ0UdATdcVdos-wQ936TW0zJUjx-G/exec'
  : 'http://localhost:8100')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const apiCall = async (action, payload = {}, attempts = 4) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload }),
        redirect: 'follow',
      })
      const parsed = JSON.parse(await response.text())
      if (parsed.ok) return parsed
      console.log(`… ${action} → ${parsed.error?.code} (attempt ${attempt})`)
    } catch (error) {
      console.log(`… ${action} failed: ${String(error).slice(0, 60)} (attempt ${attempt})`)
    }
    await sleep(2000 * attempt)
  }
  return { ok: false }
}

const truth = await apiCall('catalogue.public', {})
const stats = truth.data?.stats
check(
  'ground truth: catalogue.public answered',
  Boolean(stats),
  stats ? JSON.stringify(stats) : 'no stats',
)

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 120_000,
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

/** Read the three hero figures, the four tiles and the illustration badge. */
const readStats = () =>
  page.evaluate(() => {
    const num = (text) => {
      const cleaned = String(text ?? '').trim()
      if (cleaned === '' || cleaned === '—') return null
      const digits = cleaned.replace(/[^\d]/g, '')
      return digits === '' ? null : Number(digits)
    }
    const hero = {}
    document.querySelectorAll('[data-stat]').forEach((node) => {
      hero[node.getAttribute('data-stat')] = num(node.innerText)
    })
    const tiles = {}
    document.querySelectorAll('[data-stat-tile]').forEach((node) => {
      const label = node.getAttribute('data-stat-tile')
      const dd = node.querySelector('dd')
      tiles[label] = num(dd?.innerText)
    })
    const badge = document.querySelector('[data-testid="feature-catalogue-count"]')?.innerText?.trim() ?? null
    const source = document.querySelector('[data-testid="stats-source"]')?.innerText?.trim() ?? ''
    const retry = Boolean(document.querySelector('[data-testid="stats-retry"]'))
    return { hero, tiles, badge, source, retry, body: document.body.innerText }
  })

const waitForStats = async (timeoutMs = 90_000) => {
  const started = Date.now()
  let previous = null
  let stableFor = 0
  while (Date.now() - started < timeoutMs) {
    const snapshot = await readStats()
    const complete =
      snapshot.hero.titles !== null &&
      Object.values(snapshot.tiles).length === 4 &&
      Object.values(snapshot.tiles).every((value) => value !== null)
    // Count-up animations need two identical reads in a row before the value is trusted.
    if (complete && previous && JSON.stringify(previous) === JSON.stringify({ ...snapshot, body: undefined })) {
      stableFor += 1
      if (stableFor >= 2) return snapshot
    } else {
      stableFor = 0
    }
    previous = { ...snapshot, body: undefined }
    await sleep(800)
  }
  return readStats()
}

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // The tiles count up only when scrolled into view, so bring the section on screen.
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('h2')].find((heading) => /at a glance/i.test(heading.innerText))
    node?.scrollIntoView({ block: 'center' })
  })
  const snapshot = await waitForStats()

  const expect = stats ?? { titles: -1, members: -1, onLoan: -1, copies: -1, available: -1 }
  check(
    'hero: titles matches the API',
    snapshot.hero.titles === expect.titles,
    `page ${snapshot.hero.titles} vs api ${expect.titles}`,
  )
  check(
    'hero: members matches the API',
    snapshot.hero.members === expect.members,
    `page ${snapshot.hero.members} vs api ${expect.members}`,
  )
  check(
    'hero: on loan matches the API',
    snapshot.hero['on-loan'] === expect.onLoan,
    `page ${snapshot.hero['on-loan']} vs api ${expect.onLoan}`,
  )
  check(
    'hero: available copies matches the API',
    snapshot.hero.available === expect.available,
    `page ${snapshot.hero.available} vs api ${expect.available}`,
  )
  check(
    'tile: total book copies matches the API',
    snapshot.tiles['Total book copies'] === expect.copies,
    `page ${snapshot.tiles['Total book copies']} vs api ${expect.copies}`,
  )
  check(
    'tile: registered members matches the API',
    snapshot.tiles['Registered members'] === expect.members,
    `page ${snapshot.tiles['Registered members']} vs api ${expect.members}`,
  )
  check(
    'tile: books issued now matches the API',
    snapshot.tiles['Books issued now'] === expect.onLoan,
    `page ${snapshot.tiles['Books issued now']} vs api ${expect.onLoan}`,
  )
  check(
    'tile: available today matches the API',
    snapshot.tiles['Available today'] === expect.available,
    `page ${snapshot.tiles['Available today']} vs api ${expect.available}`,
  )
  check(
    'the worklow illustration counts the real catalogue, not a hardcoded number',
    snapshot.badge === `${expect.titles} titles`,
    `badge "${snapshot.badge}" vs expected "${expect.titles} titles"`,
  )
  check('the page claims live figures only when they are', /Live figures from the library spreadsheet/.test(snapshot.source), snapshot.source.slice(0, 80))
  check('no hardcoded "41 titles" survives on the page', !/\b41 titles\b/.test(snapshot.body))
  await page.screenshot({ path: '/home/user/qa-screens/stats-live.png', fullPage: false })

  /* ------------------------------------------------- failure → retry → recovery */
  const fresh = await browser.newPage()
  await fresh.setViewport({ width: 1440, height: 1000 })
  await fresh.setRequestInterception(true)
  let blockCatalogue = true
  fresh.on('request', (request) => {
    const body = request.postData() || ''
    if (blockCatalogue && body.includes('catalogue.public')) {
      request.abort('failed')
      return
    }
    request.continue()
  })

  await fresh.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const failed = await (async () => {
    const started = Date.now()
    while (Date.now() - started < 60_000) {
      const state = await fresh.evaluate(() => ({
        retry: Boolean(document.querySelector('[data-testid="stats-retry"]')),
        source: document.querySelector('[data-testid="stats-source"]')?.innerText ?? '',
        hero: document.querySelector('[data-stat="titles"]')?.innerText ?? '',
      }))
      if (state.retry) return state
      await sleep(600)
    }
    return fresh.evaluate(() => ({ retry: false, source: '', hero: '' }))
  })()
  check('a failed catalogue request offers a Retry control', failed.retry, failed.source.slice(0, 80))
  check('the failure is explained, not hidden', /Could not reach the library server/.test(failed.source), failed.source.slice(0, 80))
  check('a failed request shows a dash instead of a zero', failed.hero.trim() === '—', `hero shows "${failed.hero.trim()}"`)
  await fresh.screenshot({ path: '/home/user/qa-screens/stats-error.png', fullPage: false })

  blockCatalogue = false
  await fresh.evaluate(() => document.querySelector('[data-testid="stats-retry"]')?.click())
  const recovered = await (async () => {
    const started = Date.now()
    while (Date.now() - started < 90_000) {
      const state = await fresh.evaluate(() => ({
        hero: document.querySelector('[data-stat="titles"]')?.innerText ?? '',
        source: document.querySelector('[data-testid="stats-source"]')?.innerText ?? '',
        retry: Boolean(document.querySelector('[data-testid="stats-retry"]')),
      }))
      if (!state.retry && /[1-9]/.test(state.hero)) return state
      await sleep(800)
    }
    return { hero: '', source: '', retry: true }
  })()
  check(
    'Retry recovers the live figures',
    !recovered.retry && Number(recovered.hero.replace(/[^\d]/g, '')) === expect.titles,
    `hero ${recovered.hero.trim()} vs api ${expect.titles} · "${recovered.source.slice(0, 60)}"`,
  )
  await fresh.close()

  check('no console errors on the landing page', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('suite completed without throwing', false, String(error).slice(0, 240))
} finally {
  await browser.close()
}

const failures = results.filter((result) => !result.ok)
console.log(`\n=== SUMMARY (${BASE}) ===`)
console.log(`Passed: ${results.length - failures.length}/${results.length}`)
if (failures.length) {
  failures.forEach((failure) => console.log(`  · ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`))
  process.exit(1)
}
