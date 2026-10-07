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
})
