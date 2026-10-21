// The product page with a mocked doco transport: the hero (group path, kind,
// actions, «Imprimir etiqueta»), price lists with validity, age and status,
// a service says it carries no stock, and cost appears only when the server
// sent it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import Producto from '@/pages/Producto.vue'
import { productosBoot } from '@/composables/useProductos'
import { shellBoot } from '@/composables/muelleShell'

let record
const service = () => ({
  item: {
    name: 'ABIBMEX000130',
    item_name: 'Recarga ABIB $130',
    item_group: 'Recargas',
    item_group_path: ['Recargas y Tiempo Aire', 'Recargas'],
    stock_uom: 'Nos',
    is_stock_item: 0,
    is_sales_item: 1,
    is_purchase_item: 0,
    has_serial_no: 0,
    has_batch_no: 0,
    description: 'Vigencia 15 días',
    barcodes: [],
    image: null,
    modified: '2026-10-08 10:00:00',
  },
  stock: { readable: true, rows: [], hidden: 0, total: 0, service: true },
  prices: {
    readable: true,
    default_price_list: 'Standard Selling',
    rows: [
      {
        price_list: 'Standard Selling',
        rate: 130,
        currency: 'MXN',
        uom: 'Nos',
        stock_uom: 'Nos',
        can_write: true,
        valid_from: '2026-05-29',
        valid_upto: null,
        updated: '2026-10-08 22:03:05',
        status: 'vigente',
      },
      {
        price_list: 'Precios Payjoy',
        rate: null,
        currency: 'MXN',
        uom: 'Nos',
        stock_uom: 'Nos',
        can_write: true,
        valid_from: null,
        valid_upto: null,
        updated: null,
        status: 'sin-precio',
      },
    ],
  },
  ledger: { readable: true, rows: [] },
  purchases: { readable: true, rows: [] },
  sales: { readable: true, rows: [] },
  price_history: {
    readable: true,
    source: 'mercado',
    rows: [
      {
        price_list: 'Standard Selling',
        old_rate: 135,
        new_rate: 130,
        currency: 'MXN',
        by: 'Administrator',
        at: '2026-10-07 22:03:05',
        first_price: 0,
        buying: 0,
      },
    ],
  },
  actions: [
    { key: 'price', label: 'Cambiar precio', enabled: true, primary: false },
    { key: 'edit', label: 'Editar datos', enabled: true, primary: false },
  ],
  can_edit: true,
  links: { labels: '/mercado/etiquetas?codes=ABIBMEX000130' },
  inventory: { scanner: true, scanner_user: true, stock_adjust: false },
})

const flush = async () => {
  for (let i = 0; i < 6; i++) {
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
        path: '/inventario/movimientos',
        name: 'InventarioMovimientos',
        component: { render: () => null },
      },
      {
        path: '/productos/nuevo',
        name: 'ProductoNuevo',
        component: { render: () => null },
      },
      {
        path: '/productos/:item',
        name: 'Producto',
        component: Producto,
        props: true,
      },
      {
        path: '/productos/:item/ajustes',
        name: 'ProductoAjustes',
        component: { render: () => null },
      },
      {
        path: '/compras/nueva',
        name: 'CompraNueva',
        component: { render: () => null },
      },
      {
        path: '/documentos/cotizaciones/nuevo',
        name: 'CotizacionNueva',
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
  productosBoot.value = {
    enabled: true,
    user: 'ana@x.test',
    today: '2026-10-14',
    stores: [],
    capabilities: {},
  }
  record = service()
  window.__ = globalThis.__
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const method = String(url).split('.').pop()
      return {
        ok: method === 'record',
        status: method === 'record' ? 200 : 404,
        json: async () => ({ message: method === 'record' ? record : null }),
      }
    }),
  )
})
afterEach(() => {
  shellBoot.value = null
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('Producto', () => {
  it('a service: group path, kind, prices with status and no stock to count', async () => {
    await mountAt('/productos/ABIBMEX000130')
    const text = root.textContent
    expect(text).toContain('Recarga ABIB $130')
    expect(text).toContain('Recargas y Tiempo Aire')
    const crumb = [...root.querySelectorAll('nav a')].find(
      (a) => a.textContent === 'Recargas',
    )
    expect(crumb.getAttribute('href')).toBe('/crm/productos?grupo=Recargas')
    expect(text).toContain('Service, no stock')
    expect(text).toContain('Service item: it carries no stock.')
    expect(text).not.toContain('No stock in your stores')
    expect(text).toContain('6 days ago')
    expect(text).toContain('Current')
    expect(text).toContain('No price')
    expect(text).toContain('since 29 may')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).toContain('Add photo')
    // «Print label» prints here; Etiquetas stays one link away for sheets.
    const label = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Print label'),
    )
    label.click()
    await flush()
    const sheets = [...document.querySelectorAll('a')].find((a) =>
      a.textContent.includes('More sizes and sheets in Etiquetas'),
    )
    expect(sheets.getAttribute('href')).toBe(
      '/mercado/etiquetas?codes=ABIBMEX000130',
    )
    // The price history: old struck through, new, the change.
    expect(text).toMatch(/-3\.7%/)
    // No cost key from the server: no cost panel at all.
    expect(text).not.toContain('Cost and margin')
  })

  it('on a phone: no in-page back link, one group line, actions as pills', async () => {
    const width = window.innerWidth
    const setWidth = (value) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value,
      })
      window.dispatchEvent(new Event('resize'))
    }
    setWidth(400)
    try {
      await mountAt('/productos/ABIBMEX000130')
      // The shell app bar carries the back arrow (meta.listParent).
      expect(
        [...root.querySelectorAll('button')].some((b) =>
          b.textContent.includes('Productos'),
        ),
      ).toBe(false)
      const path = root.querySelector('[data-group-path]')
      expect(path.className).not.toMatch(/uppercase/)
      expect([...path.querySelectorAll('a')].map((a) => a.textContent)).toEqual(
        ['Recargas y Tiempo Aire', 'Recargas'],
      )
      // The group line follows the name.
      const h1 = root.querySelector('h1')
      expect(
        h1.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      const pills = [
        ...root.querySelectorAll('[data-hero-pills] [data-action]'),
      ].map((el) => el.dataset.action)
      // Etiqueta · Conteo · Precios live in the bottom bar (Shell D4e), so
      // the pills keep the rest and each action shows once.
      expect(pills).toEqual(['edit'])
      // A plain button with its label under the icon, not a frappe-ui Button.
      const edit = root.querySelector('[data-hero-pills] [data-action="edit"]')
      expect(edit.tagName).toBe('BUTTON')
      expect(edit.className).not.toMatch(/\bh-7\b/)
      // The bar is its own lazy chunk: wait for it, however busy the runner.
      await vi.waitFor(
        () => expect(root.querySelector('[data-producto-bar]')).toBeTruthy(),
        { timeout: 5000 },
      )
      const bar = [...root.querySelectorAll('[data-producto-bar] button')]
      expect(bar.map((b) => [b.dataset.action, b.textContent.trim()])).toEqual([
        ['labels', 'Etiqueta'],
        ['price', 'Precios'],
      ])
      // «Precios» is the solid one, as in Mercado's item card.
      expect(bar[1].className).toMatch(/bg-surface-gray-10/)
      expect(bar[0].className).not.toMatch(/bg-surface-gray-10/)
    } finally {
      setWidth(width)
    }
  })

  it('«Cotizar» opens a new cotización with the product, only for who may create one', async () => {
    const quoteButton = () =>
      [...root.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Quote',
      )
    // No Quotation in the boot's create list: no «Cotizar».
    shellBoot.value = {
      modules: {
        documentos: {
          enabled: true,
          capabilities: { doctypes: ['Quotation'], create: [] },
        },
      },
    }
    let router = await mountAt('/productos/ABIBMEX000130')
    expect(quoteButton()).toBeUndefined()
    app.unmount()
    root.remove()

    shellBoot.value.modules.documentos.capabilities.create = ['Quotation']
    router = await mountAt('/productos/ABIBMEX000130')
    quoteButton().click()
    await flush()
    expect(router.currentRoute.value.path).toBe(
      '/documentos/cotizaciones/nuevo',
    )
    expect(router.currentRoute.value.query).toEqual({
      articulo: 'ABIBMEX000130',
    })
    app.unmount()
    root.remove()

    // Not for sale: nothing to quote.
    record.item.is_sales_item = 0
    await mountAt('/productos/ABIBMEX000130')
    expect(quoteButton()).toBeUndefined()
  })

  it('a worker with no store assigned is not told the product is sold out', async () => {
    record.item.is_stock_item = 1
    record.stock = {
      readable: true,
      rows: [],
      hidden: 0,
      total: 0,
      service: false,
      unassigned: true,
    }
    await mountAt('/productos/ABIBMEX000130')
    const text = root.textContent
    expect(text).toContain('You do not see it')
    expect(text).toContain('Ask your manager to assign you a store')
    expect(text).toContain('You have no store assigned')
    expect(text).toContain("You see no store's movements")
    expect(text).not.toContain('Sold out in your stores')
    expect(text).not.toContain('Total 0')
    // A shop list it cannot see: the price is unseen, not «No price».
    record.prices = { readable: true, default_price_list: null, rows: [] }
    app.unmount()
    root.remove()
    await mountAt('/productos/ABIBMEX000130')
    const tile = root.querySelector('[data-price-unassigned]')
    expect(tile?.textContent.trim()).toBe('No lo ves')
  })

  it('movements name who moved them and «See all» opens the kardex', async () => {
    record.item.is_stock_item = 1
    record.stock.service = false
    record.ledger.rows = Array.from({ length: 7 }, (_, n) => ({
      id: `sle-${n}`,
      kind: 'venta',
      verb: 'Venta',
      party: 'Juan Pérez',
      qty: -1,
      uom: 'Nos',
      balance: 6 - n,
      store: 'Centro',
      warehouse: 'Centro - D',
      by: 'Marco Ponce',
      date: '2026-10-14',
      time: '12:41',
      voucher: { doctype: 'Sales Invoice', name: `SINV-${n}`, readable: true },
      voucher_type: 'Sales Invoice',
      voucher_no: `SINV-${n}`,
      actual_qty: -1,
      qty_after_transaction: 6 - n,
      posting_date: '2026-10-14',
    }))
    await mountAt('/productos/ABIBMEX000130')
    const list = root.querySelector('[data-producto-movements]')
    expect(list.querySelectorAll('[data-kardex-row]')).toHaveLength(5)
    expect(list.textContent).toContain('Venta · Juan Pérez')
    expect(list.textContent).toContain('Marco Ponce')
    expect(list.textContent).toContain('−1 pza')
    expect(list.querySelector('a[href^="/app/"]')).toBeNull()
    const all = root.querySelector('[data-producto-movements-all]')
    expect(all.getAttribute('href')).toBe(
      '/crm/inventario/movimientos?articulo=ABIBMEX000130',
    )
  })

  it('«How it sells»: velocity, last sale, days of stock and «Reorder» for what the store «Reordenar» buys', async () => {
    record.item.is_stock_item = 1
    record.item.is_purchase_item = 1
    record.stock = {
      readable: true,
      hidden: 0,
      total: 2,
      service: false,
      rows: [
        {
          warehouse: 'Centro - D',
          label: 'Centro',
          actual_qty: 11,
          projected_qty: 11,
          reorder_level: 0,
          state: 'ok',
          cajones: [],
        },
        {
          // An older minimum saved without its amount to order.
          warehouse: 'Bodega - D',
          label: 'Bodega',
          actual_qty: 0,
          projected_qty: 0,
          reorder_level: 10,
          reorder_qty: 0,
          state: 'faltan',
          cajones: [],
        },
      ],
    }
    record.actions.push({
      key: 'purchase',
      label: 'Pedir',
      enabled: true,
      primary: true,
      warehouse: 'Bodega - D',
      qty: null,
    })
    // Doco suggests what is missing there: 10.
    record.reorder = {
      modified: '2026-10-08 10:00:00',
      can_edit: false,
      stores: [
        {
          warehouse: 'Centro - D',
          label: 'Centro',
          actual_qty: 11,
          reorder_level: 0,
          reorder_qty: 0,
          suggested_qty: 0,
          state: 'sin_minimo',
          watch: null,
        },
        {
          warehouse: 'Bodega - D',
          label: 'Bodega',
          actual_qty: 0,
          reorder_level: 10,
          reorder_qty: 0,
          suggested_qty: 10,
          state: 'faltan',
          watch: null,
        },
      ],
    }
    record.insights = {
      readable: true,
      uom: 'Nos',
      sold_30: 9,
      sold_90: 9,
      per_day: 0.1,
      last_sale: {
        date: '2026-10-14',
        qty: 1,
        store: 'Centro',
        party: 'Juan Pérez',
        rate: 130,
        voucher: { doctype: 'Sales Invoice', name: 'SINV-1', readable: true },
      },
      last_purchase: null,
      cover: [
        { warehouse: 'Centro - D', label: 'Centro', days: 110, per_day: 0.1 },
        { warehouse: 'Bodega - D', label: 'Bodega', days: 0, per_day: 0 },
      ],
      channels: [{ key: 'web', label: 'Tienda en línea', on: true }],
    }
    const router = await mountAt('/productos/ABIBMEX000130')
    // A stocked item offers «Avísame cuando baje» (Shell D5); a service does not.
    expect(
      [...root.querySelectorAll('button')].some((b) =>
        b.textContent.includes('Avísame cuando baje'),
      ),
    ).toBe(true)
    const box = root.querySelector('[data-producto-insights]')
    expect(box.textContent).toContain('Sold in 30 days')
    expect(box.textContent).toContain('9 pzas')
    expect(box.textContent).toContain('1 every 10 days')
    // A narrow phone gets two columns; the pace takes the whole row.
    expect(box.querySelector('[data-insights-kpis]').className).toMatch(
      /\bgrid-cols-2\b.*\bsm:grid-cols-3\b/,
    )
    expect(box.querySelector('[data-insights-kpi="day"]').className).toContain(
      'col-span-2',
    )
    expect(box.textContent).toContain('Juan Pérez')
    expect(box.textContent).toContain('About 110 days')
    expect(box.textContent).toContain('Out of stock')
    expect(box.textContent).toContain('Tienda en línea')
    // Margin by month travels only with cost.
    expect(box.querySelector('[data-insights-trend]')).toBeNull()
    const buttons = box.querySelectorAll('[data-insights-reorder]')
    expect(buttons).toHaveLength(1)
    buttons[0].click()
    await flush()
    expect(router.currentRoute.value.name).toBe('CompraNueva')
    expect(router.currentRoute.value.query).toMatchObject({
      warehouse: 'Bodega - D',
      qty: '10',
    })
    // The store's «Reordenar» in «Mínimos por tienda» buys the same.
    await router.push('/productos/ABIBMEX000130')
    await flush()
    root
      .querySelector('[data-minimos-store="Bodega - D"] [data-minimos-reorder]')
      .click()
    await flush()
    expect(router.currentRoute.value.name).toBe('CompraNueva')
    expect(router.currentRoute.value.query).toMatchObject({
      warehouse: 'Bodega - D',
      qty: '10',
    })
  })

  it('«Ajustar» saves a draft ajuste for the store with the motivo, then opens it', async () => {
    record.item.is_stock_item = 1
    record.stock = {
      readable: true,
      hidden: 0,
      total: 4,
      service: false,
      rows: [
        {
          warehouse: 'Centro - D',
          label: 'Centro',
          actual_qty: 4,
          reserved_qty: 1,
          projected_qty: 3,
          ordered_qty: 0,
          reorder_level: null,
          state: 'ok',
          cajones: [],
          last_counted: null,
          counts_pending: [],
          can_request_count: true,
          negative: false,
        },
      ],
    }
    const adjustButton = () => root.querySelector('[data-producto-ajustar]')
    // Without the Stock Reconciliation rights: no «Ajustar».
    await mountAt('/productos/ABIBMEX000130')
    expect(adjustButton()).toBeNull()
    app.unmount()
    root.remove()

    record.inventory.stock_adjust = true
    const saved = []
    fetch.mockImplementation(async (url, init) => {
      const method = String(url).split('.').pop()
      if (method === 'save') saved.push(JSON.parse(init.body))
      const message =
        method === 'record'
          ? record
          : method === 'save'
            ? { name: 'MAT-RECO-0001', docstatus: 0 }
            : null
      return {
        ok: !!message,
        status: message ? 200 : 404,
        json: async () => ({ message }),
      }
    })
    const router = await mountAt('/productos/ABIBMEX000130')
    router.addRoute({
      path: '/inventario/ajustes/:name',
      name: 'Ajuste',
      component: { render: () => null },
    })
    adjustButton().click()
    // The sheet loads on first open.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ajustar-sheet]')).not.toBeNull(),
    )
    const sheet = document.querySelector('[data-ajustar-sheet]')
    expect(sheet.textContent).toContain('Original: 4')
    const qty = document.querySelector('[data-ajustar-qty]')
    expect(qty.value).toBe('4')
    // Unchanged: nothing to save.
    expect(document.querySelector('[data-ajustar-guardar]').disabled).toBe(true)
    document.querySelector('[data-ajustar-mas]').click()
    await flush()
    expect(qty.value).toBe('5')
    expect(
      document.querySelector('[data-ajustar-diferencia]').textContent,
    ).toContain('+1')
    // Disponible = new count − reserved.
    expect(
      document.querySelector('[data-ajustar-resumen]').textContent,
    ).toMatch(/Disponible\s*4/)
    document.querySelector('[data-ajustar-motivo]').click()
    await flush()
    ;[...document.querySelectorAll('[role="radio"]')]
      .find((el) => el.textContent.includes('Dañado'))
      .click()
    await flush()
    document.querySelector('[data-ajustar-guardar]').click()
    await flush()
    expect(saved).toHaveLength(1)
    expect(saved[0].doctype).toBe('Stock Reconciliation')
    expect(JSON.parse(saved[0].values)).toEqual({
      purpose: 'Stock Reconciliation',
      set_warehouse: 'Centro - D',
      items: [{ item_code: 'ABIBMEX000130', warehouse: 'Centro - D', qty: 5 }],
    })
    expect(saved[0].comment).toBe('Motivo: Dañado')
    expect(router.currentRoute.value.path).toBe(
      '/inventario/ajustes/MAT-RECO-0001',
    )
  })

  it('cost and margin only when the server sends them', async () => {
    record.cost = {
      last_cost: 80,
      valuation_rate: 82,
      currency: 'MXN',
      basis_price_list: 'Standard Selling',
      basis_rate: 130,
      basis_cost: 'last_cost',
      margin: 50,
      margin_pct: 38.46,
    }
    await mountAt('/productos/ABIBMEX000130')
    const text = root.textContent
    expect(text).toContain('Cost and margin')
    expect(text).toContain('38.5%')
    expect(text).toContain('Margin over Precio de venta')
    expect(text).not.toContain('Unit: Nos')
  })

  it('«All settings» opens every setting of the product', async () => {
    await mountAt('/productos/ABIBMEX000130')
    const link = root.querySelector('[data-producto-ajustes]')
    expect(link.textContent).toContain('All settings')
    expect(link.getAttribute('href')).toBe(
      '/crm/productos/ABIBMEX000130/ajustes',
    )
  })
})

// «Mínimos por tienda» (Shell SPEC §6 DD9): the stock section holds each
// store's minimum from the record's `reorder` block, with «Reordenar»,
// «Avísame» / «Quitar aviso» and «Poner mínimo» per store; a tap opens that
// store's minimum (MinimoSheet, see reorderLevels.test.js).
describe('Mínimos por tienda', () => {
  const MODIFIED = '2026-10-08 10:00:00'
  const stores = () => [
    {
      warehouse: 'Centro - D',
      label: 'Centro',
      actual_qty: 2,
      reorder_level: 5,
      reorder_qty: 10,
      suggested_qty: 10,
      state: 'bajo',
      watch: { name: 'AV-1', status: 'activo' },
    },
    {
      warehouse: 'Bodega - D',
      label: 'Bodega',
      actual_qty: 0,
      reorder_level: 0,
      reorder_qty: 0,
      suggested_qty: 0,
      state: 'sin_minimo',
      watch: null,
    },
    {
      warehouse: 'Norte - D',
      label: 'Norte',
      actual_qty: 0,
      reorder_level: 4,
      reorder_qty: 6,
      suggested_qty: 6,
      state: 'faltan',
      watch: null,
    },
  ]
  function stocked({ canEdit = true, list = stores() } = {}) {
    record.item.is_stock_item = 1
    record.item.is_purchase_item = 1
    record.stock = {
      readable: true,
      hidden: 0,
      total: 2,
      service: false,
      rows: [
        {
          warehouse: 'Centro - D',
          label: 'Centro',
          actual_qty: 2,
          reserved_qty: 0,
          projected_qty: 2,
          reorder_level: 5,
          reorder_qty: 10,
          state: 'bajo',
          cajones: [],
          last_counted: null,
          counts_pending: [],
          can_request_count: true,
          negative: false,
        },
      ],
    }
    record.actions.push({
      key: 'purchase',
      label: 'Pedir',
      enabled: true,
      primary: true,
    })
    record.reorder = { modified: MODIFIED, can_edit: canEdit, stores: list }
  }
  // Every call through fetch: the record, then what each test answers.
  function serve(replies = {}) {
    const calls = []
    fetch.mockImplementation(async (url, init) => {
      const method = String(url).split('.').pop()
      const body = init?.body ? JSON.parse(init.body) : {}
      calls.push([method, body])
      const reply =
        method === 'record'
          ? record
          : typeof replies[method] === 'function'
            ? replies[method](body)
            : replies[method]
      const ok = reply !== undefined
      // Over the wire: a fresh copy each time, as the browser parses it.
      const payload = JSON.stringify({ message: ok ? reply : null })
      return {
        ok,
        status: ok ? 200 : 404,
        json: async () => JSON.parse(payload),
        text: async () => payload,
      }
    })
    return calls
  }
  const row = (warehouse) =>
    root.querySelector(`[data-minimos-store="${warehouse}"]`)
  const words = (el) => el?.textContent.replace(/\s+/g, ' ').trim()
  const sheet = () => document.querySelector('[data-minimo-sheet]')

  it('one row per store with its minimum, state and watch; «Reordenar» buys what Doco suggests', async () => {
    stocked()
    serve()
    const router = await mountAt('/productos/ABIBMEX000130')
    const section = root.querySelector('#existencias')
    expect(words(section.querySelector('h2'))).toBe('Minimums by store')
    expect(words(section.querySelector('[data-minimos-story]'))).toBe(
      'How much each store should have. If it drops, I let you know once and take you to order.',
    )
    // The stores with stock first, then those that hold none yet.
    expect(
      [...section.querySelectorAll('[data-minimos-store]')].map(
        (el) => el.dataset.minimosStore,
      ),
    ).toEqual(['Centro - D', 'Bodega - D', 'Norte - D'])

    const centro = row('Centro - D')
    expect(words(centro.querySelector('[data-minimos-line]'))).toBe(
      'On hand 2 · Minimum 5 · Order 10',
    )
    // The minimum is said once, in its line.
    expect(centro.textContent).toContain('Reserved 0 · Projected 2')
    expect(centro.textContent).not.toContain('Projected 2 · Minimum 5')
    expect(words(centro.querySelector('[data-minimos-state]'))).toBe(
      'Below minimum',
    )
    expect(words(centro.querySelector('[data-minimos-watch]'))).toBe('Alert on')
    expect(centro.querySelector('[data-minimos-watch-off]')).not.toBeNull()
    expect(centro.querySelector('[data-minimos-watch-on]')).toBeNull()
    expect(centro.querySelector('[data-minimos-set]')).toBeNull()

    const bodega = row('Bodega - D')
    expect(words(bodega.querySelector('[data-minimos-line]'))).toBe(
      'On hand 0 · No minimum',
    )
    expect(words(bodega.querySelector('[data-minimos-state]'))).toBe(
      'No minimum',
    )
    expect(bodega.querySelector('[data-minimos-reorder]')).toBeNull()
    expect(bodega.querySelector('[data-minimos-watch-on]')).toBeNull()
    const set = bodega.querySelector('[data-minimos-set]')
    expect(words(set)).toBe('Set minimum')
    expect(set.getAttribute('aria-label')).toBe('Set minimum · Bodega')
    // A store with no stock of it shows no stock tools.
    expect(bodega.textContent).not.toContain('Count now')

    const norte = row('Norte - D')
    expect(words(norte.querySelector('[data-minimos-state]'))).toBe(
      'Without stock',
    )
    expect(norte.querySelector('[data-minimos-watch-on]')).not.toBeNull()
    const reorder = norte.querySelector('[data-minimos-reorder]')
    expect(reorder.getAttribute('aria-label')).toBe('Reorder · Norte')
    reorder.click()
    await flush()
    expect(router.currentRoute.value.name).toBe('CompraNueva')
    expect(router.currentRoute.value.query).toMatchObject({
      item: 'ABIBMEX000130',
      warehouse: 'Norte - D',
      qty: '6',
    })
  })

  it('«Avísame» and «Quitar aviso» on a row, then the record is read again', async () => {
    const { toast } = await import('frappe-ui')
    toast.success.mockClear()
    stocked()
    const calls = serve({
      avisame_stock: {
        name: 'AV-2',
        condition: 'Cuando baje de 4 en Norte',
        status: 'Activo',
        note: '',
      },
      quitar: { ok: true },
    })
    await mountAt('/productos/ABIBMEX000130')
    const reads = () => calls.filter(([method]) => method === 'record').length
    const before = reads()
    row('Norte - D').querySelector('[data-minimos-watch-on]').click()
    await flush()
    expect(calls.find(([method]) => method === 'avisame_stock')[1]).toEqual({
      item_code: 'ABIBMEX000130',
      warehouse: 'Norte - D',
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Done. I will let you know: cuando baje de 4 en Norte.',
    )
    expect(reads()).toBe(before + 1)
    row('Centro - D').querySelector('[data-minimos-watch-off]').click()
    await flush()
    expect(calls.find(([method]) => method === 'quitar')[1]).toEqual({
      name: 'AV-1',
    })
    expect(toast.success).toHaveBeenCalledWith('Alert removed.')
    expect(reads()).toBe(before + 2)
  })

  it('a tap on a store opens its minimum; «Guardar» sends that row with the modified', async () => {
    stocked()
    const calls = serve({
      // Doco saves it: the record read next brings the new minimum.
      save_reorder: (body) => {
        record.reorder = {
          ...record.reorder,
          modified: '2026-10-08 10:05:00',
          stores: stores().map((store) =>
            store.warehouse === 'Centro - D'
              ? { ...store, reorder_level: 8 }
              : store,
          ),
        }
        return {
          item: body.item,
          modified: '2026-10-08 10:05:00',
          reorder: record.reorder,
        }
      },
    })
    await mountAt('/productos/ABIBMEX000130')
    const open = row('Centro - D').querySelector('[data-minimos-open]')
    expect(open.getAttribute('aria-haspopup')).toBe('dialog')
    open.click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet().dataset.minimoMode).toBe('edit')
    const level = document.querySelector('input[data-minimo-level]')
    expect(level.value).toBe('5')
    // «Quitar mínimo» asks first, with the safe answer focused.
    document.querySelector('[data-minimo-clear]').click()
    await flush()
    expect(document.activeElement).toBe(
      document.querySelector('[data-minimo-cancel]'),
    )
    document.querySelector('[data-minimo-cancel]').click()
    await flush()
    const input = document.querySelector('input[data-minimo-level]')
    input.value = '8'
    input.dispatchEvent(new Event('input'))
    await flush()
    document.querySelector('[data-minimo-save]').click()
    await flush()
    const saved = calls.filter(([method]) => method === 'save_reorder')
    expect(saved).toHaveLength(1)
    expect(saved[0][1]).toMatchObject({
      item: 'ABIBMEX000130',
      modified: MODIFIED,
      rows: '[{"warehouse":"Centro - D","level":8,"qty":10}]',
    })
    expect(words(row('Centro - D').querySelector('[data-minimos-line]'))).toBe(
      'On hand 2 · Minimum 8 · Order 10',
    )
  })

  it('who does not keep the catalog reads who sets it, and may ask for the change', async () => {
    stocked({ canEdit: false })
    record.actions = record.actions.map((entry) =>
      entry.key === 'edit'
        ? {
            key: 'edit',
            label: 'Pedir cambio',
            enabled: false,
            reason: 'Los datos los cambia quien mantiene el catálogo.',
            resolve: { kind: 'request', request: 'data' },
          }
        : entry,
    )
    serve({ request_options: { candidates: [] } })
    await mountAt('/productos/ABIBMEX000130')
    // Nothing to set; the store still opens to read.
    expect(row('Bodega - D').querySelector('[data-minimos-set]')).toBeNull()
    row('Bodega - D').querySelector('[data-minimos-open]').click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet().dataset.minimoMode).toBe('read')
    expect(document.querySelector('input[data-minimo-level]')).toBeNull()
    expect(words(document.querySelector('[data-minimo-readonly]'))).toBe(
      'The minimum is set by whoever keeps the catalog.',
    )
    const ask = document.querySelector('[data-minimo-request]')
    expect(words(ask)).toBe('Pedir cambio')
    ask.click()
    // The catalog request opens with the store written in the note.
    await vi.waitFor(
      () =>
        expect(
          [...document.querySelectorAll('textarea')].map((area) => area.value),
        ).toContain('Minimum for Bodega:'),
      { timeout: 3000 },
    )
    expect(document.body.textContent).toContain(
      'The minimum is set by whoever keeps the catalog.',
    )
  })

  it('says so when no store is in sight', async () => {
    stocked({ list: [] })
    record.stock.rows = []
    serve()
    await mountAt('/productos/ABIBMEX000130')
    expect(words(root.querySelector('[data-minimos-empty]'))).toBe(
      'No stores in sight for this item.',
    )
  })

  it('just created: «Poner mínimo» comes first; one store opens it, several lead to them', async () => {
    stocked({ list: [stores()[1]] })
    record.stock.rows = []
    serve()
    await mountAt('/productos/ABIBMEX000130?creado=1')
    const next = root.querySelector('[data-notice-action]')
    expect(words(next)).toBe('Set minimum')
    next.click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(document.querySelector('[data-ui-sheet]').textContent).toContain(
      'Bodega',
    )
    app.unmount()
    root.remove()
    document.body.innerHTML = ''

    const scrolled = []
    Element.prototype.scrollIntoView = function () {
      scrolled.push(this.id)
    }
    stocked()
    serve()
    await mountAt('/productos/ABIBMEX000130?creado=1')
    root.querySelector('[data-notice-action]').click()
    await flush()
    expect(scrolled).toContain('existencias')
    expect(sheet()).toBeNull()
    delete Element.prototype.scrollIntoView
    app.unmount()
    root.remove()

    // Who does not keep the catalog is not offered it.
    stocked({ canEdit: false })
    serve()
    await mountAt('/productos/ABIBMEX000130?creado=1')
    expect(root.querySelector('[data-notice-action]')).toBeNull()
  })

  it('without the stock read, the stores still list under the sentence: a minimum can be changed or cleared', async () => {
    // No Bin read: Doco sends no stock, state or suggestion for the stores.
    const unread = () =>
      stores().map((store) => ({
        ...store,
        actual_qty: null,
        projected_qty: null,
        suggested_qty: null,
        state: null,
      }))
    stocked({ list: unread() })
    record.stock = { readable: false, rows: [], hidden: 0 }
    serve()
    await mountAt('/productos/ABIBMEX000130')
    let section = root.querySelector('#existencias')
    const said = section.querySelector('[data-stock-unreadable]')
    expect(words(said)).toBe(
      'You cannot see stock. Ask your manager for access.',
    )
    expect(
      [...section.querySelectorAll('[data-minimos-store]')].map(
        (el) => el.dataset.minimosStore,
      ),
    ).toEqual(['Centro - D', 'Bodega - D', 'Norte - D'])
    // The sentence first, then the stores.
    expect(
      said.compareDocumentPosition(row('Centro - D')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(words(row('Centro - D').querySelector('[data-minimos-line]'))).toBe(
      'Minimum 5 · Order 10',
    )
    expect(
      row('Centro - D').querySelector('[data-minimos-projection]'),
    ).toBeNull()
    expect(row('Norte - D').querySelector('[data-minimos-reorder]')).toBeNull()
    expect(row('Bodega - D').querySelector('[data-minimos-set]')).not.toBeNull()
    expect(section.querySelector('[data-minimos-empty]')).toBeNull()
    // Who keeps the catalog opens the store to change or clear its minimum.
    row('Centro - D').querySelector('[data-minimos-open]').click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    expect(sheet().dataset.minimoMode).toBe('edit')
    expect(document.querySelector('[data-minimo-clear]')).not.toBeNull()
    app.unmount()
    root.remove()
    document.body.innerHTML = ''

    // No store assigned: the same, under its own sentence.
    stocked({ list: unread() })
    record.stock = {
      readable: true,
      unassigned: true,
      rows: [],
      hidden: 0,
      total: 0,
      service: false,
    }
    serve()
    await mountAt('/productos/ABIBMEX000130')
    section = root.querySelector('#existencias')
    expect(words(section.querySelector('[data-stock-unassigned]'))).toBe(
      'You have no store assigned, so you do not see its stock. Ask your manager to assign you one.',
    )
    expect(section.querySelectorAll('[data-minimos-store]')).toHaveLength(3)
    expect(section.querySelector('[data-minimos-empty]')).toBeNull()
  })

  it('a row says what its minimum is compared with, and the store’s other ERPNext rules', async () => {
    const list = stores()
    // 4 on their way to Centro: the minimum is compared with 6.
    list[0].projected_qty = 6
    list[0].request_type = 'Purchase'
    list[0].other_rows = [
      { request_type: 'Transfer', reorder_level: 3, reorder_qty: 6 },
    ]
    list[2].projected_qty = 0
    list[2].other_rows = []
    stocked({ list })
    serve()
    await mountAt('/productos/ABIBMEX000130')
    const centro = row('Centro - D')
    // The main line stays as it is.
    expect(words(centro.querySelector('[data-minimos-line]'))).toBe(
      'On hand 2 · Minimum 5 · Order 10',
    )
    expect(words(centro.querySelector('[data-minimos-projection]'))).toBe(
      '6 left counting what is reserved and what is on its way.',
    )
    expect(words(centro.querySelector('[data-minimos-other-rules]'))).toBe(
      'This store also has other rules: Transfer (min. 3, order 6).',
    )
    // The same number, or none sent: nothing more.
    const norte = row('Norte - D')
    expect(norte.querySelector('[data-minimos-projection]')).toBeNull()
    expect(norte.querySelector('[data-minimos-other-rules]')).toBeNull()
    expect(
      row('Bodega - D').querySelector('[data-minimos-projection]'),
    ).toBeNull()
  })

  it('«How it sells» offers «Reorder» where the section does, with the same number and state', async () => {
    const outside = (warehouse, label, state) => ({
      warehouse,
      label,
      actual_qty: 1,
      reserved_qty: 0,
      projected_qty: 1,
      reorder_level: 5,
      reorder_qty: 5,
      state,
      cajones: [],
      last_counted: null,
      counts_pending: [],
      can_request_count: true,
      negative: false,
    })
    stocked({
      list: [
        // Short, with Doco's suggestion: «Reordenar» for 10.
        stores()[0],
        // Short with nothing suggested: none.
        { ...stores()[2], suggested_qty: 0 },
        // In order for Doco, whatever its stock row says.
        {
          warehouse: 'Sur - D',
          label: 'Sur',
          actual_qty: 1,
          projected_qty: 9,
          reorder_level: 5,
          reorder_qty: 5,
          suggested_qty: 0,
          state: 'ok',
          watch: null,
        },
      ],
    })
    // The stock rows' own states decide nothing; Oeste is not in the block.
    record.stock.rows = [
      { ...record.stock.rows[0], state: 'ok' },
      outside('Sur - D', 'Sur', 'bajo'),
      outside('Oeste - D', 'Oeste', 'faltan'),
    ]
    record.insights = {
      readable: true,
      uom: 'Nos',
      sold_30: 3,
      sold_90: 9,
      per_day: 0.1,
      last_sale: null,
      last_purchase: null,
      cover: [
        { warehouse: 'Centro - D', label: 'Centro', days: 20, per_day: 0.1 },
        { warehouse: 'Norte - D', label: 'Norte', days: 0, per_day: 0.1 },
        { warehouse: 'Sur - D', label: 'Sur', days: 10, per_day: 0.1 },
        { warehouse: 'Oeste - D', label: 'Oeste', days: 30, per_day: 0.1 },
      ],
      channels: [],
    }
    serve()
    const router = await mountAt('/productos/ABIBMEX000130')
    const cover = [
      ...root.querySelectorAll(
        '[data-producto-insights] [data-insights-cover] li',
      ),
    ]
    expect(
      cover.map((li) => Boolean(li.querySelector('[data-insights-reorder]'))),
    ).toEqual([true, false, false, false])
    expect(
      [...root.querySelectorAll('#existencias [data-minimos-reorder]')].map(
        (button) => button.closest('[data-minimos-store]').dataset.minimosStore,
      ),
    ).toEqual(['Centro - D'])
    // The same states: Centro short, Sur in order as its chip says.
    const shortLine = (li) =>
      li.querySelector('.text-sm').className.includes('text-ink-red-7')
    expect(shortLine(cover[0])).toBe(true)
    expect(shortLine(cover[2])).toBe(false)
    expect(words(row('Sur - D').querySelector('[data-minimos-state]'))).toBe(
      'In order',
    )
    expect(cover[2].textContent).toContain('minimum 5')
    cover[0].querySelector('[data-insights-reorder]').click()
    await flush()
    expect(router.currentRoute.value.name).toBe('CompraNueva')
    expect(router.currentRoute.value.query).toMatchObject({
      warehouse: 'Centro - D',
      qty: '10',
    })
    app.unmount()
    root.remove()

    // Who may not buy gets «Reorder» in neither.
    record.actions = record.actions.map((entry) =>
      entry.key === 'purchase' ? { ...entry, enabled: false } : entry,
    )
    await mountAt('/productos/ABIBMEX000130')
    expect(root.querySelector('[data-insights-reorder]')).toBeNull()
    expect(root.querySelector('[data-minimos-reorder]')).toBeNull()
  })

  it('«Poner mínimo» in «Avísame…» opens that store’s minimum, and «Avísame…» comes back on it once saved', async () => {
    stocked()
    const calls = serve({
      mis_avisos: [],
      // Doco saves it: Bodega now has its minimum.
      save_reorder: (body) => {
        record.reorder = {
          ...record.reorder,
          modified: '2026-10-08 10:05:00',
          stores: stores().map((store) =>
            store.warehouse === 'Bodega - D'
              ? { ...store, reorder_level: 3, reorder_qty: 6, state: 'faltan' }
              : store,
          ),
        }
        return {
          item: body.item,
          modified: '2026-10-08 10:05:00',
          reorder: record.reorder,
        }
      },
    })
    await mountAt('/productos/ABIBMEX000130')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Avísame cuando baje'))
      .click()
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="radio"]').length).toBe(3),
    )
    ;[...document.querySelectorAll('[role="radio"]')]
      .find((el) => el.textContent.includes('Bodega'))
      .click()
    await flush()
    document.querySelector('[data-avisame-set-minimum]').click()
    await vi.waitFor(() => expect(sheet()).not.toBeNull(), { timeout: 3000 })
    expect(sheet().dataset.minimoMode).toBe('edit')
    expect(document.querySelector('input[data-minimo-level]').value).toBe('')
    expect(document.querySelector('[data-avisame-set-minimum]')).toBeNull()
    for (const [selector, value] of [
      ['input[data-minimo-level]', '3'],
      ['input[data-minimo-qty]', '6'],
    ]) {
      const input = document.querySelector(selector)
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    await flush()
    document.querySelector('[data-minimo-save]').click()
    // Back in «Avísame…», on Bodega, with its new minimum to follow.
    await vi.waitFor(
      () =>
        expect(document.querySelector('[data-avisame-minimum]')).not.toBeNull(),
      { timeout: 3000 },
    )
    expect(sheet()).toBeNull()
    expect(
      calls.filter(([method]) => method === 'save_reorder')[0][1],
    ).toMatchObject({ rows: '[{"warehouse":"Bodega - D","level":3,"qty":6}]' })
    const chosen = [...document.querySelectorAll('[role="radio"]')].find(
      (el) => el.getAttribute('aria-checked') === 'true',
    )
    expect(chosen.textContent).toContain('Bodega')
    expect(words(document.querySelector('[data-avisame-minimum]'))).toBe(
      'Te aviso una vez cada vez que baje de 3 en Bodega. El mínimo se cambia en «Mínimos por tienda».',
    )
    const avisame = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Avísame',
    )
    expect(avisame.disabled).toBe(false)
  })

  it('in «Avísame…», who does not keep the catalog is told who sets a minimum', async () => {
    stocked({ canEdit: false })
    serve({ mis_avisos: [] })
    await mountAt('/productos/ABIBMEX000130')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Avísame cuando baje'))
      .click()
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="radio"]').length).toBe(3),
    )
    ;[...document.querySelectorAll('[role="radio"]')]
      .find((el) => el.textContent.includes('Bodega'))
      .click()
    await flush()
    expect(words(document.querySelector('[data-avisame-no-minimum]'))).toBe(
      'Esta tienda no tiene mínimo. Pide a quien mantiene el catálogo que lo ponga.',
    )
    expect(document.querySelector('[data-avisame-set-minimum]')).toBeNull()
  })
})
