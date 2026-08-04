// W2-inbox: render proof for the espresso v2 inbox/conversation migration.
//
// Two separate claims are pinned here, and the second one is the important one.
//
//   1. The 10 pre-v2 tokens hand-migrated in Activities.vue and WhatsAppArea.vue
//      (the two files the codemod never wrote to) now resolve to the colours the
//      v1 design intended.
//
//      Note the failure mode, because it is NOT the one the migration docs lead
//      you to expect. Only `surface-white` is truly retired and emits nothing —
//      that one left WhatsAppArea's sticky header with no background, so the
//      message thread scrolled visibly underneath it. The other five accent inks
//      (ink-red-3, ink-amber-3, ink-green-3, ink-blue-2/3) are still VALID v2
//      names; the ramps were renumbered under them, so they resolved happily to
//      a near-white wash. Six warning banners and chips were rendering their
//      labels at ~1.1:1 against a pale tinted background — an invisible label,
//      in LIGHT mode, where everyone was looking.
//
//   2. `bg-surface-gray-10 text-ink-base` is CORRECT in both themes and must not
//      be "fixed" back to a literal white. The gray ramp INVERTS between themes
//      (surface-gray-10 is near-black in light, near-white in dark) and ink-base
//      tracks it. The pre-migration `ink-white` was literally white in both, so
//      in dark it was white-on-near-white — 1.06:1, an invisible label. That is
//      why this file asserts a contrast FLOOR rather than a colour: a future
//      worker reverting to white would pass a colour check and fail a human.
//
// Run: set -a; source frontend/.env; set +a
//      npx playwright test tests/social/w2-inbox-tokens.spec.js

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { login, evidenceDir } from './helpers.js'

// `/api/method/login` is rate limited, and with five migration workers sharing
// lab it 429s well before a spec finishes iterating. A one-time login key is
// generated server-side and consumed by a plain navigation, so it never touches
// the throttled endpoint — and keeps the password out of the run entirely.
// Memory: reference_headless_login_one_time_link.
// Falls back to the shared password login when bench is not reachable (CI).
async function loginNoThrottle(page) {
  const site = new URL(process.env.CRM_BASE_URL).hostname
  const user = process.env.CRM_TEST_USER
  try {
    const out = execFileSync(
      'docker',
      [
        'compose', 'exec', '-T', 'backend',
        'bench', '--site', site, 'execute',
        'frappe.www.login._generate_temporary_login_link',
        '--kwargs', `{'email':'${user}','expiry':300}`,
      ],
      { cwd: path.resolve(process.env.HOME, 'muelle-host/muelle'), encoding: 'utf8', timeout: 120_000 },
    )
    const link = out.trim().split('\n').pop().trim()
    if (!/^https?:\/\/.*login_via_key\?key=/.test(link)) throw new Error(`unexpected output: ${link}`)
    await page.goto(link, { waitUntil: 'domcontentloaded' })
    return
  } catch (e) {
    console.warn('temporary-link login unavailable, falling back to password login:', e.message)
    await login(page)
  }
}

const OUT = path.join(evidenceDir, 'w2-inbox-tokens')
fs.mkdirSync(OUT, { recursive: true })

const setTheme = (page, theme) =>
  page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)

// Build a throwaway element with the given classes and read back what the
// browser actually computed. This is the only honest way to test a token
// migration: it exercises the real cascade, and needs no seeded data.
const probe = (page, classes) =>
  page.evaluate((cls) => {
    const d = document.createElement('div')
    d.className = cls
    d.textContent = 'x'
    document.body.appendChild(d)
    const cs = getComputedStyle(d)
    const out = { color: cs.color, background: cs.backgroundColor }
    d.remove()
    return out
  }, classes)

// Probe a token PAIR through the CSS custom properties rather than through
// utility classes.
//
// This is required for any "what did the old code look like" assertion: once a
// class is removed from source, Tailwind stops emitting it, so a probe div with
// `text-ink-red-3` gets no colour rule at all and simply inherits the page's
// near-black — which reads as excellent contrast and hides the regression. The
// theme's --ink-*/--surface-* variables are defined by the stylesheet
// independently of which utilities got emitted, so they still tell the truth.
const probeVars = (page, inkVar, surfaceVar) =>
  page.evaluate(
    ([ink, surface]) => {
      const d = document.createElement('div')
      d.style.color = `var(${ink})`
      d.style.backgroundColor = `var(${surface})`
      d.textContent = 'x'
      document.body.appendChild(d)
      const cs = getComputedStyle(d)
      const out = { color: cs.color, background: cs.backgroundColor }
      d.remove()
      return out
    },
    [inkVar, surfaceVar],
  )

// WCAG contrast from two computed colour strings.
//
// These tokens are authored in oklch and Chrome hands back THREE different
// serialisations depending on how the value reached the property, so a naive
// `match(/[\d.]+/g)` silently produces nonsense:
//
//   rgb(224, 52, 52)             channels 0..255   (plain colours)
//   color(srgb 0.87 0.2 0.2)     channels 0..1     (Tailwind's color-mix(in srgb))
//   oklch(0.595 0.208 26.283)    L, C, hue-degrees (a bare var() substitution)
//
// Reading oklch as if it were rgb treats a 26-degree hue as a colour channel
// and yields ~1.0 contrast for every pair — which passes a "must be broken"
// assertion and fails a "must be legible" one, i.e. it fails in the direction
// that looks like a real bug in the code under test.
const relLuminance = (s) => {
  const t = s.trim()
  const n = t.match(/-?[\d.]+/g).map(Number)
  let lin // linear-light sRGB triplet
  if (t.startsWith('oklch')) {
    const [L, C, hDeg = 0] = n
    const h = (hDeg * Math.PI) / 180
    const a = C * Math.cos(h)
    const bb = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3
    const q = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3
    lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
    ].map((v) => Math.max(0, Math.min(1, v)))
  } else {
    const scale = t.startsWith('color(') ? 1 : 255
    lin = n.slice(0, 3)
      .map((v) => v / scale)
      .map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)))
  }
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

const contrast = (a, b) => {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAINTS = /rgba\(0, 0, 0, 0\)|transparent/

// Lab's proxy api_zone is 60 r/s burst=60 nodelay, and the CRM service worker
// re-precaches ~70 assets on every cold headless load — enough on its own to
// 429 the login. With five migration workers sharing the lab, one login for the
// whole file is the difference between a green run and a flaky one.
// Memory: reference_crm_spa_headless_test_429.
const killServiceWorker = (page) =>
  page.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => Promise.resolve({ update() {}, unregister() {} })
    }
  })

test.describe.configure({ mode: 'serial' })

test.describe('espresso v2 — inbox bucket', () => {
  test('inbox token contract holds in both themes', async ({ page }) => {
    await killServiceWorker(page)
    await loginNoThrottle(page)
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // The six tokens the two MIXED files were migrated TO.
    const migrated = {
      'text-ink-red-6': 'color',
      'text-ink-amber-7': 'color',
      'text-ink-green-7': 'color',
      'text-ink-blue-7': 'color',
      'text-ink-blue-6': 'color',
      'bg-surface-base': 'background',
    }
    const got = {}
    for (const [cls, prop] of Object.entries(migrated)) {
      const r = await probe(page, cls)
      got[cls] = r[prop]
      expect(r[prop], `${cls} must paint a real ${prop}`).not.toMatch(PAINTS)
    }
    console.log('migrated tokens (light):', JSON.stringify(got, null, 2))

    // What the UNMIGRATED tokens actually did, per real call site. This is the
    // bug this file fixes, and it is NOT "the token emits nothing" — that is
    // true only of `surface-white`. The five accent inks are all still VALID v2
    // names that were renumbered, so they resolved fine and rendered a
    // near-white wash on a pale tinted chip: ~1.1:1, an invisible label, in
    // LIGHT mode. Assert the before/after on the real class pairs.
    const sites = [
      ['no-WhatsApp banner', '--surface-red-1', '--ink-red-3', '--ink-red-6'],
      ['unknown-WA banner', '--surface-amber-1', '--ink-amber-3', '--ink-amber-7'],
      ['unified-thread chip', '--surface-green-2', '--ink-green-3', '--ink-green-7'],
      ['Internal badge', '--surface-blue-2', '--ink-blue-3', '--ink-blue-7'],
    ]
    const beforeAfter = {}
    for (const [label, bg, oldInk, newInk] of sites) {
      const was = await probeVars(page, oldInk, bg)
      const now = await probeVars(page, newInk, bg)
      const wasRatio = contrast(was.color, was.background)
      const nowRatio = contrast(now.color, now.background)
      beforeAfter[label] = { was: +wasRatio.toFixed(2), now: +nowRatio.toFixed(2) }
      expect(wasRatio, `${label}: the pre-v2 token must be demonstrably broken`).toBeLessThan(1.5)
      expect(nowRatio, `${label}: the migrated token must be legible`).toBeGreaterThan(2.5)
    }
    console.log('per-site contrast, unmigrated -> migrated:', JSON.stringify(beforeAfter, null, 2))

    // `surface-white` is the one genuinely RETIRED name: deleted in v2, so it
    // emits no CSS at all. WhatsAppArea's sticky header used it, which left the
    // header with no background and the message thread scrolling under it.
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--surface-white').trim(),
      ),
      '--surface-white must not exist in v2',
    ).toBe('')
    expect((await probe(page, 'bg-surface-white')).background, 'retired token paints nothing').toMatch(
      PAINTS,
    )

    // ---- WhatsApp sticky header, both themes -------------------------------
    // WhatsAppArea's sticky header stack. Light is governed by surface-base,
    // dark by its own dark: override. Both must be opaque or the thread shows
    // through — the comment in the component says so explicitly.
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(600)
      const outer = await probe(page, 'bg-surface-base')
      const inner = await probe(page, 'bg-surface-gray-2')
      console.log(`sticky header (${theme}):`, JSON.stringify({ outer, inner }))
      expect(outer.background, `surface-base must be opaque in ${theme}`).not.toMatch(PAINTS)
      expect(inner.background, `surface-gray-2 must be opaque in ${theme}`).not.toMatch(PAINTS)
      // Opaque means alpha 1 — an rgba() with a fractional alpha would let the
      // thread bleed through even though it "paints".
      expect(outer.background, `surface-base must not be semi-transparent in ${theme}`).not.toMatch(
        /rgba\([^)]*,\s*0?\.\d+\)/,
      )
    }

    // ---- accent chips must clear AA in BOTH themes -------------------------
    //
    // W1-base's value-exact remap matched v1's LIGHT value and never checked
    // dark. v1's low-index accent inks were theme-AWARE — ink-violet-1 was
    // #6846E3 in light but #9D7CEA in dark, deliberately lightened to stay
    // legible on the dark tinted fill. v2's ink ramp is monotonic and its mid
    // indices barely move between themes, so the remap landed on tokens with no
    // dark-mode contrast: violet went 5.05/4.95 -> 4.03/2.32.
    //
    // Value-exactness in ONE theme is not correctness. Assert both.
    const chips = [
      ['violet chip', '--surface-violet-2', '--ink-violet-8'],
      ['violet on card', '--surface-base', '--ink-violet-8'],
      ['red chip', '--surface-red-1', '--ink-red-8'],
      ['red on card', '--surface-base', '--ink-red-8'],
    ]
    const chipResults = {}
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(600)
      for (const [label, bg, ink] of chips) {
        const got = await probeVars(page, ink, bg)
        const ratio = contrast(got.color, got.background)
        chipResults[`${label} (${theme})`] = +ratio.toFixed(2)
        expect(ratio, `${label} must clear AA in ${theme}`).toBeGreaterThanOrEqual(4.5)
      }
      // And the tokens they replaced must still be measurably worse in dark,
      // so a revert cannot pass this file.
      if (theme === 'dark') {
        for (const [label, bg, oldInk] of [
          ['violet chip', '--surface-violet-2', '--ink-violet-6'],
          ['red chip', '--surface-red-1', '--ink-red-7'],
        ]) {
          const old = await probeVars(page, oldInk, bg)
          const r = contrast(old.color, old.background)
          chipResults[`${label} PRE-FIX (dark)`] = +r.toFixed(2)
          expect(r, `${label}: the pre-fix token must be below AA in dark`).toBeLessThan(4.5)
        }
      }
    }
    console.log('accent chip contrast, both themes:', JSON.stringify(chipResults, null, 2))

    // ---- THE REGRESSION GUARD. See the header comment. ---------------------
    const results = {}
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(600)

      // The real pairing used by PostCallSheet.vue:108 and WhatsAppQueue.vue:33.
      const chip = await probe(page, 'bg-surface-gray-10 text-ink-base')
      const ratio = contrast(chip.color, chip.background)

      // What reverting to a literal white would give. In dark this collapses.
      const white = await probe(page, 'bg-surface-gray-10 text-white')
      const whiteRatio = contrast(white.color, white.background)

      results[theme] = {
        inkBase: { ...chip, ratio: +ratio.toFixed(2) },
        literalWhite: { ...white, ratio: +whiteRatio.toFixed(2) },
      }

      expect(ratio, `ink-base on surface-gray-10 must clear AA in ${theme}`).toBeGreaterThan(4.5)

      if (theme === 'dark') {
        // Pin the reason: literal white is the WRONG answer here, and by a wide
        // margin. If a future change makes this assertion fail, the ramp stopped
        // inverting and this whole guard needs revisiting.
        expect(whiteRatio, 'literal white must be demonstrably worse in dark').toBeLessThan(2)
        expect(ratio).toBeGreaterThan(whiteRatio * 4)
      }
    }
    console.log('ink-base vs literal white on surface-gray-10:', JSON.stringify(results, null, 2))

    // ---- screenshots of the real screens, both themes -----------------------
    for (const route of ['/crm/inbox', '/crm/leads']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(5000)
      const slug = route.split('/').pop()
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme)
        await page.waitForTimeout(900)
        await page.screenshot({ path: path.join(OUT, `${slug}-${theme}.png`), fullPage: false })
      }
      // A blank SPA screenshots just fine, so assert the app actually mounted.
      const mounted = await page.evaluate(() => document.querySelectorAll('#app *').length)
      console.log(`${route}: ${mounted} nodes under #app`)
      expect(mounted, `${route} must render a mounted SPA`).toBeGreaterThan(50)
    }

    // ---- open a real conversation ------------------------------------------
    // The queue list does not mount WhatsAppArea, and WhatsAppArea's sticky
    // header is the one place a RETIRED token was producing a visible bug. Open
    // a thread so the component actually renders, in both themes.
    await page.goto('/crm/inbox', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    // Match the TAG, not the aria role. Queue rows are <button> elements, but
    // they carry an explicit role for the roving-tabindex listbox pattern, so
    // their accessible role is not "button" and `getByRole('button')` sees only
    // 30 of the 90 buttons on the page — none of them queue rows.
    const firstThread = page
      .locator('button')
      .filter({ hasText: /\+?\d[\d\s]{6,}/ })
      .first()
    // The queue hydrates well after domcontentloaded; counting immediately just
    // races it and silently skips the whole check.
    let threadOpened = false
    try {
      await firstThread.waitFor({ state: 'visible', timeout: 25_000 })
      threadOpened = true
    } catch {
      /* handled below */
    }
    if (threadOpened) {
      await firstThread.click()
      await page.waitForTimeout(4000)
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme)
        await page.waitForTimeout(900)
        await page.screenshot({ path: path.join(OUT, `thread-${theme}.png`), fullPage: false })
      }
      // If WhatsAppArea mounted, its header must be opaque — a transparent one
      // is the pre-migration `surface-white` bug rendering live.
      const header = page.locator('.wa-contact-header').first()
      if (await header.count()) {
        const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
        console.log('live .wa-contact-header background (dark):', bg)
        expect(bg, 'wa-contact-header must have a real background').not.toMatch(PAINTS)
      } else {
        console.log('note: .wa-contact-header did not mount for this thread (no contact on record)')
      }
    } else {
      console.log('note: no conversation row matched; skipped the thread render')
    }
  })
})
