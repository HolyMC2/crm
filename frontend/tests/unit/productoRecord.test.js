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
        path: '/productos/:item',
        name: 'Producto',
        component: Producto,
        props: true,
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
    expect(text).toContain('Since 2026-05-29')
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
      expect(pills).toEqual(['price', 'edit', 'labels'])
    } finally {
      setWidth(width)
    }
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
})
