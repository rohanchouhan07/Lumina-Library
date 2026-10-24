/**
 * End-to-end proof of the Google Sheets integration against a local stand-in for
 * the Apps Script bridge (qa-tools/mock-appsscript.mjs).
 *
 * Covers: pull from the sheet, push the catalogue up, a "human" sheet edit
 * arriving on the website, a website edit travelling back with the Website tag,
 * and the derived availability columns staying truthful.
 */
import puppeteer from 'puppeteer'

const APP = 'http://localhost:5173'
const BRIDGE = 'http://localhost:8099'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}
const post = async (path, body = {}) => {
  const response = await fetch(`${BRIDGE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json()
}
const state = async () => (await fetch(`${BRIDGE}/state`)).json()

await post('/test/reset')

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 180))
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 180)))
page.on('console', (m) => {
  if (m.text().startsWith('[sheet]')) console.log('   app>', m.text())
})
await page.setViewport({ width: 1440, height: 950 })

const dismissToasts = async () => {
  await page.evaluate(() => {
    document.querySelectorAll('[data-toast] button, [role=status] button').forEach((b) => b.click())
  })
}

/* ---------------------------------------------------------------- configure */
await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' })
await sleep(1200)
await page.evaluate(
  ({ bridge }) => {
    localStorage.clear()
    localStorage.setItem(
      'lumina.sheets.config.v1',
      JSON.stringify({
        enabled: true,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s/edit',
        scriptUrl: `${bridge}/exec`,
        autoPull: false,
        autoPush: true,
        csvUrlOverride: `${bridge}/sheet.csv`,
        lastSyncAt: null,
        lastVerifiedAt: null,
      }),
    )
  },
  { bridge: BRIDGE },
)
await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
await sleep(1400)
await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('button')).find((b) =>
    b.innerText.includes('Enter Administrator demo'),
  )
  button?.click()
})
await page.waitForFunction(() => location.pathname === '/app', { timeout: 15000 })
await sleep(1200)

/* -------------------------------------------------------------- settings ui */
await page.goto(`${APP}/app/settings`, { waitUntil: 'domcontentloaded' })
await sleep(1800)
const panelText = await page.evaluate(() => document.body.innerText)
check('Settings shows the Google Sheets panel', panelText.includes('Google Sheets sync'))
check('Sheet link and endpoint fields are prefilled', await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input'))
  return inputs.some((i) => i.value.includes('docs.google.com/spreadsheets')) && inputs.some((i) => i.value.includes(':8099'))
}))
await page.screenshot({ path: '/home/user/qa-screens/sheets-1-panel.png' })

const clickText = async (text, selector = 'button') => {
  const ok = await page.evaluate(
    (t, sel) => {
      const el = Array.from(document.querySelectorAll(sel)).find((e) =>
        (e.innerText || '').trim().toLowerCase().includes(t.toLowerCase()),
      )
      if (!el) return false
      el.click()
      return true
    },
    text,
    selector,
  )
  return ok
}
const waitText = async (text, timeout = 20000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const body = await page.evaluate(() => document.body.innerText)
    if (body.includes(text)) return true
    await sleep(400)
  }
  return false
}

/* -------------------------------------------------------- 1. empty sheet pull */
check('Test connection reads the sheet', await (async () => {
  await clickText('Test connection')
  return waitText('Sheet readable (0 rows)')
})(), 'expects the empty sheet to be detected')

/* --------------------------------------------------- 2. push catalogue up */
const pushClicked = await clickText('Push catalogue up')
const pushed = pushClicked && (await waitText('Pushed 41 titles to the sheet', 30000))
await sleep(2500)
const afterPush = await state()
check('Push catalogue writes every row to the sheet', pushed && afterPush.rows.length === 41, `${afterPush.rows.length} rows`)
const sampleRow = afterPush.rows[0]
const sourceCol = afterPush.header.indexOf('Last edited from')
const titleCol = afterPush.header.indexOf('Title')
check(
  'Rows written from the website are tagged “Website”',
  Boolean(sampleRow) && sampleRow[sourceCol] === 'Website',
  `sample: ${sampleRow?.[titleCol]} → ${sampleRow?.[sourceCol]}`,
)
check(
  'Apps Script contract received upserts',
  afterPush.log.some((entry) => entry.action === 'upsert' && entry.count === 41),
  JSON.stringify(afterPush.log.slice(-2)),
)
await page.screenshot({ path: '/home/user/qa-screens/sheets-2-pushed.png' })

/* ------------------------------------------- 3. edit a row in the "sheet" */
await post('/test/row', {
  values: ['BK-7777', 'Sheet Only Title', 'Spreadsheet Author', '978-9999999999', 'Sheet Press', '2026', 'Fiction', 'Z-09', '3', '', '', 'Active', '2026-10-23', '', 'Sheet', '2026-10-23T09:00:00Z'],
})
await clickText('Sync now')
const pulledNew = await waitText('Pulled from the sheet', 30000)
check('Sync now reports the pull result', pulledNew)
await sleep(1500)
const searchBooks = async (term) => {
  await page.goto(`${APP}/app/books`, { waitUntil: 'domcontentloaded' })
  await sleep(1600)
  await page.evaluate((value) => {
    const input = Array.from(document.querySelectorAll('input')).find((el) =>
      (el.placeholder || '').toLowerCase().includes('search title'),
    )
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, term)
  await sleep(1200)
  return page.evaluate(() => document.body.innerText)
}
const sheetRowText = await searchBooks('Sheet Only Title')
check('A row added on the sheet appears on the website', sheetRowText.includes('Sheet Only Title'))
const badgeLabels = await page.evaluate(() =>
  Array.from(document.querySelectorAll('tbody tr')).map((row) => row.innerText.replace(/\n/g, ' | ')),
)
check(
  'Book rows carry the source badge',
  badgeLabels.some((text) => text.includes('Sheet edit') || text.includes('Web edit')),
  badgeLabels[0]?.slice(0, 90) ?? 'no rows',
)
await page.screenshot({ path: '/home/user/qa-screens/sheets-3-from-sheet.png' })

/* ------------------------------- 4. edit a book on the site → sheet tagged */
await page.goto(`${APP}/app/books?new=1`, { waitUntil: 'domcontentloaded' })
await sleep(2000)
const fill = async (selector, value) => {
  await page.evaluate(
    (s, v) => {
      const el = document.querySelector(s)
      if (!el) return
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    selector,
    value,
  )
  await sleep(150)
}
await fill('#book-form input[name="title"]', 'Website Sync Proof')
await fill('#book-form input[name="author"]', 'QA Bot')
await fill('#book-form input[name="publisher"]', 'Local Press')
await fill('#book-form input[name="shelf"]', 'W-77')
await fill('#book-form input[name="totalCopies"]', '2')
await sleep(300)
await page.evaluate(() => {
  const dialog = document.querySelector('[role=dialog]')
  const button = dialog && Array.from(dialog.querySelectorAll('button')).find((b) => b.innerText.includes('Add book'))
  if (button && !button.disabled) button.click()
})
await sleep(4000)

const afterSiteAdd = await state()
const addedRow = afterSiteAdd.rows.find((row) => row[titleCol] === 'Website Sync Proof')
check('A book added on the website reaches the sheet', Boolean(addedRow), addedRow ? `row tag: ${addedRow[sourceCol]}` : 'missing')
check('That row is tagged “Website”', addedRow?.[sourceCol] === 'Website')
check(
  'Push happened automatically without pressing Sync',
  afterSiteAdd.log.filter((entry) => entry.action === 'upsert').length >= 2,
  JSON.stringify(afterSiteAdd.log.map((entry) => entry.action)),
)

const derivedCol = afterSiteAdd.header.indexOf('Available copies')
check(
  'Derived availability columns are filled from real loan data',
  afterSiteAdd.rows.some((row) => row[derivedCol] !== '' && row[derivedCol] !== undefined),
  `example: ${afterSiteAdd.rows[0]?.[derivedCol]}`,
)
await page.screenshot({ path: '/home/user/qa-screens/sheets-4-web-edit.png' })

/* -------------------------------- 5. sheet still wins on the next pull */
await post('/test/edit', { id: addedRow[0], field: 'Title', value: 'Renamed In The Sheet' })
await post('/test/edit', { id: addedRow[0], field: 'Last edited from', value: 'Sheet' })

await page.goto(`${APP}/app/settings`, { waitUntil: 'domcontentloaded' })
await sleep(1800)
await clickText('Sync now')
await waitText('Pulled from the sheet', 25000)
await sleep(2500)

const finalText = await searchBooks('Renamed In The Sheet')
const sheetWins = finalText.includes('Renamed In The Sheet')
check('A sheet edit overwrites the website value (sheet wins)', sheetWins)
const oldText = await searchBooks('Website Sync Proof')
const oldRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
const emptyState = oldText.includes('No matches') || oldText.includes('0 titles')
check('The old website title is gone', oldRows === 0 && emptyState, `${oldRows} rows matched, empty state: ${emptyState}`)
await page.screenshot({ path: '/home/user/qa-screens/sheets-5-sheet-wins.png' })

const totalRows = (await state()).rows.length
check('Sheet row count stayed consistent (41 seeded + 2 added)', totalRows === 43, `${totalRows} rows`)

const debugBooks = await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('lumina.library.data.v1'))
  return data.books
    .filter((b) => /Sheet Only|Renamed|Website Sync/.test(b.title))
    .map((b) => ({ id: b.id, title: b.title, syncSource: b.syncSource ?? null, sheetRow: b.sheetRow ?? null }))
})
console.log('DEBUG website books:', JSON.stringify(debugBooks))
const debugSheet = (await state()).rows.filter((row) => /Sheet Only|Renamed|Website Sync/.test(row[titleCol] || ''))
console.log('DEBUG sheet log:', JSON.stringify((await state()).log, null, 1))
console.log('DEBUG sheet rows:', JSON.stringify(debugSheet.map((row) => ({ id: row[0], title: row[titleCol], tag: row[sourceCol] }))))

await browser.close()
const passed = results.filter((r) => r.ok).length
console.log('\n=== SUMMARY ===')
console.log(`Passed: ${passed}/${results.length}`)
console.log(`Console errors: ${errors.length}`)
errors.slice(0, 6).forEach((error) => console.log('  ' + error))
