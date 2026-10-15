// The purchase order record continues the chain: billing beside receiving
// while goods arrive (and as the next step once they did), the keys of each
// step, the bill made in Gastos with the way back to this order and its
// queue, and the review a list's «O» hands over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import CompraOrden from '@/pages/CompraOrden.vue'
import { comprasBoot } from '@/composables/useCompras'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const press = (key, extra = {}) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  )
const order = (extra = {}, actions = []) => ({
  document: {
    doctype: 'Purchase Order',
    name: 'PO-2',
    party: 'Distribuidora del Pacífico',
    company: 'Tienda',
    schedule_date: '2026-10-15',
    docstatus: 1,
    status: 'To Receive and Bill',
    per_received: 40,
    per_billed: 0,
    billing_pending: true,
    grand_total: 2850,
    currency: 'MXN',
    modified: '2026-10-13 07:00:00',
    ...extra,
  },
  rows: [],
  rows_scope: { total: 0, has_more: false },
  receipts: { rows: [] },
  bills: [],
  actions,
  followups: { rows: [] },
})
const RECEIVE = {
  key: 'receive',
  label: 'Recibir en Escáner',
  allowed: true,
  primary: true,
}
const BILL = {
  key: 'bill',
  label: 'Registrar factura del proveedor',
  allowed: true,
  primary: false,
}
let answers, calls, app, root, router
beforeEach(() => {
  comprasBoot.value = null
  calls = []
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  answers = {
    get_capabilities: {
      enabled: true,
      user: 'compras@example.test',
      capabilities: { confirm: true, receive: true },
      scanner: { ready: true },
    },
    order: order({}, [RECEIVE, BILL]),
    companies: [],
    start_bill: { bill: 'PINV-7', order: 'PO-2', reused: false },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push([method, init?.body ? JSON.parse(init.body) : {}])
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: answers[method] ?? [] }),
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function mountAt(path) {
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/compras/orden/:name',
        name: 'CompraOrden',
        component: CompraOrden,
        props: true,
      },
      {
        path: '/gastos/factura/:name',
        name: 'GastoFactura',
        component: { render: () => null },
      },
      ...['Compras', 'CompraSolicitud', 'Gastos'].map((name) => ({
        path: `/${name}/:name?`,
        name,
        component: { render: () => null },
      })),
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
}

describe('purchase order chain', () => {
  it('offers the bill beside receiving; F makes it and Gastos returns to this order and its queue', async () => {
    await mountAt(
      '/compras/orden/PO-2?list=%2Fcompras%3Fsegment%3Dpor-recibir%26foco%3DPO-2',
    )
    const buttons = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(buttons).toEqual(
      expect.arrayContaining([
        'Recibir en Escáner',
        'Registrar factura del proveedor',
      ]),
    )
    press('f')
    await flush()
    expect(calls.find(([m]) => m === 'start_bill')[1]).toMatchObject({
      name: 'PO-2',
    })
    expect(router.currentRoute.value.name).toBe('GastoFactura')
    expect(router.currentRoute.value.params.name).toBe('PINV-7')
    expect(router.currentRoute.value.query).toEqual({
      return_to:
        '/crm/compras/orden/PO-2?list=%2Fcompras%3Fsegment%3Dpor-recibir%26foco%3DPO-2',
      return_label: 'Compras',
    })
  })

  it('back from Gastos says the bill is registered and links it', async () => {
    answers.order = order({ per_received: 100, per_billed: 100 }, [])
    answers.order.bills = [
      {
        name: 'PINV-7',
        bill_no: 'F-1',
        docstatus: 1,
        outstanding_amount: 2850,
        currency: 'MXN',
      },
    ]
    await mountAt('/compras/orden/PO-2?done=Purchase%20Invoice%3APINV-7')
    expect(root.textContent).toContain('Bill PINV-7 registered')
    expect(router.currentRoute.value.query.done).toBeUndefined()
    expect(root.querySelector('[data-order-bills]').textContent).toContain(
      'F-1',
    )
  })

  it('the list’s O opens the review of a prepared purchase once', async () => {
    answers.order = order({ docstatus: 0, status: 'Draft' }, [
      {
        key: 'confirm',
        label: 'Revisar y confirmar',
        allowed: true,
        primary: true,
      },
    ])
    await mountAt('/compras/orden/PO-2?accion=confirmar')
    expect(router.currentRoute.value.query.accion).toBeUndefined()
    expect(document.body.textContent).toContain('Confirm purchase')
  })

  it('a step not available here says so instead of doing nothing', async () => {
    const { toast } = await import('frappe-ui')
    answers.order = order({ per_received: 100 }, [])
    await mountAt('/compras/orden/PO-2')
    press('r')
    await flush()
    expect(toast.success).toHaveBeenCalledWith(
      'Nothing left to receive on this purchase.',
    )
    expect(calls.some(([m]) => m === 'start_receipt')).toBe(false)
  })
})
