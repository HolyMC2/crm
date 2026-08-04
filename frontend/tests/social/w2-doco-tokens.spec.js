// W2-doco: render proof for the doco-verticals bucket after the espresso v2 migration.
//
// The codemod pass was value-preserving BY MEASUREMENT, not by inspection, and the
// one rename it could not reason about is `ink-white` -> `ink-base`:
//
//   v1 ink-white  = neutral/white in BOTH themes  ("literally white")
//   v2 ink-base   = white in light, gray/950 in dark  ("ink that inverts")
//
// Our bucket used `ink-white` in two structurally different idioms, and the rename
// is correct for one and wrong for the other. This spec pins BOTH, because the
// failure is invisible in light mode and a naive "restore white everywhere" sweep
// would break the other half just as silently:
//
//   A. white-on-saturated  (bg-surface-green-7 / red-7)  -> needs literal white.
//      The accent surfaces stay saturated in dark, so ink-base lands near-black
//      on colour. These are the 5 sites fixed in 8eab4ceb.
//   B. ink-on-inverting    (bg-surface-gray-10)          -> ink-base is CORRECT.
//      That surface inverts with the theme (light gray/900, dark gray/50), so the
//      ink must invert with it. Forcing white here gives 1.06:1 in dark.
//
// Assertions are on COMPUTED styles in a real browser, in both themes. A screenshot
// diff would not catch B at all, and the build catches neither.
//
// Run: cd frontend && set -a && . ./.env && set +a
//      npx playwright test tests/social/w2-doco-tokens.spec.js --project=chromium

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { login, collectErrors, evidenceDir } from './helpers.js'

// helpers' evidenceDir defaults INSIDE test-results/, which is Playwright's
// `outputDir` and gets wiped — at run start and again between spec files, so a
// multi-file run loses screenshots mid-test and then fails on the write. The
// fallback also lands outside the repo, so an unconfigured run cannot drop
// untracked files into a working tree five workers are sharing.
// W6_EVIDENCE_DIR still wins when set explicitly.
const OUT = path.join(
  process.env.W6_EVIDENCE_DIR ? evidenceDir : path.join(os.tmpdir(), 'crm-test-evidence'),
  'w2-doco',
)
// Created lazily, never at module scope, for the same reason.
const outDir = () => (fs.mkdirSync(OUT, { recursive: true }), OUT)

const THEMES = ['light', 'dark']

const setTheme = async (page, theme) => {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)
  await page.waitForTimeout(250)
}

// Paint a throwaway element with real classes and read back what the browser
// actually computed. This is the only way to see a token that emits nothing:
// a retired token does not throw, does not warn and does not fail the build.
const probe = (page, classes) =>
  page.evaluate((cls) => {
    const el = document.createElement('div')
    el.className = cls
    el.textContent = 'Xg'
    document.body.appendChild(el)
    const cs = getComputedStyle(el)
    const out = { color: cs.color, background: cs.backgroundColor }
    el.remove()
    return out
  }, classes)

// WCAG relative-luminance contrast, computed in-page from the resolved rgb()
// strings so it reflects what a user sees rather than what the palette claims.
const contrast = (page, fg, bg) =>
  page.evaluate(
    ([f, b]) => {
      const parse = (s) => {
        const m = s.match(/[\d.]+/g).map(Number)
        // color() / oklch() resolve to 0..1 triples; rgb() to 0..255.
        return s.startsWith('color(') ? m.slice(0, 3) : m.slice(0, 3).map((v) => v / 255)
      }
      const lum = (rgb) => {
        const f2 = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        const [r, g, bl] = rgb.map(f2)
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
      }
      const [l1, l2] = [lum(parse(f)), lum(parse(b))].sort((x, y) => y - x)
      return (l1 + 0.05) / (l2 + 0.05)
    },
    [fg, bg],
  )

// ONE login for the WHOLE FILE. The lab proxy limits /api/method/login to
// `login_zone` = 5r/m burst=5 (proxy/nginx.conf.template:17,314) — a login per
// test blows that budget on the first run and the penalty then masquerades as a
// credentials failure. Every test below shares this page.
// See reference_crm_spa_headless_test_429.
let page

// helpers.gotoAuthed() calls login() on EVERY navigation. The session from
// beforeAll is already on this page's cookie jar, so navigate directly --
// otherwise a 10-route sweep spends 10 of the 5-per-minute login budget.
const goto = (route) =>
  page.goto(`/crm${route}`, { waitUntil: 'domcontentloaded' })

test.describe.configure({ mode: 'serial' })

// The login budget is per-IP and every t2 worker shares this host, so a 429 here
// is contention, not a bad credential. Back off and retry rather than reporting a
// red suite for someone else's test run. 5r/m refills one token every 12s.
async function loginWithBackoff(p, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await login(p)
    } catch (e) {
      if (!String(e.message).includes('429') || i === attempts) throw e
      const waitMs = 20_000 * i
      console.log(`login 429 (shared budget), retry ${i}/${attempts - 1} in ${waitMs / 1000}s`)
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(400_000)
  page = await browser.newPage()
  await loginWithBackoff(page)
})

test.afterAll(async () => {
  await page?.close()
})

test.describe('W2-doco espresso v2 token semantics', () => {
  test('literal-white and inverting-ink idioms are both correct in both themes', async () => {
    await goto('/social')
    await page.waitForTimeout(3000)

    const report = {}

    for (const theme of THEMES) {
      await setTheme(page, theme)

      // --- The retired token must emit NOTHING. This is the proof that the
      //     pre-migration code was silently broken, not merely different.
      const retired = await probe(page, 'text-ink-white bg-surface-white')
      expect(retired.background, `bg-surface-white must not paint in ${theme}`).toBe(
        'rgba(0, 0, 0, 0)',
      )

      // --- A: white on saturated accents. Literal white in BOTH themes.
      const white = await probe(page, 'text-white')
      expect(white.color, `text-white must be literally white in ${theme}`).toBe(
        'rgb(255, 255, 255)',
      )

      const green = await probe(page, 'bg-surface-green-7')
      const red = await probe(page, 'bg-surface-red-7')
      const inkBase = await probe(page, 'text-ink-base')

      const cGreenWhite = await contrast(page, white.color, green.background)
      const cRedWhite = await contrast(page, white.color, red.background)
      const cGreenInk = await contrast(page, inkBase.color, green.background)
      const cRedInk = await contrast(page, inkBase.color, red.background)

      // The fix must be at least as readable as what the codemod left behind,
      // in every theme — that is the whole claim being made.
      expect(cGreenWhite, `white>=ink-base on green-7 (${theme})`).toBeGreaterThanOrEqual(
        cGreenInk - 0.01,
      )
      expect(cRedWhite, `white>=ink-base on red-7 (${theme})`).toBeGreaterThanOrEqual(
        cRedInk - 0.01,
      )

      // --- B: ink-base on the INVERTING gray surface must stay high-contrast.
      //     This is the half that must NOT be changed to white.
      const g10 = await probe(page, 'bg-surface-gray-10')
      const cG10Ink = await contrast(page, inkBase.color, g10.background)
      const cG10White = await contrast(page, white.color, g10.background)
      expect(cG10Ink, `ink-base on surface-gray-10 must be legible in ${theme}`).toBeGreaterThan(
        4.5,
      )

      report[theme] = {
        inkBase: inkBase.color,
        white: white.color,
        surfaces: { green7: green.background, red7: red.background, gray10: g10.background },
        contrast: {
          'green-7 + white': +cGreenWhite.toFixed(2),
          'green-7 + ink-base': +cGreenInk.toFixed(2),
          'red-7 + white': +cRedWhite.toFixed(2),
          'red-7 + ink-base': +cRedInk.toFixed(2),
          'gray-10 + ink-base': +cG10Ink.toFixed(2),
          'gray-10 + white': +cG10White.toFixed(2),
        },
      }
    }

    console.log('W2-doco token report:\n' + JSON.stringify(report, null, 2))
    fs.writeFileSync(path.join(outDir(), 'token-report.json'), JSON.stringify(report, null, 2))

    // The two idioms must genuinely diverge in dark, otherwise this whole
    // distinction is theatre and one of the two fixes is wrong.
    expect(
      report.dark.contrast['gray-10 + white'],
      'white on gray-10 must be UNREADABLE in dark — this is why B was left as ink-base',
    ).toBeLessThan(2)
    expect(
      report.dark.contrast['red-7 + white'],
      'white on red-7 must beat ink-base in dark — this is why A was changed',
    ).toBeGreaterThan(report.dark.contrast['red-7 + ink-base'])
  })

  test('the .dm-input CSS variable resolves per theme', async () => {
    await goto('/campaigns')
    await page.waitForTimeout(3000)

    const cssVar = (n) =>
      page.evaluate(
        (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
        n,
      )

    // The name that has never existed in any frappe-ui version.
    expect(await cssVar('--text-ink-gray-8'), '--text-ink-gray-8 must be absent').toBe('')

    const seen = {}
    for (const theme of THEMES) {
      await setTheme(page, theme)
      const v = await cssVar('--ink-gray-8')
      expect(v, `--ink-gray-8 must resolve in ${theme}`).not.toBe('')
      seen[theme] = v
    }
    // It must actually track the theme, not just exist.
    expect(seen.light, '--ink-gray-8 must differ between themes').not.toBe(seen.dark)
    console.log('--ink-gray-8:', JSON.stringify(seen))
  })
})

// Every route in the bucket, in both themes: does it mount, and does it stay quiet?
// Token work cannot be judged from one screen, and these are the bespoke surfaces
// (heatmap, calendar grid, funnel, board, workload) that a generic pass breaks.
const ROUTES = [
  ['social', '/social'],
  ['social-mentions', '/social/mentions'],
  ['social-evergreen', '/social/evergreen'],
  ['campaigns', '/campaigns'],
  ['workload', '/workload'],
  ['pipeline-analysis', '/pipeline-analysis'],
  ['score-rules', '/score-rules'],
  ['webshop', '/webshop'],
]

// Known-benign, root-caused, and NOT a UI regression: the router's persona guard
// (router.js:13) reads FCRM Settings.persona_captured, a field upstream added in
// d308c084 that arrived with the merge. Lab has had no `bench migrate` since, so
// the column does not exist yet and frappe.client.get_single_value answers 417.
// It fires on every navigation, so it would otherwise mask every real console
// error in this sweep. Delete this filter once lab is migrated.
const PENDING_MIGRATE_417 =
  /get_single_value|417 \(EXPECTATION FAILED\)/

test.describe('W2-doco route render sweep', () => {
  test('every bucket route mounts and stays quiet in both themes', async () => {
    test.setTimeout(300_000)
    const errors = collectErrors(page)

    const failures = []
    const seen = []

    for (const [name, route] of ROUTES) {
      const before = errors.real().length
      await goto(route)
      await page.waitForTimeout(3500)

      for (const theme of THEMES) {
        await setTheme(page, theme)
        await page.waitForTimeout(500)

        // Mounted at all? An unmounted SPA leaves an empty #app behind — the
        // shape a failed dynamic import takes, which is how a 429 or a broken
        // chunk actually presents.
        const mounted = await page.evaluate(() => {
          const app = document.querySelector('#app')
          return !!app && app.children.length > 0 && (app.textContent || '').trim().length > 0
        })
        if (!mounted) failures.push(`${name} (${theme}): did not mount`)

        await page.screenshot({ path: path.join(outDir(), `${name}-${theme}.png`), fullPage: false })
      }

      const fresh = errors.real().slice(before).filter((e) => !PENDING_MIGRATE_417.test(e))
      if (fresh.length) failures.push(`${name}: console errors:\n  ` + fresh.join('\n  '))
      seen.push(`${name} ${fresh.length ? 'ERR' : 'ok'}`)
    }

    console.log('W2-doco route sweep: ' + seen.join(' | '))
    expect(failures, 'routes must render clean in both themes').toEqual([])
  })
})
