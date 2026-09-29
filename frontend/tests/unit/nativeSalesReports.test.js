import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  AxisChart: {
    props: ['config', 'events'],
    setup: (props) => () =>
      h('button', {
        'data-chart': 'axis',
        onClick: () => props.events?.click({ dataIndex: 0 }),
      }),
  },
}))
vi.mock('@/utils/crmCapabilities', () => ({ addonAvailable: ref(false) }))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: {
    props: {
      doctype: { type: String, default: '' },
      modelValue: { type: String, default: '' },
      label: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-doctype': props.doctype,
          'aria-label': props.label,
          value: props.modelValue,
          onInput: (event) => emit('update:modelValue', event.target.value),
        })
    },
  },
}))
import Reports from '@/pages/Reports.vue'
import Return from '@/components/SalesQueueReturn.vue'
import { safeQueueReturn } from '@/utils/salesQueueContext'
import { addonAvailable } from '@/utils/crmCapabilities'
const filters = {
  from_date: '2026-09-01',
  to_date: '2026-09-26',
  owner: '',
  pipeline: '',
  company: '',
}
function report(extra = {}) {
  return {
    filters,
    date_basis: 'creation',
    as_of: '2026-09-26 12:00:00',
    timezone: 'America/Mazatlan',
    currency: 'USD',
    amounts_available: true,
    summary: {
      leads: 4,
      converted_leads: 2,
      conversion_percent: 50,
      deals: 3,
      won: 1,
      lost: 0,
      closed_win_percent: 100,
      open_expected_value: 100,
      weighted_forecast: 50,
      won_value: 20,
    },
    sources: [{ source: '', leads: 4, converted_leads: 2, deals: 3, won: 1 }],
    stages: [
      {
        pipeline: 'Retail',
        status: 'Qualified',
        type: 'Open',
        count: 2,
        average_age_days: 4,
        approximate_count: 1,
      },
    ],
    owners: [
      {
        owner: '',
        leads: 2,
        deals: 1,
        open_tasks: 3,
        overdue_tasks: 2,
        undated_tasks: 1,
      },
    ],
    definitions: {
      conversion:
        'Converted visible leads / all visible leads in the lead creation cohort.',
    },
    ...extra,
  }
}
const cleanups = []
beforeEach(() => {
  api.call.mockReset()
  addonAvailable.value = false
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
})
async function flush() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount({ query = '', behavior } = {}) {
  api.call.mockImplementation((method, args) => {
    if (behavior) {
      const result = behavior(method, args)
      if (result !== undefined) return result
    }
    if (method.endsWith('get_report'))
      return Promise.resolve(
        report({ filters: { ...filters, ...args.filters } }),
      )
    if (method.endsWith('get_records'))
      return Promise.resolve({
        items: [],
        total: 0,
        has_more: false,
        next_offset: 0,
      })
    throw new Error(`Unexpected API ${method}`)
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reports', name: 'Reports', component: Reports },
      { path: '/deals/:dealId', name: 'Deal', component: Return },
      { path: '/leads/:leadId', name: 'Lead', component: Return },
    ],
  })
  await router.push(`/reports${query}`)
  await router.isReady()
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(RouterView) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, router }
}
const calls = (method) =>
  api.call.mock.calls.filter(([name]) => name.endsWith(method))
function button(el, text) {
  return [...el.querySelectorAll('button')].find((node) =>
    node.textContent.includes(text),
  )
}
async function click(el, text) {
  const node = button(el, text)
  expect(node, text).toBeTruthy()
  node.click()
  await flush()
}

describe('standalone sales reporting', () => {
  it('loads native metrics without any addon calls and states its denominators', async () => {
    const { el } = await mount()
    expect(calls('get_report')).toHaveLength(2)
    expect(el.querySelector('[data-doctype="CRM Pipeline"]')).toBeTruthy()
    expect(el.querySelector('[data-doctype="CRM Sales Pipeline"]')).toBeNull()
    expect(
      api.call.mock.calls.every(([method]) =>
        method.startsWith('crm.api.sales_reports.'),
      ),
    ).toBe(true)
    expect(button(el, 'Marketing')).toBeUndefined()
    expect(el.textContent).toContain('Won / (Won + Lost) deals')
    expect(el.textContent).toContain('Task dates do not define this cohort')
    expect(el.textContent).toContain('America/Mazatlan')
  })
  it('does not load optional marketing metrics until selected even with the addon', async () => {
    addonAvailable.value = true
    const { el } = await mount()
    expect(button(el, 'Marketing')).toBeTruthy()
    expect(
      api.call.mock.calls.every(([method]) =>
        method.startsWith('crm.api.sales_reports.'),
      ),
    ).toBe(true)
  })
  it('does not reload sales when its active tab is recorded in the canonical URL', async () => {
    addonAvailable.value = true
    const { el, router } = await mount()
    expect(router.currentRoute.value.query.from_date).toBeTruthy()
    expect(router.currentRoute.value.query.to_date).toBeTruthy()
    expect(calls('get_report')).toHaveLength(2)
    const nav = el.querySelector('nav[aria-label="Report area"]')
    await click(nav, 'Sales')
    expect(router.currentRoute.value.query.tab).toBe('sales')
    expect(calls('get_report')).toHaveLength(2)
    router.back()
    await flush()
    expect(calls('get_report')).toHaveLength(2)
  })
  it('loads the equal-length prior creation cohort with the same scope', async () => {
    await mount({
      query:
        '?from_date=2026-09-01&to_date=2026-09-26&owner=seller%40example.test&pipeline=Retail&company=Example',
    })
    expect(calls('get_report')).toHaveLength(2)
    expect(calls('get_report')[1][1].filters).toMatchObject({
      from_date: '2026-08-06',
      to_date: '2026-08-31',
      owner: 'seller@example.test',
      pipeline: 'Retail',
      company: 'Example',
    })
  })
  it('keeps current results when comparison fails and retries only comparison', async () => {
    let failComparison = true
    const { el } = await mount({
      query: '?from_date=2026-09-01&to_date=2026-09-26',
      behavior: (method, args) =>
        method.endsWith('get_report') &&
        args.filters.from_date === '2026-08-06' &&
        failComparison
          ? Promise.reject(new Error('Comparison unavailable'))
          : undefined,
    })
    expect(el.textContent).toContain('Current results are still shown')
    expect(el.textContent).toContain('Lead conversion')
    expect(el.querySelectorAll('[data-chart="axis"]')).toHaveLength(3)
    failComparison = false
    await click(el, 'Retry comparison')
    expect(calls('get_report')).toHaveLength(3)
    expect(calls('get_report')[2][1].filters.from_date).toBe('2026-08-06')
    expect(el.textContent).not.toContain('Current results are still shown')
  })
  it.each([
    [
      'Where are deals waiting?',
      'deals',
      { pipeline: 'Retail', status: 'Qualified' },
    ],
    [
      'Who needs follow-up help?',
      'tasks',
      { owner: '', task_state: 'overdue' },
    ],
    ['Which sources bring wins?', 'deals', { source: '', outcome: 'Won' }],
  ])(
    'drills from chart %s into its exact underlying bucket',
    async (title, kind, bucket) => {
      const { el, router } = await mount({
        query: '?owner=seller%40example.test',
      })
      el.querySelector(
        `section[aria-label="${title}"] [data-chart="axis"]`,
      ).click()
      await flush()
      expect(calls('get_records')[0][1]).toMatchObject({
        kind,
        bucket,
        filters: { owner: 'seller@example.test' },
      })
      expect(calls('get_report')).toHaveLength(2)
      router.back()
      await flush()
      expect(el.querySelector('#report-records-heading')).toBeNull()
      expect(calls('get_report')).toHaveLength(2)
    },
  )
  it('closes the record drawer through Back to report while preserving applied scope', async () => {
    const { el, router } = await mount({
      query:
        '?period=custom&from_date=2026-09-01&to_date=2026-09-26&owner=seller%40example.test&pipeline=Retail&company=Example',
    })
    const initialQuery = { ...router.currentRoute.value.query }
    await click(el, 'Converted leads')
    expect(el.querySelector('#report-records-heading')).toBeTruthy()
    await click(el, 'Back to report')
    expect(el.querySelector('#report-records-heading')).toBeNull()
    expect(router.currentRoute.value.query).toEqual(initialQuery)
    expect(calls('get_report')).toHaveLength(2)
  })
  it('distinguishes a denied report from an empty cohort and permits retry', async () => {
    let denied = true
    const { el } = await mount({
      behavior: (method) =>
        method.endsWith('get_report') && denied
          ? Promise.reject({ exc_type: 'PermissionError' })
          : undefined,
    })
    expect(el.textContent).toContain('do not have permission')
    expect(el.textContent).not.toContain('Lead conversion')
    denied = false
    await click(el, 'Retry report')
    expect(el.textContent).toContain('Lead conversion')
  })
  it('preserves exact empty-source bucket and applied filters in paged drilldowns', async () => {
    const { el } = await mount({
      query: '?pipeline=Retail&owner=owner%40example.test',
      behavior: (method, args) =>
        method.endsWith('get_records')
          ? Promise.resolve({
              items: [{ name: `LEAD-${args.offset}`, lead_name: 'Client A' }],
              total: 2,
              has_more: args.offset === 0,
              next_offset: 1,
            })
          : undefined,
    })
    const sources = el.querySelector('section[aria-label="Sources"]')
    await click(sources, 'Leads')
    expect(calls('get_records')[0][1]).toMatchObject({
      kind: 'leads',
      bucket: { source: '' },
      filters: { pipeline: 'Retail', owner: 'owner@example.test' },
      offset: 0,
    })
    await click(el, 'Load more records')
    expect(calls('get_records')[1][1]).toMatchObject({
      bucket: { source: '' },
      offset: 1,
    })
    expect(el.querySelectorAll('#report-records-heading')).toHaveLength(1)
    expect(el.textContent).toContain('2 matching records')
  })
  it('returns from the native record to the exact report drawer and filters', async () => {
    const { el, router } = await mount({
      query: '?pipeline=Retail',
      behavior: (method) =>
        method.endsWith('get_records')
          ? Promise.resolve({
              items: [{ name: 'LEAD-1', lead_name: 'Client A' }],
              total: 1,
              has_more: false,
            })
          : undefined,
    })
    await click(el, 'Converted leads')
    const origin = router.currentRoute.value.fullPath
    el.querySelector('a[href^="/leads/"]').click()
    await flush()
    expect(router.currentRoute.value.query.returnTo).toBe(origin)
    expect(el.textContent).toContain('Return to report')
    el.querySelector('a').click()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe(origin)
    expect(el.querySelector('#report-records-heading')).toBeTruthy()
  })
  it('shows unavailable amounts, missing FX and truncated grouping honestly', async () => {
    const { el } = await mount({
      behavior: (method) =>
        method.endsWith('get_report')
          ? Promise.resolve(
              report({
                amounts_available: false,
                groups_truncated: true,
                summary: {
                  leads: 0,
                  converted_leads: 0,
                  conversion_percent: null,
                  deals: 0,
                  won: 0,
                  lost: 0,
                  closed_win_percent: null,
                  missing_exchange_rate_count: 2,
                },
              }),
            )
          : undefined,
    })
    expect(el.textContent).toContain('Amounts are unavailable')
    expect(el.textContent).toContain('Only the first 500 groups')
    expect(el.textContent).toContain('2 deals have no usable exchange rate')
    expect(el.textContent).not.toContain('0%')
  })
  it('drills into unassigned overdue tasks without inventing an owner identity', async () => {
    const { el } = await mount({
      behavior: (method) =>
        method.endsWith('get_records')
          ? Promise.resolve({
              items: [
                {
                  name: '12',
                  title: 'Call customer',
                  status: 'Todo',
                  reference_doctype: 'CRM Deal',
                  reference_docname: 'DEAL-1',
                },
              ],
              total: 1,
              has_more: false,
            })
          : undefined,
    })
    await click(el, 'Overdue')
    expect(calls('get_records')[0][1]).toMatchObject({
      kind: 'tasks',
      bucket: { owner: '', task_state: 'overdue' },
    })
    expect(el.querySelector('a[href="/app/crm-task/12"]')).toBeTruthy()
    expect(el.textContent).toContain('Open related record')
  })
  it('ignores late report responses after filters change', async () => {
    let resolveOld
    const { el, router } = await mount({
      behavior: (method, args) =>
        method.endsWith('get_report') && !args.filters.pipeline
          ? new Promise((resolve) => {
              resolveOld = resolve
            })
          : undefined,
    })
    await router.replace({ query: { pipeline: 'Retail' } })
    await flush()
    resolveOld(report({ timezone: 'Wrong late timezone' }))
    await flush()
    expect(el.textContent).not.toContain('Wrong late timezone')
    expect(calls('get_report').at(-1)[1].filters.pipeline).toBe('Retail')
  })
})

describe('report return boundaries', () => {
  it('accepts only the exact local report path plus its query or fragment', () => {
    for (const value of [
      '/reports',
      '/reports?pipeline=Retail&drill_bucket=%7B%7D',
      '/reports#records',
    ])
      expect(safeQueueReturn(value)).toBe(value)
    for (const value of [
      '//evil.test/reports',
      'https://evil.test/reports',
      '/reports/record',
      '/reports\\evil',
      '/reports-other',
      '/report',
      '/reports\n',
    ])
      expect(safeQueueReturn(value)).toBe('')
  })
})

describe('shared report filters', () => {
  async function setInput(el, selector, value) {
    const input = el.querySelector(selector)
    expect(input, selector).toBeTruthy()
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
  }

  it('coalesces filter edits into one navigable change and removes the old drill', async () => {
    vi.useFakeTimers()
    const { el, router } = await mount({
      query:
        '?from_date=2026-09-01&to_date=2026-09-28&drill_kind=leads&drill_bucket=%7B%7D',
    })
    const initialCalls = calls('get_report').length
    await setInput(el, '[data-doctype="User"]', 's')
    await vi.advanceTimersByTimeAsync(200)
    await setInput(el, '[data-doctype="User"]', 'seller@example.test')
    await vi.advanceTimersByTimeAsync(349)
    expect(router.currentRoute.value.query.owner).toBeUndefined()
    expect(calls('get_report')).toHaveLength(initialCalls)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(router.currentRoute.value.query.owner).toBe('seller@example.test')
    expect(router.currentRoute.value.query.drill_kind).toBeUndefined()
    expect(calls('get_report')).toHaveLength(initialCalls + 2)
    router.back()
    await flush()
    expect(router.currentRoute.value.query.owner).toBeUndefined()
    expect(router.currentRoute.value.query.drill_kind).toBe('leads')
    expect(el.querySelector('[data-doctype="User"]').value).toBe('')
  })

  it('cancels an unsaved filter edit when browser Back restores another cohort', async () => {
    vi.useFakeTimers()
    const { el, router } = await mount({ query: '?pipeline=Original' })
    await setInput(el, '[data-doctype="CRM Pipeline"]', 'Retail')
    await vi.advanceTimersByTimeAsync(350)
    await flush()
    expect(router.currentRoute.value.query.pipeline).toBe('Retail')
    await setInput(el, '[data-doctype="CRM Pipeline"]', 'Unapplied')
    router.back()
    await flush()
    expect(router.currentRoute.value.query.pipeline).toBe('Original')
    expect(el.querySelector('[data-doctype="CRM Pipeline"]').value).toBe(
      'Original',
    )
    const restoredCalls = calls('get_report').length
    await vi.advanceTimersByTimeAsync(500)
    await flush()
    expect(router.currentRoute.value.query.pipeline).toBe('Original')
    expect(calls('get_report')).toHaveLength(restoredCalls)
  })
})
