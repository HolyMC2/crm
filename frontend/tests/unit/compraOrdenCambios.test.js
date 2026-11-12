// A confirmed purchase changes like Desk's Purchase Order does: its lines
// («Cambiar artículos», never under what arrived), the supplier's confirmation
// and the delivery date, and its state (hold with a reason, resume, close,
// re-open); a draft's «Más datos» takes Desk's order data (contact, addresses,
// currency, price list, project, cost center, incoterm).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import CompraOrden from '@/pages/CompraOrden.vue'
import OrdenMasDatos from '@/components/compras/OrdenMasDatos.vue'
import {
  comprasBoot,
  forgetCompanyData,
  forgetSupplierData,
  moreFrom,
  morePayload,
  moreValues,
} from '@/composables/useCompras'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const ROWS = [
  {
    name: 'r1',
    item_code: 'FUNDA-A17',
    item_name: 'Funda A17',
    qty: 3,
    uom: 'Pza',
    stock_uom: 'Pza',
    rate: 100,
    price_list_rate: 100,
    discount_percentage: 0,
    amount: 300,
    received_qty: 1,
    remaining_qty: 2,
    billed_amt: 0,
    removable: false,
  },
  {
    name: 'r2',
    item_code: 'MICA-A17',
    item_name: 'Mica A17',
    qty: 2,
    uom: 'Pza',
    stock_uom: 'Pza',
    rate: 40,
    price_list_rate: 40,
    discount_percentage: 0,
    amount: 80,
    received_qty: 0,
    remaining_qty: 2,
    billed_amt: 0,
    removable: true,
  },
]
const change = (key, label, extra = {}) => ({
  key,
  label,
  allowed: true,
  reason: null,
  resolve: null,
  ...extra,
})
const order = (extra = {}, changes = []) => ({
  document: {
    doctype: 'Purchase Order',
    name: 'PO-9',
    party: 'Perfeccel',
    supplier: 'PERFECCEL',
    company: 'Tienda',
    schedule_date: '2026-11-20',
    docstatus: 1,
    status: 'To Receive and Bill',
    per_received: 20,
    per_billed: 0,
    grand_total: 380,
    currency: 'MXN',
    company_currency: 'MXN',
    modified: '2026-11-11 10:00:00',
    labels: {},
    restricted: [],
    ...extra,
  },
  rows: ROWS,
  rows_scope: { total: 2, has_more: false },
  receipts: { rows: [] },
  bills: [],
  actions: [],
  changes,
  followups: { rows: [] },
})
let answers, calls, app, root
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
    order: order({}, [
      change('lines', 'Cambiar artículos'),
      change('details', 'Confirmación y entrega'),
      change('hold', 'Poner en espera'),
      change('close', 'Cerrar compra'),
    ]),
    companies: [],
    update_lines: { name: 'PO-9', docstatus: 1, modified: 'x' },
    change_status: { name: 'PO-9', docstatus: 1, modified: 'x' },
    save_confirmed: { name: 'PO-9', docstatus: 1, modified: 'x' },
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

async function mountOrder() {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/compras/orden/:name',
        name: 'CompraOrden',
        component: CompraOrden,
        props: true,
      },
      ...['Compras', 'CompraSolicitud', 'CompraRecepcion', 'Gastos'].map(
        (name) => ({
          path: `/${name}/:name?`,
          name,
          component: { render: () => null },
        }),
      ),
    ],
  })
  router.push('/compras/orden/PO-9')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
}
const sent = (method) => calls.filter(([name]) => name === method)
function type(input, value) {
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function openBolt() {
  const bolt = root.querySelector('[data-testid="documentos-acciones"]')
  bolt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  bolt.click()
  for (let i = 0; i < 50; i++) {
    await flush()
    if (document.querySelector('[data-testid="acciones"]')) return
  }
}
const boltItem = (text) =>
  [...document.querySelectorAll('[data-accion^="paso:"]')].find((el) =>
    el.textContent.includes(text),
  )

describe('a confirmed purchase', () => {
  it('changes its lines from the hero, never under what arrived', async () => {
    await mountOrder()
    const button = root.querySelector('[data-testid="orden-cambiar-lineas"]')
    expect(button.textContent).toContain('Cambiar artículos')
    button.click()
    await flush()
    const sheet = document.querySelector('[data-testid="cambiar-lineas"]')
    expect(sheet).not.toBeNull()
    const save = document.querySelector('[data-testid="cambiar-guardar"]')
    // Nothing changed yet.
    expect(save.disabled).toBe(true)
    // Only the line nothing arrived for can go.
    expect(
      document.querySelectorAll(
        '[data-testid="cambiar-lineas"] [aria-label^="Remove"]',
      ),
    ).toHaveLength(1)
    expect(sheet.textContent).toContain(
      '1 Pza arrived: it cannot go under that.',
    )

    const funda = sheet.querySelector('[data-linea="FUNDA-A17"]')
    const [amount] = funda.querySelectorAll('input')
    type(amount, 0.5)
    await flush()
    expect(funda.textContent).toContain('1 already arrived: put at least that.')
    expect(save.disabled).toBe(true)

    type(amount, 5)
    await flush()
    expect(save.disabled).toBe(false)
    expect(
      document.querySelector('[data-testid="cambiar-total"]').textContent,
    ).toContain('580')
    const before = sent('order').length
    save.click()
    await flush()
    const [, body] = sent('update_lines')[0]
    expect(body.name).toBe('PO-9')
    expect(body.modified).toBe('2026-11-11 10:00:00')
    expect(body.items).toEqual([
      {
        name: 'r1',
        item_code: 'FUNDA-A17',
        qty: 5,
        uom: 'Pza',
        rate: 100,
        discount_percentage: 0,
      },
      {
        name: 'r2',
        item_code: 'MICA-A17',
        qty: 2,
        uom: 'Pza',
        rate: 40,
        discount_percentage: 0,
      },
    ])
    // Saved: the sheet closes and the purchase reads again.
    expect(document.querySelector('[data-testid="cambiar-lineas"]')).toBeNull()
    expect(sent('order').length).toBeGreaterThan(before)
  })

  it('a refusal shows in the sheet, beside what was typed', async () => {
    answers.update_lines = undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const method = String(url).split('.').pop()
        calls.push([method, init?.body ? JSON.parse(init.body) : {}])
        if (method === 'update_lines')
          return {
            ok: false,
            status: 417,
            json: async () => ({
              exc_type: 'ValidationError',
              _server_messages: JSON.stringify([
                JSON.stringify({
                  message: 'No se puede bajar de lo recibido.',
                }),
              ]),
            }),
          }
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: answers[method] ?? [] }),
        }
      }),
    )
    await mountOrder()
    root.querySelector('[data-testid="orden-cambiar-lineas"]').click()
    await flush()
    const mica = document.querySelector('[data-linea="MICA-A17"]')
    type(mica.querySelectorAll('input')[0], 4)
    await flush()
    document.querySelector('[data-testid="cambiar-guardar"]').click()
    await flush()
    const sheet = document.querySelector('[data-testid="cambiar-lineas"]')
    expect(sheet).not.toBeNull()
    expect(
      sheet.closest('[role="dialog"]')?.textContent ||
        document.body.textContent,
    ).toContain('No se puede bajar de lo recibido.')
  })

  it('goes on hold with its reason from the bolt; resume is one tap', async () => {
    await mountOrder()
    await openBolt()
    boltItem('Poner en espera').click()
    await flush()
    const confirm = document.querySelector('[data-testid="estado-confirmar"]')
    expect(confirm.textContent).toContain('Put on hold')
    expect(confirm.disabled).toBe(true)
    type(document.querySelector('.estado-motivo textarea'), 'Sin existencias')
    await flush()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await flush()
    const [, body] = sent('change_status')[0]
    expect(body).toMatchObject({
      name: 'PO-9',
      modified: '2026-11-11 10:00:00',
      change: 'hold',
      reason: 'Sin existencias',
    })

    answers.order = order({ status: 'On Hold' }, [change('resume', 'Reanudar')])
    await mountOrder()
    await openBolt()
    boltItem('Reanudar').click()
    await flush()
    expect(sent('change_status').at(-1)[1]).toMatchObject({
      change: 'resume',
      reason: '',
    })
    expect(
      document.querySelector('[data-testid="estado-confirmar"]'),
    ).toBeNull()
  })

  it('a change that is not the worker’s asks someone instead', async () => {
    answers.order = order({}, [
      change('close', 'Cerrar compra', {
        allowed: false,
        reason: 'Solo quien confirma compras cambia su estado.',
        resolve: { kind: 'handoff', action: 'review', label: 'Pedir revisión' },
      }),
    ])
    answers.handoff_options = {
      candidates: [{ user: 'gerente@example.test', full_name: 'Gerente' }],
    }
    await mountOrder()
    expect(
      root.querySelector('[data-testid="orden-cambiar-lineas"]'),
    ).toBeNull()
    await openBolt()
    expect(boltItem('Cerrar compra')).toBeUndefined()
    boltItem('Pedir revisión').click()
    await flush()
    expect(sent('change_status')).toHaveLength(0)
    expect(sent('handoff_options').at(-1)[1]).toMatchObject({
      action: 'review',
    })
    expect(document.body.textContent).toContain(
      'Solo quien confirma compras cambia su estado.',
    )
  })

  it('reads the supplier’s confirmation and Desk’s order data in its details', async () => {
    answers.order = order({
      order_confirmation_no: 'PERF-2231',
      order_confirmation_date: '2026-11-11',
      contact_person: 'Ana-PERFECCEL',
      cost_center: 'Tienda - TD',
      currency: 'USD',
      company_currency: 'MXN',
      conversion_rate: 18.5,
      incoterm: 'FOB',
      named_place: 'Manzanillo',
      project: null,
      labels: { contact_person: 'Ana Ruiz', cost_center: 'Tienda' },
      restricted: ['project'],
    })
    await mountOrder()
    const details = root.querySelector('[aria-labelledby="orden-datos"]')
    const text = details.textContent
    expect(text).toContain('PERF-2231')
    expect(text).toContain('Ana Ruiz')
    expect(text).not.toContain('Ana-PERFECCEL')
    expect(text).toContain('FOB, Manzanillo')
    expect(text).toContain('USD, 1 USD =')
    expect(text).toContain('one you cannot see')
  })
})

describe('«Más datos» on a draft', () => {
  async function mountMas(props) {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(OrdenMasDatos, props) })
    app.config.globalProperties.__ = window.__
    app.mount(root)
    await flush()
    root.querySelector('[data-testid="compra-mas-datos"] button').click()
    await flush()
  }

  it('the supplier’s contact waits for the supplier; a hidden value stays', async () => {
    await mountMas({
      values: { ...moreFrom({}), restricted: ['cost_center'] },
      company: 'Tienda',
      supplier: '',
    })
    const contact = root.querySelector('[data-mas-campo="contact_person"]')
    expect(contact.querySelector('input').disabled).toBe(true)
    expect(contact.textContent).toContain('Choose the supplier first.')
    expect(
      root.querySelector('[data-mas-campo="cost_center"]').textContent,
    ).toContain('Set to one you cannot see; it stays as it is.')
    // A currency like the company's asks no rate.
    expect(root.textContent).not.toContain('Exchange rate')
  })

  it('a foreign currency asks its rate', async () => {
    await mountMas({
      values: {
        ...moreFrom({ currency: 'USD', company_currency: 'MXN' }),
      },
      company: 'Tienda',
      supplier: 'PERFECCEL',
    })
    expect(root.textContent).toContain('Exchange rate')
    expect(
      root.querySelector('[data-mas-campo="contact_person"] input').disabled,
    ).toBe(false)
  })
})

describe('order data on the wire', () => {
  it('only what the worker changed travels; a hidden value never does', () => {
    const document = {
      contact_person: 'Ana-PERFECCEL',
      cost_center: 'Tienda - TD',
      currency: 'MXN',
      company_currency: 'MXN',
      conversion_rate: 1,
      labels: { contact_person: 'Ana Ruiz' },
      restricted: ['project'],
    }
    const form = {
      ...moreFrom(document),
      more_base: moreValues(moreFrom(document)),
    }
    expect(form.contact_person_label).toBe('Ana Ruiz')
    expect(morePayload(form)).toEqual({})
    form.project = 'PROJ-1'
    form.incoterm = 'FOB'
    expect(morePayload(form)).toEqual({ incoterm: 'FOB' })
    // Another currency drops the old rate: the day's is looked up.
    form.currency = 'USD'
    form.conversion_rate = ''
    expect(morePayload(form)).toMatchObject({
      currency: 'USD',
      conversion_rate: null,
    })
  })

  it('a new supplier drops the old contact without sending it; a new company clears its data', () => {
    const document = {
      contact_person: 'Ana-PERFECCEL',
      supplier_address: 'Bodega-Billing',
      shipping_address: 'Tienda-Shipping',
      cost_center: 'Tienda - TD',
    }
    const form = {
      ...moreFrom(document),
      more_base: moreValues(moreFrom(document)),
    }
    forgetSupplierData(form)
    expect([form.contact_person, form.supplier_address]).toEqual(['', ''])
    expect(morePayload(form)).toEqual({})
    forgetCompanyData(form)
    expect(morePayload(form)).toEqual({
      shipping_address: null,
      cost_center: null,
    })
  })
})
