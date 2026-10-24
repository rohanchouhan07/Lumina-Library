/**
 * Demo-mode end-to-end check (no backend configured).
 *
 * Verifies the offline demo still works after the API migration: role picker,
 * local mutations, persistence, and role-based navigation.
 *
 * Run: node qa-tools/demo-e2e.mjs   (BASE_URL default http://localhost:5176 — `npm run dev:demo`)
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5176'
const OUT = '/home/user/qa-screens'
fs.mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 960 })
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

const clickText = async (text, { last = false } = {}) => {
  const handle = await page.evaluateHandle(
    (wanted, useLast) => {
      const nodes = Array.from(document.querySelectorAll('button, a, [role="radio"], [role="menuitem"], [role="tab"]'))
      const matches = nodes.filter((n) => (n.innerText || '').trim().replace(/\s+/g, ' ').includes(wanted))
      return useLast ? (matches.at(-1) ?? null) : (matches[0] ?? null)
    },
    text,
    last,
  )
  const el = handle.asElement()
  if (!el) throw new Error(`nothing clickable containing "${text}"`)
  await el.click()
  await sleep(450)
}

const fill = async (label, value) => {
  await page.evaluate(
    (l, v) => {
      const labels = Array.from(document.querySelectorAll('label'))
      const t = labels.find((x) => (x.textContent || '').trim().startsWith(l))
      if (!t) throw new Error(`no label "${l}"`)
      const id = t.getAttribute('for')
      const el = id ? document.getElementById(id) : t.querySelector('input,textarea,select')
      const proto =
        el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    label,
    value,
  )
}

try {
  /* ------------------------------------------------------- public catalogue */
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle2' })
  await sleep(800)
  const catalogText = await page.evaluate(() => document.body.innerText)
  record('public catalogue renders seeded titles without signing in', /Clean Code|Algorithms|Gatsby/i.test(catalogText))

  /* ---------------------------------------------------------- demo sign-in */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(600)
  const loginText = await page.evaluate(() => document.body.innerText)
  const hasPasswordInput = await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')))
  record('demo mode shows the role picker, not a password form', !hasPasswordInput)
  record('demo mode offers the admin seat', /Administrator/i.test(loginText))

  await clickText('Enter Administrator demo')
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 10000 })
  await sleep(900)
  record('demo admin reaches the dashboard', page.url().includes('/app'))

  /* ------------------------------------------------- add a book (localStorage) */
  const title = `Demo QA Title ${Date.now().toString().slice(-5)}`
  await page.goto(`${BASE}/app/books`, { waitUntil: 'networkidle2' })
  await sleep(800)
  await clickText('Add book')
  await sleep(400)
  await fill('Title', title)
  await fill('Author', 'Ada Lovelace')
  await fill('Publisher', 'Demo Press')
  await fill('Publication year', '2026')
  await fill('Shelf / location', 'D-01')
  await fill('Total copies', '2')
  await clickText('Add book', { last: true })
  await sleep(1200)
  const afterAdd = await page.evaluate(() => document.body.innerText)
  record('book created in demo mode', afterAdd.includes(title))

  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1200)
  const afterReload = await page.evaluate(() => document.body.innerText)
  record('demo book survives a reload (localStorage persistence)', afterReload.includes(title))

  /* ----------------------------------------------------------- student role */
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(600)
  await page.evaluate(() => {
    const radio = Array.from(document.querySelectorAll('[role="radio"]')).find((r) =>
      (r.innerText || '').includes('Student'),
    )
    radio?.click()
  })
  await sleep(300)
  await clickText('Enter Student demo')
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 10000 })
  await sleep(900)
  const studentNav = await page.evaluate(() => document.body.innerText)
  record('student does not see the Members admin screen in navigation', !/Members\b.*Manage/i.test(studentNav))

  await page.goto(`${BASE}/app/members`, { waitUntil: 'networkidle2' })
  await sleep(900)
  const blocked = await page.evaluate(() => document.body.innerText)
  record('student is blocked from /app/members by the route guard', /restricted/i.test(blocked))

  await page.screenshot({ path: `${OUT}/demo-student-guard.png` })

  /* ---------------------------------------------------------------- logout */
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-haspopup') === 'menu')
    btn?.click()
  })
  await sleep(400)
  await clickText('Sign out')
  await sleep(900)
  record('demo logout returns to the public site', !page.url().includes('/app'), page.url())
} catch (error) {
  record('suite completed without throwing', false, error.message)
} finally {
  const relevant = consoleErrors.filter((e) => !/favicon|React DevTools/i.test(e))
  record('no console errors during the demo flow', relevant.length === 0, relevant.slice(0, 3).join(' | '))
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
