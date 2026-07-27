// Shared helpers for the social e2e specs (W6 B5-prep). See playwright.config.js
// header for the harness contract. Nothing here hardcodes a URL or a secret.

import { expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const REQUIRED = ['CRM_BASE_URL', 'CRM_TEST_USER', 'CRM_TEST_PASSWORD']

export function env() {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing env var(s): ${missing.join(', ')} — see frontend/.env.example`)
  }
  return {
    base: process.env.CRM_BASE_URL,
    user: process.env.CRM_TEST_USER,
    password: process.env.CRM_TEST_PASSWORD,
  }
}

export const evidenceDir =
  process.env.W6_EVIDENCE_DIR || path.resolve(process.cwd(), 'test-results/evidence')

// Frappe's `sid` cookie is HttpOnly, so JS `document.cookie=` can't set it — the
// SERVER must. page.request shares the page context's cookie jar, so a login POST
// here lands the HttpOnly sid on the browser context; the next goto is authenticated.
export async function login(page) {
  const { base, user, password } = env()
  const res = await page.request.post(`${base}/api/method/login`, {
    form: { usr: user, pwd: password },
  })
  if (!res.ok()) {
    throw new Error(`login failed: HTTP ${res.status()} — check CRM_TEST_USER / CRM_TEST_PASSWORD`)
  }
  return res
}

// Log in, then land on the social calendar with the SPA actually mounted (the 429
// memory: an unmounted SPA leaves the title stuck on "Frappe CRM").
export async function gotoSocial(page) {
  await login(page)
  await page.goto('/crm/social', { waitUntil: 'domcontentloaded' })
  await expect(SEL.title(page)).toBeVisible({ timeout: 30_000 })
}

// Authenticated navigation to any CRM SPA route (evergreen/mentions live at /social/*).
export async function gotoAuthed(page, route = '/social') {
  await login(page)
  await page.goto(`/crm${route}`, { waitUntil: 'domcontentloaded' })
}

// data-testid locator shorthand.
export function byTestId(page, id) {
  return page.locator(`[data-testid="${id}"]`)
}

// Centralized, text/role-based selectors — resilient to the Wave B DOM churn.
// UPDATE HERE (one place) if the toolbar markup changes.
export const SEL = {
  title: (page) => page.getByText('Social', { exact: true }).first(),
  newPost: (page) => page.getByRole('button', { name: /Nueva publicación/ }),
  calendarTab: (page) => page.getByRole('button', { name: 'Calendario', exact: true }),
  metricsTab: (page) => page.getByRole('button', { name: 'Métricas', exact: true }),
  prevMonth: (page) => page.getByRole('button', { name: '‹' }),
  nextMonth: (page) => page.getByRole('button', { name: '›' }),
  // month label between the ‹ › buttons, e.g. "julio 2026" (capitalize + a 4-digit year)
  monthLabel: (page) => page.locator('span.capitalize').filter({ hasText: /\d{4}/ }).first(),
  // Mes/Semana/Lista sub-toggle (calView) — label is the button text
  calView: (page, label) => page.getByRole('button', { name: label, exact: true }),
  clearFilters: (page) => page.getByRole('button', { name: /Limpiar/ }),
}

// Console + page errors, minus the known-benign. B1's channelBadges now renders the A2
// {channel,status} dict properly, so the old "[object Object]" chip cosmetic is GONE and is
// no longer ignored — a reappearance is now a real failure. ResizeObserver loop is browser noise.
const IGNORE = [/ResizeObserver loop/]

export function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)))
  return {
    real: () => errors.filter((t) => !IGNORE.some((re) => re.test(t))),
    all: () => [...errors],
  }
}

// Named evidence screenshot → W6_EVIDENCE_DIR (returns the path written).
export async function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}
