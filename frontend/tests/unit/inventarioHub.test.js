// The Inventario hub's stores (Shell D4.3): stocked stores first, empty ones
// folded into one row, shared names told apart, and ≥1024 master-detail (the
// picked store's movements beside the hub).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/documentos/api', () => ({ docApi: vi.fn(async () => ({})) }))
vi.mock('@/components/inventario/kardex', () => ({
  kardexApi: vi.fn(async () => ({
    readable: true,
    cost_visible: true,
    rows: [
      {
        warehouse: 'Vacío A - D',
        label: 'Vacío A',
        company: 'Doco',
        items: 0,
        units: 0,
        value: 0,
      },
      {
        warehouse: 'Centro - D',
        label: 'Centro',
        company: 'Doco',
        items: 2,
        units: 5,
        value: 50,
      },
      {
        warehouse: 'Centro - X',
        label: 'Centro',
        company: 'Xolo',
        items: 1,
        units: 1,
        value: 900,
      },
      {
        warehouse: 'Vacío B - D',
        label: 'Vacío B',
        company: 'Doco',
        items: 0,
        units: 0,
        value: 0,
      },
    ],
  })),
}))
vi.mock('@/pages/InventarioMovimientos.vue', () => ({
  default: {
    props: { pane: Boolean },
    render() {
      return h('div', {
        'data-testid': 'kardex-stub',
        'data-pane': String(this.pane),
      })
    },
  },
}))

import DocumentosHub from '@/pages/DocumentosHub.vue'
import { shellBoot } from '@/composables/muelleShell'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const setWidth = (value) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value,
  })
  window.dispatchEvent(new Event('resize'))
}

let app
let root
let width
async function mountAt(path) {
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/inventario', name: 'Inventario', component: DocumentosHub },
      {
        path: '/inventario/movimientos',
        name: 'InventarioMovimientos',
        component: stub,
      },
      { path: '/inventario/:slug', component: stub },
      { path: '/documentos/tipo/:doctype', component: stub },
      { path: '/productos', name: 'Productos', component: stub },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(root)
  await flush()
  return router
}

beforeEach(() => {
  width = window.innerWidth
  shellBoot.value = {
    modules: {
      inventario: {
        enabled: true,
        capabilities: {
          doctypes: ['Stock Entry', 'Stock Ledger Entry', 'Warehouse'],
        },
      },
    },
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  shellBoot.value = null
  setWidth(width)
})

describe('Inventario hub', () => {
  it('lists stocked stores by value, folds the empty ones and names shared stores by company', async () => {
    setWidth(400)
    await mountAt('/inventario')
    const titles = [
      ...root.querySelectorAll('[data-testid="inventario-store"]'),
    ].map((el) => el.textContent)
    expect(titles).toHaveLength(2)
    expect(titles[0]).toContain('Centro · Xolo')
    expect(titles[1]).toContain('Centro · Doco')
    const empty = root.querySelector('[data-testid="inventario-stores-empty"]')
    expect(empty.textContent).toContain('Sin existencias (2)')
    // A phone opens the store's movements on their own page.
    expect(root.querySelector('[data-testid="hub-detail"]')).toBeNull()
    const first = root.querySelector(
      '[data-testid="inventario-store"] a, a[data-testid="inventario-store"]',
    )
    expect(first.getAttribute('href')).toContain(
      '/inventario/movimientos?almacen=',
    )
  })

  it('≥1024: the hub on the left, the picked store’s movements on the right', async () => {
    setWidth(1440)
    const router = await mountAt('/inventario')
    // It opens on the most valuable store.
    expect(router.currentRoute.value.query.almacen).toBe('Centro - X')
    const detail = root.querySelector('[data-testid="hub-detail"]')
    expect(
      detail.querySelector('[data-testid="kardex-stub"]').dataset.pane,
    ).toBe('true')
    const link = root.querySelector(
      '[data-testid="inventario-store"] a, a[data-testid="inventario-store"]',
    )
    expect(link.getAttribute('href')).toBe('/crm/inventario?almacen=Centro+-+X')
    await router.push(link.getAttribute('href').replace('/crm', ''))
    await flush()
    expect(router.currentRoute.value.query.almacen).toBe('Centro - X')
    expect(root.querySelector('[data-testid="hub-detail"]')).not.toBeNull()
  })
})
