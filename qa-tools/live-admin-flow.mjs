/**
 * Live-mode admin flows that go beyond the core e2e:
 * registering a real account (with initial password) and saving circulation policy.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const API = 'http://localhost:8100'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

async function api(action, payload = {}, token = null) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, token }),
  })
  return res.json()
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const fill = (label, value) =>
  page.evaluate(
    (l, v) => {
      const labels = Array.from(document.querySelectorAll('label'))
      const t = labels.find((x) => (x.textContent || '').trim().startsWith(l))
      if (!t) throw new Error(`no label "${l}"`)
      const id = t.getAttribute('for')
      const el = id ? document.getElementById(id) : t.querySelector('input,textarea,select')
      if (!el) throw new Error(`no control for "${l}"`)
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

const click = (text, { last = false } = {}) =>
  page.evaluate(
    (wanted, useLast) => {
      const nodes = Array.from(document.querySelectorAll('button, a, [role="menuitem"], [role="tab"]'))
      const matches = nodes.filter((n) => (n.innerText || '').trim().replace(/\s+/g, ' ').includes(wanted))
      const target = useLast ? matches.at(-1) : matches[0]
      if (!target) throw new Error(`nothing clickable containing "${wanted}"`)
      target.click()
    },
    text,
    last,
  )

async function login(identifier, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await sleep(500)
  await fill('Email or institutional ID', identifier)
  await fill('Password', password)
  await click('Sign in')
  await sleep(2500)
}

try {
  await login('admin@lumina.edu', 'Lumina@2026')
  record('admin signed in', page.url().includes('/app'), page.url())

  /* ------------------------------------------------ register a member account */
  const email = `qa.member.${Date.now().toString().slice(-6)}@lumina.edu`
  await page.goto(`${BASE}/app/members`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await click('Register member')
  await sleep(600)
  await fill('Full name', 'QA Test Member')
  await fill('Email', email)
  await fill('Institutional ID', `M-${Date.now().toString().slice(-5)}`)
  await fill('Department', 'Computer Science')
  await fill('Phone', '+91 90000 00000')
  const passwordField = await page.evaluate(
    () => Boolean(Array.from(document.querySelectorAll('label')).find((l) => (l.textContent || '').startsWith('Initial password'))),
  )
  record('live mode asks for an initial password when registering a member', passwordField)
  if (passwordField) await fill('Initial password', 'Member@2026')
  await click('Register member', { last: true })
  await sleep(2500)

  const adminToken = (await api('auth.login', { identifier: 'admin@lumina.edu', password: 'Lumina@2026' })).data.token
  const users = await api('users.list', {}, adminToken)
  const created = (users.data?.users ?? []).find((u) => u.email === email)
  record('registered member exists in the backend', Boolean(created), created ? created.userId : 'missing')
  record(
    'new account never exposes a password hash',
    created ? !('passwordHash' in created) && !('salt' in created) : false,
  )

  /* -------------------------------------------------- new member can sign in */
  if (created) {
    const signIn = await api('auth.login', { identifier: email, password: 'Member@2026' })
    record('the new member can sign in with the initial password', signIn.ok === true, signIn.ok ? 'ok' : signIn.error?.code)
    const wrong = await api('auth.login', { identifier: email, password: 'Member@2027' })
    record('a wrong password for the new member is rejected', wrong.ok === false && wrong.error?.code === 'UNAUTHORIZED')
  }

  /* --------------------------------- editing a member must not corrupt their ID */
  const before = (users.data?.users ?? []).find((u) => u.institutionalId === 'M-1004')
  if (before) {
    await page.goto(`${BASE}/app/members`, { waitUntil: 'networkidle2' })
    await sleep(1200)
    const opened = await page.evaluate((name) => {
      const row = Array.from(document.querySelectorAll('tr')).find((r) => (r.innerText || '').includes(name))
      const btn = row?.querySelector('button[aria-label*="dit"], button[aria-label*="View"], button')
      btn?.click()
      return Boolean(row)
    }, before.name)
    await sleep(900)
    const edited = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /edit/i.test(b.innerText || ''))
      btn?.click()
      return Boolean(btn)
    })
    await sleep(700)
    if (opened && edited) {
      await fill('Phone', '+91 91111 22222')
      await click('Save changes')
      await sleep(2200)
    }
    const after = await api('users.list', {}, adminToken)
    const row = (after.data?.users ?? []).find((u) => u.userId === before.userId)
    record(
      'editing a member keeps their institutional ID intact',
      row?.institutionalId === 'M-1004',
      `institutionalId=${row?.institutionalId}`,
    )
    const stillSignsIn = await api('auth.login', { identifier: 'M-1004', password: 'Student@2026' })
    record('the member can still sign in with their institutional ID', stillSignsIn.ok === true)
  }

  /* ------------------------------------------------------- policy persistence */
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  const policyEditable = await page.evaluate(
    () => Boolean(Array.from(document.querySelectorAll('label')).find((l) => /fine/i.test(l.textContent || ''))),
  )
  record('admin sees the circulation policy form', policyEditable)

  if (policyEditable) {
    const fineLabel = await page.evaluate(() => {
      const l = Array.from(document.querySelectorAll('label')).find((x) => /fine/i.test(x.textContent || ''))
      return l ? l.textContent.trim() : null
    })
    await fill(fineLabel.slice(0, 12), '7')
    await click('Save policy')
    await sleep(2500)
    const settings = await api('settings.get', {}, adminToken)
    const raw = settings.data?.settings?.fine_per_day ?? settings.data?.settings?.finePerDay
    record('policy change is written to the backend', Number(raw) === 7, `fine_per_day=${raw}`)

    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(2000)
    const shown = await page.evaluate(() => document.body.innerText)
    record('the saved fine rate is read back into the UI', /₹\s*7\s*\/\s*day|₹7/.test(shown))
  }

  await page.screenshot({ path: '/home/user/qa-screens/live/admin-settings-after.png', fullPage: true })
  record('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (error) {
  record('suite completed without throwing', false, error.message)
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
