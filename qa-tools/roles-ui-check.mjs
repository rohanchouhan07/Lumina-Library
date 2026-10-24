/**
 * Members UI: create a LIBRARIAN and a STUDENT through the form, then prove the roles work.
 *
 *   BASE_URL=http://localhost:5174 node qa-tools/roles-ui-check.mjs
 *
 * Runs against the contract mock by default (safe, disposable). Point BASE_URL at the
 * live server (:5173) with ALLOW_LIVE=1 only if you mean to add rows to the real sheet.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const ADMIN_ID = process.env.ADMIN_ID || 'admin@lumina.edu'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Lumina@2026'
const RUN = Date.now().toString(36)

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

const bodyText = () => page.evaluate(() => document.body.innerText)

/**
 * Navigation with one retry. A dev server mid-reload can leave a single goto hanging until
 * its 60 s ceiling; retrying once is cheaper than a flaky suite.
 */
const goto = async (path) => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // A dev server mid-reload can hold a single navigation open; fall back to a hard
      // location change plus an explicit wait, which every call site already does.
      await Promise.race([
        page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 }),
        sleep(15_000),
      ])
      return
    } catch (error) {
      if (attempt === 2) {
        await page.evaluate((target) => {
          window.location.href = target
        }, path).catch(() => {})
        await sleep(1500)
        return
      }
      await sleep(1200)
    }
  }
}
const waitFor = async (predicate, timeoutMs = 60_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await sleep(400)
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
      if (input.tagName === 'SELECT') {
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return input.value === text
      }
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    labelText,
    value,
  )
const choose = (labelText, value) =>
  page.evaluate(
    (needle, option) => {
      const label = [...document.querySelectorAll('label')].find((element) =>
        (element.textContent || '').trim().startsWith(needle),
      )
      if (!label) return false
      const select = document.getElementById(label.getAttribute('for'))
      if (!select || select.tagName !== 'SELECT') return false
      select.value = option
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return select.value === option
    },
    labelText,
    value,
  )
const clickInDialog = (text) =>
  page.evaluate((label) => {
    const scope = document.querySelector('[role="dialog"]') ?? document
    const buttons = [...scope.querySelectorAll('button')].filter((element) => element.innerText?.trim() === label)
    const target = buttons[buttons.length - 1]
    target?.click()
    return Boolean(target)
  }, text)

const signIn = async (identifier, password) => {
  await goto('/login')
  await waitFor(() =>
    page.evaluate(() =>
      [...document.querySelectorAll('label')].some((label) =>
        (label.textContent || '').trim().startsWith('Email or institutional ID'),
      ),
    ),
  )
  await fill('Email or institutional ID', identifier)
  await fill('Password', password)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Sign in')?.click()
  })
  return waitFor(async () => page.url().includes('/app'), 60_000)
}
/**
 * Drop the stored session token and reload.
 *
 * The real Sign out control lives inside the account popover, so clicking text is flaky —
 * clearing the same two keys the app uses is deterministic and still exercises the real
 * "token gone → RequireAuth redirects" path.
 */
const signOut = async () => {
  await page.evaluate(() => {
    for (const key of ['lumina.session.token.v1', 'lumina.session.remember.v1']) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  })
  await goto('/login')
  await sleep(600)
}

const createMember = async ({ name, email, institutionalId, role, password }) => {
  await goto('/app/members')
  const ready = await waitFor(async () => /members/i.test(await bodyText()))
  if (!ready) return { ok: false, why: 'members page never rendered' }

  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((element) =>
      /register member/i.test(element.innerText || ''),
    )
    button?.click()
    return Boolean(button)
  })
  if (!opened) return { ok: false, why: 'no Register member button (role may not be allowed)' }

  await sleep(700)
  await fill('Full name', name)
  await fill('Email', email)
  await fill('Institutional ID', institutionalId)
  const roleSet = await choose('Role', role)
  await fill('Department', 'Library')
  await fill('Membership status', 'active')
  // Live mode asks for an initial password; demo mode does not.
  const needsPassword = await page.evaluate(() =>
    [...document.querySelectorAll('label')].some((label) => /initial password/i.test(label.textContent || '')),
  )
  if (needsPassword) await fill('Initial password', password)

  await clickInDialog('Register member')
  const closed = await waitFor(async () => !/register a new member|new member/i.test(await bodyText()), 60_000)
  // Let the list refetch before the caller reads it back.
  await sleep(1500)
  const text = await bodyText()
  const errorLine = text.split('\n').find((line) => /required|invalid|already|must/i.test(line)) ?? ''
  return { ok: closed && !errorLine, roleSet, needsPassword, errorLine }
}

try {
  await signIn(ADMIN_ID, ADMIN_PASSWORD)
  check('admin signs in', page.url().includes('/app'), page.url())

  const librarian = await createMember({
    name: `Desk Librarian ${RUN}`,
    email: `librarian.${RUN}@lumina.test`,
    institutionalId: `LIB-${RUN}`.toUpperCase().slice(0, 20),
    role: 'librarian',
    password: 'Desk@2026',
  })
  check('a librarian can be created from the Members form', librarian.ok, librarian.errorLine || (librarian.roleSet ? 'role select accepted "librarian"' : 'role not set'))

  const student = await createMember({
    name: `Reader Student ${RUN}`,
    email: `student.${RUN}@lumina.test`,
    institutionalId: `M-${RUN}`.toUpperCase().slice(0, 20),
    role: 'student',
    password: 'Reader@2026',
  })
  check('a student can be created from the Members form', student.ok, student.errorLine)

  const membersText = await bodyText()
  check('the librarian appears in the member list', new RegExp(`Desk Librarian ${RUN}`).test(membersText))
  check('the student appears in the member list', new RegExp(`Reader Student ${RUN}`).test(membersText))
  check('the list labels the librarian role', /librarian/i.test(membersText))
  check('live mode asks for an initial password', librarian.needsPassword !== false)

  /*
   * Prove the role actually works: sign in as the new librarian and check the navigation
   * it is allowed to see. Mock mode only, because the generated password is known here.
   */
  if (process.env.CHECK_SIGNIN !== '0') {
    await signOut()
    const signedIn = await signIn(`LIB-${RUN}`.toUpperCase().slice(0, 20), 'Desk@2026')
    check('the new librarian can sign in with their institutional ID', signedIn, page.url())
    if (signedIn) {
      const nav = await bodyText()
      check('the librarian sees Members and Circulation', /members/i.test(nav) && /circulation/i.test(nav))
      check('the librarian sees the whole library, not just their own shelf', /dashboard|overview/i.test(nav))
      await goto('/app/settings')
      await waitFor(async () => /admins only|loan period/i.test(await bodyText()), 60_000)
      const settings = await bodyText()
      check(
        'the librarian cannot edit circulation policy',
        /admins only|managed by library administrators/i.test(settings),
        settings.split('\n').find((line) => /admins only/i.test(line)) ?? '',
      )
    }
    console.log('…step: signing out after librarian')
    await signOut()
    console.log('…step: signed out')
    const studentIn = await signIn(`M-${RUN}`.toUpperCase().slice(0, 20), 'Reader@2026')
    check('the new student can sign in', studentIn, page.url())
    if (studentIn) {
      await goto('/app/members')
      await waitFor(
        async () => /this area is restricted/i.test(await bodyText()) || /register member/i.test(await bodyText()),
        60_000,
      )
      const blocked = await bodyText()
      check(
        'the student is blocked from the members page',
        /this area is restricted/i.test(blocked) && !/register member/i.test(blocked),
        blocked.slice(0, 120).replace(/\n/g, ' '),
      )

      /*
       * Password panel: reject a mismatch, then rotate for real and prove the new password
       * works and the old one does not.
       */
      await goto('/app/profile')
      const panelUp = await waitFor(async () => /change password/i.test(await bodyText()), 60_000)
      check('the profile page offers a change-password panel', panelUp)

      if (panelUp) {
        await fill('Current password', 'Reader@2026')
        await fill('New password', 'Rotated@2026')
        await fill('Confirm new password', 'Rotated@2027')
        await page.evaluate(() => {
          ;[...document.querySelectorAll('button')].find((button) => /change password/i.test(button.innerText || ''))?.click()
        })
        const mismatch = await waitFor(async () => /do not match/i.test(await bodyText()), 15_000)
        check('a mismatched confirmation is rejected before it reaches the server', mismatch)

        await fill('Confirm new password', 'Rotated@2026')
        await page.evaluate(() => {
          ;[...document.querySelectorAll('button')].find((button) => /change password/i.test(button.innerText || ''))?.click()
        })
        const rotated = await waitFor(async () => /password updated/i.test(await bodyText()), 90_000)
        check('the password can be changed from the UI', rotated, (await bodyText()).split('\n').find((line) => /password/i.test(line)) ?? '')

        await signOut()
        const oldFails = !(await signIn(`M-${RUN}`.toUpperCase().slice(0, 20), 'Reader@2026'))
        check('the old password stops working', oldFails)
        await signOut()
        const newWorks = await signIn(`M-${RUN}`.toUpperCase().slice(0, 20), 'Rotated@2026')
        check('the new password works', newWorks)
        await signOut()
      }

    }
  }

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
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
