// Productos page walk on the Inventario queues with a mocked doco transport:
// view switching keeps the URL, j/k/x select from the keyboard, the selection
// lives in the URL, «Pedir conteo a…» sends one request per store, Escáner
// links come back to the focused row, and a `done` from Escáner is said and
// re-counted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { toast } from 'frappe-ui'
import Productos from '@/pages/Productos.vue'
import { productosBoot } from '@/composables/useProductos'
import { pageShortcuts } from '@/composables/shellKeyboard'
import { readReturn } from '@/vendor/muelle-shell/contracts'

const W = 'Tienda Centro - GD'
const calls = []
const row = (n, extra = {}) => ({
  kind: 'stock',
  key: `IPN${n}|${W}`,
  name: `IPN${n}`,
  title: `Funda ${n}`,
  item_group: 'Fundas',
  uom: 'Pza',
  warehouse: W,
  warehouse_label: 'Centro',
  actual_qty: n,
  stock_value: n * 100,
  reserved_qty: 0,
  ordered_qty: 0,
  cajones: [],
  requested: [],
  last_counted: null,
  can_request_count: true,
  ...extra,
})
const answers = {
  bootstrap: () => ({
    enabled: true,
    user: 'ana@x.test',
    today: '2026-10-14',
    stores: [
      { value: W, label: 'Centro' },
      { value: 'Otra - GD', label: 'Otra' },
    ],
    capabilities: { read: true, scanner: true, count: true },
    inventory: {
      views: {
        'sin-cajon': true,
        'sin-contar': true,
        negativo: true,
        'por-revisar': true,
        'conteos-abiertos': false,
      },
      reasons: {},
      days: [30, 60, 90, 180, 365],
      default_days: 90,
      conteo_manager: true,
      stock_adjust: false,
      scanner_user: true,
    },
  }),
  queue: (args) => ({
    rows:
      args.view === 'negativo'
        ? [
            row(9, {
              actual_qty: -2,
              cajones: [{ ubicacion: 'CAJ-1', label: 'A-1' }],
            }),
          ]
        : [row(1), row(2), row(3)],
    has_more: false,
    view: args.view,
  }),
  counts: () => ({
    'sin-cajon': { count: 3830, more: false },
    negativo: { count: 28, more: false },
  }),
  health: () => ({
    readable: true,
    days: 90,
    stocked: 4299,
    views: {
      'sin-cajon': { count: 3830, pct: 89.1, more: false },
      'sin-contar': { count: 4032, pct: 93.8, more: false },
      negativo: { count: 28, more: false },
    },
    trend: [{ week: 0, start: '2026-10-08', counted: 4, cajones: 2 }],
    week: { counted: 4, cajones: 2 },
  }),
  inventory_filters: () => ({
    groups: [{ value: 'Fundas', count: 2815 }],
    brands: [],
  }),
  count_options: (args) => ({
    mode: 'assign',
    warehouse: args.warehouse,
    items: args.items,
    workers: [{ user: 'teresa@x.test', full_name: 'Teresa', conflicts: [] }],
    excluded: [],
    today: '2026-10-14',
    max_date: '2026-11-13',
  }),
  request_counts: (args) => ({
    tasks: ['CC-1'],
    done: args.items,
    skipped: [],
    warehouse: args.warehouse,
    assigned_to: args.assignee,
    assigned_to_name: 'Teresa',
    date: '2026-10-14',
  }),
}
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const called = (name) => calls.filter(([method]) => method === name)
const last = (name) => called(name).at(-1)?.[1]

let app
let root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/productos', name: 'Productos', component: Productos },
      {
        path: '/productos/:item',
        name: 'Producto',
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
const press = (key, extra = {}) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...extra }),
  )

beforeEach(() => {
  calls.length = 0
  productosBoot.value = null
  sessionStorage.clear()
  window.__ = globalThis.__
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      const args = JSON.parse(init?.body || '{}')
      calls.push([method, args])
      const answer = answers[method]
      return {
        ok: Boolean(answer),
        status: answer ? 200 : 404,
        json: async () => ({ message: answer ? answer(args) : null }),
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
  toast.success.mockClear()
})

describe('Productos › Inventario', () => {
  it('opens a queue from the URL with its counts, summary and filters', async () => {
    await mountAt(`/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}`)
    expect(last('queue')).toMatchObject({
      view: 'sin-cajon',
      store: W,
      days: 90,
      group: '',
      brand: '',
    })
    expect(last('health')).toMatchObject({ store: W, fresh: 0 })
    const text = root.textContent
    expect(text).toContain('No bin · 3,830')
    expect(text).toMatch(/89[.,]1 % without a bin/)
    expect(text).toContain('4,299 products with stock')
    expect(text).toContain('Funda 1')
    expect(text).toContain('Never counted')
    // A view this worker cannot use is not offered.
    expect(text).not.toContain('Open counts')
    expect(pageShortcuts.value.extra.map((s) => s.id)).toContain(
      'select.toggle',
    )
  })

  it('switches views through the URL and resets the selection', async () => {
    const router = await mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&sel=IPN1`,
    )
    expect(root.textContent).toContain('1 selected')
    const negative = [...root.querySelectorAll('aside button')].find((b) =>
      b.textContent.includes('Negative stock'),
    )
    negative.click()
    await flush()
    expect(router.currentRoute.value.query).toEqual({
      vista: 'negativo',
      tienda: W,
    })
    expect(last('queue').view).toBe('negativo')
    expect(root.textContent).not.toContain('selected')
    const move = [...root.querySelectorAll('a')].find(
      (a) => a.textContent === 'Move',
    )
    const url = new URL(move.getAttribute('href'), 'https://x.invalid')
    expect(url.pathname).toBe('/scan/bins/move')
    expect(url.searchParams.get('from')).toBe('CAJ-1')
    // Escáner comes back to this queue, on this row.
    const back = new URL(readReturn(url.search).to, 'https://x.invalid')
    expect(back.pathname).toBe('/crm/productos')
    expect(back.searchParams.get('vista')).toBe('negativo')
    expect(back.searchParams.get('fila')).toBe('IPN9')
  })

  it('j/k move, x and shift+x select, the URL keeps the selection', async () => {
    const router = await mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}`,
    )
    press('j')
    await flush()
    expect(root.querySelector('[aria-current="true"]')?.dataset.key).toBe(
      `IPN1|${W}`,
    )
    press('x')
    press('j')
    press('j')
    press('X', { shiftKey: true })
    await flush()
    expect(router.currentRoute.value.query.sel).toBe('IPN1~IPN2~IPN3')
    expect(root.textContent).toContain('3 selected')
    press('k')
    press('x')
    await flush()
    expect(router.currentRoute.value.query.sel).toBe('IPN1~IPN3')
    press('Escape')
    await flush()
    expect(router.currentRoute.value.query.sel).toBeUndefined()
  })

  it('«Pedir conteo a…» asks Escáner for the selected products of one store', async () => {
    await mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&sel=IPN1~IPN2`,
    )
    const ask = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Ask for a count of…',
    )
    ask.click()
    await flush()
    expect(last('count_options')).toEqual({
      warehouse: W,
      items: ['IPN1', 'IPN2'],
    })
    // «Who counts» is frappe-ui's select: open it and pick the counter.
    const label = [...document.querySelectorAll('label')].find(
      (l) => l.textContent.trim() === 'Who counts',
    )
    const trigger = document.getElementById(label.getAttribute('for'))
    trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
    trigger.click()
    await flush()
    const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent.includes('Teresa'),
    )
    option.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }),
    )
    option.click()
    await flush()
    const send = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Ask for the count',
    )
    send.click()
    await flush()
    expect(last('request_counts')).toMatchObject({
      warehouse: W,
      items: ['IPN1', 'IPN2'],
      assignee: 'teresa@x.test',
      date: '',
    })
    expect(document.body.textContent).toContain(
      'Count of 2 product(s) asked of Teresa',
    )
    // Re-counted fresh, and the sent products leave the selection.
    expect(last('counts').fresh).toBe(1)
  })

  it('a return from Escáner says what changed and re-counts', async () => {
    const router = await mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&fila=IPN2&done=${encodeURIComponent('Taller Item Ubicacion:TIU-9')}`,
    )
    expect(toast.success).toHaveBeenCalledWith('Bin assigned (TIU-9).')
    expect(router.currentRoute.value.query.done).toBeUndefined()
    expect(last('counts').fresh).toBe(1)
    expect(last('health').fresh).toBe(1)
    expect(root.querySelector('[aria-current="true"]')?.dataset.key).toBe(
      `IPN2|${W}`,
    )
  })
})
