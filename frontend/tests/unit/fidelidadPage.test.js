import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('@/documentos/api', async (importOriginal) => ({
  ...(await importOriginal()),
  docApi: vi.fn(async () => ({ rows: [] })),
}))
import { call } from 'frappe-ui'
import { docApi } from '@/documentos/api'
import Fidelidad from '@/pages/Fidelidad.vue'
import PromoSheet from '@/components/fidelidad/PromoSheet.vue'
import CuponSheet from '@/components/fidelidad/CuponSheet.vue'

const API = 'doco.fidelidad.api'
const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
  vi.restoreAllMocks()
})
const originalWidth = window.innerWidth
function resize(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}
afterEach(() => resize(originalWidth))
/** The room the page measures for its board (the shell's rail and the Ventas
 * column take the rest of the window), reported after layout as a browser's
 * ResizeObserver does. */
function room(width) {
  class Observer {
    constructor(report) {
      this.report = report
    }
    observe() {
      setTimeout(() =>
        this.report([
          {
            borderBoxSize: [{ inlineSize: width, blockSize: 800 }],
            contentRect: { width, height: 800 },
          },
        ]),
      )
    }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = Observer
  cleanups.push(() => delete window.ResizeObserver)
}
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}
const text = (el) => el.textContent.replace(/\s+/g, ' ')

const offer = (name, state, extra = {}) => ({
  name,
  title: name,
  state,
  ending_soon: false,
  ends_in: 10,
  target: { kind: 'item_group', name: 'Fundas', label: 'Fundas' },
  discount: { kind: 'percent', value: 10 },
  min_amount: null,
  valid_from: '2026-10-01',
  valid_upto: '2026-11-09',
  coupon_based: false,
  auto: true,
  coupons: { issued: 0, used: 0 },
  ...extra,
})
const CAPS = {
  register: true,
  create_offer: true,
  edit_offer: true,
  issue_coupon: true,
  adjust_points: true,
  edit_groups: true,
  denied: { create_offer: null, issue_coupon: null, adjust_points: null },
}
const board = (extra = {}) => ({
  company: 'Grupo Doco',
  currency: 'MXN',
  offers: [
    offer('Mes Patrio', 'live', { ending_soon: true, ends_in: 1 }),
    offer('Buen Fin', 'scheduled', { coupon_based: true }),
  ],
  counts: { live: 1, scheduled: 1, paused: 0, ended: 0, ending_soon: 1 },
  program: {
    state: 'active',
    members: 3,
    collection_factor: 10,
    conversion_factor: 0.1,
    expiry_days: 365,
  },
  capabilities: CAPS,
  ...extra,
})

function answer(map) {
  call.mockImplementation(async (method, args) => {
    const key = method.replace(`${API}.`, '')
    const value = map[key]
    if (value instanceof Error) throw value
    return typeof value === 'function' ? value(args) : value
  })
}

async function mountApp(component, props = {}, path = '/ventas/fidelidad') {
  const page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/ventas/fidelidad', name: 'Fidelidad', component: page },
      { path: '/productos/precios', name: 'Precios', component: page },
      { path: '/contactos', name: 'Contactos', component: page },
      { path: '/contactos/:source/:name', name: 'Contacto', component: page },
    ],
  })
  await router.push(path)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(component, props)
  app.config.globalProperties.__ = globalThis.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, router }
}

describe('Fidelidad page on a phone', () => {
  beforeEach(() => resize(412))

  it('shows the four quick jobs and the running promotions', async () => {
    answer({ get_board: board() })
    const { el } = await mountApp(Fidelidad)
    const tiles = [...el.querySelectorAll('[data-fidelidad-rapidas] button')]
    expect(tiles.map((b) => text(b).trim())).toEqual([
      'New promotion',
      'Give a coupon',
      'Adjust points',
      'Prices',
    ])
    const rows = el.querySelector('[data-testid=fidelidad-promos]')
    expect(text(rows)).toContain('Mes Patrio')
    expect(text(rows)).toContain('Ends tomorrow')
    expect(text(rows)).toContain('Ends soon')
    expect(text(rows)).not.toContain('Buen Fin')
  })

  it('switches to scheduled promotions from the state chip in the URL', async () => {
    answer({ get_board: board() })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?estado=scheduled',
    )
    const rows = el.querySelector('[data-testid=fidelidad-promos]')
    expect(text(rows)).toContain('Buen Fin')
    expect(text(rows)).not.toContain('Mes Patrio')
  })

  it('says who can do a quick job the reader may not', async () => {
    answer({
      get_board: board({
        capabilities: {
          ...CAPS,
          create_offer: false,
          denied: {
            ...CAPS.denied,
            create_offer: 'A sales manager can do it.',
          },
        },
      }),
    })
    const { el } = await mountApp(Fidelidad)
    const tile = el.querySelector('[data-testid=fidelidad-rapida-promo]')
    tile.click()
    await flush(2)
    expect(text(el.querySelector('[data-testid=fidelidad-denied]'))).toContain(
      'A sales manager can do it.',
    )
    expect(
      document.querySelector('[data-testid=fidelidad-promo-sheet]'),
    ).toBeNull()
  })

  it('ranks points members and offers «Ajustar» to a manager', async () => {
    answer({
      get_board: board(),
      get_members: [
        {
          name: 'C-1',
          customer_name: 'Aldo',
          customer_group: 'Mostrador',
          points: 245,
        },
        {
          name: 'C-2',
          customer_name: 'Bety',
          customer_group: 'Mostrador',
          points: 10,
        },
      ],
    })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=puntos',
    )
    const list = el.querySelector('[data-testid=fidelidad-miembros]')
    expect(text(list)).toMatch(/Aldo.*245 pts.*Bety.*10 pts/)
    expect(el.querySelector('[data-testid=fidelidad-ajustar-0]')).not.toBeNull()
    expect(
      text(el.querySelector('[data-testid=fidelidad-programa]')),
    ).toContain('365 days')
  })

  it('lists customer groups with their price list', async () => {
    answer({
      get_board: board(),
      get_groups: {
        groups: [
          {
            name: 'Mayoreo',
            label: 'Mayoreo',
            customers: 4,
            price_list: 'Mayoreo',
          },
          {
            name: 'Mostrador',
            label: 'Mostrador',
            customers: 90,
            price_list: null,
          },
        ],
        price_lists: ['Mayoreo', 'Venta'],
      },
    })
    const { el } = await mountApp(
      Fidelidad,
      {},
      '/ventas/fidelidad?vista=grupos',
    )
    const list = text(el.querySelector('[data-testid=fidelidad-grupos]'))
    expect(list).toContain('4 customers · Mayoreo')
    expect(list).toContain('90 customers · Default price list')
  })
})

const GROUPS = {
  groups: [
    { name: 'Mayoreo', label: 'Mayoreo', customers: 4, price_list: 'Mayoreo' },
    { name: 'Mostrador', label: 'Mostrador', customers: 90, price_list: null },
  ],
  price_lists: ['Mayoreo', 'Venta'],
}
const member = (n) => ({
  name: `C-${n}`,
  customer_name: `Cliente ${n}`,
  customer_group: 'Mostrador',
  points: 100 - n,
})

describe('Fidelidad page on desktop', () => {
  beforeEach(() => resize(1440))

  it('shows the whole board at once, the quick jobs in the bar', async () => {
    room(1200)
    answer({
      get_board: board({
        offers: [
          offer('Mes Patrio', 'live', { ending_soon: true, ends_in: 1 }),
          offer('Cupón amigo', 'live', {
            coupon_based: true,
            coupons: { issued: 4, used: 1 },
          }),
          offer('Buen Fin', 'scheduled'),
        ],
        counts: { live: 2, scheduled: 1, paused: 0, ended: 0, ending_soon: 1 },
      }),
      get_members: [member(1), member(2)],
      get_groups: GROUPS,
    })
    const { el } = await mountApp(Fidelidad)
    const bar = el.querySelector('[data-appbar] [data-fidelidad-rapidas]')
    expect(
      [...bar.querySelectorAll('button')].map((b) => text(b).trim()),
    ).toEqual(['New promotion', 'Give a coupon', 'Adjust points', 'Prices'])
    expect(el.querySelector('[role=tablist], [data-ui-segmented]')).toBeNull()

    const figures = text(el.querySelector('[data-testid=fidelidad-cifras]'))
    expect(figures).toMatch(/Promotions running\s*2\s*1 ending soon/)
    expect(figures).toMatch(/Coupons used\s*1\s*of 4 given/)
    expect(figures).toMatch(/Points members\s*3/)
    expect(figures).toMatch(
      /Groups with their own prices\s*1\s*4 customers buy at them/,
    )

    const rows = [...el.querySelectorAll('[data-fidelidad-promo-fila]')]
    expect(rows.map((r) => text(r))).toEqual([
      expect.stringMatching(
        /Mes Patrio.*Ends tomorrow.*10 %.*No coupon needed.*Ends soon/,
      ),
      expect.stringMatching(/Cupón amigo.*1 of 4 used.*Running/),
    ])
    const groups = [...el.querySelectorAll('[data-fidelidad-grupo-fila]')]
    expect(text(groups[1])).toMatch(/Mostrador.*90.*Default price list/)
    expect(text(el.querySelector('[data-testid=fidelidad-miembros]'))).toMatch(
      /Cliente 1.*99 pts.*Cliente 2/,
    )
    const methods = call.mock.calls.map(([m]) => m.replace(`${API}.`, ''))
    expect(methods).toEqual(
      expect.arrayContaining(['get_board', 'get_members', 'get_groups']),
    )
  })

  it('opens a promotion from its table row', async () => {
    room(1200)
    answer({
      get_board: board(),
      get_members: [],
      get_groups: GROUPS,
      get_offer: (args) => offer(args.name, 'live'),
    })
    const { el } = await mountApp(Fidelidad)
    el.querySelector('[data-fidelidad-promo-fila]').click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-testid=fidelidad-oferta-sheet]'),
      ).not.toBeNull(),
    )
    expect(call).toHaveBeenCalledWith(`${API}.get_offer`, {
      name: 'Mes Patrio',
    })
  })

  it('folds the table into list rows and the bar into icons when narrow', async () => {
    room(600)
    answer({ get_board: board(), get_members: [], get_groups: GROUPS })
    const { el } = await mountApp(Fidelidad)
    expect(el.querySelector('[data-fidelidad-promo-fila]')).toBeNull()
    expect(text(el.querySelector('[data-testid=fidelidad-promos]'))).toContain(
      'Mes Patrio',
    )
    expect(text(el.querySelector('[data-testid=fidelidad-grupos]'))).toContain(
      '4 customers · Mayoreo',
    )
    const coupon = el.querySelector('[data-testid=fidelidad-rapida-cupon]')
    expect(coupon.getAttribute('aria-label')).toBe('Give a coupon')
    expect(text(coupon).trim()).toBe('')
    expect(
      text(el.querySelector('[data-testid=fidelidad-rapida-promo]')).trim(),
    ).toBe('New promotion')
  })

  it('folds a long points ranking under its first rows', async () => {
    room(1200)
    answer({
      get_board: board(),
      get_members: Array.from({ length: 10 }, (_, i) => member(i + 1)),
      get_groups: GROUPS,
    })
    const { el } = await mountApp(Fidelidad)
    const rows = () =>
      el.querySelectorAll('[data-testid=fidelidad-miembros] > li').length
    expect(rows()).toBe(8)
    const more = el.querySelector('[data-testid=fidelidad-miembros-todos]')
    expect(text(more).trim()).toBe('Show all 10')
    more.click()
    await flush(2)
    expect(rows()).toBe(10)
  })

  it('says how to start a points program in place of the ranking', async () => {
    room(1200)
    answer({
      get_board: board({ program: { state: 'no_program', can_create: true } }),
      get_groups: GROUPS,
    })
    const { el } = await mountApp(Fidelidad)
    expect(text(el)).toContain('Create it from a customer')
    expect(el.querySelector('[data-testid=fidelidad-miembros]')).toBeNull()
    expect(call.mock.calls.some(([m]) => m === `${API}.get_members`)).toBe(
      false,
    )
  })
})

describe('Nueva promoción sheet', () => {
  it('starts a ticket promotion in a few taps', async () => {
    answer({
      create_offer: (args) => ({
        name: 'P1',
        title: 'P1',
        state: 'live',
        coupon_based: false,
        request: args,
      }),
    })
    const onCreated = vi.fn()
    await mountApp(PromoSheet, { open: true, company: 'Grupo Doco', onCreated })
    const sheet = document.querySelector('[data-testid=fidelidad-promo-sheet]')
    sheet.querySelector('[data-testid=promo-target-ticket]').click()
    await flush(2)
    sheet.querySelector('[data-testid=promo-minimo-500]').click()
    sheet.querySelector('[data-testid=promo-valor-15]').click()
    const until = sheet.querySelectorAll('[data-testid^=promo-hasta-]')
    until[until.length - 1].click()
    await flush(2)
    expect(text(sheet.querySelector('[data-testid=promo-preview]'))).toContain(
      '15 % off the whole ticket from',
    )
    document.querySelector('[data-testid=promo-iniciar]').click()
    await flush()
    const [method, args] = call.mock.calls.at(-1)
    expect(method).toBe(`${API}.create_offer`)
    const data = JSON.parse(args.data)
    expect(data).toMatchObject({
      apply_on: 'Transaction',
      value: 15,
      min_amount: 500,
      valid_upto: '',
      coupon_based: false,
      company: 'Grupo Doco',
    })
    expect(args.request_id).toBeTruthy()
    expect(onCreated).toHaveBeenCalled()
  })

  it('asks for the category before starting', async () => {
    await mountApp(PromoSheet, { open: true })
    document.querySelector('[data-testid=promo-iniciar]').click()
    await flush(2)
    expect(
      text(document.querySelector('[data-testid=promo-missing]')),
    ).toContain('Choose the category.')
    expect(call).not.toHaveBeenCalled()
    expect(docApi).toHaveBeenCalledWith(
      'rows',
      expect.objectContaining({ doctype: 'Item Group' }),
    )
  })
})

describe('Regalar cupón sheet', () => {
  it('gives the customer of the deal a coupon of the only coupon promotion', async () => {
    answer({
      issue_coupon: {
        coupon: {
          name: 'X',
          code: 'AB12CD34EF',
          personal: true,
          customer_name: 'Aldo',
          valid_upto: '2026-11-09',
          uses: { used: 0, maximum: 1 },
          state: 'active',
        },
        offer: 'Buen Fin',
      },
    })
    await mountApp(CuponSheet, {
      open: true,
      board: board(),
      customer: { name: 'C-1', title: 'Aldo' },
    })
    const sheet = document.querySelector('[data-testid=fidelidad-cupon-sheet]')
    expect(
      text(sheet.querySelector('[data-testid=cupon-cliente-picked]')),
    ).toContain('Aldo')
    document.querySelector('[data-testid=cupon-dar]').click()
    await flush()
    const [method, args] = call.mock.calls.at(-1)
    expect(method).toBe(`${API}.issue_coupon`)
    expect(JSON.parse(args.data)).toEqual({
      offer: 'Buen Fin',
      customer: 'C-1',
    })
    expect(
      text(document.querySelector('[data-testid=cupon-codigo]')),
    ).toContain('AB12CD34EF')
  })

  it('says who can give coupons instead of a form', async () => {
    await mountApp(CuponSheet, {
      open: true,
      board: board({
        capabilities: {
          ...CAPS,
          issue_coupon: false,
          denied: {
            ...CAPS.denied,
            issue_coupon: 'A sales manager or accounts user can do it.',
          },
        },
      }),
    })
    expect(
      text(document.querySelector('[data-testid=cupon-denied]')),
    ).toContain('A sales manager or accounts user can do it.')
    expect(document.querySelector('[data-testid=cupon-dar]')).toBeNull()
  })
})
