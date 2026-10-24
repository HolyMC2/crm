// The palette reaches what Desk reaches (Shell E7, DE9): Listas, Reportes,
// Desk rows from one registry, the assistant as a place and the `?` scope,
// Recientes for any stable row.
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

import {
  parsePaletteQuery,
  providersFor,
} from '@/vendor/muelle-shell/contracts'
import {
  createShellProviders,
  orderPaletteSections,
  resolveRecent,
  toRecentRef,
} from '@/utils/shellPalette'
import { createTiposProvider, documentosPlaces } from '@/documentos/palette'
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

describe('Listas: every readable DocType through the generic floor', () => {
  it('lists a doctype without a profile on the floor, with «Crear» only where the worker may create', async () => {
    const tipos = createTiposProvider({ boot: ref(boot()) })
    const items = await tipos.search(query('almac'))
    expect(state.call).toHaveBeenCalledWith('crm.api.documentos.doctypes', {
      search: 'almac',
    })
    const almacen = items.find((i) => i.id === 'tipos:Warehouse')
    expect(almacen).toMatchObject({
      group: 'listas',
      title: 'Almacén',
      subtitle: 'Inventario',
      keywords: 'Warehouse',
      href: '/documentos/tipo/Warehouse',
    })
    expect(items.find((i) => i.id === 'tipos:Warehouse:nuevo')).toMatchObject({
      group: 'acciones',
      title: 'Create Almacén',
      href: '/documentos/tipo/Warehouse/nuevo',
    })
    expect(items.some((i) => i.id === 'tipos:Item Group:nuevo')).toBe(false)
    expect(items.some((i) => i.id === 'tipos:Item Group')).toBe(true)
  })

  it('a curated list stays a place (no duplicate row) and its English name matches there', async () => {
    const tipos = createTiposProvider({ boot: ref(boot()) })
    const items = await tipos.search(query('sales invoice'))
    expect(items.some((i) => i.id.startsWith('tipos:Sales Invoice'))).toBe(
      false,
    )
    const place = documentosPlaces(boot()).find(
      (i) => i.id === 'documentos.facturas',
    )
    expect(place.keywords).toContain('Sales Invoice')
  })

  it('answers nothing on an empty or one-letter query, nor without the Documentos module', async () => {
    const tipos = createTiposProvider({ boot: ref(boot()) })
    expect(await tipos.search(query(''))).toEqual([])
    expect(await tipos.search(query('a'))).toEqual([])
    const off = createTiposProvider({
      boot: ref(
        boot({
          documentos: { key: 'documentos', enabled: false, capabilities: {} },
        }),
      ),
    })
    expect(await off.search(query('almac'))).toEqual([])
    expect(state.call).not.toHaveBeenCalled()
  })
})

describe('sections', () => {
  it('shell places sort before Listas, Reportes and Desk; the assistant question still leads', () => {
    const grouped = [
      { group: 'desk', items: [{ id: 'd', group: 'desk', title: 'Compras' }] },
      {
        group: 'reportes',
        items: [{ id: 'r', group: 'reportes', title: 'Ventas' }],
      },
      {
        group: 'listas',
        items: [{ id: 'l', group: 'listas', title: 'Almacén' }],
      },
      {
        group: 'ir_a',
        items: [
          { id: 'm', group: 'ir_a', title: 'Ventas', href: '/ventas' },
          {
            id: 'asistente.abrir',
            group: 'ir_a',
            title: 'Ask Muelle',
            action: 'assistant',
            args: { text: '' },
          },
        ],
      },
      {
        group: 'acciones',
        items: [
          {
            id: 'asistente.preguntar',
            group: 'acciones',
            title: 'Ask',
            action: 'assistant',
            args: { text: 'qué vendí' },
          },
        ],
      },
    ]
    const ordered = orderPaletteSections(grouped)
    expect(ordered.map((s) => s.group)).toEqual([
      'acciones',
      'ir_a',
      'listas',
      'reportes',
      'desk',
    ])
    expect(ordered[0].lead).toBe(true)
    expect(ordered[0].items.map((i) => i.id)).toEqual(['asistente.preguntar'])
    // The place row «Pregúntale a Muelle» stays in Ir a, not in the lead.
    expect(ordered[1].items.map((i) => i.id)).toEqual(['m', 'asistente.abrir'])
  })
})

describe('the assistant is a place and owns the ? scope', () => {
  const asistente = () =>
    createShellProviders({ boot: ref(boot()), modules: ref(modules) }).find(
      (p) => p.key === 'asistente',
    )

  it('?qué vendí ayer reaches only the assistant, which asks the question', async () => {
    const providers = createShellProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const q = query('?qué vendí ayer')
    expect(providersFor(providers, q).map((p) => p.key)).toEqual(['asistente'])
    const items = await asistente().search(q)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      action: 'assistant',
      args: { text: 'qué vendí ayer' },
      group: 'acciones',
    })
  })

  it('a bare ?, the empty palette or a door word list «Pregúntale a Muelle» in Ir a', async () => {
    for (const raw of ['?', '', 'asistente', 'ayuda', 'muelle']) {
      const items = await asistente().search(query(raw))
      expect(
        items.map((i) => i.id),
        raw,
      ).toContain('asistente.abrir')
      expect(items.find((i) => i.id === 'asistente.abrir')).toMatchObject({
        group: 'ir_a',
        title: 'Ask Muelle',
        action: 'assistant',
        args: { text: '' },
      })
    }
    expect(await asistente().search(query('factura 123'))).toEqual([])
  })

  it('lists nothing when the status is off', async () => {
    state.status = { enabled: false }
    _resetAssistant()
    expect(await asistente().search(query('?qué vendí'))).toEqual([])
    expect(await asistente().search(query(''))).toEqual([])
    state.status = { enabled: true }
  })
})

describe('Recientes remember any stable row', () => {
  it('keeps a place, a list, a report and a workspace by label; never an action or a sibling app', () => {
    expect(
      toRecentRef({
        id: 'tipos:Warehouse',
        group: 'listas',
        title: 'Almacén',
        subtitle: 'Inventario',
        href: '/documentos/tipo/Warehouse',
      }),
    ).toEqual({
      id: 'tipos:Warehouse',
      group: 'listas',
      title: 'Almacén',
      subtitle: 'Inventario',
      href: '/documentos/tipo/Warehouse',
    })
    expect(
      toRecentRef({
        id: 'reporte:Stock Ledger',
        group: 'reportes',
        title: 'Mayor',
        desk: '/app/query-report/Stock%20Ledger',
      }),
    ).toEqual({
      id: 'reporte:Stock Ledger',
      group: 'reportes',
      title: 'Mayor',
      desk: '/app/query-report/Stock%20Ledger',
    })
    expect(
      toRecentRef({
        id: 'module.compras',
        group: 'ir_a',
        title: 'Compras',
        href: '/compras',
      }),
    ).toMatchObject({ href: '/compras' })
    expect(
      toRecentRef({
        id: 'tipos:Warehouse:nuevo',
        group: 'acciones',
        title: 'Crear',
        href: '/documentos/tipo/Warehouse/nuevo',
      }),
    ).toBeNull()
    expect(
      toRecentRef({
        id: 'asistente.abrir',
        group: 'ir_a',
        title: 'Ask',
        action: 'assistant',
      }),
    ).toBeNull()
    expect(
      toRecentRef({
        id: 'app.pos',
        group: 'ir_a',
        title: 'POS',
        external: '/pos',
      }),
    ).toBeNull()
  })

  it('a documentos record is a {doctype, name} reference the server resolves; a revoked one is dropped', async () => {
    const ref1 = toRecentRef({
      id: 'documentos:Sales Invoice:ACC-SINV-1',
      group: 'registros',
      title: 'Ana López',
      href: '/documentos/facturas/ACC-SINV-1',
      record: { doctype: 'Sales Invoice', name: 'ACC-SINV-1' },
    })
    expect(ref1).toEqual({
      id: 'documentos:Sales Invoice:ACC-SINV-1',
      href: '/documentos/facturas/ACC-SINV-1',
      record: { doctype: 'Sales Invoice', name: 'ACC-SINV-1' },
    })
    const gone = {
      ...ref1,
      id: 'documentos:Sales Invoice:ACC-SINV-2',
      record: { doctype: 'Sales Invoice', name: 'ACC-SINV-2' },
    }
    const place = {
      id: 'tipos:Warehouse',
      group: 'listas',
      title: 'Almacén',
      href: '/documentos/tipo/Warehouse',
    }
    const report = {
      id: 'reporte:Stock Ledger',
      group: 'reportes',
      title: 'Mayor',
      desk: '/app/query-report/Stock%20Ledger',
    }
    state.call.mockImplementation(async (method, args) => {
      if (method === 'crm.api.shell.resolve_documents') {
        expect(args.records).toEqual([ref1.record, gone.record])
        return [
          {
            doctype: 'Sales Invoice',
            name: 'ACC-SINV-1',
            title: 'Ana López',
            status: 'Paid',
            amount: 100,
            currency: 'MXN',
          },
        ]
      }
      throw new Error(`unexpected ${method}`)
    })
    const rows = await resolveRecent([ref1, gone, place, report], boot())
    expect(rows.map((r) => r.id)).toEqual([
      'documentos:Sales Invoice:ACC-SINV-1',
      'tipos:Warehouse',
      'reporte:Stock Ledger',
    ])
    expect(rows[0]).toMatchObject({
      group: 'recientes',
      title: 'Ana López',
      icon: 'lucide-history',
    })
    expect(rows[1]).toMatchObject({
      group: 'recientes',
      title: 'Almacén',
      href: '/documentos/tipo/Warehouse',
    })
    expect(rows[2].desk).toBe('/app/query-report/Stock%20Ledger')
    expect(state.call).not.toHaveBeenCalledWith(
      'crm.api.shell.resolve_recent',
      expect.anything(),
    )
  })

  it('a list of a module the worker lost is dropped without asking the server', async () => {
    const place = {
      id: 'tipos:Warehouse',
      group: 'listas',
      title: 'Almacén',
      href: '/documentos/tipo/Warehouse',
    }
    const rows = await resolveRecent(
      [place],
      boot({
        documentos: { key: 'documentos', enabled: false, capabilities: {} },
      }),
    )
    expect(rows).toEqual([])
    expect(state.call).not.toHaveBeenCalled()
  })
})
