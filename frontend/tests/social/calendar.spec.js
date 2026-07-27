// Calendar surface (B1). The calendar shipped with text/structural markup and NO
// data-testids, so selectors here are text/role/class based (centralized in helpers.SEL
// where shared). Deterministic behaviors (mount, view switch + localStorage persistence,
// month nav) assert hard; data-dependent ones (pillar tiles, channel emoji+dots, season
// ribbons, filter chips, drag) are feature-detected — lab may have zero posts — and the
// residue-risky happy-path drag is a documented FIXME (no writes that leave residue).

import { test, expect } from '@playwright/test'
import { gotoSocial, SEL, collectErrors, shot } from './helpers.js'

test('calendar: mount, view switch + persistence, month nav, filters/seasons no-crash', async ({ page }) => {
  const errs = collectErrors(page)
  await gotoSocial(page)

  await expect(SEL.calendarTab(page)).toBeVisible()
  await expect(SEL.newPost(page)).toBeVisible()
  await expect(SEL.monthLabel(page)).toBeVisible()
  await shot(page, 'calendar-month')

  // View switch + localStorage persistence — deterministic, no data needed.
  await SEL.calView(page, 'Semana').click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('social:calView')))
    .toBe('week')
  await SEL.calView(page, 'Lista').click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('social:calView')))
    .toBe('list')
  await SEL.calView(page, 'Mes').click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('social:calView')))
    .toBe('month')
  await shot(page, 'calendar-week-then-month')

  // Persists across a reload (the whole point of the localStorage key).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(SEL.monthLabel(page)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('social:calView'))).toBe('month')

  // Month nav moves the range label and returns.
  const before = (await SEL.monthLabel(page).textContent())?.trim() ?? ''
  await SEL.nextMonth(page).click()
  await expect(SEL.monthLabel(page)).not.toHaveText(before)
  await SEL.prevMonth(page).click()
  await expect(SEL.monthLabel(page)).toHaveText(before)

  // Filter bar renders only facets present in the loaded window. When posts exist, a
  // pillar chip toggles the "✕ Limpiar (n)" affordance; empty window → no chips.
  const clear = SEL.clearFilters(page)
  const pillarChip = page.locator('button').filter({ hasText: /^\s*(🛒|🛠|🎉|📣|💬|ℹ️)/ })
  if (await pillarChip.count()) {
    await pillarChip.first().click()
    await expect(clear).toBeVisible()
    await clear.click()
    await expect(clear).toHaveCount(0)
  } else {
    test.info().annotations.push({
      type: 'fixme',
      description: 'no posts in window → filter chips absent; interaction needs seeded posts',
    })
  }

  // Season ribbons: get_seasons data may be empty → assert the page stays healthy (no crash).
  await expect(SEL.monthLabel(page)).toBeVisible()

  // FIXME(data): with a published post in view, assert a tile is pillar-colored and its
  // channel badges render emoji + a status dot (B1 channelBadges; no more [object Object]).
  // FIXME(data): assert past-day cells carry the dimmed/not-droppable state (opacity-70).
  // FIXME(mutation): happy-path drag of a Draft to another day → reschedule toast — only
  // against a disposable seeded Draft (avoid residue; a same-day drop is a no-op, not a test).

  expect(errs.real(), `console errors:\n${errs.real().join('\n')}`).toEqual([])
})
