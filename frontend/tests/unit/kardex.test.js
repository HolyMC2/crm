// Kardex («Movimientos», Shell D4.1): the route query ⇄ the service's
// filters, the chip row's exclusive pairs, rows in the worker's words, the
// day-grouped log with who moved what, and Producto's «See all movements».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import InventarioMovimientos from '@/pages/InventarioMovimientos.vue'
import {
  applyChips,
  chipValues,
  filtersOn,
  groupByDay,
  kardexArgs,
  kardexQuery,
  kardexState,
  rowAction,
  rowPeople,
  signedQty,
  voucherLink,
} from '@/components/inventario/kardex'

const row = (over = {}) => ({
  id: 'sle-1',
  item_code: 'FUNDA-13',
  item_name: 'Funda iPhone 13',
  warehouse: 'Centro - D',
  store: 'Centro',
  other_store: null,
  kind: 'venta',
  verb: 'Venta',
  qty: -2,
  uom: 'Nos',
  balance: 5,
  date: '2026-10-18',
  time: '12:41',
  by: 'Marco Ponce',
  user: 'marco@x.test',
  captured_by: null,
  party: 'Juan Pérez',
  voucher: {
    doctype: 'Sales Invoice',
    name: 'ACC-SINV-2026-00012',
    readable: true,
  },
  ...over,
})

describe('kardex helpers', () => {
  it('reads its state from the URL and drops what it does not know', () => {
    const state = kardexState({
      articulo: 'FUNDA-13',
      periodo: 'mes',
      sentido: 'salida',
      desde: '18/10/2026',
      hasta: '2026-10-18',
    })
    expect(state.articulo).toBe('FUNDA-13')
    expect(state.periodo).toBe('')
    expect(state.sentido).toBe('salida')
    expect(state.desde).toBe('')
    expect(kardexQuery(state)).toEqual({
      articulo: 'FUNDA-13',
      sentido: 'salida',
      hasta: '2026-10-18',
    })
  })

  it('sends the period to the server, which counts shop days', () => {
    expect(
      kardexArgs(
        kardexState({ periodo: '7d', desde: '2026-10-01', persona: 'a@x' }),
      ),
    ).toEqual({ period: '7d', user: 'a@x' })
    expect(kardexArgs(kardexState({ desde: '2026-10-01' }))).toEqual({
      from_date: '2026-10-01',
    })
  })

  it('Hoy and 7 días exclude each other, so do Entradas and Salidas', () => {
    let state = kardexState({})
    state = applyChips(state, ['hoy'])
    expect(chipValues(state)).toEqual(['hoy'])
    state = applyChips(state, ['hoy', '7d'])
    expect(state.periodo).toBe('7d')
    state = applyChips(state, ['7d', 'entradas'])
    state = applyChips(state, ['7d', 'entradas', 'salidas'])
    expect(state.sentido).toBe('salida')
    state = applyChips(state, ['7d', 'salidas', 'ajustes'])
    expect(state.tipo).toBe('ajuste')
    expect(applyChips(state, ['7d']).tipo).toBe('')
    expect(filtersOn({ ...state, almacen: 'x', persona: 'y' })).toBe(2)
  })

  it('a row reads as a verb, a signed quantity and the people', () => {
    expect(rowAction(row())).toBe('Venta · Juan Pérez')
    expect(
      rowAction(
        row({
          kind: 'traspaso',
          verb: 'Traspaso',
          qty: -4,
          party: null,
          other_store: 'Bodega',
        }),
      ),
    ).toBe('Traspaso to Bodega')
    expect(signedQty(-2, 'Nos')).toBe('−2 pzas')
    expect(signedQty(3, 'Nos')).toBe('+3 pzas')
    expect(rowPeople(row({ captured_by: 'Rosa' }))).toBe(
      'Marco Ponce · captured by Rosa',
    )
  })

  it('opens only shell pages, never Desk', () => {
    expect(voucherLink(row().voucher)).toBeNull()
    expect(
      voucherLink({ doctype: 'Purchase Order', name: 'PO-1', readable: true }),
    ).toEqual({ name: 'CompraOrden', params: { name: 'PO-1' } })
    expect(
      voucherLink({ doctype: 'Purchase Order', name: 'PO-1', readable: false }),
    ).toBeNull()
  })

  it('groups by posting day, newest first', () => {
    const groups = groupByDay(
      [row(), row({ id: '2' }), row({ id: '3', date: '2026-10-17' })],
      new Date(2026, 9, 18, 13),
    )
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Hoy', 2],
      ['Ayer', 1],
    ])
  })
})

let answers
let calls
let wide = false
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
let app
let root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/productos',
        name: 'Productos',
        component: { render: () => null },
      },
      {
        path: '/productos/movimientos',
        name: 'InventarioMovimientos',
        component: InventarioMovimientos,
      },
      {
        path: '/productos/:item',
        name: 'Producto',
        component: { render: () => null },
      },
      {
        path: '/compras/orden/:name',
        name: 'CompraOrden',
        component: { render: () => null },
      },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

beforeEach(() => {
  calls = []
  answers = {
    movements: () => ({
      readable: true,
      cost_visible: false,
      next: null,
      today: '2026-10-18',
      scope: {},
      rows: [
        row(),
        row({
          id: 'sle-2',
          kind: 'compra',
          verb: 'Compra',
          qty: 10,
          party: 'Distribuidora Sur',
          by: 'Rosa Ibarra',
          voucher: { doctype: 'Purchase Order', name: 'PO-7', readable: true },
          date: '2026-10-17',
        }),
      ],
    }),
    options: () => ({ readable: true, kinds: [], stores: [], users: [] }),
  }
  window.__ = globalThis.__
  wide = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query.includes('1024') ? wide : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push({ method, args: JSON.parse(init?.body || '{}') })
      const answer = answers[method]
      return {
        ok: !!answer,
        status: answer ? 200 : 404,
        json: async () => ({ message: answer ? answer() : null }),
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('Movimientos page', () => {
  it('shows the log by day with who moved what, and opens shell vouchers only', async () => {
    await mountAt('/productos/movimientos')
    const text = root.textContent
    expect(text).toContain('Hoy')
    expect(text).toContain('Ayer')
    expect(text).toContain('Funda iPhone 13')
    expect(text).toContain('Venta · Juan Pérez')
    expect(text).toContain('Marco Ponce')
    expect(text).toContain('−2 pzas')
    expect(text).toContain('5 left')
    const rows = [...root.querySelectorAll('[data-kardex-row]')]
    expect(rows).toHaveLength(2)
    // A sale has no shell page yet: a plain row, never a Desk link.
    expect(rows[0].tagName).toBe('DIV')
    expect(rows[1].getAttribute('href')).toBe('/crm/compras/orden/PO-7')
    expect(root.querySelector('a[href^="/app/"]')).toBeNull()
  })

  it('on a desktop: the same rows as a dense table, cost only when sent', async () => {
    wide = true
    await mountAt('/productos/movimientos')
    const table = root.querySelector('[data-kardex-table] table')
    expect(table).not.toBeNull()
    expect(table.textContent).toContain('Marco Ponce')
    expect(table.textContent).not.toContain('Unit cost')
    expect(root.querySelector('[data-kardex-log]')).toBeNull()
  })

  it('a chip filters through the URL and the service', async () => {
    const router = await mountAt('/productos/movimientos?articulo=FUNDA-13')
    expect(calls.find((c) => c.method === 'movements').args.item).toBe(
      'FUNDA-13',
    )
    root.querySelector('[data-chip="hoy"]').click()
    await flush()
    expect(router.currentRoute.value.query).toEqual({
      articulo: 'FUNDA-13',
      periodo: 'hoy',
    })
    const last = calls.filter((c) => c.method === 'movements').pop()
    expect(last.args).toMatchObject({ item: 'FUNDA-13', period: 'hoy' })
  })

  it('pages with the cursor and says when nothing matches', async () => {
    answers.movements = () => ({
      readable: true,
      cost_visible: false,
      next: null,
      scope: {},
      rows: [],
    })
    await mountAt('/productos/movimientos?periodo=hoy')
    expect(root.textContent).toContain('No movements match')
    expect(root.textContent).toContain('Show every movement')
  })
})
