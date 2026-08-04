// One-off probe: measure the EXACT final class strings from every W2-doco edit,
// in both themes, against the vite dev server (which compiles the working tree —
// no build, no shared bundle written).
//
// The SPA does not mount in dev (get_context_for_dev needs developer_mode on the
// site), but the Tailwind layer is fully present, which is all these assertions
// need: they paint synthetic elements with the real class strings.
import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

const THEMES = ['light', 'dark']

const setTheme = (page, t) =>
  page.evaluate((th) => {
    document.documentElement.setAttribute('data-theme', th)
    document.documentElement.classList.toggle('dark', th === 'dark')
  }, t)

const measure = (page, fg, bg) =>
  page.evaluate(
    ([f, b]) => {
      const mk = (cls) => {
        const el = document.createElement('div')
        el.className = cls
        el.textContent = 'Xg'
        document.body.appendChild(el)
        return el
      }
      const a = mk(f), c = mk(b)
      const col = getComputedStyle(a).color
      const back = getComputedStyle(c).backgroundColor
      a.remove(); c.remove()
      const parse = (s) => {
        const m = s.match(/[\d.]+/g).map(Number)
        return s.startsWith('color(') ? m.slice(0, 3) : m.slice(0, 3).map((v) => v / 255)
      }
      const lum = (rgb) => {
        const f2 = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
        const [r, g, bl] = rgb.map(f2)
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
      }
      const [l1, l2] = [lum(parse(col)), lum(parse(back))].sort((x, y) => y - x)
      return { color: col, background: back, contrast: (l1 + 0.05) / (l2 + 0.05) }
    },
    [fg, bg],
  )

// [label, text classes as written in the component, background classes]
const SITES = [
  ['RepairOrdersSection:125 tracker badge', 'text-ink-green-1', 'bg-surface-green-7'],
  ['RepairSendModal:86 photo tick', 'text-ink-green-1', 'bg-surface-green-7'],
  ['WorkloadView:130 checkbox tick', 'text-ink-green-1', 'bg-surface-green-7'],
  ['SocialEvergreen:151 destructive btn', 'text-ink-red-1', 'bg-surface-red-7'],
  ['SocialMentions:55 count badge', 'text-ink-red-1', 'bg-surface-red-7'],
  ['PILLAR Servicio / RepairOrders:190 / CampaignDetail:15', 'text-ink-violet-8', 'bg-surface-violet-2'],
  ['PILLAR Producto', 'text-ink-blue-7 dark:text-ink-blue-8', 'bg-surface-blue-2'],
  ['PILLAR Noticia', 'text-ink-red-6 dark:text-ink-red-8', 'bg-surface-red-2'],
  ['PILLAR Testimonio', 'text-ink-green-7 dark:text-ink-green-8', 'bg-surface-green-2'],
  ['red-1 chips (WorkloadView:75, SocialComposer:41/153, ScoreRules:73)', 'text-ink-red-7 dark:text-ink-red-8', 'bg-surface-red-1'],
  ['KEEP: inverting gray chip (SocialCalendar x3, SocialMentions:49)', 'text-ink-base', 'bg-surface-gray-10'],
]

test('W2-doco: every edited class pair, both themes', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await page.goto('/crm/social', { waitUntil: 'commit', timeout: 120_000 })
  await page.waitForTimeout(4000)

  const rows = []
  for (const [label, fg, bg] of SITES) {
    const r = {}
    for (const th of THEMES) {
      await setTheme(page, th)
      await page.waitForTimeout(120)
      r[th] = await measure(page, fg, bg)
    }
    rows.push({ label, fg, bg, light: r.light.contrast, dark: r.dark.contrast, colorDark: r.dark.color })
  }

  const fmt = (n) => n.toFixed(2).padStart(6)
  console.log('\n=== W2-doco edited sites, measured on the dev server ===')
  for (const r of rows) {
    const flag = Math.min(r.light, r.dark) >= 4.5 ? 'PASS' : 'below'
    console.log(`${fmt(r.light)} L ${fmt(r.dark)} D  ${flag}  ${r.label}\n            ${r.fg}  on  ${r.bg}`)
  }

  // The five white-on-saturated badges must be LITERALLY white in both themes.
  for (const r of rows.slice(0, 5)) {
    // espresso tokens resolve through color-mix(), so white comes back as
    // `color(srgb 1 1 1)` rather than `rgb(255,255,255)`. Compare channels.
    const ch = r.colorDark.match(/[\d.]+/g).map(Number).slice(0, 3)
    const norm = r.colorDark.startsWith('color(') ? ch : ch.map((v) => v / 255)
    for (const c of norm) expect(c, `${r.label} must be pure white in dark`).toBeGreaterThan(0.99)
    expect(r.dark, `${r.label} dark contrast`).toBeGreaterThanOrEqual(4.5)
  }
  // Violet regressed in BOTH themes, so it must clear the floor in both.
  const violet = rows.find((r) => r.fg === 'text-ink-violet-8')
  expect(violet.light, 'violet light').toBeGreaterThanOrEqual(4.5)
  expect(violet.dark, 'violet dark').toBeGreaterThanOrEqual(4.5)
  // The dark-only fixes must clear the floor in dark (light is pre-existing).
  for (const label of ['PILLAR Producto', 'PILLAR Noticia', 'PILLAR Testimonio']) {
    const r = rows.find((x) => x.label === label)
    expect(r.dark, `${label} dark`).toBeGreaterThanOrEqual(4.5)
  }
  const red1 = rows.find((r) => r.bg === 'bg-surface-red-1')
  expect(red1.dark, 'red-1 chips dark').toBeGreaterThanOrEqual(4.5)
  expect(red1.light, 'red-1 chips light').toBeGreaterThanOrEqual(4.5)
  // And the KEEP row must stay high-contrast in both — proof it was right to leave.
  const keep = rows[rows.length - 1]
  expect(Math.min(keep.light, keep.dark), 'inverting gray chip').toBeGreaterThan(4.5)
})
