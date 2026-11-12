// Mi cuenta › Facturación's invoice detail (capability «invoice_detail») and
// «Historial» (capability «history»): a tap on an invoice row opens a sheet with
// Boat's lines, the credits, partner discount and refunds as their own rows,
// the total with «IVA incluido: $X» (Boat's split, never computed here), how and
// when it was paid, the CFDI and the receipt, and «Pagar» on an invoice to pay;
// «Historial» lists Boat's events newest first in the site's clock, with
// «Cargar más» passing Boat's cursor. Without the capabilities the rows only
// read and no tab is added. No folio, key or login reaches the screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  call: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                h('p', { 'data-testid': 'sheet-subtitle' }, props.subtitle),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
  exportStatus: async () => ({ export: null, can_request: true }),
}))

import {
  detailView,
  historyDetails,
  historyRows,
  siteWhen,
} from '@/components/cuenta/facturaDetalle'
import { fiscalPending } from '@/components/cuenta/facturacion'
import { createHistory } from '@/components/cuenta/historial'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaFacturacion from '@/components/cuenta/CuentaFacturacion.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'

const NOW = new Date(2026, 10, 12, 10, 0)
const DETAIL = {
  ok: true,
  invoice: {
    name: 'INV-MU-2026-00012',
    status: 'Paid',
    plan: 'Pro',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-09',
    issued_at: '2026-10-04T08:00:00-06:00',
    amount_mxn: 940.6,
    iva_mxn: 129.74,
    subtotal_mxn: 1069.8,
    partner_discount_mxn: 79.2,
    lines: [
      {
        kind: 'base_fee',
        label: 'Plan Pro',
        amount_mxn: 499,
        quantity: null,
        unit_price_mxn: null,
      },
      {
        kind: 'seat_extra',
        label: 'Usuarios extra',
        amount_mxn: 297,
        quantity: 3,
        unit_price_mxn: 99,
      },
      { kind: 'addon', label: 'Complemento Tienda en línea', amount_mxn: 199 },
      {
        kind: 'overage',
        label: 'Timbres: 12 más de lo incluido',
        amount_mxn: 36,
      },
      {
        kind: 'proration',
        label: 'Prorrateo alta de Tienda en línea',
        amount_mxn: 38.8,
      },
    ],
    credits: [
      { kind: 'adjustment', label: 'Crédito aplicado', amount_mxn: -50 },
    ],
    payment: { at: '2026-10-05T23:30:00-07:00', method: 'Tarjeta' },
    refunds: [{ amount_mxn: 100, at: '2026-10-20T09:00:00-07:00' }],
    refunded_mxn: 100,
    cfdi_state: 'stamped',
    cfdi_pdf: true,
    cfdi_xml: true,
    receipt: true,
  },
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 600; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )

let app, root
beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.call.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.read.mockImplementation(async (fn) =>
    fn === 'payment_methods' ? { ok: true, cards: [] } : [],
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  shellBoot.value = null
})

describe('detailView', () => {
  it('reads Boat’s invoice line by line, credits apart, with the IVA inside the total', () => {
    const view = detailView(DETAIL, NOW)
    expect(view.title).toBe('Octubre 2026')
    expect(view.status).toBe('Paid on 5 de octubre with tarjeta')
    expect(view.total).toBe('$940.60')
    expect(view.iva).toBe('IVA included: $129.74')
    expect(
      view.lines.map((line) => [line.label, line.detail, line.amount]),
    ).toEqual([
      ['Plan Pro', '', '$499.00'],
      ['Usuarios extra', '3 × $99.00', '$297.00'],
      ['Complemento Tienda en línea', '', '$199.00'],
      ['Timbres: 12 más de lo incluido', '', '$36.00'],
      ['Prorrateo alta de Tienda en línea', '', '$38.80'],
    ])
    expect(view.subtotal).toBe('$1,069.80')
    expect(view.credits.map((line) => [line.label, line.amount])).toEqual([
      ['Crédito aplicado', '−$50.00'],
      ['Partner discount', '−$79.20'],
    ])
    expect(view.refunds.map((row) => [row.label, row.amount])).toEqual([
      ['Refund of 20 de octubre', '$100.00'],
    ])
    expect(view.cfdi).toEqual(['pdf', 'xml'])
    expect(view.cfdiNote).toBe('')
    expect(view.receipt).toBe(true)
    expect(JSON.stringify(view)).not.toMatch(/INV-MU|issued_at/)
  })

  it('the payment day is the site’s, not the browser’s', () => {
    // 23:30 at the site (UTC-7) is already the 6th in UTC.
    expect(detailView(DETAIL, NOW).status).toContain('5 de octubre')
  })

  it('an invoice to pay says when it is due, or since when it is overdue', () => {
    const due = (status, extra = {}) =>
      detailView(
        {
          ok: true,
          invoice: { ...DETAIL.invoice, status, payment: null, ...extra },
        },
        NOW,
      )
    expect(due('Sent').status).toBe('Due on 9 de octubre')
    expect(due('Overdue').status).toBe('Unpaid since 9 de octubre')
    expect(due('Overdue').overdue).toBe(true)
    expect(due('Sent', { due_date: null }).status).toBe('To pay')
    expect(due('Cancelled').status).toBe('Cancelled')
  })

  it('says where the CFDI stands when there is no file to download', () => {
    const cfdi = (status, cfdi_state) =>
      detailView(
        { ok: true, invoice: { ...DETAIL.invoice, status, cfdi_state } },
        NOW,
      )
    expect(cfdi('Paid', 'pending').cfdiNote).toBe('Fiscal invoice in process')
    expect(cfdi('Paid', 'none').cfdiNote).toBe('Fiscal invoice pending')
    expect(cfdi('Sent', 'none').cfdiNote).toBe('')
    expect(cfdi('Paid', 'pending').cfdi).toEqual([])
  })

  it('promises no CFDI where Boat says none will be stamped', () => {
    const cfdi = (extra) =>
      detailView(
        { ok: true, invoice: { ...DETAIL.invoice, status: 'Paid', ...extra } },
        NOW,
      )
    // A month covered by credit, or the fiscal leg off.
    const none = cfdi({ cfdi_state: 'not_applicable', amount_mxn: 0 })
    expect(none.cfdiNote).toBe('')
    expect(none.cfdi).toEqual([])
    // A Boat that sends no fiscal state promises nothing either.
    expect(cfdi({ cfdi_state: undefined }).cfdiNote).toBe('')
    // The row says the same as the sheet.
    expect(fiscalPending({ cfdi_state: 'not_applicable' })).toBe(false)
    expect(fiscalPending({ cfdi_state: 'none' })).toBe(true)
  })

  it('a $0 month says nothing was charged, with no IVA line to split', () => {
    const zero = (extra) =>
      detailView(
        {
          ok: true,
          invoice: {
            ...DETAIL.invoice,
            status: 'Paid',
            amount_mxn: 0,
            iva_mxn: 0,
            partner_discount_mxn: 0,
            cfdi_state: 'not_applicable',
            ...extra,
          },
        },
        NOW,
      )
    // Covered by a credit: the credit row stands under the lines.
    const covered = zero({})
    expect(covered.status).toBe('No charge: your credit covered it')
    expect(covered.iva).toBe('')
    expect(covered.total).toBe('$0.00')
    // No credit to show (a free month): only that nothing was charged.
    expect(zero({ credits: [] }).status).toBe('No charge')
    // An answer without an amount is not read as $0.
    const unknown = zero({ amount_mxn: undefined })
    expect(unknown.status).toBe('Paid on 5 de octubre with tarjeta')
    expect(unknown.iva).toBe('IVA included: $0.00')
  })

  it('no subtotal when nothing is taken off; nothing for a refusal', () => {
    const plain = detailView(
      {
        ok: true,
        invoice: { ...DETAIL.invoice, credits: [], partner_discount_mxn: 0 },
      },
      NOW,
    )
    expect(plain.subtotal).toBe('')
    expect(detailView({ ok: false, reason: 'not_found' })).toBeNull()
    expect(detailView(null)).toBeNull()
  })
})

describe('the history rows', () => {
  it('Boat’s title, the site’s day and time, and what it costs', () => {
    const rows = historyRows(
      [
        {
          id: 'a1',
          at: '2026-11-02T10:05:00-07:00',
          kind: 'seats',
          title: 'Usuarios extra: de 1 a 3',
          status: 'done',
          amount_mxn: 297,
          cycle: 'Mensual',
          charge_now_mxn: 132,
        },
        {
          id: 'a2',
          at: '2026-11-05T09:30:00-07:00',
          kind: 'adjustment',
          title: 'Cargo proporcional de Tienda en línea',
          amount_mxn: 66.5,
          bills_on: '2026-12-01',
        },
        {
          id: 'a3',
          at: '2025-12-31T23:59:00-07:00',
          kind: 'site',
          title: 'Se creó tu sistema',
        },
        { id: 'a4', at: '2026-11-01T08:00:00-07:00', kind: 'plan', title: '' },
      ],
      NOW,
    )
    expect(rows.map((row) => [row.title, row.when, row.details])).toEqual([
      [
        'Usuarios extra: de 1 a 3',
        '2 de noviembre, 10:05',
        ['$297.00 a month, IVA included', 'Prorated charge: $132.00'],
      ],
      [
        'Cargo proporcional de Tienda en línea',
        '5 de noviembre, 9:30',
        ['$66.50 on your diciembre 2026 invoice'],
      ],
      ['Se creó tu sistema', '31 de diciembre de 2025, 23:59', []],
    ])
  })

  it('each state in words, a credit as a credit, an annual price per year', () => {
    expect(
      historyDetails(
        {
          kind: 'plan',
          status: 'scheduled',
          effective_date: '2026-12-01',
          amount_mxn: 4990,
          cycle: 'Anual',
        },
        NOW,
      ),
    ).toEqual([
      'Scheduled for 1 de diciembre',
      '$4,990.00 a year, IVA included',
    ])
    expect(
      historyDetails({ kind: 'seats', status: 'in_progress' }, NOW),
    ).toEqual(['Being applied'])
    expect(historyDetails({ kind: 'seats', status: 'failed' }, NOW)).toEqual([
      'It did not go through',
    ])
    expect(
      historyDetails(
        { kind: 'addon', status: 'cancelled', amount_mxn: 199 },
        NOW,
      ),
    ).toEqual([
      'Dropped before it took effect',
      '$199.00 a month, IVA included',
    ])
    expect(
      historyDetails(
        { kind: 'adjustment', amount_mxn: -50, bills_on: '2026-12-01' },
        NOW,
      ),
    ).toEqual(['$50.00 off your diciembre 2026 invoice'])
    expect(
      historyDetails({ kind: 'adjustment', amount_mxn: -50 }, NOW),
    ).toEqual(['Credit of $50.00'])
  })

  it('a time without a zone reads as given; an unknown one shows nothing', () => {
    expect(siteWhen('2026-11-03 07:04:00', NOW)).toBe('3 de noviembre, 7:04')
    expect(siteWhen('', NOW)).toBe('')
  })
})

describe('createHistory', () => {
  it('pages with Boat’s cursor, drops repeats and stops on the last page', async () => {
    const seam = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        events: [{ id: 'e1' }, { id: 'e2' }],
        cursor: 'c-1',
      })
      .mockResolvedValueOnce({
        ok: true,
        events: [{ id: 'e2' }, { id: 'e3' }],
        cursor: null,
      })
    const history = createHistory({ seam })
    await history.load({ reset: true })
    expect(seam).toHaveBeenLastCalledWith('my_history', {})
    expect(history.done.value).toBe(false)
    await history.load()
    expect(seam).toHaveBeenLastCalledWith('my_history', { cursor: 'c-1' })
    expect(history.events.value.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(history.done.value).toBe(true)
    await history.load()
    expect(seam).toHaveBeenCalledTimes(2)
  })

  it('a refusal or a failed read keeps the rows and says why', async () => {
    const seam = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        events: [{ id: 'e1' }],
        cursor: 'c-1',
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'invalid',
        message: 'Vuelve a abrirlo.',
      })
      .mockRejectedValueOnce(new Error('down'))
    const history = createHistory({ seam })
    await history.load({ reset: true })
    await history.load()
    expect(history.error.value).toBe('Vuelve a abrirlo.')
    expect(history.events.value).toHaveLength(1)
    await history.load()
    expect(history.error.value).not.toBe('')
    expect(history.events.value).toHaveLength(1)
  })
})

function boot(capabilities, invoices) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    store: { addons: [] },
    invoices: invoices || [
      {
        name: 'INV-MU-2026-00012',
        status: 'Paid',
        period_start: '2026-10-01',
        amount_mxn: 940.6,
        payment_date: '2026-10-05',
        receipt: true,
      },
      {
        name: 'INV-MU-2026-00013',
        status: 'Sent',
        period_start: '2026-11-01',
        due_date: '2026-11-09',
        amount_mxn: 499,
      },
    ],
    payment_state: {
      status: 'ready',
      authoritative: true,
      invoices: {
        'INV-MU-2026-00013': { status: 'ready', authoritative: true },
      },
    },
    ...(capabilities ? { capabilities } : {}),
  }
}
function readyDoor(data) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}

describe('Facturación › an invoice in detail', () => {
  it('without the capability a row only reads and no detail is asked', async () => {
    mount(CuentaFacturacion, { door: readyDoor(boot(['receipts'])) })
    await flush()
    expect(root.querySelector('[data-testid="factura-abrir"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="cuenta-facturas-pagadas"]').textContent,
    ).toContain('Octubre 2026')
    expect(state.seam).not.toHaveBeenCalled()
  })

  it('a tap on a paid invoice opens its lines, the IVA and its documents', async () => {
    state.seam.mockResolvedValue(DETAIL)
    mount(CuentaFacturacion, {
      door: readyDoor(boot(['invoice_detail', 'receipts'])),
    })
    await flush()
    const rows = [...root.querySelectorAll('[data-testid="factura-abrir"]')]
    expect(rows).toHaveLength(2)
    rows[1].click()
    const sheet = await find(
      '[data-testid="factura-detalle"] [data-testid="detalle-lineas"]',
    )
    await flush()
    expect(state.seam).toHaveBeenCalledWith('invoice_detail', {
      invoice: 'INV-MU-2026-00012',
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.getAttribute('aria-label')).toBe('Octubre 2026')
    expect(sheet.textContent).toContain('Usuarios extra')
    expect(sheet.textContent).toContain('3 × $99.00')
    expect(
      dialog.querySelector('[data-testid="detalle-iva"]').textContent.trim(),
    ).toBe('IVA included: $129.74')
    expect(
      dialog.querySelectorAll('[data-testid="detalle-credito"]'),
    ).toHaveLength(2)
    expect(
      dialog.querySelector('[data-testid="detalle-reembolsos"]').textContent,
    ).toContain('$100.00')
    expect(
      dialog.querySelector('[data-testid="factura-fiscal"]'),
    ).not.toBeNull()
    expect(
      dialog.querySelector('[data-testid="detalle-comprobante"]'),
    ).not.toBeNull()
    // A paid invoice has nothing to pay; no folio on the screen.
    expect(dialog.querySelector('[data-testid="detalle-pagar"]')).toBeNull()
    expect(dialog.textContent).not.toContain('INV-MU')
  })

  it('an invoice to pay offers «Pagar» in the sheet, the same payment as its row', async () => {
    state.seam.mockResolvedValue({
      ok: true,
      invoice: {
        ...DETAIL.invoice,
        name: 'INV-MU-2026-00013',
        status: 'Sent',
        payment: null,
        refunds: [],
        receipt: false,
        cfdi_state: 'none',
      },
    })
    const door = readyDoor(boot(['invoice_detail']))
    door.payInvoice = vi.fn()
    mount(CuentaFacturacion, { door })
    await flush()
    root
      .querySelector(
        '[data-testid="cuenta-por-pagar"] [data-testid="factura-abrir"]',
      )
      .click()
    const pay = await find('[data-testid="detalle-pagar"]')
    expect(pay.textContent).toBe('Pay $499.00')
    pay.click()
    await flush()
    expect(door.payInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'INV-MU-2026-00013' }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('a refusal says Boat’s sentence and offers to try again', async () => {
    state.seam
      .mockResolvedValueOnce({
        ok: false,
        reason: 'not_found',
        message: 'No encontramos esa factura en tu cuenta.',
      })
      .mockResolvedValueOnce(DETAIL)
    mount(CuentaFacturacion, { door: readyDoor(boot(['invoice_detail'])) })
    await flush()
    root.querySelectorAll('[data-testid="factura-abrir"]')[1].click()
    await flush()
    const dialog = await find('[role="dialog"]')
    expect(dialog.textContent).toContain(
      'No encontramos esa factura en tu cuenta.',
    )
    button('Try again', dialog).click()
    expect(await find('[data-testid="detalle-lineas"]')).not.toBeNull()
  })
})

describe('Mi cuenta › Historial', () => {
  async function page(path, data) {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    }
    state.call.mockResolvedValue(shellBoot.value)
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap'
        ? data
        : fn === 'payment_methods'
          ? { ok: true, cards: [] }
          : [],
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cuenta', component: Cuenta }],
    })
    router.push(path)
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cuenta) })
    app.use(router)
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    await flush()
    return router
  }
  const tabs = () =>
    [...root.querySelectorAll('[role="radio"]')].map((b) =>
      b.textContent.trim(),
    )

  it('no tab without the capability', async () => {
    await page('/cuenta?tab=historial', boot(['invoice_detail']))
    expect(tabs()).toEqual(['Summary', 'Billing', 'Store'])
    expect(root.querySelector('[data-testid="cuenta-historial"]')).toBeNull()
  })

  it('the tab lists Boat’s events and «Cargar más» asks for the next page', async () => {
    state.seam.mockImplementation(async (method, payload) => {
      if (method !== 'my_history') return { ok: false, reason: 'disabled' }
      return payload?.cursor
        ? {
            ok: true,
            events: [
              {
                id: 'e3',
                at: '2026-09-01T12:00:00-06:00',
                kind: 'app',
                title: 'Se activó Taller',
              },
              {
                id: 'e4',
                at: '2026-08-28T11:15:00-06:00',
                kind: 'addon',
                title: 'Complemento WhatsApp',
                status: 'failed',
                amount_mxn: 149,
                cycle: 'Mensual',
              },
            ],
            cursor: null,
          }
        : {
            ok: true,
            events: [
              {
                id: 'e1',
                at: '2026-11-08T12:00:00-06:00',
                kind: 'subscription',
                title: 'Se pidió cancelar la suscripción',
              },
              {
                id: 'e2',
                at: '2026-11-02T10:00:00-06:00',
                kind: 'seats',
                title: 'Usuarios extra: de 1 a 3',
                status: 'done',
                amount_mxn: 297,
                cycle: 'Mensual',
              },
            ],
            cursor: '2026-11-02 10:00:00.000000|0123456789abcdef',
          }
    })
    await page('/cuenta?tab=historial', boot(['history']))
    expect(tabs()).toEqual(['Summary', 'Billing', 'Store', 'History'])
    const list = await find('[data-testid="historial-filas"]')
    expect(
      [...list.querySelectorAll('li')].map(
        (li) => li.querySelector('p').textContent,
      ),
    ).toEqual(['Se pidió cancelar la suscripción', 'Usuarios extra: de 1 a 3'])
    expect(list.textContent).toContain('$297.00 a month, IVA included')
    root.querySelector('[data-testid="historial-mas"]').click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('my_history', {
      cursor: '2026-11-02 10:00:00.000000|0123456789abcdef',
    })
    expect(
      root.querySelectorAll('[data-testid="historial-filas"] li'),
    ).toHaveLength(4)
    expect(root.querySelector('[data-testid="historial-mas"]')).toBeNull()
    // A change that did not go through: its state is the marked line, not its price.
    const failed = [
      ...root.querySelectorAll('[data-testid="historial-filas"] li'),
    ].at(-1)
    expect(
      [...failed.querySelectorAll('[data-failed]')].map((p) =>
        p.textContent.trim(),
      ),
    ).toEqual(['It did not go through'])
    expect(failed.textContent).toContain('$149.00 a month, IVA included')
  })
})
