/**
 * Prove the browser writes to the real spreadsheet — one book, created and removed.
 *
 *   BASE_URL=http://localhost:5173 ADMIN_ID=… ADMIN_PASSWORD='…' \
 *     node qa-tools/live-ui-write-check.mjs
 *
 * Steps: sign in → Books → Add book → fill the form → submit → wait for the success
 * toast → confirm the title through the API *and* through the sheet's public CSV view →
 * delete it again (allowed, because it was never borrowed).
 *
 * Nothing else is created: no member account, no loan, no hold.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const ADMIN_ID = process.env.ADMIN_ID || ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const API = process.env.API || ''
const SHEET_CSV = process.env.SHEET_CSV || ''
if (!ADMIN_ID || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_ID and ADMIN_PASSWORD')
  process.exit(2)
}

const TITLE = `E2E-UI ${Date.now().toString(36)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const apiCall = async (action, payload = {}, token = null) => {
  if (!API) return { ok: false, error: { code: 'NO_API' } }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(700)
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token }),
        redirect: 'follow',
      })
      const json = JSON.parse(await response.text())
      if (json.ok || json.error?.code !== 'MALFORMED_RESPONSE') return json
    } catch {
      /* retry */
    }
  }
  return { ok: false, error: { code: 'FLAKY' } }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 950 })
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

const bodyText = () => page.evaluate(() => document.body.innerText)
const waitFor = async (predicate, timeoutMs = 120_000) => {
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
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    labelText,
    value,
  )
const clickByText = (text) =>
  page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.innerText?.trim() === label && element.offsetParent !== null,
    )
    button?.click()
    return Boolean(button)
  }, text)

let createdBookId = null
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60_000 })
  // Wait for the React form itself before typing into it.
  const formReady = await waitFor(
    async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('label')].some((label) =>
          (label.textContent || '').trim().startsWith('Email or institutional ID'),
        ),
      ),
    30_000,
  )
  check('the sign-in form is ready', formReady)
  await fill('Email or institutional ID', ADMIN_ID)
  await fill('Password', ADMIN_PASSWORD)
  await sleep(300)
  await clickByText('Sign in')
  const signedIn = await waitFor(async () => page.url().includes('/app'), 180_000)
  check(
    'signed in on the live app',
    signedIn,
    signedIn
      ? page.url()
      : (await page.evaluate(() =>
          (document.body.innerText.split('\n').find((line) => /could not sign in|incorrect|too long|attempt/i.test(line)) ?? '').trim(),
        )) || page.url(),
  )

  if (signedIn) {
    await page.goto(`${BASE}/app/books`, { waitUntil: 'networkidle2', timeout: 120_000 })
    const atBooks = await waitFor(async () => /book inventory/i.test(await bodyText()), 120_000)
    check('the books workspace is reachable', atBooks)

    await clickByText('Add book')
    const dialogOpen = await waitFor(async () => /add a new book/i.test(await bodyText()), 30_000)
    check('the add-book dialog opens', dialogOpen)

    await sleep(700)
    await fill('Title', TITLE)
    await fill('Author', 'UI write check')
    await fill('Publisher', 'QA')
    await fill('Publication year', String(new Date().getFullYear()))
    await fill('Shelf / location', 'E2E-01')
    await fill('Total copies', '1')
    // Category is a <select>; pick a real option rather than inventing one.
    const categorySet = await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((element) =>
        (element.textContent || '').trim().startsWith('Category'),
      )
      if (!label) return false
      const control = document.getElementById(label.getAttribute('for'))
      if (!control) return false
      const values = [...control.options].map((option) => option.value).filter(Boolean)
      control.value = values.includes('Testing') ? 'Testing' : values[0]
      control.dispatchEvent(new Event('change', { bubbles: true }))
      return Boolean(control.value)
    })
    check('the category field is seeded with a valid option', categorySet)

    // Submit from inside the dialog: the page header also has an "Add book" button.
    const submitted = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') || document.querySelector('form')?.closest('div')
      const scope = dialog ?? document
      const button = [...scope.querySelectorAll('button')].filter(
        (element) => element.innerText?.trim() === 'Add book',
      )
      const target = button[button.length - 1]
      target?.click()
      return Boolean(target)
    })
    check('the dialog submit button is pressed', submitted)

    const saved = await waitFor(async () => !/add a new book/i.test(await bodyText()), 150_000)
    check('the dialog closes after saving (no validation error left open)', saved)
    if (!saved) {
      const errorText = (await bodyText()).split('\n').filter((line) => /required|invalid|must/i.test(line)).slice(0, 3)
      check('no blocking validation error', false, errorText.join(' | '))
    }

    // 1. the API sees it
    if (API) {
      const login = await apiCall('auth.login', { identifier: ADMIN_ID, password: ADMIN_PASSWORD })
      const token = login.data?.token
      const found = await (async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const list = await apiCall('books.list', {}, token)
          const book = list.data?.books?.find((item) => item.title.trim() === TITLE)
          if (book) return book
          await sleep(1500)
        }
        return null
      })()
      check('the API returns the book created through the UI', Boolean(found), found ? found.bookId : 'not found')
      createdBookId = found?.bookId ?? null
    }

    // 2. the spreadsheet itself contains the row
    if (SHEET_CSV) {
      let inSheet = false
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const csv = await fetch(SHEET_CSV, { redirect: 'follow' }).then((response) => response.text()).catch(() => '')
        if (csv.includes(TITLE)) {
          inSheet = true
          break
        }
        await sleep(2500)
      }
      check('the row is visible in the spreadsheet itself', inSheet, SHEET_CSV.slice(0, 60))
    }

    // 3. clean up: a never-borrowed title may be deleted
    if (API && createdBookId) {
      const token = (await apiCall('auth.login', { identifier: ADMIN_ID, password: ADMIN_PASSWORD })).data?.token
      const removed = await apiCall('books.delete', { bookId: createdBookId }, token)
      if (removed.ok) {
        check('the test title was deleted again', true, createdBookId)
      } else {
        const archived = await apiCall('books.archive', { bookId: createdBookId, archived: true }, token)
        check('the test title was archived (delete was refused)', Boolean(archived.ok), removed.error?.code)
      }
    }
  }

  check('no console errors during the write', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
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
