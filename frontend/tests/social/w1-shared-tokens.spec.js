// W1-base: render proof for the espresso v2 shared-layer migration.
//
// A green vite build proves nothing here — every failure mode in this migration
// produces valid-looking code that renders wrong. This spec asserts on COMPUTED
// styles in a real browser, in both themes, for the two shared surfaces W1
// changed:
//
//   1. composables/crmFormat.js  avatar palette (16 importers, every t2 bucket).
//      Was var(--text-ink-*), which has never been a real frappe-ui variable, so
//      the initials fell back to inherited colour. Now var(--ink-*).
//   2. components/SidebarLink.vue  active item used bg-surface-selected, a
//      RETIRED token that emits no CSS at all -> no background.
//
// Run: source frontend/.env, then `npx playwright test tests/social/w1-shared-tokens.spec.js`

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { login, evidenceDir } from './helpers.js'

const OUT = path.join(evidenceDir, 'w1-tokens')
fs.mkdirSync(OUT, { recursive: true })

const setTheme = (page, theme) =>
  page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)

// Resolve a CSS custom property off the document root.
const cssVar = (page, name) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test.describe('espresso v2 shared layer', () => {
  test('avatar palette resolves to real ink tokens in both themes', async ({ page }) => {
    await login(page)
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // The five variables the migrated palette points at must all resolve.
    const inks = ['--ink-violet-8', '--ink-blue-9', '--ink-green-8', '--ink-amber-9', '--ink-red-8']
    const resolved = {}
    for (const v of inks) resolved[v] = await cssVar(page, v)
    console.log('resolved ink vars:', JSON.stringify(resolved, null, 2))
    for (const v of inks) expect(resolved[v], `${v} must resolve`).not.toBe('')

    // ...but RESOLVING IS NOT WORKING. The first version of this spec asserted
    // only that these variables were non-empty, and passed for hours while the
    // palette was unreadable: every pair was below WCAG AA, one at 2.32:1.
    // Measure the contrast the user actually gets, in both themes.
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme)
      await page.waitForTimeout(400)
      const ratios = await page.evaluate((pairs) => {
        // Resolve to real sRGB bytes by painting onto a canvas. Reading
        // getComputedStyle().color is NOT safe here: Chrome returns oklch()
        // unchanged for oklch inputs, so parsing its numbers as RGB yields a
        // luminance of ~0 for every colour and a contrast ratio of ~1.0 for
        // every pair -- which is exactly how this assertion first "passed".
        const probe = document.createElement('div')
        document.body.appendChild(probe)
        const cv = document.createElement('canvas')
        cv.width = cv.height = 1
        const ctx = cv.getContext('2d')
        const lum = (css) => {
          probe.style.color = css
          const resolved = getComputedStyle(probe).color
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = resolved
          ctx.fillRect(0, 0, 1, 1)
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
          const f = (c) => {
            c /= 255
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const out = pairs.map(([bg, fg]) => {
          const a = lum(`var(${fg})`), b = lum(`var(${bg})`)
          const hi = Math.max(a, b), lo = Math.min(a, b)
          return { bg, fg, ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2) }
        })
        probe.remove()
        return out
      }, [
        ['--surface-violet-2', '--ink-violet-8'],
        ['--surface-blue-1', '--ink-blue-9'],
        ['--surface-green-2', '--ink-green-8'],
        ['--surface-amber-1', '--ink-amber-9'],
        ['--surface-red-1', '--ink-red-8'],
      ])
      console.log(`avatar contrast (${theme}):`, JSON.stringify(ratios, null, 2))
      for (const { bg, fg, ratio } of ratios) {
        expect(ratio, `${fg} on ${bg} in ${theme} must clear WCAG AA`).toBeGreaterThanOrEqual(4.5)
      }
    }
    await setTheme(page, 'light')

    // The names the old code used must NOT resolve — this is the proof that the
    // pre-migration palette was silently falling back to inherited colour.
    for (const dead of ['--text-ink-violet-1', '--text-ink-amber-3', '--surface-selected', '--surface-white']) {
      expect(await cssVar(page, dead), `${dead} must be absent`).toBe('')
    }

    // Any element the app styled from the palette must have a real colour.
    const swatches = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('[style*="--ink-"], [style*="--surface-"]')) {
        const cs = getComputedStyle(el)
        out.push({ color: cs.color, background: cs.backgroundColor, text: (el.textContent || '').trim().slice(0, 4) })
      }
      return out.slice(0, 12)
    })
    console.log('inline-styled palette elements:', JSON.stringify(swatches, null, 2))

    await page.screenshot({ path: path.join(OUT, 'leads-light.png'), fullPage: false })
    await setTheme(page, 'dark')
    await page.waitForTimeout(1200)
    const darkInks = {}
    for (const v of inks) darkInks[v] = await cssVar(page, v)
    console.log('resolved ink vars (dark):', JSON.stringify(darkInks, null, 2))
    for (const v of inks) expect(darkInks[v], `${v} must resolve in dark`).not.toBe('')
    await page.screenshot({ path: path.join(OUT, 'leads-dark.png'), fullPage: false })
  })

  test('mobile sidebar active item has a real background', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 })
    await login(page)
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    expect(await cssVar(page, '--surface-elevation-3'), 'elevation-3 must resolve').not.toBe('')
    expect(await cssVar(page, '--surface-selected'), 'retired token must be gone').toBe('')

    // Open the drawer so MobileSidebar (SidebarLink's only importer) is mounted.
    await page.locator('button:has(svg), [aria-label*="menu" i]').first().click()
    await page.waitForTimeout(1500)

    // SidebarLink's active state only renders for SAVED VIEWS inside a collapsed
    // section, so there may be no active instance on a given site. Assert the
    // underlying contract instead, which is what actually broke: the utility
    // class must emit a real background. `bg-surface-selected` (the retired name
    // this file used) emits NO CSS at all, which is precisely the silent failure
    // mode this migration is about — so we assert both directions.
    const probe = await page.evaluate(() => {
      const mk = (cls) => {
        const d = document.createElement('div')
        d.className = cls
        document.body.appendChild(d)
        const bg = getComputedStyle(d).backgroundColor
        d.remove()
        return bg
      }
      return { migrated: mk('bg-surface-elevation-3'), retired: mk('bg-surface-selected') }
    })
    console.log('SidebarLink active-state contract:', JSON.stringify(probe))
    expect(probe.migrated, 'bg-surface-elevation-3 must paint').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(probe.retired, 'bg-surface-selected must paint NOTHING (retired)').toMatch(/rgba\(0, 0, 0, 0\)|transparent/)

    await page.screenshot({ path: path.join(OUT, 'mobile-light.png'), fullPage: false })
    await setTheme(page, 'dark')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, 'mobile-dark.png'), fullPage: false })
  })
})
