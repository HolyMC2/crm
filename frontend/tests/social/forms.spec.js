// Forms: the page, the builder, and a live submission drill on the lab.
//
// Creates its own draft-free test form + a wait-only follow-up campaign (no send
// steps, so enrollment can never message anyone), submits the public page as a
// guest with UTM tags and the consent box ticked, then reads back what the CRM
// recorded. Screenshots go to W6_EVIDENCE_DIR (desktop + phone, light + dark).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { env, evidenceDir, login } from './helpers.js'

const RUN = Date.now().toString(36)
const state = {}

async function api(page, method, args = {}) {
  const res = await page.request.post(`/api/method/${method}`, { data: args })
  const body = await res.json()
  if (!res.ok())
    throw new Error(
      `${method}: ${res.status()} ${JSON.stringify(body).slice(0, 400)}`,
    )
  return body.message
}

async function snap(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  await page.screenshot({
    path: path.join(evidenceDir, `${name}.png`),
    fullPage: false,
  })
}

async function useTheme(page, theme) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
}

test.describe.configure({ mode: 'serial' })

test('set up a drill form and a wait-only campaign', async ({ page }) => {
  await login(page)
  // FORMS_E2E_FORM=<name> reuses an existing drill form (screenshots only)
  if (process.env.FORMS_E2E_FORM) {
    state.form = process.env.FORMS_E2E_FORM
    state.route = process.env.FORMS_E2E_FORM
    return
  }
  const me = env().user
  const campaign = await api(page, 'frappe.client.insert', {
    doc: {
      doctype: 'CRM Campaign',
      title: `Forms drill follow-up ${RUN}`,
      type: 'whatsapp',
      status: 'Active',
      enrollment_trigger: 'manual',
      steps: [{ step_type: 'wait', wait_hours: 720 }],
    },
  })
  state.campaign = campaign.name
  const created = await api(page, 'crm.api.form.create_form', {
    template: 'contact',
    title: `Contact us (drill ${RUN})`,
    route: `contact-drill-${RUN}`,
  })
  state.form = created.name
  state.route = created.route
  const cfg = await api(page, 'crm.api.form.get_form_config', {
    name: state.form,
  })
  await api(page, 'crm.api.form.save_form', {
    name: state.form,
    form: {
      ...cfg,
      published: 1,
      settings: {
        ...cfg.settings,
        assign_mode: 'user',
        assign_to: me,
        notify_users: ['Administrator'],
        campaign: state.campaign,
        consent_enabled: 1,
        consent_text:
          'Yes, send me offers and news from {business} on WhatsApp.',
      },
    },
  })
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(
    path.join(evidenceDir, 'drill-state.json'),
    JSON.stringify(state, null, 2),
  )
})

for (const theme of ['light', 'dark']) {
  test(`forms list + builder, desktop ${theme}`, async ({ page }) => {
    test.setTimeout(150_000) // five tabs on a busy lab
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, theme)
    await login(page)
    await page.goto('/crm/forms', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /Forms|Formularios/ }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(`/crm-form/${state.route}`).first(),
    ).toBeVisible()
    await snap(page, `forms-list-desktop-${theme}`)

    await page
      .getByRole('button', { name: /New form|Nuevo formulario/ })
      .click()
    await expect(
      page.getByText(/Pick a starting point|Elige un punto/),
    ).toBeVisible()
    await snap(page, `forms-new-desktop-${theme}`)
    await page.keyboard.press('Escape')

    for (const tab of ['questions', 'after', 'share', 'submissions']) {
      await page.goto(`/crm/forms/${state.form}?tab=${tab}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForTimeout(tab === 'share' ? 2500 : 1500)
      await snap(page, `builder-${tab}-desktop-${theme}`)
      if (tab === 'after' || tab === 'share') {
        // the channel sections sit below the fold
        await page.evaluate(() =>
          document
            .querySelectorAll('.overflow-y-auto')
            .forEach((el) => el.scrollTo(0, el.scrollHeight)),
        )
        await page.waitForTimeout(500)
        await snap(page, `builder-${tab}-bottom-desktop-${theme}`)
      }
    }
  })

  test(`forms on a phone, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await useTheme(page, theme)
    await login(page)
    await page.goto('/crm/forms', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText(`/crm-form/${state.route}`).first(),
    ).toBeVisible({
      timeout: 30_000,
    })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await snap(page, `forms-list-phone-${theme}`)
    await page.goto(`/crm/forms/${state.form}?tab=after`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(1500)
    await snap(page, `builder-after-phone-${theme}`)
    await page.getByRole('button', { name: /^Preview$|^Vista previa$/ }).click()
    await page.waitForTimeout(800)
    await snap(page, `builder-preview-phone-${theme}`)
  })
}

test('send a test from the builder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto(`/crm/forms/${state.form}?tab=questions`, {
    waitUntil: 'domcontentloaded',
  })
  const preview = page.locator('aside')
  await preview
    .locator('#pv-first_name input, input#pv-first_name')
    .first()
    .fill('Test Visitor')
  await preview
    .locator('#pv-mobile_no input, input#pv-mobile_no')
    .first()
    .fill('5550009999')
  await preview.locator('textarea').first().fill('Checking the form works')
  await preview
    .getByRole('button', { name: /Send a test|Enviar una prueba/ })
    .click()
  await expect(
    page.getByText(/Everything above was undone|Todo lo anterior se deshizo/),
  ).toBeVisible({ timeout: 30_000 })
  await snap(page, 'builder-test-run-desktop-light')
})

test('guest submits the public page with UTM tags and consent', async ({
  browser,
}) => {
  const { base } = env()
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await ctx.newPage()
  await page.goto(
    `${base}/crm-form/${state.route}?utm_source=instagram&utm_medium=social&utm_campaign=forms-drill`,
    { waitUntil: 'domcontentloaded' },
  )
  await snap(page, 'public-form-phone')
  await page.fill('#first_name', `Drill Guest ${RUN}`)
  await page.fill('#mobile_no', '5550001234')
  await page.fill('#email', `forms-drill-${RUN}@example.invalid`)
  await page.fill('#crm_form_message', 'I need a quote for a screen repair')
  await page.check('#crm-consent')
  await page.click('#submit-btn')
  await expect(page.locator('#success-view')).toBeVisible({ timeout: 30_000 })
  await snap(page, 'public-form-success-phone')
  await ctx.close()
})

test('the CRM recorded everything the form promised', async ({ page }) => {
  await login(page)
  const subs = await api(page, 'crm.api.form.get_form_submissions', {
    name: state.form,
  })
  const lead = subs.rows.find((r) => r.title.includes(`Drill Guest ${RUN}`))
  expect(lead, 'lead created').toBeTruthy()
  const doc = await api(page, 'frappe.client.get', {
    doctype: 'CRM Lead',
    name: lead.name,
  })
  const q = (doctype, filters, fields = ['name']) =>
    api(page, 'frappe.client.get_list', {
      doctype,
      filters,
      fields,
      limit_page_length: 50,
    })
  const evidence = {
    lead: {
      name: doc.name,
      source: doc.source,
      crm_web_form: doc.crm_web_form,
      lead_owner: doc.lead_owner,
      utm_source: doc.utm_source,
      utm_medium: doc.utm_medium,
      utm_campaign: doc.utm_campaign,
      crm_form_message: doc.crm_form_message,
      status: doc.status,
    },
    todos: await q(
      'ToDo',
      { reference_type: 'CRM Lead', reference_name: doc.name },
      ['allocated_to', 'status'],
    ),
    notifications: await q(
      'CRM Notification',
      { notification_type_doc: doc.name },
      ['to_user', 'type', 'from_user'],
    ),
    comments: await q(
      'Comment',
      {
        reference_doctype: 'CRM Lead',
        reference_name: doc.name,
        comment_type: 'Info',
      },
      ['content'],
    ),
    enrollments: await q('CRM Campaign Enrollment', { lead: doc.name }, [
      'campaign',
      'status',
      'current_step',
    ]),
    touchpoints: await q('CRM Touchpoint', { reference_name: doc.name }, [
      'event',
      'channel',
      'utm_source',
      'utm_medium',
      'utm_campaign',
    ]),
    consent: await q(
      'Marketing Consent Log',
      { source_form: `crm-form:${state.route}` },
      ['action', 'channel', 'consent_class', 'consent_text'],
    ),
    send_logs_for_campaign: await q(
      'Marketing Send Log',
      { campaign: state.campaign },
      ['name', 'status'],
    ),
    stats: subs.stats,
  }
  fs.writeFileSync(
    path.join(evidenceDir, 'drill-evidence.json'),
    JSON.stringify(evidence, null, 2),
  )
  expect(evidence.lead.crm_web_form).toBe(state.form)
  expect(evidence.lead.source).toBe('Web Form')
  expect(evidence.lead.lead_owner).toBe(env().user)
  expect(evidence.enrollments.some((e) => e.campaign === state.campaign)).toBe(
    true,
  )
  expect(evidence.send_logs_for_campaign).toHaveLength(0)
})

test('close the drill campaign', async ({ page }) => {
  await login(page)
  await api(page, 'frappe.client.set_value', {
    doctype: 'CRM Campaign',
    name: state.campaign,
    fieldname: 'status',
    value: 'Completed',
  })
})

// FORMS_E2E_DESK_FORM=<name>: screenshots of a Web Form made in Desk (read-only
// state + clean-copy action). The form itself is never changed.
test('a form made outside the builder', async ({ page }) => {
  test.skip(!process.env.FORMS_E2E_DESK_FORM, 'no Desk-made form given')
  const name = process.env.FORMS_E2E_DESK_FORM
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, theme)
    await login(page)
    await page.goto('/crm/forms', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.evaluate(() =>
      document
        .querySelectorAll('.overflow-y-auto')
        .forEach((el) => el.scrollTo(0, el.scrollHeight)),
    )
    await snap(page, `forms-list-desk-form-${theme}`)
    await page.goto(`/crm/forms/${name}`, { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('button', {
        name: /Duplicate as a clean form|Duplicar como formulario limpio/,
      }),
    ).toBeVisible({ timeout: 30_000 })
    await snap(page, `builder-desk-form-desktop-${theme}`)
  }
})
