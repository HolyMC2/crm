// A purchase order reads its dates like the rest of the shell («jue, 15 oct»),
// never as raw ISO («entrega 2026-10-15»).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import CompraOrden from '@/pages/CompraOrden.vue'
import { comprasBoot } from '@/composables/useCompras'
import { formatDay } from '@/utils/contactos'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const ORDER = {
  document: {
    doctype: 'Purchase Order',
    name: 'PUR-ORD-2026-00001',
    party: 'Distribuidora Celular del Pacífico',
    company: '_Test Retail MX',
    set_warehouse: 'Stores - _TRMX',
    schedule_date: '2026-10-15',
    docstatus: 1,
    status: 'To Receive and Bill',
    grand_total: 2850,
    currency: 'MXN',
    modified: '2026-10-13 07:00:00',
  },
  rows: [],
  rows_scope: { total: 0, has_more: false },
  receipts: {
    rows: [
      { name: 'MAT-PRE-2026-00001', docstatus: 1, posting_date: '2026-10-14' },
    ],
  },
  followups: {
    rows: [
      { name: 'TD-1', description: 'Llamar al proveedor', date: '2026-10-16' },
    ],
  },
}

let app, root
beforeEach(() => {
  comprasBoot.value = null
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const method = String(url).split('.').pop()
      const message =
        method === 'get_capabilities'
          ? { enabled: true, user: 'compras@example.test', capabilities: {} }
          : method === 'order'
            ? ORDER
            : []
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('purchase order dates', () => {
  it('shows delivery, receipt and follow-up days in words', async () => {
    const router = createRouter({
      history: createMemoryHistory('/crm'),
      routes: [
        {
          path: '/compras/orden/:name',
          name: 'CompraOrden',
          component: CompraOrden,
          props: true,
        },
        ...['Compras', 'CompraSolicitud', 'Contactos', 'Gastos'].map(
          (name) => ({
            path: `/${name}/:name?`,
            name,
            component: { render: () => null },
          }),
        ),
      ],
    })
    router.push('/compras/orden/PUR-ORD-2026-00001')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ template: '<RouterView />' })
    app.use(router)
    app.config.globalProperties.__ = window.__
    app.mount(root)
    await flush()
    const text = root.textContent
    expect(text).toContain(`delivery ${formatDay('2026-10-15')}`)
    expect(text).toContain(formatDay('2026-10-14'))
    expect(text).toContain(formatDay('2026-10-16'))
    expect(text).not.toMatch(/2026-10-1[456]/)
  })
})
