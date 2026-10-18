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
    ...(args.view === 'todos'
      ? {
          rows: [
            {
              name: 'IPN1',
              title: 'Funda roja',
              item_group: 'Fundas',
              uom: 'Pza',
              image: '/files/funda.png',
              stock_item: true,
              stock: { qty: 4, projected: 4, stores: 1 },
              price: {
                rate: 120,
                currency: 'MXN',
                price_list: 'Standard Selling',
              },
            },
            {
              name: 'REC130',
              title: 'Recarga 130',
              item_group: 'Recargas',
              uom: 'Nos',
              image: null,
              stock_item: false,
              stock: { qty: 0, projected: 0, stores: 0 },
              price: null,
            },
          ],
          total: 2,
          has_more: false,
          view: 'todos',
        }
      : {}),
    ...(args.view === 'todos'
      ? {}
      : {
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
  catalog_facets: () => ({
    total: 2,
    groups: [
      { value: 'Fundas', count: 3559 },
      { value: 'Recargas', count: 709 },
    ],
    photo: { con: 1, sin: 1 },
    stock: { con: 1, sin: 0 },
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

  it('an updated product from the mover is said, and done never stays', async () => {
    const router = await mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&done=${encodeURIComponent('Item:IPN3')}`,
    )
    expect(toast.success).toHaveBeenCalledWith('Product IPN3 updated.')
    expect(router.currentRoute.value.query).toEqual({
      vista: 'sin-cajon',
      tienda: W,
    })
    expect(last('counts').fresh).toBe(1)
  })

  it('a quiet refresh racing the first load keeps the returned row focused', async () => {
    const { hoyLive } = await import('@/composables/useHoy')
    const hub = hoyLive(null)
    const original = answers.queue
    let release
    const gate = new Promise((resolve) => (release = resolve))
    // The first page answers late; the live hub resyncs meanwhile.
    answers.queue = (args) => original(args)
    const fetch = globalThis.fetch
    let first = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        if (first && String(url).endsWith('.queue')) {
          first = false
          await gate
        }
        return fetch(url, init)
      }),
    )
    const pending = mountAt(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&fila=IPN3`,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    hub.resync(false)
    await new Promise((resolve) => setTimeout(resolve, 300))
    release()
    await pending
    await flush()
    expect(root.querySelector('[aria-current="true"]')?.dataset.key).toBe(
      `IPN3|${W}`,
    )
    answers.queue = original
  })
})

describe('Productos › catálogo', () => {
  it('shows each product with photo or initials, stock in words and price', async () => {
    localStorage.clear()
    await mountAt('/productos')
    const text = root.textContent
    expect(text).toContain('2 of 2 products')
    expect(text).toContain('4 in stock')
    expect(text).toContain('Service, no stock')
    expect(text).toContain('No price')
    expect(root.querySelector('img[src="/files/funda.png"]')).toBeTruthy()
    expect(text).toContain('R1') // Recarga 130's tile
    expect(last('catalog_facets')).toMatchObject({
      group: '',
      stock: '',
      photo: '',
    })
    expect(text).toContain('Fundas')
    expect(text).toContain('3,559')
  })

  it('filters through the URL, as chips, and remembers Tarjetas', async () => {
    localStorage.clear()
    const router = await mountAt('/productos')
    const group = [...root.querySelectorAll('aside button')].find((b) =>
      b.textContent.includes('Recargas'),
    )
    group.click()
    await flush()
    expect(router.currentRoute.value.query).toEqual({ grupo: 'Recargas' })
    expect(last('queue')).toMatchObject({ view: 'todos', group: 'Recargas' })
    expect(last('catalog_facets')).toMatchObject({ group: 'Recargas' })
    const chip = root.querySelector('[aria-label="Remove filter Recargas"]')
    chip.click()
    await flush()
    expect(router.currentRoute.value.query).toEqual({})
    const cards = root.querySelector('button[aria-pressed][title="Cards"]')
    cards.click()
    await flush()
    expect(localStorage.getItem('muelle:productos:layout:ana@x.test')).toBe(
      'tarjetas',
    )
    expect(root.querySelector('ul.grid')).toBeTruthy()
  })

  it('on a phone: the controls scroll with the list; one chip row and «Filtros»', async () => {
    localStorage.clear()
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 400,
    })
    window.dispatchEvent(new Event('resize'))
    try {
      const router = await mountAt('/productos')
      // The search and the chips live inside the one scroller (Shell C5).
      const scroller = root.querySelector('[data-productos-scroller]')
      expect(scroller.querySelector('input[type="search"]')).toBeTruthy()
      expect(scroller.querySelector('[data-ui-filter-chips]')).toBeTruthy()
      expect(scroller.querySelector('h1')).toBeTruthy()
      // No list select, no list/cards toggle in the page on a phone.
      expect(root.querySelector('select[aria-label="List"]')).toBeNull()
      expect(
        root.querySelector('button[aria-pressed][title="Cards"]'),
      ).toBeNull()
      // A list is a chip.
      root.querySelector('[data-chip="sin-precio"]').click()
      await flush()
      expect(router.currentRoute.value.query).toMatchObject({
        vista: 'sin-precio',
      })
      root.querySelector('[data-chip="todos"]').click()
      await flush()
      // «Filtros» holds the store, the view and the catálogo filters.
      root.querySelector('[data-ui-filters-chip]').click()
      await flush()
      const sheet = document.body.querySelector('[data-productos-filters]')
      expect(sheet).toBeTruthy()
      const button = (text) =>
        [...sheet.querySelectorAll('button')].find((b) =>
          b.textContent.includes(text),
        )
      button('With stock').click()
      await flush()
      expect(router.currentRoute.value.query).toMatchObject({
        existencias: 'con',
      })
      const store = sheet.querySelector('select[data-productos-store]')
      store.value = 'Otra - GD'
      store.dispatchEvent(new Event('change'))
      await flush()
      expect(router.currentRoute.value.query).toMatchObject({
        existencias: 'con',
        tienda: 'Otra - GD',
      })
      expect(
        root.querySelector('[data-ui-filters-chip]').getAttribute('aria-label'),
      ).toBe('2 filters on')
      button('Cards').click()
      await flush()
      expect(localStorage.getItem('muelle:productos:layout:ana@x.test')).toBe(
        'tarjetas',
      )
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
      })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('a template says its variants, a search names itself, and opens with it', async () => {
    localStorage.clear()
    const original = answers.queue
    answers.queue = (args) =>
      args.view === 'todos'
        ? {
            rows: [
              {
                name: 'IPN109',
                title: 'Silicone Case',
                item_group: 'Fundas',
                uom: 'Pza',
                image: null,
                stock_item: true,
                stock: { qty: 7, projected: 7, stores: 1 },
                price: { rate: 99, currency: 'MXN', from: true },
                variants: { count: 1011, matching: args.search ? 3 : null },
              },
            ],
            total: 1,
            has_more: false,
            view: 'todos',
          }
        : original(args)
    await mountAt('/productos?q=a04')
    const text = root.textContent
    expect(text).toContain('Results for “a04”')
    expect(text).toContain('3 of 1,011 variants')
    expect(text).toContain('from')
    const link = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Silicone Case'),
    )
    expect(link.getAttribute('href')).toContain('vq=a04')
    answers.queue = original
  })

  it('a live change refreshes the catalogue in place, without reordering', async () => {
    localStorage.clear()
    const { hoyLive } = await import('@/composables/useHoy')
    const hub = hoyLive(null)
    await mountAt('/productos')
    const original = answers.queue
    // The server now ranks Recarga first and Funda has a new price.
    answers.queue = (args) => {
      const page = original(args)
      if (args.view !== 'todos') return page
      const [funda, recarga] = page.rows
      return {
        ...page,
        rows: [recarga, { ...funda, price: { ...funda.price, rate: 150 } }],
      }
    }
    hub.resync(false)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await flush()
    const text = root.textContent
    expect(text.indexOf('Funda roja')).toBeLessThan(text.indexOf('Recarga 130'))
    expect(text).toMatch(/150/)
    answers.queue = original
  })
})
