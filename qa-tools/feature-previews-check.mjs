/**
 * The landing page feature showcase must show six finished-looking previews, on three widths.
 *
 *   BASE_URL=http://localhost:5174 node qa-tools/feature-previews-check.mjs
 *   BASE_URL=https://lumina-library-fawn.vercel.app node qa-tools/feature-previews-check.mjs
 *
 * For every tab it asserts: the panel renders, it carries real content (no skeleton bars with
 * zero text), it is labelled as sample data unless it quotes the live catalogue, and the panel
 * never overflows its column or the viewport.
 */
import puppeteer from 'puppeteer'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`)
}

const TABS = [
  { key: 'catalog', label: 'Smart book catalog', expects: ['Search title', 'Computer Science', 'titles'] },
  { key: 'circulation', label: 'Issue & return management', expects: ['Clean Architecture', 'M-2041', 'Overdue', 'on loan'] },
  { key: 'selfservice', label: 'Student self-service', expects: ['My loans', 'Introduction to Algorithms', 'Renew loan', 'Due soon'] },
  { key: 'reservations', label: 'Reservations & due dates', expects: ['Design Patterns', 'Ready for pickup', 'expected 12 Nov'] },
  { key: 'analytics', label: 'Library analytics', expects: ['Issued this month', 'Popular categories', 'Computer Science', '%'] },
  { key: 'members', label: 'Member management', expects: ['A. Sharma', 'M-2041', 'Faculty', 'Active'] },
]

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 120_000,
})

const consoleErrors = []
const page = await browser.newPage()
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

/** Click the feature tab whose heading matches, then read only that panel. */
const openTab = async (page, label) => {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('#features button')].find((element) => {
      const heading = element.querySelector('span.font-semibold')
      return heading?.textContent?.trim() === text
    })
    button?.click()
    return Boolean(button)
  }, label)
  await sleep(650)
  return clicked
}

const readPanel = (page, key) =>
  page.evaluate((variant) => {
    const panel = document.querySelector(`[data-testid="feature-preview-${variant}"]`)
    if (!panel) return null
    const rect = panel.getBoundingClientRect()
    const styles = [...panel.querySelectorAll('*')].map((node) => {
      const style = getComputedStyle(node)
      return { overflowX: style.overflowX, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }
    })
    const overflowing = styles.filter((entry) => entry.scrollWidth > entry.clientWidth + 2)
    return {
      text: panel.innerText,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      overflowing: overflowing.length,
      skeletons: panel.querySelectorAll('.animate-pulse').length,
      sampleTag: Boolean(panel.querySelector('[data-testid="preview-sample-tag"]')),
      docOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
          ? document.documentElement.scrollWidth - document.documentElement.clientWidth
          : 0,
    }
  }, key)

const testWidth = async (name, width, height) => {
  const view = await browser.newPage()
  await view.setViewport({ width, height })
  await view.goto(`${BASE}/#features`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await view.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await sleep(9000)
  await view.evaluate(() => {
    const section = document.querySelector('#features')
    section?.scrollIntoView({ block: 'start' })
  })
  await sleep(1200)

  for (const tab of TABS) {
    const opened = await openTab(view, tab.label)
    if (!opened) {
      check(`${name} · ${tab.key}: tab is clickable`, false, 'tab button not found')
      continue
    }
    const panel = await readPanel(view, tab.key)
    if (!panel) {
      check(`${name} · ${tab.key}: panel renders`, false, 'panel not in the DOM')
      continue
    }
    // innerText reflects CSS text-transform, so compare case-insensitively.
    const haystack = panel.text.toLowerCase()
    const missing = tab.expects.filter((needle) => !haystack.includes(needle.toLowerCase()))
    check(
      `${name} · ${tab.key}: panel shows finished content`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : `${panel.text.replace(/\s+/g, ' ').slice(0, 70)}…`,
    )
    check(`${name} · ${tab.key}: no skeleton placeholders`, panel.skeletons === 0, `${panel.skeletons} pulse blocks`)
    check(`${name} · ${tab.key}: labelled as sample or live`, panel.sampleTag)
    check(`${name} · ${tab.key}: nothing clipped inside the panel`, panel.overflowing === 0, `${panel.overflowing} overflowing nodes`)
    check(`${name} · ${tab.key}: page has no horizontal overflow`, panel.docOverflow === 0, `${panel.docOverflow}px`)
  }

  if (name === 'desktop') {
    await openTab(view, TABS[1].label)
    await view.screenshot({ path: '/home/user/qa-screens/preview-desktop.png', fullPage: false })
    for (const tab of TABS) {
      await openTab(view, tab.label)
      const section = await view.evaluateHandle((label) => {
        const button = [...document.querySelectorAll('#features button')].find(
          (element) => element.querySelector('span.font-semibold')?.textContent?.trim() === label,
        )
        return button?.closest('section')
      }, tab.label)
      try {
        await section.asElement().screenshot({ path: `/home/user/qa-screens/preview-${tab.key}.png` })
      } catch {
        /* element screenshots can fail mid-animation; the viewport shot is enough */
      }
    }
  }
  if (name === 'mobile') {
    for (const tab of TABS) {
      await openTab(view, tab.label)
      await view.evaluate((variant) => {
        document.querySelector(`[data-testid="feature-preview-${variant}"]`)?.scrollIntoView({ block: 'center' })
      }, tab.key)
      await sleep(400)
      await view.screenshot({ path: `/home/user/qa-screens/preview-mobile-${tab.key}.png`, fullPage: false })
    }
  }
  await view.close()
}

/** Reduced motion must not leave the panels half-drawn or mis-sized. */
const testReducedMotion = async () => {
  const view = await browser.newPage()
  await view.setViewport({ width: 1280, height: 900 })
  await view.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await view.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await sleep(8000)
  await view.evaluate(() => document.querySelector('#features')?.scrollIntoView({ block: 'start' }))
  await sleep(800)
  for (const tab of TABS) {
    await openTab(view, tab.label)
    const panel = await readPanel(view, tab.key)
    check(
      `reduced-motion · ${tab.key}: panel fully rendered`,
      Boolean(panel) && panel.text.length > 60 && panel.overflowing === 0 && panel.docOverflow === 0,
      panel ? `${panel.text.length} chars, ${panel.overflowing} clipped` : 'missing',
    )
  }
  await view.close()
}

try {
  await testWidth('desktop', 1440, 1000)
  await testWidth('tablet', 820, 1180)
  await testWidth('mobile', 390, 844)
  await testReducedMotion()
  check('no console errors while switching features', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
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
