// Gastos pages with a mocked doco.workspaces.payables transport: the queue,
// a bill the worker can pay, one they must ask about, and a draft to register.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import Gastos from '@/pages/Gastos.vue'
import GastoFactura from '@/pages/GastoFactura.vue'
import { gastosBoot } from '@/composables/useGastos'
import { toast } from 'frappe-ui'
import {
  registrationOf,
  registrations,
  upsertRegistration,
} from '@/composables/gastosRegistrations'
import {
  REGISTRATION_CHANGED,
  REGISTRATION_EVENT,
  watchRegistrations,
} from '@/composables/useBillRegistrations'

const calls = []
let answers
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const bill = (extra = {}) => ({
  doctype: 'Purchase Invoice',
  name: 'PI-1',
  party: 'Renta Local',
  bill_no: 'F-77',
  company: 'Doco',
  date: '2026-10-01',
  due_date: '2026-10-07',
  currency: 'MXN',
  total: 1000,
  paid: 400,
  outstanding_amount: 600,
  docstatus: 1,
  overdue: false,
  modified: '2026-10-06 10:00:00',
  items: [{ item_name: 'Renta', qty: 1, uom: 'Mes', amount: 1000 }],
  item_count: 1,
  has_xml: false,
  ...extra,
})

let app, root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/gastos', name: 'Gastos', component: Gastos },
      {
        path: '/gastos/factura/:name',
        name: 'GastoFactura',
        component: GastoFactura,
        props: true,
      },
      { path: '/compras/orden/:name', name: 'CompraOrden', component: Gastos },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

beforeEach(() => {
  calls.length = 0
  gastosBoot.value = null
  registrations.value = []
  vi.clearAllMocks()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  answers = {
    get_capabilities: {
      enabled: true,
      user: 'pagos@example.test',
      today: '2026-10-06',
      capabilities: { read: true, submit: true, pay: true, bank: true },
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push([method, JSON.parse(init.body)])
      const answer = answers[method]
      return {
        ok: answer !== undefined,
        status: answer !== undefined ? 200 : 417,
        json: async () =>
          answer !== undefined ? { message: answer } : { exc_type: 'x' },
      }
    }),
  )
})
afterEach(() => {
  // A pending registration keeps polling; emptied, the poll stops itself.
  registrations.value = []
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('Gastos queue', () => {
  it('lists bills owed, soonest due, with what is paid and the overdue count', async () => {
    answers.queue = {
      rows: [bill()],
      has_more: false,
      counts: {
        'por-pagar': 1,
        'por-registrar': 2,
        vencidas: 0,
        capped: false,
        totals: [{ currency: 'MXN', amount: 600 }],
      },
    }
    await mountAt('/gastos?chip=semana')
    const queue = calls.find(([m]) => m === 'queue')[1]
    expect(queue).toMatchObject({ segment: 'por-pagar', chip: 'semana' })
    expect(root.textContent).toContain('Renta Local')
    expect(root.textContent).toContain('Due tomorrow')
    expect(root.textContent).toMatch(/Paid .*400.* of/)
    const link = root.querySelector('a[href*="/gastos/factura/PI-1"]')
    expect(decodeURIComponent(link.getAttribute('href'))).toContain(
      'list=/gastos?chip=semana',
    )
  })
  it('a held bill shows «On hold» in the list', async () => {
    answers.queue = {
      rows: [bill({ on_hold: true })],
      has_more: false,
      counts: { 'por-pagar': 1, 'por-registrar': 0, vencidas: 0, totals: [] },
    }
    await mountAt('/gastos')
    expect(root.textContent).toContain('On hold')
  })
})

describe('Gastos bill record', () => {
  it('a payer sees the balance, Pagar and the bank status of each payment', async () => {
    answers.invoice = {
      document: bill(),
      schedule: [],
      orders: [{ name: 'PO-9' }],
      payments: [
        {
          name: 'PE-1',
          amount: 400,
          currency: 'MXN',
          posting_date: '2026-10-06',
          reconciled: false,
        },
      ],
      assignments: [],
      actions: [
        { key: 'pay', allowed: true },
        { key: 'bank', allowed: true },
      ],
    }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toMatch(/Paid .*400.* of/)
    expect(root.textContent).toContain('Pay')
    expect(root.textContent).toContain('Waiting for the bank movement')
    const bank = root.querySelector('a[href^="/contador/bancos"]')
    expect(bank.getAttribute('href')).toContain('return_to=%2Fcrm%2Fgastos')
    expect(root.querySelector('a[href*="/compras/orden/PO-9"]')).not.toBeNull()
  })

  it('the bar names the supplier with its state and folio; Pagar leads and Escáner receives its goods', async () => {
    answers.invoice = {
      document: bill({ overdue: true }),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [{ key: 'pay', allowed: true }],
    }
    answers.bill_warehouse = {
      stock: true,
      update_stock: true,
      scanner: true,
      can_open: true,
      receipts: [],
      warehouses: ['Tienda - GD'],
      receive: { allowed: true, code: null, reason: null },
      inbounds: [],
      tasks: [],
    }
    await mountAt('/gastos/factura/PI-1')
    expect(root.querySelector('[data-appbar-title]').textContent.trim()).toBe(
      'Renta Local',
    )
    expect(root.querySelector('[data-testid="bill-status"]').textContent).toBe(
      'Overdue',
    )
    expect(root.textContent).toContain('Bill F-77')
    const [first] = root.querySelectorAll('[data-testid="bill-next"] button')
    expect(first.dataset.step).toBe('pay')
    expect(calls.find(([m]) => m === 'bill_warehouse')?.[1]).toEqual({
      name: 'PI-1',
    })
    const receive = root.querySelector('a[href^="/scan/inbound?"]')
    expect(receive.textContent).toContain('Verify and put away')
    const url = new URL(receive.getAttribute('href'), 'https://x.invalid')
    expect(url.searchParams.get('source_name')).toBe('PI-1')
    expect(url.searchParams.get('return_to')).toBe('/crm/gastos/factura/PI-1')
  })

  it('a worker who cannot pay gets the reason and «Ask for approval», never a dead button', async () => {
    answers.invoice = {
      document: bill(),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [{ user: 'jefa@example.test', full_name: 'Jefa' }],
      actions: [
        {
          key: 'pay',
          allowed: false,
          reason: 'Los pagos los hace un administrador de cuentas.',
          fallback: 'pay',
        },
      ],
    }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain(
      'Los pagos los hace un administrador de cuentas.',
    )
    const buttons = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(buttons).toContain('Ask for approval')
    expect(buttons).not.toContain('Pay')
    expect(root.textContent).toContain('Waiting on: Jefa')
  })

  it('a held bill says why; an Accounts Manager releases it and then can pay', async () => {
    const held = {
      document: bill({ on_hold: true, release_date: '2026-10-11' }),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [
        {
          key: 'pay',
          allowed: false,
          reason: 'Esta factura está retenida hasta el 11-10-2026.',
          fallback: 'release',
        },
      ],
    }
    answers.invoice = held
    answers.release_hold = { name: 'PI-1', on_hold: false }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain('retenida hasta el 11-10-2026')
    expect(root.textContent).toContain('On hold')
    const buttons = () => [...root.querySelectorAll('button')]
    expect(buttons().map((b) => b.textContent.trim())).not.toContain('Pay')
    answers.invoice = {
      ...held,
      document: bill(),
      actions: [{ key: 'pay', allowed: true }],
    }
    buttons()
      .find((b) => b.textContent.trim() === 'Release hold')
      .click()
    await flush()
    const release = calls.find(([m]) => m === 'release_hold')[1]
    expect(release).toMatchObject({ name: 'PI-1' })
    expect(release.request_id).toBeTruthy()
    expect(root.textContent).toContain('Hold released')
    expect(buttons().map((b) => b.textContent.trim())).toContain('Pay')
  })

  it('someone who cannot release a held bill asks for a review', async () => {
    answers.invoice = {
      document: bill({ on_hold: true }),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [
        {
          key: 'pay',
          allowed: false,
          reason: 'Esta factura está retenida.',
          fallback: 'review',
        },
      ],
    }
    await mountAt('/gastos/factura/PI-1')
    const labels = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(labels).toContain('Ask for a review')
    expect(labels).not.toContain('Release hold')
  })

  it('«Pagar» shows the account the bill pays from and the rate it posts', async () => {
    answers.invoice = {
      document: bill({ currency: 'USD' }),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [{ key: 'pay', allowed: true }],
    }
    answers.pay_options = {
      name: 'PI-1',
      outstanding_amount: 100,
      currency: 'USD',
      company_currency: 'MXN',
      today: '2026-10-06',
      accounts: [
        { account: 'Banco - X', label: 'Banco', type: 'Bank', currency: 'MXN' },
      ],
      other_currency: [
        { account: 'Euros - X', label: 'Euros', type: 'Bank', currency: 'EUR' },
      ],
      fixed_by: 'Transferencia',
      refusal: null,
      exchange_rate: {
        from: 'USD',
        to: 'MXN',
        rate: 18.5,
        date: '2026-10-06',
        missing: null,
      },
      can_pay: true,
      needs_setup: false,
    }
    await mountAt('/gastos/factura/PI-1')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Pay')
      .click()
    await flush()
    const text = document.body.textContent
    expect(text).toContain(
      'set to be paid by Transferencia, so it is paid from Banco',
    )
    expect(text).toContain('Exchange rate (USD to MXN)')
    expect(text).toContain('Rate on file for 2026-10-06: 18.5')
    expect(text).toContain('1,850')
    expect(text).toContain('Euros · EUR')
    const account = document.body.querySelector('[role="combobox"]')
    expect(account.hasAttribute('disabled')).toBe(true)
  })

  it('a draft offers «Review and register»', async () => {
    answers.invoice = {
      document: bill({ docstatus: 0, paid: 0, outstanding_amount: 0 }),
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [{ key: 'submit', allowed: true }],
    }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain('Review and register')
    expect(root.textContent).toContain('Draft')
  })

  const draft = (extra = {}) => ({
    document: bill({ docstatus: 0, paid: 0, outstanding_amount: 0 }),
    schedule: [],
    orders: [],
    payments: [],
    assignments: [],
    actions: [{ key: 'submit', allowed: true }],
    ...extra,
  })
  const press = async (label) => {
    const button = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label,
    )
    button.click()
    await flush()
  }

  it('«Register» queues in the background and frees the page at once', async () => {
    answers.invoice = draft()
    answers.submit_bill = { name: 'PI-1', docstatus: 0, queued: true }
    await mountAt('/gastos/factura/PI-1')
    await press('Review and register')
    expect(document.body.textContent).toContain(
      'It registers in the background',
    )
    await press('Register')
    const sent = calls.find(([m]) => m === 'submit_bill')[1]
    expect(sent).toMatchObject({ name: 'PI-1', background: 1 })
    expect(sent.request_id).toBeTruthy()
    expect(registrationOf('PI-1')).toMatchObject({
      state: 'queued',
      party: 'Renta Local',
      total: 1000,
    })
    expect(root.textContent).toContain('Registering…')
    expect(root.textContent).toContain('Back to Gastos')
    expect(root.textContent).not.toContain('Review and register')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  const refused = (fix, message = 'Supplier Renta Local is disabled') =>
    draft({ registration: { state: 'failed', message, fix } })

  it('a deactivated supplier: «Activate supplier and register» in one step', async () => {
    answers.invoice = refused({
      kind: 'supplier_disabled',
      supplier: 'SUP-1',
      supplier_name: 'Renta Local',
      can_fix: true,
    })
    answers.fix_and_register = { name: 'PI-1', docstatus: 0, queued: true }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain(
      'The supplier Renta Local is deactivated',
    )
    // The card carries the way on; no second «Review and register» beside it.
    expect(root.textContent).not.toContain('Review and register')
    await press('Activate supplier and register')
    const sent = calls.find(([m]) => m === 'fix_and_register')[1]
    expect(sent).toMatchObject({ name: 'PI-1', fix: 'supplier_disabled' })
    expect(registrationOf('PI-1').state).toBe('queued')
  })

  it('a fix this worker cannot make offers the ask, with what ERPNext said', async () => {
    answers.invoice = refused({
      kind: 'supplier_disabled',
      supplier: 'SUP-1',
      supplier_name: 'Renta Local',
      can_fix: false,
    })
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain('Supplier Renta Local is disabled')
    expect(root.textContent).toContain('whoever manages suppliers')
    expect(root.textContent).toContain('Ask someone to activate it')
    expect(root.textContent).not.toContain('Activate supplier and register')
  })

  it('a closed period: pick an open date, then change it and register', async () => {
    answers.invoice = refused(
      {
        kind: 'closed_period',
        posting_date: '2026-10-01',
        suggested_date: '2026-10-06',
        can_fix: true,
      },
      'You cannot create a Purchase Invoice within the closed Accounting Period Oct',
    )
    answers.fix_and_register = { name: 'PI-1', docstatus: 0, queued: true }
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain('falls in a closed accounting period')
    await press('Change the date and register')
    const sent = calls.find(([m]) => m === 'fix_and_register')[1]
    expect(sent).toMatchObject({
      fix: 'closed_period',
      posting_date: '2026-10-06',
    })
  })

  it('anything else: ERPNext’s sentence, «Try again» and the review ask', async () => {
    answers.invoice = refused({ kind: 'other' }, 'Expense account is mandatory')
    await mountAt('/gastos/factura/PI-1')
    expect(root.textContent).toContain('The bill could not be registered')
    expect(root.textContent).toContain('Expense account is mandatory')
    expect(root.textContent).toContain('Try again')
    expect(root.textContent).toContain('Ask for a review')
  })

  it('the review ask never goes back to the one asking', async () => {
    answers.invoice = refused({ kind: 'other' }, 'Expense account is mandatory')
    answers.approval_options = {
      candidates: [],
      fallback: null,
      fallback_to: [],
    }
    await mountAt('/gastos/factura/PI-1')
    await press('Ask for a review')
    expect(document.body.textContent).toContain(
      'the request would come back to you',
    )
    const send = document.body.querySelector('[data-testid="approval-send"]')
    expect(send.disabled).toBe(true)
  })
})

describe('background registrations', () => {
  it('the realtime outcome settles the bill and says so, once', async () => {
    const handlers = {}
    const socket = { on: (event, fn) => (handlers[event] = fn) }
    upsertRegistration({
      name: 'PI-9',
      party: 'Renta Local',
      total: 500,
      currency: 'MXN',
      state: 'queued',
      startedAt: Date.now(),
    })
    answers.registration = { name: 'PI-9', state: 'queued' }
    watchRegistrations({ socket })
    await flush()
    const changed = vi.fn()
    window.addEventListener(REGISTRATION_CHANGED, changed)
    handlers[REGISTRATION_EVENT]({ name: 'PI-9', state: 'done' })
    handlers[REGISTRATION_EVENT]({ name: 'PI-9', state: 'done' })
    window.removeEventListener(REGISTRATION_CHANGED, changed)
    expect(registrationOf('PI-9').state).toBe('done')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success.mock.calls[0][0]).toContain('Renta Local')
  })

  it('a refusal stays until dismissed, with the server sentence', async () => {
    upsertRegistration({
      name: 'PI-8',
      party: 'Renta Local',
      state: 'queued',
      startedAt: Date.now(),
    })
    answers.registration = {
      name: 'PI-8',
      state: 'failed',
      message: 'Accounting Period is closed',
    }
    watchRegistrations({})
    await flush()
    expect(registrationOf('PI-8')).toMatchObject({
      state: 'failed',
      message: 'Accounting Period is closed',
    })
    expect(toast.error.mock.calls[0][0]).toContain(
      'Accounting Period is closed',
    )
  })
})
