import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, KeepAlive, nextTick, ref } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))
vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return { activeSettingsPage: ref('Effective configuration') }
})
import EffectiveSettings from '@/components/Settings/EffectiveSettings.vue'
import { activeSettingsPage } from '@/composables/settings'
const source = (doctype, name, editor = null) => ({
  doctype,
  name,
  url: `/app/${doctype.toLowerCase().replaceAll(' ', '-')}/${encodeURIComponent(name)}`,
  editor,
  can_write: true,
})
const scalar = (doctype, name, values, editor = null) => ({
  state: 'configured',
  values,
  source: source(doctype, name, editor),
})
function response() {
  return {
    scope: { company: null, pipeline: null },
    choices: {
      state: 'configured',
      pipelines: [{ name: 'PIPE-A', label: 'Retail', company: 'Company A' }],
      truncated: false,
    },
    sections: {
      pipeline: {
        ...scalar(
          'CRM Pipeline',
          'PIPE-A',
          {
            label: 'Retail',
            company: 'Company A',
            currency: 'USD',
            probability_policy: 'Manual',
            roles: ['Sales Manager'],
            default: {
              state: 'configured',
              label: 'Retail',
              company: 'Company A',
              reason: 'explicit_default',
            },
          },
          'Sales pipelines',
        ),
        items: [
          {
            status: 'Qualified',
            type: 'Open',
            probability: 25,
            has_entry_requirements: true,
          },
        ],
      },
      site_timezone: scalar('System Settings', 'System Settings', {
        time_zone: 'America/Mazatlan',
        effective_timezone: 'America/Mazatlan',
        uses_framework_fallback: false,
      }),
      personal_timezone: scalar(
        'User',
        'manager@example.invalid',
        {
          time_zone: 'Europe/Madrid',
          effective_timezone: 'Europe/Madrid',
          inherits_site: false,
        },
        'Preferences',
      ),
      crm_currency: scalar(
        'FCRM Settings',
        'FCRM Settings',
        { currency: 'MXN' },
        'Dashboard',
      ),
      hierarchy: scalar(
        'FCRM Settings',
        'FCRM Settings',
        { enable_sales_hierarchy: 1 },
        'Sales Hierarchy',
      ),
      system_defaults: scalar(
        'System Settings',
        'System Settings',
        { currency: 'USD', date_format: 'dd-mm-yyyy', time_format: 'HH:mm' },
        'Defaults',
      ),
      slas: {
        state: 'configured',
        applicability: 'record_conditions_required',
        items: [
          {
            name: 'Business response',
            document_type: 'CRM Deal',
            enabled: true,
            default: true,
            conditional: true,
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            hours: [{ day: 'Monday', start: '09:00:00', end: '17:00:00' }],
            source: source(
              'CRM Service Level Agreement',
              'SLA-A',
              'SLA Policies',
            ),
            holiday: {
              ...scalar('CRM Holiday List', 'Holidays A', {
                from_date: '2026-01-01',
                to_date: '2026-12-31',
              }),
              items: [{ date: '2026-12-25', weekly_off: false }],
              truncated: false,
            },
          },
        ],
        warnings: [],
        truncated: false,
      },
      assignment: {
        state: 'configured',
        applicability: 'record_conditions_required',
        items: [
          {
            name: 'Deal routing',
            document_type: 'CRM Deal',
            enabled: true,
            priority: 3,
            method: 'Round Robin',
            conditional: true,
            weekdays: ['Tuesday'],
            source: source(
              'Assignment Rule',
              'Deal routing',
              'Assignment Rules',
            ),
          },
        ],
        warnings: [],
        truncated: false,
      },
    },
  }
}
const cleanups = []
beforeEach(() => {
  api.call.mockReset()
  activeSettingsPage.value = 'Effective configuration'
})
afterEach(() => cleanups.splice(0).forEach((fn) => fn()))
async function flush() {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(data = response(), implementation) {
  api.call.mockImplementation(
    implementation || (() => Promise.resolve(structuredClone(data))),
  )
  const el = document.createElement('div')
  document.body.append(el)
  const shown = ref(true)
  const app = createApp({
    render: () =>
      h(KeepAlive, null, {
        default: () =>
          shown.value ? h(EffectiveSettings) : h('div', 'Other editor'),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, shown }
}
function button(el, label) {
  return [...el.querySelectorAll('button')].find((item) =>
    item.textContent.includes(label),
  )
}
async function input(el, value, event = 'input') {
  el.value = value
  el.dispatchEvent(new Event(event, { bubbles: true }))
  await flush()
}
async function review(el) {
  el.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
  await flush()
}
describe('effective configuration (synthetic permissioned DTOs)', () => {
  it('reads saved sources only and distinguishes timezone, currency and independent schedules', async () => {
    const { el } = await mount()
    expect(api.call.mock.calls).toEqual([
      [
        'crm.api.effective_settings.get_effective_settings',
        { pipeline: null, company: null },
      ],
    ])
    for (const text of [
      'America/Mazatlan',
      'Europe/Madrid',
      'CRM reporting currency',
      'System currency setting',
      'Monday: 09:00:00 — 17:00:00',
      'Tuesday',
      '2026-12-25',
      'not a schedule selected for this pipeline',
      'do not inherit SLA working hours',
    ])
      expect(el.textContent).toContain(text)
    expect(
      el.querySelector('a[href="/app/crm-holiday-list/Holidays%20A"]'),
    ).toBeTruthy()
    expect(el.textContent).toContain(
      'Explicit deal probabilities are preserved',
    )
  })
  it('reviews an explicitly chosen scope without assuming a candidate rule matches it', async () => {
    const { el } = await mount()
    await input(el.querySelector('input[list]'), 'Company A')
    await input(el.querySelector('select'), 'PIPE-A', 'change')
    expect(api.call).toHaveBeenCalledTimes(1)
    await review(el)
    expect(api.call.mock.calls[1][1]).toEqual({
      pipeline: 'PIPE-A',
      company: 'Company A',
    })
    expect(el.textContent).toContain('Record conditions apply')
    expect(el.textContent).toContain('native applicability still decides')
  })
  it('keeps missing, denied and unavailable sources distinct without fallback values', async () => {
    const data = response()
    data.sections.pipeline = { state: 'not_configured' }
    data.sections.site_timezone = { state: 'denied' }
    data.sections.personal_timezone = {
      state: 'not_configured',
      values: {
        time_zone: null,
        effective_timezone: null,
        inherits_site: true,
      },
      source: source('User', 'Manager', 'Preferences'),
    }
    data.sections.crm_currency = { state: 'unavailable' }
    const { el } = await mount(data)
    expect(el.textContent).toContain('No readable configuration is saved')
    expect(el.textContent).toContain('permissions do not allow reading')
    expect(el.textContent).toContain('source could not be read')
    expect(el.textContent).toContain('Site timezone is not readable')
    expect(el.textContent).not.toContain('Asia/Kolkata')
    expect(el.textContent).not.toContain('America/Mazatlan')
  })
  it('retains selection after a failed request and retries without showing it as empty configuration', async () => {
    let failing = false
    const { el } = await mount(response(), () =>
      failing
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(response()),
    )
    await input(el.querySelector('input[list]'), 'Company A')
    failing = true
    await review(el)
    expect(el.textContent).toContain('selection is preserved')
    expect(el.querySelector('input[list]').value).toBe('Company A')
    expect(el.textContent).toContain('Retail')
    failing = false
    await review(el)
    expect(el.textContent).not.toContain('selection is preserved')
    expect(api.call.mock.calls.at(-1)[1].company).toBe('Company A')
  })
  it('routes to canonical settings editors without mutating sources or accepting external links', async () => {
    const data = response()
    data.sections.pipeline.source.url = 'https://other.example/settings'
    data.sections.slas.items[0].name = '<script>bad()</script>'
    const { el } = await mount(data)
    button(el, 'Open Sales pipelines').click()
    await flush()
    expect(activeSettingsPage.value).toBe('Sales pipelines')
    expect(el.querySelector('a[href^="https:"]')).toBeNull()
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('<script>bad()</script>')
    expect(api.call).toHaveBeenCalledTimes(1)
  })
  it('shows partial and bounded lists and preserves native no-weekday restriction semantics', async () => {
    const data = response()
    data.choices.truncated = true
    data.sections.slas.warnings = ['denied']
    data.sections.slas.items[0].holiday.truncated = true
    data.sections.assignment.truncated = true
    data.sections.assignment.items[0].weekdays = []
    const { el } = await mount(data)
    expect(el.textContent).toContain('pipeline list is limited')
    expect(el.textContent).toContain('policy summary is incomplete')
    expect(el.textContent).toContain('first 100 dates')
    expect(el.textContent).toContain('assignment summary is incomplete')
    expect(el.textContent).toContain('No weekday restriction')
  })
  it('refreshes saved sources when returning from an editor while retaining the selected scope', async () => {
    const { el, shown } = await mount()
    await input(el.querySelector('input[list]'), 'Company A')
    shown.value = false
    await flush()
    shown.value = true
    await flush()
    expect(api.call).toHaveBeenCalledTimes(2)
    expect(api.call.mock.calls[1][1].company).toBe('Company A')
    expect(el.querySelector('input[list]').value).toBe('Company A')
  })
  it('reports top-level scope denial separately and refuses an incomplete DTO', async () => {
    const { el } = await mount(null, () =>
      Promise.reject({ exc_type: 'PermissionError' }),
    )
    expect(el.textContent).toContain('cannot review this configuration scope')
    api.call.mockResolvedValue({ scope: {}, choices: {}, sections: {} })
    await review(el)
    expect(el.textContent).toContain('Configuration could not be loaded')
    expect(el.textContent).not.toContain('No readable configuration is saved')
  })
})
