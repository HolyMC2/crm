// Composer dialog (B3). Testids: first-comment-input (parent), variants-open /
// variant-card-{i} / variant-pick-{i} (VariantsPanel, managers only), suggest-time-open /
// suggest-option-{i} (SuggestTimeButton), alt-text-input-{i} (MediaEditor, per media row).
// We assert STRUCTURE without generating (AI may be off) and without leaving residue —
// the composer is opened but never saved/submitted.

import { test, expect } from '@playwright/test'
import { gotoSocial, SEL, byTestId, collectErrors, shot } from './helpers.js'

test('composer: first-comment + variants knobs + suggest-time render (no generate, no save)', async ({ page }) => {
  const errs = collectErrors(page)
  await gotoSocial(page)
  await SEL.newPost(page).click()

  // Parent dialog: first-comment textarea is present for both new and edit.
  await expect(byTestId(page, 'first-comment-input')).toBeVisible({ timeout: 10_000 })
  await shot(page, 'composer-new')

  // Variants panel is manager-only; on an UNSAVED post generate is disabled + a hint shows.
  const variantsOpen = byTestId(page, 'variants-open')
  if (await variantsOpen.count()) {
    await variantsOpen.click()
    for (const knob of ['Casual', 'Neutral', 'Formal', 'Corto', 'Medio', 'Largo']) {
      await expect(page.getByRole('button', { name: knob, exact: true })).toBeVisible()
    }
    // Unsaved → the "save first" hint is shown and generate is disabled. Do NOT generate.
    await expect(page.getByText('Guarda el borrador primero para generar variantes.')).toBeVisible()
    await shot(page, 'composer-variants')
    // FIXME(data/AI): real generate + variant-pick-{i} needs a saved post AND AI enabled.
  } else {
    test.info().annotations.push({
      type: 'fixme',
      description: 'variants-open absent → test user is not a manager; needs manager creds',
    })
  }

  // Suggest-time popover: ≤3 heuristic slots (suggest_time is AI-independent). Read-only.
  const suggestOpen = byTestId(page, 'suggest-time-open')
  if (await suggestOpen.count()) {
    await suggestOpen.click()
    const opt0 = byTestId(page, 'suggest-option-0')
    if (await opt0.count()) {
      await expect(opt0).toBeVisible()
    } else {
      test.info().annotations.push({
        type: 'fixme',
        description: 'suggest_time returned no slots (thin FB data) — options unverified',
      })
    }
  }

  // FIXME(data): alt-text-input-{i} only exists on a post WITH media — assert after
  // openEdit on an existing post that has photos (needs seeded media; skip to avoid residue).

  expect(errs.real(), `console errors:\n${errs.real().join('\n')}`).toEqual([])
})
