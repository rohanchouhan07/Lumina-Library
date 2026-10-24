/** Screenshots every authenticated screen in live mode for a visual pass. */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = '/home/user/qa-screens/live'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

async function login(identifier, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.evaluate(
    (id, pw) => {
      const set = (labelText, value) => {
        const label = Array.from(document.querySelectorAll('label')).find((l) =>
          (l.textContent || '').trim().startsWith(labelText),
        )
        const el = document.getElementById(label.getAttribute('for'))
        const proto = HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set('Email or institutional ID', id)
      set('Password', pw)
    },
    identifier,
    password,
  )
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => b.innerText.trim() === 'Sign in')?.click())
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 20000 })
  await sleep(1500)
}

await login('admin@lumina.edu', 'Lumina@2026')
for (const [name, path] of [
  ['dashboard', '/app'],
  ['books', '/app/books'],
  ['members', '/app/members'],
  ['loans', '/app/loans'],
  ['reservations', '/app/reservations'],
  ['reports', '/app/reports'],
  ['settings', '/app/settings'],
  ['profile', '/app/profile'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' })
  await sleep(1400)
  await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: true })
  console.log('shot', name)
}

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
console.log('console errors:', errors.filter((e) => !/favicon|DevTools/i.test(e)).slice(0, 5))
await browser.close()
