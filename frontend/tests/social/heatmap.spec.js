// Best-time heatmap (B2), inside the Métricas view. Testids: social-heatmap (root),
// heatmap-cell-{wd}-{h} (wd 0=lun..6, h 0-23), fb-only-badge. Grid renders a cell for
// every wd×h (incl. empty) when data exists → ≤ 7×24; with zero posts the root shows the
// es-MX empty-state instead. Untrusted buckets get the .hm-cell--weak greyed/hatched class.

import { test, expect } from '@playwright/test'
import { gotoSocial, SEL, byTestId, collectErrors, shot } from './helpers.js'

test('heatmap: Métricas view — heatmap present, fb-only badge, cells ≤ 7×24 or empty-state', async ({ page }) => {
  const errs = collectErrors(page)
  await gotoSocial(page)
  await SEL.metricsTab(page).click()

  const heatmap = byTestId(page, 'social-heatmap')
  await expect(heatmap).toBeVisible({ timeout: 15_000 })
  await shot(page, 'heatmap')

  // FB is the only source today, so the "solo Facebook" badge is always shown.
  await expect(byTestId(page, 'fb-only-badge')).toBeVisible()

  const cells = page.locator('[data-testid^="heatmap-cell-"]')
  const n = await cells.count()
  if (n === 0) {
    // No insight rows in scope → the component's es-MX empty state, no grid, no legend.
    await expect(page.getByText('Aún no hay suficientes datos')).toBeVisible()
  } else {
    // Grid present → the low-confidence legend key ships with it (never color-alone).
    await expect(page.getByText('Datos insuficientes')).toBeVisible()
  }
  if (n > 0) {
    expect(n).toBeLessThanOrEqual(7 * 24) // full grid: one cell per weekday×hour
    // Greyed/hatched thin-data cells only exist when 0<n<min_n posts hit a bucket.
    if ((await page.locator('.hm-cell--weak').count()) === 0) {
      test.info().annotations.push({
        type: 'fixme',
        description: 'no untrusted buckets in lab data — .hm-cell--weak greyed class unverified',
      })
    }
  } else {
    // No posts at all → empty-state placeholder, no grid.
    await expect(page.getByText('Aún no hay suficientes datos de publicaciones')).toBeVisible()
    test.info().annotations.push({
      type: 'fixme',
      description: 'heatmap empty on lab — cell-count + greyed assertions need seeded published posts',
    })
  }

  expect(errs.real(), `console errors:\n${errs.real().join('\n')}`).toEqual([])
})
