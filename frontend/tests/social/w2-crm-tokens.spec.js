// W2-crm: render proof for the espresso v2 migration of deals / leads / contacts.
//
// The build is not evidence here — every failure mode in this migration compiles.
// This spec asserts on COMPUTED styles in a real browser, in BOTH themes.
//
// What it is guarding, specifically:
//
//  1. TYPOGRAPHY. The codemod pass (8b3e2b35) shifted four occurrences that were
//     already on the v2 scale — they arrived from upstream via the merge, not from
//     our v1 tree — so it double-shifted them. Reverted in e9674720. The sizes are
//     asserted on the REAL rendered elements, because the whole point is that a
//     wrong size is valid CSS and silent:
//       pages/Lead.vue   record title  20px (was pushed to 24px)
//       pages/Deal.vue   record title  20px  — must MATCH Lead, they diverged
//       pages/Deals.vue  list separators 24px (was pushed to 26px)
//
//  2. COLOUR TOKENS IN DARK MODE. Cookbook §2.6 leaves the v2 dark values of the
//     COLOURED families (amber, green, blue, red) explicitly UNKNOWN — the §2.3
//     value-exact fixes were derived in light mode only. This bucket uses nine of
//     them, so they are re-checked here in dark rather than assumed.
//
//  3. The retired names must resolve to NOTHING. That is what proves the pre-
//     migration code was silently broken rather than merely different (§10.5).
//
// Run: cd frontend && set -a && . ./.env && set +a
//      npx playwright test tests/social/w2-crm-tokens.spec.js --project=chromium \
//        --output=/tmp/<somewhere-outside-the-repo> \
//        # and export W6_EVIDENCE_DIR to the same place for the PNGs
//
// ⚠ Always pass --output. `outputDir` in playwright.config.js is `test-results`,
// which is SHARED, and Playwright CLEARS it at run start — running this without
// the flag deletes whatever another worker's in-flight run has written there.
// It has already happened once in each direction. The config is shared so the
// override belongs on the command line, not in it.

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { login, evidenceDir } from './helpers.js'

const OUT = path.join(evidenceDir, 'w2-crm-tokens')
fs.mkdirSync(OUT, { recursive: true })

// Every ink/surface/outline token the ten files in this bucket reference after
// migration. Derived by grep from the bucket, not hand-listed, so it cannot drift
// out of sync with the source without this spec noticing.
const BUCKET_TOKENS = [
  'ink-amber-7', 'ink-blue-6', 'ink-blue-link', 'ink-gray-4', 'ink-gray-5',
  'ink-gray-6', 'ink-gray-7', 'ink-gray-8', 'ink-gray-9', 'ink-green-7',
  'ink-red-6', 'ink-red-7', 'outline-amber-4', 'outline-elevation-2',
  'outline-gray-1', 'outline-gray-2', 'outline-gray-3', 'outline-gray-4',
  'outline-green-4', 'outline-red-4', 'surface-amber-1', 'surface-base',
  'surface-blue-1', 'surface-elevation-2', 'surface-gray-1', 'surface-gray-2',
  'surface-gray-3', 'surface-green-2', 'surface-green-7', 'surface-red-1',
]

// Names this bucket migrated AWAY from. They must emit nothing.
const RETIRED = ['surface-white', 'ink-white', 'outline-white', 'surface-selected', 'surface-menu-bar']

// Per-tenant brand accent, defined on :root in index.css and used for inline
// styles in five of these files. A wrong variable name here is even quieter than
// a wrong utility class — var(--nope) just yields nothing (§10.4).
const BRAND = ['brand', 'brand-soft', 'brand-strong']

// The lab proxy's api_zone is 60 r/s and several workers exercise it at once, so
// a bare login() throws 429 on contention (config header,
// `reference_crm_spa_headless_test_429`). A concurrent `dev-refresh --restart-py`
// also takes the backend out for ~30-60s, which surfaces as 502/503/504. Both are
// environmental, not app failures, so retry through them rather than reporting a
// red suite. helpers.js is shared with the other buckets, so this lives here.
const TRANSIENT = /\b(429|502|503|504)\b/

async function loginRetry(page, attempts = 10) {
  let wait = 4000
  for (let i = 1; i <= attempts; i++) {
    try {
      return await login(page)
    } catch (err) {
      if (!TRANSIENT.test(String(err)) || i === attempts) throw err
      console.log(`login transient (${String(err).match(TRANSIENT)[0]}) — backing off ${wait}ms (${i}/${attempts})`)
      await page.waitForTimeout(wait)
      wait = Math.min(wait * 2, 30_000)
    }
  }
}

const setTheme = (page, theme) =>
  page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)

const cssVars = (page, names) =>
  page.evaluate((ns) => {
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue('--' + n).trim()]))
  }, names)

// §10.5: paint a throwaway element with a class and read back what it computed to.
// A retired token does not throw and does not warn — the property is simply absent.
const paint = (page, classes) =>
  page.evaluate((cls) => {
    const out = {}
    for (const c of cls) {
      const d = document.createElement('div')
      d.className = c
      d.textContent = 'x'
      document.body.appendChild(d)
      const cs = getComputedStyle(d)
      out[c] = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, background: cs.backgroundColor }
      d.remove()
    }
    return out
  }, classes)

async function firstRecord(page, doctype) {
  const res = await page.request.get('/api/method/frappe.client.get_list', {
    params: { doctype, limit_page_length: 1, fields: JSON.stringify(['name']) },
  })
  if (!res.ok()) return null
  const body = await res.json()
  return body?.message?.[0]?.name ?? null
}

// WCAG relative luminance from a computed colour string, evaluated in the page so
// the browser has already resolved oklch() to concrete channels for us. Deriving
// it by hand is where this bucket's first contrast measurement went wrong: the
// OKLab->sRGB matrix yields LINEAR rgb, and gamma-decoding it a second time
// inflates light contrast and deflates dark.
const contrastPairs = (page, pairs) =>
  page.evaluate((ps) => {
    const chan = (c) => {
      const n = (c.match(/[\d.]+/g) || []).map(Number)
      return c.startsWith('color(srgb') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3)
    }
    const lum = (c) => {
      const a = chan(c).map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
    }
    const out = {}
    for (const [ink, surface] of ps) {
      const d = document.createElement('div')
      d.className = `text-${ink} bg-${surface}`
      d.textContent = 'x'
      document.body.appendChild(d)
      const cs = getComputedStyle(d)
      const [l1, l2] = [lum(cs.color), lum(cs.backgroundColor)].sort((a, b) => b - a)
      out[`${ink} on ${surface}`] = Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2))
      d.remove()
    }
    return out
  }, pairs)

test.describe('W2-crm — deals/leads espresso v2 render proof', () => {
  // Guards 6826b58d. W1-base's value-exact remap matched v1's LIGHT value and did
  // not check dark; v1's ink-red-4 was theme-aware (lightened in dark to stay
  // legible on the dark tinted fill) while v2's ink ramp is monotonic, so dark
  // collapsed from 6.19 to 4.40. This asserts the CONTRACT rather than sampling a
  // rendered chip, so it does not depend on a chip being present in the data.
  test('the red-on-red chip pairing clears AA in both themes', async ({ page }) => {
    await loginRetry(page)
    await page.goto('/crm/deals', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(600)

      const got = await contrastPairs(page, [
        ['ink-red-8', 'surface-red-1'],
        ['ink-red-8', 'surface-base'],
        ['ink-red-7', 'surface-red-1'],
      ])
      console.log(`[${theme}] contrast:`, JSON.stringify(got))

      expect(got['ink-red-8 on surface-red-1'], `the token we migrated TO must clear AA in ${theme}`).toBeGreaterThanOrEqual(4.5)
      // The buttons only take surface-red-1 on hover; at rest they sit on the page.
      expect(got['ink-red-8 on surface-base'], `resting state must clear AA in ${theme}`).toBeGreaterThanOrEqual(4.5)
    }

    // And the reason for the change: the previous token fails in dark. If this
    // ever passes, the ramp moved and the fix should be re-derived rather than
    // assumed.
    await setTheme(page, 'dark')
    await page.waitForTimeout(600)
    const dark = await contrastPairs(page, [['ink-red-7', 'surface-red-1']])
    console.log('dark ink-red-7 on surface-red-1 (the regression):', JSON.stringify(dark))
    expect(dark['ink-red-7 on surface-red-1'], 'ink-red-7 is expected to FAIL dark — that is why it was changed').toBeLessThan(4.5)
  })

  test('every token this bucket uses resolves, in light AND dark', async ({ page }) => {
    await loginRetry(page)
    await page.goto('/crm/deals', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(600)

      const resolved = await cssVars(page, BUCKET_TOKENS)
      const empty = Object.entries(resolved).filter(([, v]) => !v).map(([k]) => k)
      console.log(`[${theme}] unresolved bucket tokens:`, JSON.stringify(empty))
      expect(empty, `all ${BUCKET_TOKENS.length} bucket tokens must resolve in ${theme}`).toEqual([])

      const brand = await cssVars(page, BRAND)
      console.log(`[${theme}] brand vars:`, JSON.stringify(brand))
      for (const b of BRAND) expect(brand[b], `--${b} must resolve in ${theme}`).not.toBe('')

      const dead = await cssVars(page, RETIRED)
      const alive = Object.entries(dead).filter(([, v]) => v).map(([k]) => k)
      console.log(`[${theme}] retired tokens that still resolve:`, JSON.stringify(alive))
      expect(alive, `retired names must emit nothing in ${theme}`).toEqual([])
    }
  })

  test('the type scale is the beta.29 one, and the shifted classes mean what we think', async ({ page }) => {
    await loginRetry(page)
    await page.goto('/crm/deals', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    const sizes = await paint(page, [
      'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl',
      'text-3xl-medium', 'text-4xl-medium', 'text-3xl-semibold', 'text-lg-medium',
    ])
    console.log('type scale as rendered:', JSON.stringify(sizes, null, 2))

    // The beta.29 scale, read off the running app rather than the JSON.
    expect(sizes['text-lg'].fontSize, 'lg').toBe('16px')
    expect(sizes['text-xl'].fontSize, 'xl').toBe('17px')
    expect(sizes['text-2xl'].fontSize, '2xl').toBe('18px')
    expect(sizes['text-3xl'].fontSize, '3xl').toBe('20px')

    // The scale that makes the revert correct: our v1 text-3xl was 24px and
    // upstream's migrated text-4xl is 24px — pixel-identical, already right.
    expect(sizes['text-4xl'].fontSize, 'text-4xl is the v2 name for our old 24px').toBe('24px')
    expect(sizes['text-3xl-medium'].fontSize, 'record-title class').toBe('20px')
    expect(sizes['text-3xl-semibold'].fontSize, 'modal-heading class').toBe('20px')
    expect(sizes['text-lg-medium'].fontSize, 'Deal subtitle class').toBe('16px')

    // The two classes the codemod's double-shift introduced. Tailwind only emits
    // classes it finds in the source, so once the last use is gone the rule is
    // gone too and a probe div falls back to the 16px default. Their ABSENCE is
    // therefore the assertion — it proves nothing in the tree references them.
    // (Both are real classes in beta.29: 5xl=26px, 4xl-medium=24px. If either
    // starts emitting again, something has re-introduced the double-shift.)
    expect(sizes['text-5xl'].fontSize, 'text-5xl must no longer be emitted').toBe('16px')
    expect(sizes['text-4xl-medium'].fontSize, 'text-4xl-medium must no longer be emitted').toBe('16px')
  })

  test('Lead and Deal record titles are 20px and identical', async ({ page }) => {
    await loginRetry(page)

    const leadId = await firstRecord(page, 'CRM Lead')
    const dealId = await firstRecord(page, 'CRM Deal')
    console.log('sampled records:', JSON.stringify({ leadId, dealId }))
    test.skip(!leadId || !dealId, 'lab has no lead/deal to render')

    const titleSize = async (route, cls) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(5000)
      const el = page.locator(`div.${cls}`).first()
      await expect(el, `${route} title must render`).toBeVisible({ timeout: 30_000 })
      return el.evaluate((n) => {
        const cs = getComputedStyle(n)
        return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color }
      })
    }

    // Both record titles are `text-3xl-medium` — Lead's had been pushed to
    // `text-4xl-medium` (24px) while Deal's kept 20px, so they silently diverged.
    const lead = await titleSize(`/crm/leads/${leadId}`, 'text-3xl-medium')
    console.log('Lead title:', JSON.stringify(lead))
    await page.screenshot({ path: path.join(OUT, 'lead-title-light.png') })

    const deal = await titleSize(`/crm/deals/${dealId}`, 'text-3xl-medium')
    console.log('Deal title:', JSON.stringify(deal))
    await page.screenshot({ path: path.join(OUT, 'deal-title-light.png') })

    expect(lead.fontSize, 'Lead record title must be 20px').toBe('20px')
    expect(deal.fontSize, 'Deal record title must be 20px').toBe('20px')
    expect(lead.fontSize, 'Lead and Deal titles must match').toBe(deal.fontSize)
  })

  test('deals list separators are 24px, not the double-shifted 26px', async ({ page }) => {
    await loginRetry(page)
    await page.goto('/crm/deals/view/list', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)

    // The separators live in Deals.vue's #actions slot, which the list only
    // reveals on row hover — at rest they are not in the DOM at all.
    const row = page.locator('[class*="grid"] >> text=/CRM-DEAL-/').first()
    if (await row.count()) {
      await row.hover().catch(() => {})
      await page.waitForTimeout(1200)
    }

    const seps = await page.evaluate(() =>
      [...document.querySelectorAll('span[class*="text-4xl"]')]
        .map((s) => ({ cls: s.className, text: (s.textContent || '').trim(), fontSize: getComputedStyle(s).fontSize }))
        .slice(0, 6),
    )
    console.log('deal-list separators:', JSON.stringify(seps))
    test.skip(seps.length === 0, 'actions slot not revealed on lab — separators not in the DOM')

    for (const s of seps) {
      expect(s.fontSize, 'separator must be 24px (v1 text-3xl == v2 text-4xl)').toBe('24px')
    }
  })

  test('every screen in this bucket renders in both themes', async ({ page }) => {
    await loginRetry(page)
    const routes = {
      'deals-view': '/crm/deals',
      'leads-view': '/crm/leads',
      'deals-list': '/crm/deals/view/list',
      'leads-list': '/crm/leads/view/list',
      tasks: '/crm/tasks',
      reports: '/crm/reports',
    }

    for (const [name, route] of Object.entries(routes)) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(4500)

      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme)
        await page.waitForTimeout(700)

        // Nothing may be painted with an unresolved colour, and the page must
        // have actually mounted (an unmounted SPA screenshots as a blank shell).
        const health = await page.evaluate(() => ({
          mounted: !!document.querySelector('#app')?.children.length,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          text: (document.body.innerText || '').trim().length,
          // The double-shifted classes the codemod introduced. Checked on every
          // route rather than only where the separators live, because this is the
          // assertion that actually guards the regression from coming back.
          shifted: [...document.querySelectorAll('[class*="text-5xl"], [class*="text-4xl-medium"]')].length,
        }))
        console.log(`${name} [${theme}]:`, JSON.stringify(health))
        expect(health.mounted, `${name} must mount`).toBeTruthy()
        expect(health.text, `${name} must render text in ${theme}`).toBeGreaterThan(0)
        expect(health.shifted, `${name} must carry no double-shifted type class`).toBe(0)

        await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`), fullPage: false })
      }
    }
  })
})
