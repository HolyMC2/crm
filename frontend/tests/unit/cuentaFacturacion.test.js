// Mi cuenta › Facturación as the owner sees it: the invoices to pay first with
// their «Pagar» (two taps from Mi cuenta), the paid ones with a CFDI only when
// Boat stamped it, the wallet with its paginated ledger and «Recargar», and the
// saved cards with a two-tap delete and the honest line about adding one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
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

import {
  cardRows,
  cfdiKinds,
  downloadCfdi,
  fiscalPending,
  invoiceGroups,
  monthTitle,
  receiptKinds,
  serviceNames,
  txnRows,
} from '@/components/cuenta/facturacion'
import { downloadPath } from '@/components/cuenta/api'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaFacturacion from '@/components/cuenta/CuentaFacturacion.vue'

const NOW = new Date(2026, 10, 11, 10, 0)

const INVOICES = [
  {
    name: 'INV-11',
    status: 'Sent',
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    due_date: '2026-11-20',
    amount_mxn: 499,
  },
  {
    name: 'INV-10',
    status: 'Overdue',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-10',
    amount_mxn: 499,
  },
  {
    name: 'INV-09',
    status: 'Paid',
    period_start: '2026-09-01',
    amount_mxn: 499,
    payment_date: '2026-09-03',
    cfdi_state: 'stamped',
    cfdi_pdf: true,
  },
  {
    name: 'INV-08',
    status: 'Paid',
    period_start: '2026-08-01',
    amount_mxn: 499,
    cfdi_state: 'none',
    cfdi_pdf: false,
  },
  {
    name: 'INV-07',
    status: 'Paid',
    period_start: '2026-07-01',
    amount_mxn: 499,
  },
]

function boot(overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      saldo: { balance_mxn: 1250, status: 'healthy' },
    },
    store: {
      addons: [{ service_key: 'cfdi_timbres', service_name: 'Timbres CFDI' }],
    },
    invoices: INVOICES,
    payment_state: {
      status: 'ready',
      authoritative: true,
      is_trial: false,
      invoices: {
        'INV-10': { status: 'ready', authoritative: true },
        'INV-11': {
          status: 'unconfirmed',
          authoritative: false,
          message: 'Todavía no sabemos.',
        },
      },
    },
    ...overrides,
  }
}

describe('the invoices in the owner’s words', () => {
  it('puts what is to pay first, oldest first, and the paid ones after', () => {
    const { due, done } = invoiceGroups(boot())
    expect(due.map((r) => [r.name, r.title, r.overdue])).toEqual([
      ['INV-10', 'Octubre 2026', true],
      ['INV-11', 'Noviembre 2026', false],
    ])
    expect(due[0].line).toMatch(/^Overdue since /)
    expect(due[1].line).toMatch(/^Due /)
    expect(done.map((r) => r.name)).toEqual(['INV-09', 'INV-08', 'INV-07'])
    expect(done[0].line).toMatch(/^Paid /)
    expect(due[0].amount).toBe('$499.00')
    expect(monthTitle('')).toBe('Invoice')
  })

  it('a $0 month Boat closed as Paid reads as no charge, not as paid', () => {
    const { done } = invoiceGroups({
      invoices: [
        {
          name: 'INV-12',
          status: 'Paid',
          period_start: '2026-09-01',
          amount_mxn: 0,
          payment_date: '2026-09-01',
          cfdi_state: 'not_applicable',
        },
        { name: 'INV-13', status: 'Paid', period_start: '2026-08-01' },
      ],
    })
    expect(done.map((r) => [r.line, r.amount])).toEqual([
      ['No charge', '$0.00'],
      ['Paid', '$0.00'],
    ])
  })

  it('offers a CFDI only when Boat stamped it, the PDF only when attached', () => {
    expect(cfdiKinds({ cfdi_state: 'stamped' })).toEqual(['pdf', 'xml'])
    expect(cfdiKinds({ cfdi_state: 'stamped', cfdi_pdf: false })).toEqual([
      'xml',
    ])
    expect(cfdiKinds({ cfdi_state: 'none' })).toEqual([])
    // A Boat that sends no fiscal state offers nothing and promises nothing.
    expect(cfdiKinds({})).toEqual([])
    expect(fiscalPending({ cfdi_state: 'none' })).toBe(true)
    expect(fiscalPending({})).toBe(false)
    // Boat says no CFDI will be stamped (a month covered by credit).
    expect(fiscalPending({ cfdi_state: 'not_applicable' })).toBe(false)
    const { done } = invoiceGroups(boot())
    expect(done.map((r) => [r.cfdi, r.fiscalPending])).toEqual([
      [['pdf', 'xml'], false],
      [[], true],
      [[], false],
    ])
  })
})

describe('the ledger and the cards', () => {
  it('names each movement and signs it as Boat did', () => {
    const rows = txnRows(
      [
        {
          name: 'T1',
          txn_type: 'Top-up',
          amount_mxn: 500,
          creation: '2026-11-11 09:30:00',
          has_receipt: true,
          receipt_pdf: false,
        },
        {
          name: 'T2',
          txn_type: 'Debit',
          amount_mxn: -2.5,
          service_key: 'cfdi_timbres',
          note: 'cs_test_ref',
          creation: '2026-11-10 18:03:00',
        },
        { name: 'T3', txn_type: 'Top-up', amount_mxn: 200, has_receipt: false },
        {
          name: 'T4',
          txn_type: 'Debit',
          amount_mxn: -1,
          service_key: 'unknown',
        },
      ],
      serviceNames(boot()),
    )
    expect(rows.map((r) => [r.label, r.amount, r.credit])).toEqual([
      ['Top-up', '+$500.00', true],
      ['Timbres CFDI', '−$2.50', false],
      ['Top-up', '+$200.00', true],
      ['Charge', '−$1.00', false],
    ])
    expect(rows[0].receipts).toEqual(['xml'])
    expect(rows[2].receiptPending).toBe(true)
    expect(rows[1].receipts).toEqual([])
    // Boat's reference never reaches the screen.
    expect(
      JSON.stringify(rows.map((r) => [r.label, r.amount, r.when])),
    ).not.toContain('cs_test')
    expect(receiptKinds({})).toEqual([])
  })

  it('a card reads as its brand, last four and expiry', () => {
    expect(
      cardRows([
        {
          id: 'pm_1',
          brand: 'Visa',
          last4: '4242',
          exp_month: 8,
          exp_year: 2028,
        },
        { brand: 'Mastercard', last4: '1111' },
      ]),
    ).toEqual([
      { id: 'pm_1', title: 'Visa ···· 4242', expires: 'Expires 08/28' },
    ])
  })

  it('downloads through the existing relay and says why when Boat refuses', async () => {
    expect(downloadPath('invoice', 'INV-09', 'pdf')).toBe(
      '/api/method/doco.docoutils.miplan.download_invoice_cfdi?invoice=INV-09&kind=pdf',
    )
    expect(downloadPath('topup', 'T1', 'xml')).toBe(
      '/api/method/doco.docoutils.miplan.download_topup_cfdi?txn=T1&kind=xml',
    )
    const save = vi.fn()
    const file = new Blob(['<cfdi/>'])
    const ok = await downloadCfdi(
      { type: 'invoice', name: 'INV-09', kind: 'xml' },
      {
        fetcher: async () => ({
          ok: true,
          headers: { get: () => 'application/xml' },
          blob: async () => file,
        }),
        save,
      },
    )
    expect(ok).toBe('')
    expect(save).toHaveBeenCalledWith(file, 'CFDI-INV-09.xml')
    const refused = await downloadCfdi(
      { type: 'invoice', name: 'INV-09', kind: 'pdf' },
      {
        fetcher: async () => ({
          ok: false,
          headers: { get: () => 'application/json' },
          json: async () => ({
            _server_messages: JSON.stringify([
              JSON.stringify({
                message: 'El CFDI no está disponible en este formato.',
              }),
            ]),
          }),
        }),
        save,
      },
    )
    expect(refused).toBe('El CFDI no está disponible en este formato.')
    const lost = await downloadCfdi(
      { type: 'invoice', name: 'INV-09', kind: 'pdf' },
      {
        fetcher: async () => {
          throw new TypeError('Failed to fetch')
        },
      },
    )
    expect(lost).toMatch(/could not download the CFDI/)
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const button = (text) =>
  [...root.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.read.mockReset()
  state.mutate.mockReset()
  state.toast.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  vi.useRealTimers()
  app?.unmount()
  root?.remove()
  app = null
})

function readyDoor(data = boot()) {
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
function mount(pagos, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () =>
      h(CuentaFacturacion, {
        door: pagos,
        ...props,
        onAct: (key) => events.push(key),
      }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}
const page = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    name: `T${from + i}`,
    txn_type: 'Debit',
    amount_mxn: -1,
    service_key: 'cfdi_timbres',
    creation: '2026-11-10 10:00:00',
  }))

describe('CuentaFacturacion', () => {
  beforeEach(() => {
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods')
        return {
          ok: true,
          cards: [
            {
              id: 'pm_1',
              brand: 'Visa',
              last4: '4242',
              exp_month: 8,
              exp_year: 2028,
            },
          ],
        }
      if (fn === 'wallet_txns')
        return params.start === 0 ? page(20) : page(2, 20)
      return null
    })
  })

  it('an overdue invoice is one «Pagar» away; a blocked one says why and offers «Revisar estado»', async () => {
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/inv' })
    const pagos = readyDoor()
    mount(pagos)
    await flush()
    const due = root.querySelector('[data-testid="cuenta-por-pagar"]')
    expect(due.textContent).toContain('Octubre 2026')
    const [pay, blocked] = due.querySelectorAll('[data-testid="factura-pagar"]')
    expect(pay.textContent).toBe('Pay $499.00')
    expect(blocked.disabled).toBe(true)
    expect(due.textContent).toContain('Todavía no sabemos.')
    expect(due.textContent).toContain('Check status')
    pay.click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('pay_invoice', {
      invoice: 'INV-10',
    })
    expect(pagos.paymentState.value.invoices['INV-10'].status).toBe(
      'unconfirmed',
    )
  })

  it('a stamped CFDI downloads; a pending one says so quietly; an unknown one shows nothing', async () => {
    const save = vi.fn()
    const pagos = readyDoor()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/pdf' },
        blob: async () => new Blob(['%PDF']),
      })),
    )
    mount(pagos, { saveFile: save })
    await flush()
    const paid = root.querySelector('[data-testid="cuenta-facturas-pagadas"]')
    const items = paid.querySelectorAll('li')
    // One quiet «Factura fiscal» under the row; its PDF and XML unfold in place.
    const fiscal = items[0].querySelector('[data-testid="factura-fiscal"]')
    expect(fiscal.textContent.trim()).toBe('Fiscal invoice')
    expect(items[0].querySelectorAll('button')).toHaveLength(1)
    expect(items[1].textContent).toContain('Fiscal invoice pending')
    expect(items[1].querySelector('[data-testid="factura-fiscal"]')).toBeNull()
    expect(items[2].querySelector('[data-testid="factura-fiscal"]')).toBeNull()
    expect(items[2].textContent).not.toContain('Fiscal invoice pending')
    fiscal.click()
    await flush()
    expect(fiscal.getAttribute('aria-expanded')).toBe('true')
    const formats = items[0].querySelector(
      '[data-testid="factura-fiscal-formatos"]',
    )
    expect(
      [...formats.querySelectorAll('button')].map((b) => b.textContent.trim()),
    ).toEqual(['PDF', 'XML'])
    expect(state.read).not.toHaveBeenCalledWith(
      'download_invoice_cfdi',
      expect.anything(),
    )
    formats.querySelector('button').click()
    await flush()
    expect(fetch).toHaveBeenCalledWith(
      '/api/method/doco.docoutils.miplan.download_invoice_cfdi?invoice=INV-09&kind=pdf',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'CFDI-INV-09.pdf')
    vi.unstubAllGlobals()
  })

  it('two invoices to pay: only the oldest one’s «Pagar» is the filled button', async () => {
    const data = boot()
    data.invoices = INVOICES.map((inv) =>
      inv.name === 'INV-11' ? { ...inv, status: 'Overdue' } : inv,
    )
    data.payment_state = {
      ...data.payment_state,
      invoices: {
        'INV-10': { status: 'ready', authoritative: true },
        'INV-11': { status: 'ready', authoritative: true },
      },
    }
    mount(readyDoor(data))
    await flush()
    const pays = [
      ...root.querySelectorAll(
        '[data-testid="cuenta-por-pagar"] [data-testid="factura-pagar"]',
      ),
    ]
    expect(pays.map((b) => [b.textContent, b.dataset.variant])).toEqual([
      ['Pay $499.00', 'solid'],
      ['Pay $499.00', 'subtle'],
    ])
    expect(pays.every((b) => !b.disabled)).toBe(true)
  })

  it('a blocked oldest invoice hands the filled «Pagar» to the next one', async () => {
    const data = boot()
    data.payment_state = {
      ...data.payment_state,
      invoices: {
        'INV-10': {
          status: 'unconfirmed',
          authoritative: false,
          message: 'Todavía no sabemos.',
        },
        'INV-11': { status: 'ready', authoritative: true },
      },
    }
    mount(readyDoor(data))
    await flush()
    const pays = [...root.querySelectorAll('[data-testid="factura-pagar"]')]
    expect(pays.map((b) => [b.disabled, b.dataset.variant])).toEqual([
      [true, 'subtle'],
      [false, 'solid'],
    ])
  })

  it('a top-up’s CFDI is one quiet action in the ledger; XML alone downloads at once', async () => {
    const save = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/xml' },
        blob: async () => new Blob(['<cfdi/>']),
      })),
    )
    state.read.mockImplementation(async (fn) => {
      if (fn === 'wallet_txns')
        return [
          {
            name: 'TX-1',
            txn_type: 'Top-up',
            amount_mxn: 500,
            creation: '2026-11-10 10:00:00',
            has_receipt: true,
            receipt_pdf: false,
          },
          {
            name: 'TX-2',
            txn_type: 'Top-up',
            amount_mxn: 200,
            creation: '2026-11-09 10:00:00',
            has_receipt: true,
          },
        ]
      return { ok: true, cards: [] }
    })
    mount(readyDoor(), { saveFile: save })
    await flush()
    const rows = root.querySelectorAll('[data-testid="cuenta-movimientos"] li')
    expect(rows[0].querySelectorAll('button')).toHaveLength(1)
    expect(rows[1].querySelectorAll('button')).toHaveLength(1)
    const xml = rows[0].querySelector('[data-testid="factura-fiscal"]')
    expect(xml.textContent.trim()).toBe('Fiscal invoice (XML)')
    xml.click()
    await flush()
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'CFDI-TX-1.xml')
    vi.unstubAllGlobals()
  })

  it('the wallet shows its balance, its movements 20 at a time and «Recargar»', async () => {
    const events = mount(readyDoor())
    await flush()
    const saldo = root.querySelector('[data-testid="cuenta-saldo"]')
    // The same name as on Resumen and the top-up sheet: the wallet.
    expect(saldo.querySelector('h2').textContent.trim()).toBe('Wallet')
    expect(saldo.querySelector('[data-testid="saldo-monto"]').textContent).toBe(
      '$1,250.00',
    )
    expect(state.read).toHaveBeenCalledWith('wallet_txns', {
      limit: 20,
      start: 0,
    })
    expect(
      saldo.querySelectorAll('[data-testid="cuenta-movimientos"] li'),
    ).toHaveLength(20)
    expect(saldo.textContent).toContain('Timbres CFDI')
    button('Load more').click()
    await flush()
    expect(state.read).toHaveBeenCalledWith('wallet_txns', {
      limit: 20,
      start: 20,
    })
    expect(
      saldo.querySelectorAll('[data-testid="cuenta-movimientos"] li'),
    ).toHaveLength(22)
    expect(button('Load more')).toBeUndefined()
    button('Top up').click()
    expect(events).toEqual(['topup'])
  })

  it('a site without a wallet has no wallet section and reads no ledger', async () => {
    const data = boot()
    delete data.meters.saldo
    mount(readyDoor(data))
    await flush()
    expect(root.querySelector('[data-testid="cuenta-saldo"]')).toBeNull()
    expect(state.read).not.toHaveBeenCalledWith(
      'wallet_txns',
      expect.anything(),
    )
  })

  it('a card goes in two taps in place; adding one is an honest line, not a button', async () => {
    state.mutate.mockResolvedValue({ ok: true, id: 'pm_1' })
    mount(readyDoor())
    await flush()
    const cards = root.querySelector('[data-testid="cuenta-tarjetas"]')
    expect(cards.textContent).toContain('Visa ···· 4242')
    expect(cards.textContent).toContain('Expires 08/28')
    expect(cards.textContent).toContain(
      'Adding or replacing a card is not done here yet',
    )
    expect(button('Add')).toBeUndefined()
    cards.querySelector('[data-testid="tarjeta-borrar"]').click()
    await flush()
    expect(state.mutate).not.toHaveBeenCalled()
    const confirm = cards.querySelector('[data-testid="tarjeta-borrar-si"]')
    expect(confirm.textContent.trim()).toBe('Delete')
    confirm.click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('remove_payment_method', {
      source_id: 'pm_1',
    })
    expect(state.toast).toHaveBeenCalledWith('Card removed')
  })
})
