// W2-nav render verification — settings / sidebar / nav / user dropdown / mobile shell.
//
// Why this shape: the espresso v2 colour work was value-preserving BY MEASUREMENT in
// light mode only (cookbook §10.3). Light and dark drifted on different tokens, so
// checking one theme tells you nothing about the other (§2.6). And a retired token does
// not throw — the element just loses the property (§10.5). So this spec:
//
//   1. paints probe elements with the EXACT class pairs the nav chrome uses and asserts
//      the rendered contrast in BOTH themes. Probes rather than live badges because the
//      badge chips only mount when the shell endpoint returns a non-zero count, which is
//      not guaranteed on lab — the token pairing must be assertable regardless of data.
//   2. asserts the tokens we migrated AWAY from resolve to nothing, which is what proves
//      the old code was silently broken rather than merely different.
//   3. renders the real desktop rail and the real mobile shell, in both themes.

import { test, expect } from '@playwright/test'
import { login, collectErrors, shot } from './helpers.js'

// Five t2 workers share one lab. The proxy api_zone (60 r/s, burst 60) returns 429 on the
// login POST when two of us start a run at the same moment, which is not a product failure.
// Back off and retry rather than editing the shared helper other workers depend on.
async function authed(page, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      return await login(page)
    } catch (e) {
      if (i >= attempts || !/HTTP 429/.test(String(e))) throw e
      await page.waitForTimeout(15_000 * i)
    }
  }
}

// Upstream's persona wizard asks for `FCRM Settings.persona_captured` on every route
// resolve (router.js). No `bench migrate` has been run on trackb/merge, so lab has no such
// field and Frappe answers 417. It is a migrate gap in shared-core, not nav rendering —
// filtered here, and reported rather than silently swallowed.
const NAV_IGNORE = [/get_single_value/]
const realErrors = (errors) => errors.real().filter((t) => !NAV_IGNORE.some((re) => re.test(t)))

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 } // iPhone 14-ish; < 768 → MobileLayout

// The fg/bg class pairs actually used by the nav chrome, with the floor each must clear.
// 4.5 = WCAG AA normal text. 3.0 = AA large / non-text UI. Amber and blue sit at
// frappe-ui's own `Badge variant="subtle"` pairing, which is under 4.5 in light — that is
// upstream's choice and still better than what we shipped before, so they are floored at 3.
const PAIRS = [
  ['drawer + rail active row', 'bg-surface-green-2', 'text-ink-green-8', 4.5],
  ['tab bar active label', 'bg-surface-base', 'text-ink-green-8', 4.5],
  ['avatar initials', 'bg-surface-violet-2', 'text-ink-violet-8', 4.5],
  // one pairing, three uses: the drawer badges sit on it permanently, the sign-out and
  // outbox-discard rows hit it on hover. W1-base's value-exact remap put ink-red-7 here,
  // which matched v1's LIGHT value exactly and collapsed to 4.40 in dark.
  ['red chip + sign-out/discard hover', 'bg-surface-red-1', 'text-ink-red-8', 4.5],
  ['tab bar unread badge', 'bg-surface-red-7', 'text-ink-red-1', 4.5],
  ['drawer overdue badge', 'bg-surface-amber-1', 'text-ink-amber-8', 3.0],
  ['tab bar overdue badge', 'bg-surface-amber-2', 'text-ink-amber-8', 3.0],
  ['offline strip', 'bg-surface-amber-1', 'text-ink-amber-8', 3.0],
  ['outbox strip', 'bg-surface-blue-1', 'text-ink-blue-8', 3.0],
  ['sign-out row (resting)', 'bg-surface-base', 'text-ink-red-8', 4.5],
  ['drawer inactive row', 'bg-surface-base', 'text-ink-gray-7', 4.5],
  ['saved-view link (SidebarLink)', 'bg-surface-elevation-3', 'text-ink-gray-8', 4.5],
]

// Retired by the v2 rename tables — every one of these must paint NOTHING.
const RETIRED = ['ink-white', 'surface-white', 'surface-selected', 'surface-menu-bar']

// Runs in the page: paint a probe, read back the computed colours, return sRGB triples.
const PROBE = ([bgClass, fgClass]) => {
  const wrap = document.createElement('div')
  wrap.className = bgClass
  const span = document.createElement('span')
  span.className = fgClass
  span.textContent = '42'
  wrap.appendChild(span)
  document.body.appendChild(wrap)
  const bg = getComputedStyle(wrap).backgroundColor
  const fg = getComputedStyle(span).color
  wrap.remove()
  return { bg, fg }
}

function parseColor(s) {
  // Chromium returns rgb()/rgba() or color(srgb r g b) depending on the source notation.
  let m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }
  }
  m = s.match(/^color\(srgb ([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  return null
}

function relLum({ r, g, b }) {
  const f = (x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(fg, bg) {
  const a = relLum(fg)
  const b = relLum(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// The rail and the drawer carry `transition-all duration-200`, so a computed style read
// straight after flipping the theme returns an INTERPOLATED midpoint — Chromium reports it
// as `oklab(...)`, which is neither the old colour nor the new one. Settle past the
// transition before reading, or you will chase a colour that never renders at rest.
async function setTheme(page, theme, settleMs = 400) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(settleMs)
}

for (const theme of ['light', 'dark']) {
  test(`nav chrome tokens resolve and contrast in ${theme} mode`, async ({ page }) => {
    await authed(page)
    await page.setViewportSize(DESKTOP)
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000) // let the SPA mount and the css land
    await setTheme(page, theme)

    // 1. every pair paints, and clears its contrast floor
    const failures = []
    for (const [label, bgClass, fgClass, floor] of PAIRS) {
      const { bg, fg } = await page.evaluate(PROBE, [bgClass, fgClass])
      const bgc = parseColor(bg)
      const fgc = parseColor(fg)
      if (!bgc || !fgc) {
        failures.push(`${label}: unparseable bg=${bg} fg=${fg}`)
        continue
      }
      // A retired background paints nothing → fully transparent. That is the §10.5 failure.
      if (bgc.a === 0) {
        failures.push(`${label}: ${bgClass} painted NOTHING (retired token?)`)
        continue
      }
      const ratio = contrast(fgc, bgc)
      if (ratio < floor) {
        failures.push(`${label}: ${fgClass} on ${bgClass} = ${ratio.toFixed(2)} < ${floor}`)
      }
    }
    expect(failures, `contrast failures in ${theme}:\n${failures.join('\n')}`).toEqual([])

    // 2. the tokens we migrated away from must paint nothing — proof the old code was broken
    for (const name of RETIRED) {
      const painted = await page.evaluate((n) => {
        const d = document.createElement('div')
        d.className = `bg-${n} text-${n}`
        document.body.appendChild(d)
        const bg = getComputedStyle(d).backgroundColor
        d.remove()
        return bg
      }, name)
      const c = parseColor(painted)
      expect(c === null || c.a === 0, `${name} still paints ${painted} — it should be retired`).toBe(true)
    }

    // 3. the CSS variables the nav builds inline styles from must exist (§10.4)
    for (const v of ['--surface-base', '--brand']) {
      const val = await page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        v,
      )
      expect(val, `${v} resolved empty — inline styles using it render nothing`).not.toBe('')
    }
  })
}

test('desktop rail renders in both themes', async ({ page }) => {
  const errors = collectErrors(page)
  await authed(page)
  await page.setViewportSize(DESKTOP)
  await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    // The rail is the only 58px-or-210px flex column with a right border at the root.
    const rail = page.locator('div.border-r.bg-surface-base').first()
    await expect(rail).toBeVisible()
    const bg = await rail.evaluate((el) => getComputedStyle(el).backgroundColor)
    const c = parseColor(bg)
    expect(c, `rail background unparseable in ${theme}: ${bg}`).not.toBeNull()
    expect(c.a, `rail background transparent in ${theme}`).toBeGreaterThan(0)
    await shot(page, `w2nav-desktop-rail-${theme}`)
  }
  expect(realErrors(errors)).toEqual([])
})

test('mobile shell renders tab bar and drawer in both themes', async ({ page }) => {
  const errors = collectErrors(page)
  await authed(page)
  await page.setViewportSize(MOBILE) // must precede goto: isMobileView reads innerWidth once
  await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const tabbar = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(tabbar).toBeVisible()

  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    const bg = await tabbar.evaluate((el) => getComputedStyle(el).backgroundColor)
    const c = parseColor(bg)
    expect(c, `tab bar background unparseable in ${theme}: ${bg}`).not.toBeNull()
    expect(c.a, `tab bar background transparent in ${theme}`).toBeGreaterThan(0)
    await shot(page, `w2nav-mobile-tabbar-${theme}`)

    // "Más" opens the drawer — the one part of the app whose layout differs by viewport.
    // Scope to the tab bar: "Más" is a substring of a lot of list-row accessible names.
    await tabbar.getByRole('button', { name: 'Más', exact: true }).click()
    const drawer = page.locator('div.w-\\[286px\\]')
    await expect(drawer).toBeVisible()
    await shot(page, `w2nav-mobile-drawer-${theme}`)

    // Measure the REAL chrome, not just probes: the drawer surface, the active nav row,
    // the avatar initials and any live badge. A probe proves the palette pairing; only
    // this proves the component actually wears it.
    const live = await drawer.evaluate((d) => {
      const rows = [...d.querySelectorAll('nav button')]
      const active = rows.find((b) => b.getAttribute('aria-current') === 'page')
      const badge = rows.map((b) => b.querySelector('span.rounded-full')).find(Boolean)
      const avatar = d.querySelector('span.bg-surface-violet-2')
      const g = (el, p) => (el ? getComputedStyle(el)[p] : null)
      return {
        surface: g(d, 'backgroundColor'),
        activeFg: g(active, 'color'),
        activeBg: g(active, 'backgroundColor'),
        badgeFg: g(badge, 'color'),
        badgeBg: g(badge, 'backgroundColor'),
        avatarFg: g(avatar, 'color'),
        avatarBg: g(avatar, 'backgroundColor'),
      }
    })
    const check = (label, fg, bg, floor) => {
      if (!fg || !bg) return null // element absent (badge counts can legitimately be zero)
      const f = parseColor(fg)
      const b = parseColor(bg)
      if (!f || !b) return `${label}: unparseable ${fg} / ${bg}`
      // a transparent row background means it inherits the drawer surface
      const base = b.a === 0 ? parseColor(live.surface) : b
      const r = contrast(f, base)
      return r < floor ? `${label}: ${r.toFixed(2)} < ${floor} (${fg} on ${bg})` : null
    }
    const liveFails = [
      check('live active nav row', live.activeFg, live.activeBg, 4.5),
      check('live avatar initials', live.avatarFg, live.avatarBg, 4.5),
      check('live drawer badge', live.badgeFg, live.badgeBg, 3.0),
    ].filter(Boolean)
    expect(liveFails, `live drawer contrast in ${theme}:\n${liveFails.join('\n')}`).toEqual([])
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  expect(realErrors(errors)).toEqual([])
})
