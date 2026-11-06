// The buying loop in the shell: the suggested levels the owner ticks and saves,
// the floor's lines, the asks without stock and the bot's drafts the seller
// confirms, the settings and budgets as the server takes them, the Compras ›
// Hoy board (its tiles, «Armar pedido» opening the draft in Surtido), the chat's
// «No lo tenía», and every string of these screens in es-MX.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  route: null,
  router: null,
  toast: null,
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({ name: 'CompraHoy', params: {}, query: {} })
  state.router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (_p, { slots }) =>
        () =>
          h('a', slots.default?.()),
    },
    useRoute: () => state.route,
    useRouter: () => state.router,
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  state.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  return {
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, slots }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled, onClick: () => emit('click') },
            props.label || slots.default?.(),
          ),
    },
    FormControl: { render: () => null },
    toast: state.toast,
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  const slot =
    (tag) =>
    (_p, { slots }) =>
    () =>
      h(tag, slots.default?.())
  return {
    AppBar: { props: ['title'], setup: (p) => () => h('header', p.title) },
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, slots.default?.())
            : null,
    },
    EmptyState: {
      props: ['title', 'message', 'action'],
      emits: ['action'],
      setup:
        (p, { emit }) =>
        () =>
          h('div', { 'data-empty': '' }, [
            p.title,
            p.action
              ? h('button', { onClick: () => emit('action') }, p.action)
              : null,
          ]),
    },
    KpiGrid: { setup: slot('div') },
    KpiTile: {
      props: ['label', 'value', 'hint', 'tone'],
      setup: (p) => () =>
        h(
          'div',
          { 'data-tile': p.label, 'data-tone': p.tone },
          `${p.label}: ${p.value} ${p.hint}`,
        ),
    },
    chipClass: () => 'chip',
  }
})
// loaded with defineAsyncComponent: the flag makes Vue take its default export
vi.mock('@/components/compras/LostSaleSheet.vue', () => ({
  __esModule: true,
  default: {
    props: ['open', 'channel', 'referenceDoctype', 'referenceName'],
    setup: (p) => () =>
      p.open
        ? h('div', { 'data-lost-sheet': p.channel }, p.referenceName)
        : null,
  },
}))
vi.mock('@/components/compras/ComprasPicker.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, comprasApi: (...args) => state.api(...args) }
})

import {
  applyPayload,
  boardAlerts,
  budgetUse,
  budgetsPayload,
  cajones,
  leadRows,
  mixText,
  moveLines,
  pickable,
  priceChangeRows,
  pricesQuery,
  settingsPayload,
  splitDrafts,
  suggestionKey,
  tonesText,
} from '@/utils/comprasLoop'
import NivelesSugerencias from '@/components/compras/niveles/NivelesSugerencias.vue'
import NivelesPerdidas from '@/components/compras/niveles/NivelesPerdidas.vue'
import InboxLostSales from '@/components/doco/inbox/InboxLostSales.vue'
import CompraHoy from '@/pages/CompraHoy.vue'

const here = dirname(fileURLToPath(import.meta.url))
const ip12 = {
  item_group: 'Fundas',
  model: 'iPhone 12',
  warehouse: '',
  sold: 12,
  lost: 2,
  per_week: 1.75,
  target_qty: 7,
  min_qty: 4,
  mix: [
    { tone: 'Oscuros', share: 60 },
    { tone: 'Vivos', share: 40 },
  ],
  current: null,
  change: 'nuevo',
  can_apply: true,
}
const a15 = { ...ip12, model: 'Samsung A15', change: 'igual' }
const s23 = { ...ip12, model: 'Samsung S23', change: 'subir', can_apply: false }

describe('the loop’s pure parts', () => {
  it('ticks only a level that changes and the owner may save', () => {
    expect(pickable([ip12, a15, s23])).toEqual([ip12])
    expect(suggestionKey(ip12)).toBe('Fundas|iPhone 12|')
  })

  it('saves the picked suggestions with their mix, nothing else', () => {
    const rows = JSON.parse(
      applyPayload(
        [ip12, a15],
        new Set([suggestionKey(ip12), suggestionKey(a15)]),
      ),
    )
    expect(rows).toEqual([
      {
        item_group: 'Fundas',
        model: 'iPhone 12',
        warehouse: '',
        target_qty: 7,
        min_qty: 4,
        mix: ip12.mix,
      },
    ])
  })

  it('says the mix and the tones in the shop’s words', () => {
    expect(mixText(ip12.mix)).toBe('60 % Oscuros, 40 % Vivos')
    expect(
      tonesText([
        { tone: 'Oscuros', buy: 2 },
        { tone: 'Vivos', buy: 0 },
      ]),
    ).toBe('2 Oscuros')
    expect(tonesText({ Oscuros: 1, Vivos: 3 })).toBe('1 Oscuros, 3 Vivos')
  })

  it('opens Precios on the codes of a surplus row and comes back', () => {
    expect(pricesQuery({ items: ['A', 'B'] })).toEqual({
      codigos: 'A,B',
      return_to: '/crm/compras/niveles?ver=piso',
    })
  })

  it('sends a move’s lines with pieces only, and visits each cajón once', () => {
    expect(
      JSON.parse(
        moveLines([
          { item: 'F-1', qty: 2, bin: 'C1' },
          { item: 'F-2', qty: 0 },
        ]),
      ),
    ).toEqual([{ item: 'F-1', qty: 2, bin: 'C1' }])
    expect(
      cajones([{ cajon: 'C1' }, { cajon: 'C2' }, { cajon: 'C1' }, {}]),
    ).toEqual(['C1', 'C2'])
  })

  it('keeps the bot’s drafts apart from what counts', () => {
    const got = splitDrafts([
      { name: 'VP-1', status: 'Borrador' },
      { name: 'VP-2', status: 'Confirmada' },
    ])
    expect(got.drafts.map((r) => r.name)).toEqual(['VP-1'])
    expect(got.confirmed.map((r) => r.name)).toEqual(['VP-2'])
  })

  it('measures a budget’s month', () => {
    expect(budgetUse({ amount: 1000, committed: 250 })).toEqual({
      pct: 25,
      spent: false,
      left: 750,
    })
    expect(budgetUse({ amount: 1000, committed: 1200 }).spent).toBe(true)
    expect(budgetUse({ amount: 0, committed: 10 }).pct).toBeNull()
  })

  it('gives a tile only to what the person may read', () => {
    const tiles = boardAlerts({
      levels: 4,
      met: 3,
      orders: { count: 2, late: 1 },
      arrivals: null,
      bills: { count: 1, overdue: 0 },
      lost: { qty: 0 },
    })
    expect(tiles.map((t) => [t.key, t.urgent])).toEqual([
      ['levels', true],
      ['orders', true],
      ['bills', false],
      ['lost', false],
    ])
  })

  it('edits only the owner’s own delivery days', () => {
    expect(
      leadRows([
        { supplier: 'S1', days: 5, source: 'proveedor' },
        {
          supplier: 'S2',
          label: 'Accesorios',
          days: 9,
          source: 'medido',
          samples: 3,
        },
      ]).map((r) => [r.label, r.own]),
    ).toEqual([
      ['S1', '5'],
      ['Accesorios', ''],
    ])
  })

  it('sends the settings it has and the displays with a store', () => {
    const got = settingsPayload(
      {
        suggest_weeks: '6',
        order_cycle_days: '',
        review_enabled: false,
        review_weekday: 'Lunes',
        review_hour: 9,
      },
      [
        { display: 'Mostrador', backroom: 'Bodega' },
        { display: '', backroom: '' },
      ],
    )
    expect(JSON.parse(got.values)).toEqual({
      review_enabled: 0,
      suggest_weeks: 6,
      review_hour: 9,
      review_weekday: 'Lunes',
    })
    expect(JSON.parse(got.exhibitions)).toEqual([
      { display: 'Mostrador', backroom: 'Bodega' },
    ])
  })

  it('sends one budget per type', () => {
    expect(
      JSON.parse(
        budgetsPayload([
          { item_group: 'Fundas', amount: '500' },
          { item_group: '', amount: 9 },
          { item_group: 'Fundas', amount: 800 },
        ]),
      ),
    ).toEqual([{ item_group: 'Fundas', amount: 800 }])
  })

  it('names the model a price change prices', () => {
    const low = [
      { model: 'iPhone 12', offers: [{ catalog: 'CAT-1', code: 'f12 ' }] },
    ]
    expect(
      priceChangeRows([{ catalog: 'CAT-1', code: 'F12', kind: 'up' }], low)[0]
        .model,
    ).toBe('iPhone 12')
  })
})

let app = null
let root = null
async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}
async function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await flush()
  return root
}
function button(text) {
  return [...root.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text,
  )
}
function calls(method) {
  return state.api.mock.calls.filter(([m]) => m.endsWith(method))
}

beforeEach(() => {
  state.api.mockReset()
  state.router.push.mockReset()
  state.toast.success.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
})

describe('Niveles › Sugerencias', () => {
  it('ticks what changes and «Use» saves only those', async () => {
    state.api.mockImplementation(async (method) => {
      if (method.endsWith('.suggestions'))
        return {
          groups: [
            {
              item_group: 'Fundas',
              weeks: 8,
              cycle: 14,
              lead: { days: 7, source: 'medido' },
            },
          ],
          rows: [ip12, a15],
          owner: true,
        }
      return { saved: [{ name: 'NS-1' }] }
    })
    await mount(NivelesSugerencias)
    expect(root.textContent).toContain('iPhone 12')
    expect(root.textContent).toContain('Fill up to 7, order below 4')
    expect(root.querySelectorAll('input[type=checkbox]').length).toBe(1)
    button('Use 1').click()
    await flush()
    const [[, args]] = calls('.suggestions_apply')
    expect(JSON.parse(args.rows).map((r) => r.model)).toEqual(['iPhone 12'])
  })

  it('tells a non-owner who uses them', async () => {
    state.api.mockResolvedValue({ groups: [], rows: [ip12], owner: false })
    await mount(NivelesSugerencias)
    expect(root.querySelector('input[type=checkbox]')).toBeNull()
    expect(root.textContent).toContain('The owner uses the suggestions.')
  })
})

describe('Niveles › Perdidas', () => {
  it('shows the bot’s drafts to confirm', async () => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('.lost')
        ? {
            rows: [
              {
                name: 'VP-1',
                title: 'Fundas · iPhone 12 · Rosa · 2',
                status: 'Borrador',
                qty: 2,
              },
              {
                name: 'VP-2',
                title: 'Micas · A15 · 1',
                status: 'Confirmada',
                qty: 1,
              },
            ],
            by_model: [{ model: 'A15', qty: 1, tones: {}, last: '' }],
            days: 90,
          }
        : {},
    )
    await mount(NivelesPerdidas)
    expect(root.textContent).toContain('Noted by the assistant')
    expect(root.textContent).toContain('1 asked')
    button('Confirm').click()
    await flush()
    expect(calls('ventas_perdidas.confirm')[0][1]).toEqual({ name: 'VP-1' })
  })
})

describe('the chat’s «No lo tenía»', () => {
  it('is hidden for someone who may not record', async () => {
    state.api.mockRejectedValue(
      Object.assign(new Error('no'), {
        status: 403,
        exc_type: 'PermissionError',
      }),
    )
    await mount(InboxLostSales, { doctype: 'CRM Deal', name: 'CRM-DEAL-1' })
    expect(root.querySelector('[data-testid=inbox-lost-sales]')).toBeNull()
  })

  it('records from the chat with its deal', async () => {
    state.api.mockResolvedValue([])
    await mount(InboxLostSales, { doctype: 'CRM Deal', name: 'CRM-DEAL-1' })
    expect(calls('.drafts')[0][1]).toEqual({
      reference_doctype: 'CRM Deal',
      reference_name: 'CRM-DEAL-1',
    })
    button('We did not have it').click()
    await flush()
    const sheet = root.querySelector('[data-lost-sheet]')
    expect(sheet.dataset.lostSheet).toBe('WhatsApp')
    expect(sheet.textContent).toBe('CRM-DEAL-1')
  })
})

describe('Compras › Hoy', () => {
  const board = {
    levels: 4,
    met: 3,
    money: 450,
    low: [
      {
        item_group: 'Fundas',
        model: 'iPhone 12',
        warehouse: '',
        need: 5,
        tones: [{ tone: 'Oscuros', buy: 3 }],
        offers: [
          { supplier: 'Accesorios', price: 90, catalog: 'CAT-1', code: 'F12' },
        ],
        cost: 450,
        priced: true,
        lost: 2,
      },
    ],
    nobody: [],
    suppliers: [
      {
        supplier: 'Accesorios',
        catalog: 'CAT-1',
        title: 'Fundas',
        models: 1,
        pieces: 5,
        money: 450,
      },
    ],
    cheaper: [],
    changes: [],
    budgets: [],
    orders: { count: 1, pending: 900, late: 1, oldest: [] },
    arrivals: null,
    bills: null,
    lost: { qty: 2, rows: 1 },
    month: { days: 6, start: '2026-11-01', groups: [] },
    cost_visible: false,
    owner: true,
  }

  it('puts what needs the owner in its tiles', async () => {
    state.api.mockResolvedValue(board)
    await mount(CompraHoy)
    const tiles = [...root.querySelectorAll('[data-tile]')].map(
      (t) => t.dataset.tile,
    )
    expect(tiles).toEqual(['Levels met', 'Open orders', 'Asked without stock'])
    expect(
      root.querySelector('[data-tile="Open orders"]').textContent,
    ).toContain('1 late')
    expect(root.textContent).toContain('5 short')
  })

  it('«Build the order» opens the draft in Surtido', async () => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('.board')
        ? board
        : { pedido: 'PED-0001', total: 450, budget: 450, notes: [] },
    )
    await mount(CompraHoy)
    button('Build the order').click()
    await flush()
    expect(calls('.build_order')[0][1]).toEqual({ supplier: 'Accesorios' })
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'CompraSurtido',
      query: { pedido: 'PED-0001' },
    })
  })
})

describe('the loop’s strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const FILES = [
    'src/pages/CompraHoy.vue',
    'src/pages/CompraNiveles.vue',
    'src/components/compras/LostSaleSheet.vue',
    'src/components/compras/niveles/NivelesAjustes.vue',
    'src/components/compras/niveles/NivelesPerdidas.vue',
    'src/components/compras/niveles/NivelesPiso.vue',
    'src/components/compras/niveles/NivelesSugerencias.vue',
    'src/components/doco/inbox/InboxLostSales.vue',
  ]
  const CONTEXTS = ['Niveles', 'ComprasHoy', 'VentasPerdidas']
  const CALL =
    /\b__\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*'(\w+)'\s*,?\s*\)/g

  for (const file of FILES) {
    const source = readFileSync(resolve(here, '../..', file), 'utf8')
    const calls = [...source.matchAll(CALL)].filter((m) =>
      CONTEXTS.includes(m[3]),
    )

    it(`${file}: every call is a literal the check can read`, () => {
      const ends =
        source.match(/'(Niveles|ComprasHoy|VentasPerdidas)'\s*,?\s*\)/g) || []
      expect(calls.length).toBe(ends.length)
    })

    it(`${file}: every msgid has its es-MX entry`, () => {
      for (const [, , msgid, ctx] of calls)
        expect(po, `${ctx}: ${msgid}`).toContain(
          `msgctxt "${ctx}"\nmsgid "${msgid.replace(/"/g, '\\"')}"\nmsgstr "`,
        )
    })
  }

  it('reaches Hoy from Compras', () => {
    const compras = readFileSync(
      resolve(here, '../../src/pages/Compras.vue'),
      'utf8',
    )
    expect(compras).toContain("router.push({ name: 'CompraHoy' })")
  })
})
