// Cobranza list and customer record mounted with the real pages and a debt in
// two currencies: totals in the company currency with the dollar part named,
// dollar amounts in dollars with their peso value, and no raw ISO date.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  route: null,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({
    name: 'Cobranza',
    params: {},
    query: {},
    fullPath: '/cobranza',
  })
  return { useRoute: () => state.route, useRouter: () => state.router }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  const labelled = (tag) => ({
    props: ['label', 'theme', 'variant', 'loading', 'disabled'],
    setup: (props) => () => h(tag, props.label),
  })
  return {
    Badge: labelled('span'),
    Button: labelled('button'),
    Dialog: { render: () => null },
    FeatherIcon: { render: () => null },
    FormControl: { render: () => null },
    toast: { success: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/components/shell/ModuleLayout.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}))
vi.mock('@/components/cobranza/CobranzaSendSheet.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/useCobranza', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    cobranzaApi: (...args) => state.api(...args),
    loadCobranzaBoot: async () =>
      (actual.cobranzaBoot.value = { enabled: true, companies: ['Tienda'] }),
  }
})

import { formatDay, money } from '@/composables/useCobranza'
import Cobranza from '@/pages/Cobranza.vue'
import CobranzaCliente from '@/pages/CobranzaCliente.vue'

const ISO = /\b\d{4}-\d{2}-\d{2}\b/
const usdPart = { currency: 'USD', outstanding: 300, overdue: 300 }
const QUEUE = {
  segment: 'vencidas',
  rows: [
    {
      customer: 'Laura',
      customer_name: 'Laura Pérez',
      company: 'Tienda',
      currency: 'MXN',
      outstanding: 1838,
      overdue_amount: 1838,
      company_currency: 'MXN',
      base_outstanding: 1838,
      base_overdue_amount: 1838,
      invoices: 2,
      oldest_overdue_days: 33,
      promise: null,
      last_reminder: null,
    },
    {
      customer: 'Importadora',
      customer_name: 'Importadora Pacífico LLC',
      company: 'Tienda',
      currency: 'USD',
      outstanding: 300,
      overdue_amount: 300,
      company_currency: 'MXN',
      base_outstanding: 5550,
      base_overdue_amount: 5550,
      invoices: 1,
      oldest_overdue_days: 5,
      promise: null,
      last_reminder: {
        label: 'Recordatorio amable',
        date: '2026-10-08',
        delivery: null,
      },
    },
  ],
  has_more: false,
  counts: { vencidas: 2, hoy: 0, promesas: 0, todas: 2 },
  capped: false,
  stats: {
    currency: 'MXN',
    outstanding: 11755,
    overdue: 11406,
    collected_today: 0,
    foreign: [{ ...usdPart, collected_today: 0 }],
    totals: [
      {
        currency: 'MXN',
        outstanding: 11755,
        overdue: 11406,
        collected_today: 0,
        foreign: [{ ...usdPart, collected_today: 0 }],
      },
    ],
  },
  today: '2026-10-13',
}
const RECORD = {
  customer: 'Frontera',
  customer_name: 'Distribuidora Frontera LLC',
  company: 'Tienda',
  companies: ['Tienda'],
  currency: 'USD',
  outstanding: 150,
  overdue_amount: 150,
  company_currency: 'MXN',
  base_outstanding: 2775,
  base_overdue_amount: 2775,
  credit: { limit: 20000, store_credit: null },
  invoices: [
    {
      name: 'ACC-SINV-2026-00010',
      posting_date: '2026-09-28',
      due_date: '2026-10-10',
      currency: 'USD',
      total: 200,
      outstanding: 150,
      overdue_amount: 150,
      base_outstanding: 2775,
      base_overdue_amount: 2775,
      overdue_days: 3,
      next_due: '2026-10-20',
      schedule: [
        { payment_schedule: 'a', due_date: '2026-10-10', outstanding: 100 },
        { payment_schedule: 'b', due_date: '2026-10-20', outstanding: 50 },
      ],
      due_level: 1,
      due_label: 'Recordatorio amable',
      current_dunning: null,
      promise: null,
    },
  ],
  timeline: [
    {
      kind: 'payment',
      doctype: 'Payment Entry',
      name: 'ACC-PAY-2026-00003',
      date: '2026-10-13',
      at: '2026-10-13 09:00:00',
      amount: 50,
      currency: 'USD',
      base_amount: 950,
      detail: 'Efectivo',
    },
  ],
  phones: [],
  suppressed: null,
  ladder_ready: true,
  capabilities: { remind: true, promise: true, collect: true, call: true },
  today: '2026-10-13',
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
let app, root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, reactive({ ...props })) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
}
beforeEach(() => {
  state.api.mockReset()
  state.route.query = {}
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Cobranza list with a dollar customer', () => {
  it('totals are in pesos with the dollar part named; the dollar row keeps dollars', async () => {
    state.api.mockResolvedValue(QUEUE)
    mount(Cobranza)
    await flush()
    const clean = (node) => node.textContent.replace(/\s+/g, ' ').trim()
    const cards = [...root.querySelectorAll('dl > div')].map((card) => [
      clean(card.querySelector('dt')),
      [...card.querySelectorAll('dd')].map(clean),
    ])
    expect(cards).toEqual([
      ['To collect', [`${money(11755, 'MXN')} includes ${money(300, 'USD')}`]],
      ['Overdue', [`${money(11406, 'MXN')} includes ${money(300, 'USD')}`]],
      ['Collected today', [money(0, 'MXN')]],
    ])
    const dollars = [...root.querySelectorAll('li')].find((li) =>
      li.textContent.includes('Importadora'),
    )
    expect(dollars.textContent).toContain(money(300, 'USD'))
    expect(dollars.textContent).toContain(`≈\u00a0${money(5550, 'MXN')}`)
    expect(dollars.textContent).toContain(formatDay('2026-10-08'))
    const pesos = [...root.querySelectorAll('li')].find((li) =>
      li.textContent.includes('Laura'),
    )
    expect(pesos.textContent).not.toContain('≈')
    expect(root.textContent).not.toMatch(ISO)
  })
})

describe('Cobranza record of a dollar customer paid in part', () => {
  it('dollars with their peso value, the credit limit in pesos, dates as the shell shows them', async () => {
    state.route.name = 'CobranzaCliente'
    state.api.mockResolvedValue(RECORD)
    mount(CobranzaCliente, { customer: 'Frontera' })
    await flush()
    const text = root.textContent.replace(/\s+/g, ' ')
    expect(text).toContain(money(150, 'USD'))
    expect(text).toContain(`≈ ${money(2775, 'MXN')}`)
    expect(text).toContain(`Credit limit ${money(20000, 'MXN')}`)
    expect(text).toContain(`of ${money(200, 'USD')}`)
    expect(text).toContain(`· ${formatDay('2026-09-28')}`)
    expect(text).toContain(`Due ${formatDay('2026-10-10')}`)
    expect(text).toContain(
      `Payment ACC-PAY-2026-00003 · ${money(50, 'USD')} ≈ ${money(950, 'MXN')}`,
    )
    expect(text).not.toMatch(ISO)
  })
})
