import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/documentos/tools', async (importOriginal) => ({
  ...(await importOriginal()),
  copyText: vi.fn(async () => true),
}))
import { call, toast } from 'frappe-ui'
import { copyText } from '@/documentos/tools'
import ClientePanel from '@/components/ventas/ClientePanel.vue'

const CLIENT = 'doco_marketing.api.contact360.get_contact_client'
const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(props = {}) {
  const page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/inbox', name: 'Inbox', component: page },
      { path: '/ventas/deal/:dealId', name: 'Deal 360', component: page },
      { path: '/prospectos/:leadId', name: 'Prospecto', component: page },
      { path: '/contactos', name: 'Contactos', component: page },
      { path: '/contactos/:source/:name', name: 'Contacto', component: page },
    ],
  })
  await router.push('/inbox')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(ClientePanel, {
    contact: 'CONT-1',
    deal: 'DEAL-3',
    returnTo: '/crm/inbox?deal=DEAL-3',
    returnLabel: 'Ventas',
    ...props,
  })
  app.config.globalProperties.__ = (s, args) =>
    String(s).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
  globalThis.__ = app.config.globalProperties.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, app, router }
}
const deal = (name, kind, extra = {}) => ({
  name,
  title: `Trato ${name}`,
  status: kind,
  status_label: { won: 'Ganado', lost: 'Perdido', open: 'En cotización' }[kind],
  kind,
  value: null,
  currency: 'MXN',
  date: '2026-10-01',
  current: false,
  ...extra,
})
const member = {
  state: 'member',
  company: 'Doco',
  currency: 'MXN',
  program: { name: 'P', label: 'Puntos' },
  tier: 'Oro',
  points: 320,
  points_value: 32,
  next_expiry: { date: '2026-12-01', points: 20 },
  monedero: { balance: 150, sources: 1 },
  gift_cards_used: 2,
  last_purchase: '2026-10-01',
  blocked: null,
  actions: { enroll: false, sell: true, deposit: true, adjust: false },
}
function payload(over = {}) {
  return {
    contact: {
      name: 'CONT-1',
      full_name: 'Itker Llamas',
      first_seen: '2026-08-29',
    },
    deals: {
      rows: [
        deal('DEAL-1', 'won', { value: 1500, date: '2026-09-01' }),
        deal('DEAL-2', 'lost', { date: '2026-09-15' }),
        deal('DEAL-3', 'open', { current: true, date: '2026-10-20' }),
        deal('DEAL-4', 'won', { value: 450, date: '2026-10-25' }),
      ],
      total: 4,
      open: 1,
      won: 2,
      lost: 1,
      won_value: [{ currency: 'MXN', amount: 1950 }],
    },
    leads: {
      rows: [
        {
          name: 'LEAD-1',
          title: 'Itker',
          status: 'Converted',
          status_label: 'Convertido',
          kind: 'converted',
          date: '2026-08-29',
        },
      ],
      total: 1,
      open: 0,
    },
    customers: [
      {
        name: 'CUST-1',
        customer_name: 'Itker Llamas',
        customer_group: 'Mostrador',
        disabled: false,
        can_change_group: true,
        loyalty: member,
        coupons: [
          {
            code: 'REGALO10',
            label: 'Regalo',
            type: 'Gift Card',
            valid_upto: '2026-12-31',
          },
        ],
        referral: { code: 'AMIGO7', label: null },
      },
    ],
    ...over,
  }
}
// What a reader hears: every text node, separated as the layout separates them.
const text = (node) => {
  if (!node) return undefined
  const parts = []
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) parts.push(walker.currentNode.textContent)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

describe('«Cliente» beside a deal', () => {
  it('reads the person once, with the deal open beside it', async () => {
    call.mockResolvedValue(payload())
    await mount()
    expect(call).toHaveBeenCalledWith(CLIENT, {
      contact: 'CONT-1',
      lead: null,
      deal: 'DEAL-3',
    })
  })

  it('counts how it has gone and lists the history, this deal first', async () => {
    call.mockResolvedValue(payload())
    const { el } = await mount()
    const tiles = [
      ...el.querySelectorAll('[data-testid="cliente-tratos"] > div'),
    ]
    expect(tiles.map(text)).toEqual([
      expect.stringMatching(/^Won 2 .*1,950/),
      'Open 1',
      'Lost 1',
    ])
    const items = [...el.querySelectorAll('[data-cliente-item]')]
    expect(items.map((a) => a.dataset.clienteItem)).toEqual([
      'DEAL-3',
      'DEAL-4',
      'DEAL-2',
      'DEAL-1',
    ])
    expect(items[0].getAttribute('aria-current')).toBe('page')
    expect(text(items[0])).toContain('this one')
    expect(items[1].getAttribute('href')).toBe('/crm/ventas/deal/DEAL-4')
    // Five in all: the fifth (the prospect) waits behind «Show all 5».
    const more = el.querySelector('[data-testid="cliente-ver-todo"]')
    expect(text(more)).toBe('Show all 5')
    more.click()
    await flush()
    const lead = el.querySelector('[data-cliente-item="LEAD-1"]')
    expect(lead.getAttribute('href')).toBe('/crm/prospectos/LEAD-1')
    expect(text(lead)).toContain('Convertido')
    expect(
      el.querySelector('[data-testid="cliente-ficha"]').getAttribute('href'),
    ).toMatch(/^\/crm\/contactos\/[a-z-]+\/CONT-1$/)
  })

  it('shows the card, points, monedero and codes, and sends spending to the register', async () => {
    call.mockResolvedValue(payload())
    const { el } = await mount()
    expect(text(el.querySelector('[data-testid="cliente-puntos"]'))).toMatch(
      /Points Oro 320 worth .*32/,
    )
    expect(text(el)).toContain('20 points expire on')
    expect(text(el.querySelector('[data-testid="cliente-monedero"]'))).toMatch(
      /Monedero .*150/,
    )
    expect(text(el)).toContain('Gift cards they paid with 2')
    const deposit = new URL(
      el.querySelector('[data-testid="cliente-abonar"]').href,
      'https://x.test',
    )
    expect(deposit.pathname).toBe('/posapp/pos')
    expect(deposit.searchParams.get('customer')).toBe('CUST-1')
    expect(deposit.searchParams.get('intent')).toBe('deposit')
    expect(deposit.searchParams.get('return_to')).toBe('/crm/inbox?deal=DEAL-3')
    const sell = new URL(
      el.querySelector('[data-testid="cliente-vender"]').href,
      'https://x.test',
    )
    expect(sell.searchParams.get('intent')).toBeNull()
    expect(sell.searchParams.get('return_label')).toBe('Ventas')

    el.querySelector('[data-testid="cliente-cupon"] button').click()
    await flush()
    expect(copyText).toHaveBeenCalledWith('REGALO10')
    expect(toast.success).toHaveBeenCalledWith('Copied: REGALO10')
    expect(
      text(el.querySelector('[data-testid="cliente-referido"]')),
    ).toContain('AMIGO7')
  })

  it('changes the customer group in a sheet and reads the person again', async () => {
    call.mockImplementation(async (method) => {
      if (method === CLIENT) return payload()
      if (method === 'frappe.client.get_list')
        return [{ name: 'Mayoreo' }, { name: 'Mostrador' }]
      if (method === 'frappe.client.set_value') return {}
      throw new Error(method)
    })
    const { el } = await mount()
    el.querySelector('[data-testid="cliente-cambiar-grupo"]').click()
    await flush()
    const sheet = document.querySelector('[data-testid="cliente-grupos"]')
    const options = [...sheet.querySelectorAll('button')]
    expect(options.map(text)).toEqual(['Mayoreo', 'Mostrador'])
    expect(options[1].getAttribute('aria-pressed')).toBe('true')
    const save = document.querySelector('[data-testid="cliente-guardar-grupo"]')
    expect(save.disabled).toBe(true)
    options[0].click()
    await flush()
    save.click()
    await flush()
    expect(call).toHaveBeenCalledWith('frappe.client.set_value', {
      doctype: 'Customer',
      name: 'CUST-1',
      fieldname: 'customer_group',
      value: 'Mayoreo',
    })
    expect(call.mock.calls.filter(([m]) => m === CLIENT)).toHaveLength(2)
    expect(text(el)).toContain('Group saved: Mayoreo.')
  })

  it('activates the customer card where the reader may', async () => {
    const notMember = {
      ...member,
      state: 'not_member',
      tier: null,
      points: 0,
      actions: { enroll: true, sell: true, deposit: true },
    }
    call.mockImplementation(async (method) => {
      if (method === CLIENT)
        return payload({
          customers: [{ ...payload().customers[0], loyalty: notMember }],
        })
      if (method === 'doco.clientes_frecuentes.api.enroll_customer') return {}
      throw new Error(method)
    })
    const { el } = await mount()
    expect(text(el.querySelector('[data-testid="cliente-tarjeta"]'))).toContain(
      'No customer card yet.',
    )
    el.querySelector('[data-testid="cliente-activar-tarjeta"]').click()
    await flush()
    expect(call).toHaveBeenCalledWith(
      'doco.clientes_frecuentes.api.enroll_customer',
      { customer: 'CUST-1', company: 'Doco' },
    )
    expect(text(el)).toContain('Card activated')
  })

  it('says who can activate the card when the reader cannot, and why it failed when it did', async () => {
    const denied = {
      ...member,
      state: 'not_member',
      actions: { enroll: false, enroll_denied: true, sell: false },
    }
    call.mockResolvedValue(
      payload({ customers: [{ ...payload().customers[0], loyalty: denied }] }),
    )
    const { el } = await mount()
    expect(text(el.querySelector('[data-testid="cliente-tarjeta"]'))).toBe(
      'No customer card yet. A manager can activate it.',
    )
    expect(
      el.querySelector('[data-testid="cliente-activar-tarjeta"]'),
    ).toBeNull()
    expect(el.querySelector('[data-testid="cliente-vender"]')).toBeNull()
  })

  it('a prospect with no contact yet says so, and a person not yet a customer says how', async () => {
    call.mockResolvedValue({
      contact: null,
      deals: null,
      leads: null,
      customers: [],
    })
    const { el } = await mount({ contact: '', lead: 'LEAD-9', deal: '' })
    expect(call).toHaveBeenCalledWith(CLIENT, {
      contact: null,
      lead: 'LEAD-9',
      deal: null,
    })
    expect(el.querySelector('[data-testid="cliente-sin-ficha"]')).not.toBeNull()

    cleanups.splice(0).forEach((fn) => fn())
    call.mockResolvedValue(
      payload({
        customers: [],
        deals: { rows: [], total: 0, open: 0, won: 0, lost: 0, won_value: [] },
        leads: { rows: [], total: 0, open: 0 },
      }),
    )
    const second = await mount()
    expect(
      second.el.querySelector('[data-testid="cliente-sin-cliente"]'),
    ).not.toBeNull()
    expect(
      second.el.querySelector('[data-testid="cliente-sin-historial"]'),
    ).not.toBeNull()
  })

  it('moving to another person drops a late answer for the previous one', async () => {
    let first
    call.mockImplementationOnce(
      () => new Promise((resolve) => (first = resolve)),
    )
    call.mockResolvedValueOnce(
      payload({
        contact: { name: 'CONT-2', full_name: 'Otra', first_seen: null },
      }),
    )
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { createApp: make, ref, h } = await import('vue')
    const contact = ref('CONT-1')
    const router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [
        { path: '/', component: { template: '<div />' } },
        {
          path: '/contactos/:source/:name',
          name: 'Contacto',
          component: { template: '<div />' },
        },
        {
          path: '/contactos',
          name: 'Contactos',
          component: { template: '<div />' },
        },
        {
          path: '/ventas/deal/:dealId',
          name: 'Deal 360',
          component: { template: '<div />' },
        },
        {
          path: '/prospectos/:leadId',
          name: 'Prospecto',
          component: { template: '<div />' },
        },
      ],
    })
    await router.push('/')
    const app = make({
      render: () => h(ClientePanel, { contact: contact.value }),
    })
    app.config.globalProperties.__ = (s, args) =>
      String(s).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
    app.use(router).mount(el)
    cleanups.push(() => {
      app.unmount()
      el.remove()
    })
    await flush()
    contact.value = 'CONT-2'
    await flush()
    first(payload())
    await flush()
    expect(
      el.querySelector('[data-testid="cliente-ficha"]').getAttribute('href'),
    ).toMatch(/CONT-2$/)
  })
})
