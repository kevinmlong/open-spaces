#!/usr/bin/env node
/**
 * Screenshots /display at projector resolution and measures the layout boxes.
 *
 * Exists because this screen is the one thing that cannot be verified by
 * reading code: whether the wall actually overflows, whether anything is
 * clipped, and whether the vertical space really divides the way it should.
 *
 *   node scripts/shoot-display.mjs [url] [width] [height]
 */
import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:5173/display'
const width = Number(process.argv[3] || 1920)
const height = Number(process.argv[4] || 1080)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500) // let realtime settle and the wall render

const box = async (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }
  }, sel)

const report = {
  viewport: `${width}x${height}`,
  documentScrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
  header: await box('header'),
  heroBlock: await box('[data-test="hero-block"]'),
  hero: await box('[data-test="hero"]'),
  wall: await box('[data-test="wall"]'),
  footer: await box('footer'),
  cards: await page.evaluate(
    () => document.querySelectorAll('[data-test="wall"] > div > div').length,
  ),
  columnCount: await page.evaluate(() => {
    const el = document.querySelector('[data-test="wall"] > div')
    return el ? getComputedStyle(el).columnCount : null
  }),
}

console.log(JSON.stringify(report, null, 2))

const w = report.wall
if (w) {
  const overflow = w.scrollHeight - w.clientHeight
  console.log(
    overflow > 1
      ? `\nwall OVERFLOWS by ${overflow}px -> it should scroll`
      : `\nwall FITS (scrollHeight ${w.scrollHeight} <= clientHeight ${w.clientHeight}) -> nothing to scroll`,
  )
}
if (report.documentScrollHeight > height) {
  console.log(`!! PAGE OVERFLOWS: document is ${report.documentScrollHeight}px tall in a ${height}px viewport`)
} else {
  console.log('page fits the viewport exactly (no runaway content)')
}
if (errors.length) console.log('\nconsole errors:\n  ' + errors.join('\n  '))

// --- assertions -------------------------------------------------------------
// These are the failures that cannot be caught by reading the code, and each one
// has actually happened.
const fail = []

if (report.documentScrollHeight > height) {
  fail.push(`page overflows the viewport (${report.documentScrollHeight}px in ${height}px)`)
}
for (const key of ['heroBlock', 'hero']) {
  const b = report[key]
  if (b && b.scrollHeight - b.clientHeight > 1) {
    fail.push(`${key} is clipped by ${b.scrollHeight - b.clientHeight}px (descenders get sheared)`)
  }
}
// A countdown that renders but never changes looks fine in a screenshot and is
// obvious in a room. It froze once because an exception in onMounted killed the
// interval that drives it.
const readTimer = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-test="countdown"]')
    return el ? el.textContent.trim() : null
  })
const timerBefore = await readTimer()
if (timerBefore === '0:00') {
  fail.push(`countdown shows a bare 0:00 -- a lapsed deadline should say Time's Up!`)
} else if (timerBefore && /^\d+:\d\d$/.test(timerBefore)) {
  await page.waitForTimeout(2500)
  const timerAfter = await readTimer()
  if (timerAfter === timerBefore) fail.push(`countdown is frozen at ${timerBefore}`)
  else console.log(`countdown is ticking: ${timerBefore} -> ${timerAfter}`)
} else {
  console.log(`countdown: ${timerBefore ?? 'not shown in this phase'}`)
}

if (report.wall && report.wall.scrollHeight - report.wall.clientHeight > 1) {
  // It overflows, so it must actually be moving. A sub-pixel accumulation bug
  // once left this pinned at 0 while looking perfectly correct in the markup.
  const start = await page.evaluate(() => document.querySelector('[data-test="wall"]').scrollTop)
  await page.waitForTimeout(5000)
  const later = await page.evaluate(() => document.querySelector('[data-test="wall"]').scrollTop)
  if (later === start) fail.push(`wall overflows but scrollTop never moved (stuck at ${start})`)
  else console.log(`wall is scrolling: ${Math.round(start)} -> ${Math.round(later)} over 5s`)
}

await page.screenshot({ path: 'display.png' })
console.log('\nsaved display.png')
await browser.close()

if (fail.length) {
  console.error('\nFAILED:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log('display checks passed')
