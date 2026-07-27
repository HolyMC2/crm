// =============================================================================
// Playwright e2e harness — CRM SPA "social" surface (W6 B5-prep foundation)
// =============================================================================
// This is the shared harness Wave B spec-writers build on. It runs the built SPA
// LIVE (lab), it does not mock. Read this header before adding a spec.
//
// HOW WAVE B ADDS SPECS
//   • Drop `tests/social/<feature>.spec.js`. Import the shared helpers:
//       import { gotoSocial, SEL, collectErrors, shot } from './helpers.js'
//     `gotoSocial(page)` logs in + lands on /crm/social with the SPA mounted.
//     `SEL` centralizes text/role selectors — if the toolbar DOM changes during a
//     B wave, fix the selector THERE (one place), not in every spec.
//     `collectErrors(page)` returns {real(), all()} — assert `real()` is empty.
//     `shot(page, name)` writes an evidence PNG (see W6_EVIDENCE_DIR).
//   • Do NOT assert channel-chip TEXT: A2's channels string→dict change renders a
//     chip as "[object Object]" until a B builder fixes the UI; helpers already
//     ignore that one string in the console-error filter.
//
// THROTTLE RULE (429 trap — non-negotiable)
//   The lab proxy api_zone is 60 r/s burst=60 nodelay. A cold SPA load + the
//   workbox service worker precaching ~70 assets in one burst overflows it → 429 →
//   a failed dynamic import → the page never mounts (and the SW caches the 429s).
//   Mitigations baked in here: workers:1 (never parallel), fullyParallel:false, and
//   serviceWorkers:'block' (no precache burst). Keep them. Don't add parallelism.
//
// ENV CONTRACT (values NEVER hardcoded/committed — see .env.example, names only)
//   CRM_BASE_URL      https URL of the CRM host under test (baseURL; e.g. lab root)
//   CRM_TEST_USER     Frappe login with CRM + social access
//   CRM_TEST_PASSWORD that user's password (a throwaway on lab)
//   W6_EVIDENCE_DIR   optional; where shot() writes PNGs (default test-results/evidence)
// Provide them via shell export or a gitignored .env. Frappe's `sid` is HttpOnly, so
// helpers log in server-side (page.request) — JS cookie injection can't set it.
// =============================================================================

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/social',
  // Only *.spec.js here — keeps Playwright off the vitest *.test.js unit suite.
  testMatch: /.*\.spec\.js$/,
  fullyParallel: false, // 429 trap — never burst the proxy
  workers: 1, //           one browser at a time, period
  forbidOnly: !!process.env.CI,
  retries: 1, // absorb a single transient lab hiccup; a real break still fails twice
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.CRM_BASE_URL,
    ignoreHTTPSErrors: true, // lab serves a self-signed cert
    serviceWorkers: 'block', // stop the workbox precache burst (429 root cause)
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
