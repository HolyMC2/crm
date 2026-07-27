// Social calendar SMOKE (W6 B5-prep) — runs against the CURRENT live lab SPA.
// Purpose: catch the regressions that matter (SPA fails to mount, JS errors, calendar
// gone, month nav dead) before Wave B builds richer specs on top of this harness.
// Cosmetic channel-chip "[object Object]" (A2 string→dict) is knowingly ignored.

import { test, expect } from '@playwright/test'
import { gotoSocial, SEL, collectErrors, shot } from './helpers.js'

test('social: loads, calendar renders, month nav works, no unexpected console errors', async ({ page }) => {
  const errs = collectErrors(page)

  await gotoSocial(page)

  // SPA mounted + the default calendar view is up.
  await expect(SEL.title(page)).toBeVisible()
  await expect(SEL.newPost(page)).toBeVisible()
  await expect(SEL.calendarTab(page)).toBeVisible()

  // Calendar renders: a month label with a year is shown.
  await expect(SEL.monthLabel(page)).toBeVisible()
  await shot(page, 'social-calendar')

  // Month nav works: next changes the label, prev restores it.
  const before = (await SEL.monthLabel(page).textContent())?.trim() ?? ''
  await SEL.nextMonth(page).click()
  await expect(SEL.monthLabel(page)).not.toHaveText(before)
  await SEL.prevMonth(page).click()
  await expect(SEL.monthLabel(page)).toHaveText(before)
  await shot(page, 'social-calendar-nav')

  // No console errors except the known-benign (see helpers IGNORE).
  const real = errs.real()
  expect(real, `unexpected console errors:\n${real.join('\n')}`).toEqual([])
})
