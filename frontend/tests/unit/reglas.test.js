// Compras' rules side by side (≥1024): the list on the left, the comparison
// table or the open rule on the right, closing back to the table.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import CompraReglas from '@/pages/CompraReglas.vue'
// The panes CompraReglas loads on demand, already in the module cache.
import '@/pages/CompraEnvios.vue'
import '@/pages/CompraEnvio.vue'
import '@/components/compras/EnviosResumen.vue'
import '@/pages/CompraDescuentos.vue'
import '@/pages/CompraDescuento.vue'
import '@/components/compras/DescuentosResumen.vue'

const RULE = {
  name: 'Paquetería local',
  label: 'Paquetería local',
  state: 'activo',
  disabled: false,
  company: 'DC',
  currency: 'MXN',
  account: { name: 'Fletes - DC', label: 'Fletes y acarreos' },
  cost_center: null,
  based_on: 'fixed',
  amount: 189,
  steps: [],
  ranges: [],
  extras: [],
  selling: false,
  desk_ranges: false,
  editable: true,
  modified: '2026-11-06 10:00:00',
}

const DISCOUNT = {
  name: 'PRLE-0003',
  title: 'Tecnomaxx 10 % en pantallas',
  state: 'activo',
  disabled: 0,
  who: { kind: 'supplier', name: 'SUP-0007', label: 'Tecnomaxx' },
  what: {
    kind: 'groups',
    targets: [{ name: 'Pantallas', label: 'Pantallas' }],
  },
  discount: { kind: 'percent', value: 10 },
  apply_discount_on: 'Grand Total',
  min_qty: 0,
  max_qty: 0,
  min_amt: 0,
  max_amt: 0,
  valid_from: null,
  valid_upto: null,
  company: 'DC',
  warehouse: null,
  priority: 0,
  currency: 'MXN',
  extras: [],
  editable: true,
  modified: '2026-11-06 10:00:00',
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

// Async panes load their chunks: wait until what the test reads is there.
async function until(selector) {
  for (let i = 0; i < 100; i++) {
    const found = root.querySelector(selector)
    if (found) return found
    await flush()
  }
  throw new Error(`never showed: ${selector}`)
}

let app, root, calls
beforeEach(() => {
  calls = []
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push({ method, args: JSON.parse(init?.body || '{}') })
      const message = {
        rules: {
          rows: String(url).includes('descuentos') ? [DISCOUNT] : [RULE],
          counts: { activo: 1, desactivado: 0 },
          has_more: false,
          capped: false,
          can_create: true,
        },
        rule: String(url).includes('descuentos')
          ? {
              rule: DISCOUNT,
              can_write: true,
              companies: [],
              overlaps: [{ name: 'PRLE-0009', title: 'Pantallas 8 %' }],
            }
          : { rule: RULE, can_write: true, companies: [] },
      }[method]
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

async function open(path) {
  const envios = { reglas: 'envios' }
  const descuentos = { reglas: 'descuentos' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/compras', name: 'Compras', component: { render: () => null } },
      {
        path: '/compras/envios',
        name: 'CompraEnvios',
        component: CompraReglas,
        meta: envios,
      },
      {
        path: '/compras/envio/:name',
        name: 'CompraEnvio',
        component: CompraReglas,
        meta: envios,
      },
      {
        path: '/compras/descuentos',
        name: 'CompraDescuentos',
        component: CompraReglas,
        meta: descuentos,
      },
      {
        path: '/compras/descuento/:name',
        name: 'CompraDescuento',
        component: CompraReglas,
        meta: descuentos,
      },
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

describe('shipping rules on a wide screen', () => {
  it('compares them all, opens one beside the list and closes back', async () => {
    expect(window.innerWidth).toBeGreaterThanOrEqual(1024)
    const router = await open('/compras/envios')
    expect(root.querySelector('[data-testid="reglas-split"]')).not.toBeNull()
    const table = await until('[data-testid="envios-resumen"] table')
    expect(table.textContent).toContain('Per purchase')
    expect(table.textContent).toContain('Fletes y acarreos')
    // The row's figure is what it charges.
    const row = root.querySelector('[data-envio="Paquetería local"]')
    expect(row.textContent).toContain('189')
    await router.push(row.getAttribute('href').replace(/^\/crm/u, ''))
    await until('[data-testid="envio-monto"]')
    // The list stayed: one read of it, the rule read beside it.
    expect(calls.filter((c) => c.method === 'rules')).toHaveLength(1)
    expect(
      root
        .querySelector('[data-envio="Paquetería local"]')
        .getAttribute('aria-current'),
    ).toBe('true')
    root.querySelector('[data-testid="envio-cerrar"]').click()
    await flush()
    expect(router.currentRoute.value.name).toBe('CompraEnvios')
    await until('[data-testid="envios-resumen"]')
  })
})

describe('supplier discounts on a wide screen', () => {
  it('compares them, and an open one names what it collides with', async () => {
    const router = await open('/compras/descuentos?supplier=SUP-0007')
    const table = await until('[data-testid="descuentos-resumen"] table')
    expect(table.textContent).toContain('10 %')
    expect(table.textContent).toContain('Tecnomaxx')
    const row = root.querySelector('[data-descuento="PRLE-0003"]')
    // The list's supplier stays with the discount opened beside it.
    expect(row.getAttribute('href')).toContain('supplier=SUP-0007')
    await router.push(row.getAttribute('href').replace(/^\/crm/u, ''))
    const warning = await until('[data-testid="descuento-empalmes"]')
    expect(warning.textContent).toContain('Pantallas 8 %')
    root.querySelector('[data-testid="descuento-cerrar"]').click()
    await flush()
    expect(router.currentRoute.value.query.supplier).toBe('SUP-0007')
  })
})
