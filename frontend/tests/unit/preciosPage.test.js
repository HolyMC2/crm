// Precios (Productos › Precios): what the worker sees when a receipt opens
// it, and what typing a price, «Sigue igual» and «Guardar» send.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

import Precios from '@/pages/Precios.vue'
import { importDrafts, reviewEntries } from '@/composables/usePrecios'

const LIST = 'Menudeo'
const cell = (over = {}) => ({
  price_list: LIST,
  rate: 350,
  revision: 'r'.repeat(64),
  can_write: true,
  requires_ack: false,
  warning_percent: 30,
  uom: 'Pieza',
  currency: 'MXN',
  ...over,
})
const ROWS = {
  A: {
    item_code: 'A',
    item_name: 'Pantalla Moto G15',
    stock_uom: 'Pieza',
    uoms: { Pieza: 1 },
    stock: 4,
    prices: { [LIST]: cell() },
    cost: { new: 200, at_price: 160, change_pct: 25, last: 200, spark: [] },
    line: { qty: 4, uom: 'Pieza', lines: 1, kind: 'compra', cost: 200 },
    signal: 'costo-subio',
  },
  B: {
    item_code: 'B',
    item_name: 'Mica 9H',
    stock_uom: 'Pieza',
    uoms: { Pieza: 1 },
    stock: 20,
    prices: { [LIST]: cell({ rate: 80, revision: 'b'.repeat(64) }) },
    cost: { new: 30, at_price: 30, change_pct: 0, last: 30, spark: [] },
    line: { qty: 20, uom: 'Pieza', lines: 1, kind: 'compra', cost: 30 },
    signal: '',
  },
}

let app
let root
let calls
let answers

function stubApi() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('doco.workspaces.precios.')[1]
      const args = JSON.parse(init?.body || '{}')
      calls.push([method, args])
      const answer = answers[method]
      const message = typeof answer === 'function' ? answer(args) : answer
      return { ok: true, json: async () => ({ message }) }
    }),
  )
}

async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/productos',
        name: 'Productos',
        component: { render: () => null },
      },
      { path: '/productos/precios', name: 'Precios', component: Precios },
      {
        path: '/productos/etiquetas',
        name: 'Etiquetas',
        component: { render: () => null },
      },
      {
        path: '/productos/:item',
        name: 'Producto',
        component: { render: () => null },
      },
      { path: '/:rest(.*)*', component: { render: () => null } },
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

// A sheet is its own chunk: the first open waits for its import.
async function waitFor(check, ms = 3000) {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await nextTick()
  }
  await flush()
}

const text = () => document.body.textContent.replace(/\s+/g, ' ')
const button = (label) =>
  [...document.body.querySelectorAll('button')].find((b) =>
    b.textContent.replace(/\s+/g, ' ').trim().includes(label),
  )
const priceInput = (code) =>
  root.querySelector(
    `[data-precio-row="${code}"] [data-precio-input="${LIST}"]`,
  )
async function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flush()
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  answers = {
    bootstrap: {
      enabled: true,
      today: '2026-10-30',
      default_price_list: LIST,
      price_lists: [{ name: LIST, currency: 'MXN' }],
      price_setup: null,
      cost_visible: true,
      can_write: true,
      cost_moved_pct: 2,
      views: ['costo', 'sin-precio', 'recientes', 'todos'],
      sources: ['Purchase Receipt'],
      page: 30,
    },
    counts: { costo: 1, 'sin-precio': 0, recientes: 0 },
    rows: (args) => {
      const codes = args.doctype
        ? ['A', 'B']
        : args.items
          ? JSON.parse(args.items)
          : ['A']
      return {
        rows: codes.map((code) => ROWS[code]).filter(Boolean),
        total: codes.length,
        start: 0,
        more: false,
        price_list: LIST,
        source: args.doctype
          ? {
              doctype: args.doctype,
              name: args.name,
              kind: 'compra',
              party: 'Refacciones del Norte',
              date: '2026-10-28',
              docstatus: 1,
              products: 2,
            }
          : null,
        unknown: [],
      }
    },
    save: (args) => {
      const changes = JSON.parse(args.changes)
      const keep = JSON.parse(args.keep)
      return {
        results: [
          ...changes.map((entry) => ({
            item: entry.item,
            ok: true,
            updated: 1,
            inserted: 0,
          })),
          ...keep.map((code) => ({ item: code, ok: true, kept: true })),
        ],
        saved: changes.length,
        kept: keep.length,
        failed: 0,
      }
    },
  }
  stubApi()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Precios from a receipt', () => {
  it('lists its products with why each asks for a decision', async () => {
    await mountAt(
      '/productos/precios?desde=Purchase%20Receipt:MAT-PRE-7&return_to=/crm/documentos/x&return_label=Recepción',
    )
    const rows = calls.find(([method]) => method === 'rows')[1]
    expect(rows).toMatchObject({
      doctype: 'Purchase Receipt',
      name: 'MAT-PRE-7',
      price_list: LIST,
    })
    expect(text()).toContain('Recepción de Refacciones del Norte')
    expect(text()).toContain('Pantalla Moto G15')
    expect(text()).toContain('Costo subió 25 %')
    // The receipt's cost per piece against the cost when the price was set.
    expect(text()).toMatch(
      /Costo aquí \S*\$200\.00 · al poner el precio \S*\$160\.00/,
    )
    expect(text()).not.toContain('MAT-PRE-7')
  })

  it('offers the price that keeps the margin, and saves it with the revision it was read at', async () => {
    await mountAt(
      '/productos/precios?desde=Purchase%20Receipt:MAT-PRE-7&return_to=/crm/documentos/x',
    )
    button('Mantener margen').click()
    await flush()
    expect(priceInput('A').value).toBe('437.5')
    expect(text()).toContain('1 precio nuevo')
    button('Revisar y guardar').click()
    await waitFor(() => button('Guardar 1 cambio'))
    expect(text()).toMatch(/\$350\.00 · ▲ 25 %/)
    button('Guardar 1 cambio').click()
    await flush()
    const save = calls.find(([method]) => method === 'save')[1]
    expect(JSON.parse(save.changes)).toEqual([
      {
        item: 'A',
        prices: { [LIST]: 437.5 },
        expected: { [LIST]: 'r'.repeat(64) },
        acknowledged: [],
      },
    ])
    expect(save.request_id).toBeTruthy()
    expect(text()).toContain('Guardé el precio de 1 producto')
    expect(text()).toContain('Imprimir etiquetas de los cambiados')
    expect(text()).toContain('Volver a Recepción')
  })

  it('asks for an OK on a large change before it saves', async () => {
    await mountAt('/productos/precios?desde=Purchase%20Receipt:MAT-PRE-7')
    await type(priceInput('B'), '200')
    expect(text()).toContain('Es un cambio grande (150 %). Lo revisé.')
    button('Revisar y guardar').click()
    await waitFor(() => button('Guardar 1 cambio'))
    expect(button('Guardar 1 cambio').disabled).toBe(true)
    const ok = [
      ...document.body.querySelectorAll(
        '[data-precios-revision] input[type=checkbox]',
      ),
    ][0]
    ok.click()
    await flush()
    expect(button('Guardar 1 cambio').disabled).toBe(false)
  })

  it('confirms «Sigue igual» without a price', async () => {
    await mountAt('/productos/precios?desde=Purchase%20Receipt:MAT-PRE-7')
    root.querySelector('[data-precio-row="A"] footer button').click()
    await flush()
    expect(text()).toContain('1 sigue igual')
    button('Revisar y guardar').click()
    await waitFor(() => button('Guardar 1 cambio'))
    button('Guardar 1 cambio').click()
    await flush()
    const save = calls.find(([method]) => method === 'save')[1]
    expect(JSON.parse(save.changes)).toEqual([])
    expect(JSON.parse(save.keep)).toEqual(['A'])
    expect(text()).toContain('Confirmé 1 que sigue igual')
  })

  it('keeps a refused product with its reason and the price as it is now', async () => {
    answers.save = () => ({
      results: [
        {
          item: 'A',
          ok: false,
          kind: 'conflict',
          reason: 'Otro equipo cambió este precio.',
          prices: { [LIST]: cell({ rate: 390, revision: 'n'.repeat(64) }) },
        },
      ],
      saved: 0,
      kept: 0,
      failed: 1,
    })
    await mountAt('/productos/precios?desde=Purchase%20Receipt:MAT-PRE-7')
    await type(priceInput('A'), '420')
    button('Revisar y guardar').click()
    await waitFor(() => button('Guardar 1 cambio'))
    button('Guardar 1 cambio').click()
    await flush()
    expect(text()).toContain('1 producto no se guardó')
    button('Revisar los que faltan').click()
    await flush()
    expect(text()).toContain('Cambió en otro equipo.')
    expect(text()).toMatch(/Hoy \S*\$390\.00/)
    expect(priceInput('A').value).toBe('420')
  })
})

describe('Precios standalone', () => {
  it('opens on the view whose costs moved, with the views and their counts', async () => {
    await mountAt('/productos/precios')
    const rows = calls.find(([method]) => method === 'rows')[1]
    expect(rows.view).toBe('costo')
    expect(text()).toMatch(/Costo cambió\s*1/)
    expect(text()).toContain('Pantalla Moto G15')
  })
})

describe('the review and import arithmetic', () => {
  const known = new Map(Object.entries(ROWS))
  it('lists only changed drafts, and names those the worker cannot write', () => {
    const locked = new Map([
      ...known,
      [
        'C',
        {
          ...ROWS.B,
          item_code: 'C',
          item_name: 'Funda',
          prices: { [LIST]: cell({ can_write: false }) },
        },
      ],
    ])
    const drafts = new Map([
      ['A|Menudeo', { code: 'A', list: LIST, value: '400' }],
      ['B|Menudeo', { code: 'B', list: LIST, value: '80' }],
      ['C|Menudeo', { code: 'C', list: LIST, value: '99' }],
    ])
    const { entries, blocked } = reviewEntries(drafts, locked, new Set())
    expect(
      entries.map((entry) => [
        entry.code,
        entry.before,
        entry.value,
        entry.pct,
        entry.margin,
      ]),
    ).toEqual([['A', 350, 400, 14.3, 50]])
    expect(blocked).toEqual(['Funda'])
  })

  it('turns a CSV into drafts, leaving equal prices and unknown codes out', () => {
    const result = importDrafts(
      {
        rows: [
          { code: 'A', prices: { [LIST]: 399 } },
          { code: 'B', prices: { [LIST]: 80 } },
          { code: 'Z', prices: { [LIST]: 5 } },
        ],
      },
      known,
    )
    expect(result).toEqual({
      drafts: [{ code: 'A', list: LIST, value: '399' }],
      same: 1,
      missing: ['Z'],
    })
  })
})
