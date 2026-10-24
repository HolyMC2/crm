// Reportes and Desk rows (Shell E7, DE9): what the awesomebar reaches, as Desk
// rows after the shell's own places, from the one registry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), status: { enabled: true } }))
vi.mock('frappe-ui', () => ({
  call: (...args) => state.call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
  useTheme: () => ({ currentTheme: ref('light'), setTheme: vi.fn() }),
  createResource: () => ({ data: null, fetch: vi.fn() }),
}))
vi.mock('@/composables/breakpoint', async () => {
  const { computed, ref } = await import('vue')
  const mobile = ref(false)
  return {
    isMobile: mobile,
    isNarrow: mobile,
    isWide: computed(() => !mobile.value),
  }
})

import { parsePaletteQuery } from '@/vendor/muelle-shell/contracts'
import { createShellProviders } from '@/utils/shellPalette'
import { createDeskProviders } from '@/utils/deskPalette'
import { _resetAssistant } from '@/components/assistant/useAssistant'

const boot = (overrides = {}) => ({
  user: { name: 'ana@example.test', full_name: 'Ana López' },
  modules: {
    contactos: {
      key: 'contactos',
      enabled: true,
      capabilities: { read: true, create: true },
    },
    ventas: { key: 'ventas', enabled: true, capabilities: { read: true } },
    documentos: {
      key: 'documentos',
      enabled: true,
      capabilities: { doctypes: ['Sales Invoice'], create: ['Sales Invoice'] },
    },
    resultados: {
      key: 'resultados',
      enabled: true,
      capabilities: { read: true },
    },
    ...overrides,
  },
})
const modules = [
  { key: 'hoy', label: 'Hoy', icon: 'lucide-sun', to: '/hoy', go: 'h' },
  {
    key: 'compras',
    label: 'Compras',
    icon: 'lucide-truck',
    to: '/compras',
    go: 'p',
  },
  {
    key: 'resultados',
    label: 'Resultados',
    icon: 'lucide-bar-chart-3',
    to: '/resultados',
    go: 'r',
  },
]
const query = (raw) => parsePaletteQuery(raw)
const doctypes = [
  {
    doctype: 'Warehouse',
    label: 'Almacén',
    module: 'Inventario',
    create: true,
  },
  {
    doctype: 'Sales Invoice',
    label: 'Factura de venta',
    module: 'Cuentas',
    create: true,
  },
  {
    doctype: 'Item Group',
    label: 'Grupo de artículos',
    module: 'Inventario',
    create: false,
  },
]

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  _resetAssistant()
  state.call.mockReset()
  state.call.mockImplementation(async (method, args) => {
    if (method === 'crm.api.documentos.doctypes') return doctypes
    if (method.endsWith('shell_api.status')) return state.status
    if (method === 'crm.api.shell.reports')
      return [
        {
          name: 'Stock Ledger',
          title: 'Mayor de Inventarios',
          report_type: 'Script Report',
          ref_doctype: 'Stock Ledger Entry',
          ref_label: 'Movimiento de inventario',
          href: '/app/query-report/Stock%20Ledger',
        },
        {
          name: 'Sales Register',
          title: 'Registro de ventas',
          report_type: 'Report Builder',
          ref_doctype: 'Sales Invoice',
          ref_label: 'Factura de venta',
          href: '/app/sales-invoice/view/report/Sales%20Register',
        },
      ]
    if (method === 'crm.api.shell.workspaces')
      return [
        {
          name: 'Compras',
          title: 'Compras',
          label: 'Compras',
          href: '/app/compras',
        },
        {
          name: 'Muelle Inventario',
          title: 'Muelle Inventario',
          label: 'Inventario Muelle',
          href: '/app/muelle-inventario',
        },
      ]
    throw new Error(`unexpected ${method} ${JSON.stringify(args)}`)
  })
})
afterEach(() => localStorage.clear())

describe('Reportes and Desk rows leave the shell only where it has no page', () => {
  it('reports are Desk rows labelled Desk, from the server, with the Desk URL', async () => {
    const [reportes] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const items = await reportes.search(query('stock'))
    expect(state.call).toHaveBeenCalledWith('crm.api.shell.reports', {
      search: 'stock',
    })
    expect(items[0]).toMatchObject({
      id: 'reporte:Stock Ledger',
      group: 'reportes',
      title: 'Mayor de Inventarios',
      keywords: 'Stock Ledger',
      desk: '/app/query-report/Stock%20Ledger',
    })
    expect(items[0].subtitle).toMatch(/^Desk · Movimiento de inventario$/)
    expect(items[1].desk).toBe(
      '/app/sales-invoice/view/report/Sales%20Register',
    )
  })

  it('workspaces skip the ones a shell module already is, and say Desk', async () => {
    const [, desk] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const items = await desk.search(query('inv'))
    expect(items.map((i) => i.id)).toEqual(['desk:Muelle Inventario'])
    expect(items[0]).toMatchObject({
      group: 'desk',
      title: 'Inventario Muelle',
      subtitle: 'Desk',
      desk: '/app/muelle-inventario',
    })
  })

  it('the registry carries every provider with its scopes once', () => {
    const providers = createShellProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const keys = providers.map((p) => p.key)
    expect(keys).toEqual([...new Set(keys)])
    for (const key of ['tipos', 'reportes', 'desk', 'asistente'])
      expect(keys).toContain(key)
    expect(providers.find((p) => p.key === 'asistente').scopes).toEqual([
      'assistant',
    ])
  })
})
