import puppeteer from 'puppeteer'
// Works in either mode: uses the credential form when the server is configured,
// otherwise the demo role picker. Point BASE_URL at the instance you want to check.
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 })
const out = []
const overflow = async (name) => {
  const o = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  out.push(`${name}: ${o.scroll > o.client + 1 ? 'OVERFLOW' : 'ok'} (${o.scroll}/${o.client})`)
}
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' }); await sleep(900)
await overflow('login')
await page.screenshot({ path: '/home/user/qa-screens/mobile-login.png', fullPage: true })

// sign in as admin — credential form (live) or role picker (demo)
const liveForm = await page.evaluate(
  () => !![...document.querySelectorAll('label')].find((x) => (x.textContent || '').trim().startsWith('Email or institutional ID')),
)
if (liveForm) {
  await page.evaluate(() => {
    const set = (l, v) => {
      const lab = Array.from(document.querySelectorAll('label')).find((x) => (x.textContent || '').trim().startsWith(l))
      const el = document.getElementById(lab.getAttribute('for'))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('Email or institutional ID', 'admin@lumina.edu')
    set('Password', 'Lumina@2026')
    Array.from(document.querySelectorAll('button')).find((b) => b.innerText.trim() === 'Sign in')?.click()
  })
} else {
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    buttons.find((b) => b.innerText.trim().startsWith('Admin'))?.click()
    buttons.find((b) => /^Enter .* demo$/i.test(b.innerText.trim()))?.click()
  })
}
await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 20000 })
await sleep(1800)
for (const [name, path] of [['dashboard', '/app'], ['books', '/app/books'], ['settings', '/app/settings'], ['reports', '/app/reports'], ['profile', '/app/profile']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await overflow(name)
  await page.screenshot({ path: `/home/user/qa-screens/mobile-${name}.png`, fullPage: true })
}
console.log(out.join('\n'))
await browser.close()
