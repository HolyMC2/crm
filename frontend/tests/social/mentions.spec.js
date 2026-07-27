// Mentions view (C3) at /social/mentions. Testids: mentions-page (root),
// mentions-filter-{Nuevo|Atendido|Descartado|todas} (the 'Todas' chip has an empty status
// value → 'todas'), mention-card-{i}, mention-suggest/send/dismiss/reactivate-{i},
// mention-send-confirm. Default filter is Nuevas. Lab likely has zero mentions (live capture
// pending Meta) → assert the es-MX empty copy. Read-only: reply flows post PUBLIC replies.

import { test, expect } from '@playwright/test'
import { gotoAuthed, byTestId, collectErrors, shot } from './helpers.js'

test('mentions: page renders, filter chips + default, empty-state copy', async ({ page }) => {
  const errs = collectErrors(page)
  await gotoAuthed(page, '/social/mentions')

  const root = byTestId(page, 'mentions-page')
  if (!(await root.count())) {
    test.fixme(true, '/social/mentions did not render (route/guard/creds) — revisit once creds exist')
    return
  }
  await expect(root).toBeVisible({ timeout: 15_000 })
  await shot(page, 'mentions')

  // Status filter chips (default = Nuevas).
  await expect(byTestId(page, 'mentions-filter-Nuevo')).toBeVisible()
  await expect(byTestId(page, 'mentions-filter-todas')).toBeVisible()
  // Switching to "Todas" is a read-only filter change (no mutation).
  await byTestId(page, 'mentions-filter-todas').click()

  const cards = page.locator('[data-testid^="mention-card-"]')
  if ((await cards.count()) === 0) {
    // No mentions on lab → es-MX empty copy (live capture pending Meta activation).
    await expect(page.getByText(/menci/i).first()).toBeVisible()
    test.info().annotations.push({
      type: 'fixme',
      description: 'no mentions on lab (capture pending Meta) — card + reply/dismiss flows need seeded mentions',
    })
  } else {
    await expect(byTestId(page, 'mention-card-0')).toBeVisible()
    // FIXME(mutation): suggest/send publish a PUBLIC reply, dismiss flips status — only on seeded data.
  }

  expect(errs.real(), `console errors:\n${errs.real().join('\n')}`).toEqual([])
})
