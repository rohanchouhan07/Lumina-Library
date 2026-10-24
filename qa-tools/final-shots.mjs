import puppeteer from 'puppeteer'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' }); await sleep(900)
await page.screenshot({ path: '/home/user/qa-screens/final-login.png' })
await page.evaluate(() => {
  const set = (l, v) => {
    const lab = Array.from(document.querySelectorAll('label')).find((x) => (x.textContent || '').trim().startsWith(l))
    const el = document.getElementById(lab.getAttribute('for'))
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set('Email or institutional ID', 'admin@lumina.edu'); set('Password', 'Lumina@2026')
  Array.from(document.querySelectorAll('button')).find((b) => b.innerText.trim() === 'Sign in')?.click()
})
await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 20000 }); await sleep(1500)
await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle2' }); await sleep(1800)
await page.screenshot({ path: '/home/user/qa-screens/final-settings.png', fullPage: true })
await page.goto(`${BASE}/app/members`, { waitUntil: 'networkidle2' }); await sleep(1500)
await page.screenshot({ path: '/home/user/qa-screens/final-members.png', fullPage: true })
await browser.close()
