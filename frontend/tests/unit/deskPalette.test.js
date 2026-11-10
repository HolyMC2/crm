// Reportes and Desk rows (Shell E7, DE9): what the awesomebar reaches (reports,
// workspaces, pages, dashboards, a single's form, a tree, a list's report
// view), as Desk rows after the shell's own places, from the one registry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), status: { enabled: true } }))
vi.mock('frappe-ui', () => ({
  call: (...args) => state.call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
  useColorScheme: () => ({
    colorScheme: ref('light'),
    setColorScheme: vi.fn(),
  }),
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
  federatedSearch,
  groupPaletteItems,
  parsePaletteQuery,
  providersFor,
} from '@/vendor/muelle-shell/contracts'
import {
  createShellProviders,
  orderPaletteSections,
} from '@/utils/shellPalette'
import { createDeskProviders } from '@/utils/deskPalette'
import { _resetPaletteReach } from '@/utils/paletteReach'
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
    report: true,
  },
  {
    doctype: 'Sales Invoice',
    label: 'Factura de venta',
    module: 'Cuentas',
    create: true,
    report: true,
  },
  {
    doctype: 'Sales Invoice Timesheet',
    label: 'Factura de venta por horas',
    module: 'Cuentas',
    create: true,
    report: true,
  },
  {
    doctype: 'Sales Invoice Reference',
    label: 'Factura de venta relacionada',
    module: 'Cuentas',
    create: true,
    report: true,
  },
  {
    doctype: 'Item Group',
    label: 'Grupo de artículos',
    module: 'Inventario',
    create: false,
    report: false,
  },
]

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  _resetAssistant()
  _resetPaletteReach()
  state.call.mockReset()
  state.call.mockImplementation(async (method, args) => {
    if (method.endsWith('shell_api.status')) return state.status
    if (method === 'crm.api.shell.palette_reach')
      return {
        reports,
        workspaces,
        lists: doctypes,
        desk_types: deskTypes,
        pages,
        dashboards,
      }
    if (
      method === 'crm.api.palette.search_deals' ||
      method === 'crm.api.documentos.search'
    )
      return []
    if (method.endsWith('contactos.search')) return { rows: [] }
    throw new Error(`unexpected ${method} ${JSON.stringify(args)}`)
  })
})
afterEach(() => localStorage.clear())
// What only Desk opens: a single's form, a tree, a virtual type's list.
const deskTypes = [
  {
    doctype: 'Books Assistant Settings',
    label: 'Books Assistant Settings',
    module: 'Docoutils',
    kind: 'single',
    href: '/app/books-assistant-settings',
  },
  {
    doctype: 'Stock Settings',
    label: 'Configuración de inventario',
    module: 'Inventario',
    kind: 'single',
    href: '/app/stock-settings',
  },
  {
    doctype: 'Warehouse',
    label: 'Almacén',
    module: 'Inventario',
    kind: 'tree',
    href: '/app/warehouse/view/tree',
  },
  {
    doctype: 'RQ Job',
    label: 'Trabajo RQ',
    module: 'Núcleo',
    kind: 'list',
    href: '/app/rq-job',
  },
]
const pages = [
  {
    name: 'permission-manager',
    title: 'Role Permissions Manager',
    label: 'Administrador de permisos',
    href: '/app/permission-manager',
  },
  {
    name: 'muelle-compras',
    title: 'Compras',
    label: 'Compras',
    href: '/app/muelle-compras',
  },
  { name: 'pos', title: 'POS Awesome', label: 'POS Awesome', href: '/app/pos' },
  {
    name: 'posapp',
    title: 'POS Awesome',
    label: 'POS Awesome',
    href: '/app/posapp',
  },
  {
    name: 'stock-balance',
    title: 'Stock Summary',
    label: 'Resumen de inventario',
    href: '/app/stock-balance',
  },
]
const dashboards = [
  { name: 'Stock', label: 'Inventario', href: '/app/dashboard-view/Stock' },
  {
    name: 'Repair Orders',
    label: 'Órdenes de reparación',
    href: '/app/dashboard-view/Repair%20Orders',
  },
]
const reports = [
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
const workspaces = [
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

describe('Reportes and Desk rows leave the shell only where it has no page', () => {
  it('reports are Desk rows labelled Desk, from the reach, with the Desk URL', async () => {
    const [reportes] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const items = await reportes.search(query('stock'))
    expect(state.call).toHaveBeenCalledWith('crm.api.shell.palette_reach')
    expect(items[0]).toMatchObject({
      id: 'reporte:Stock Ledger',
      group: 'reportes',
      title: 'Mayor de Inventarios',
      keywords: 'Stock Ledger',
      desk: '/app/query-report/Stock%20Ledger',
    })
    expect(items[0].subtitle).toMatch(/^Desk · Movimiento de inventario$/)
    expect(items).toHaveLength(1)
    const [register] = await reportes.search(query('registro'))
    expect(register.desk).toBe(
      '/app/sales-invoice/view/report/Sales%20Register',
    )
  })

  it('workspaces skip the ones a shell module already is, and say Desk', async () => {
    const [, desk] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const items = await desk.search(query('muelle'))
    expect(items.map((i) => i.id)).toEqual(['desk:Muelle Inventario'])
    expect(items[0]).toMatchObject({
      group: 'desk',
      title: 'Inventario Muelle',
      subtitle: 'Desk',
      desk: '/app/muelle-inventario',
    })
  })

  it('the reach is read once when the palette opens; keystrokes filter it in memory', async () => {
    const [reportes, desk] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    expect(state.call).toHaveBeenCalledTimes(1)
    for (const raw of ['st', 'sto', 'stock', 'stock led', 'ventas', 'inv'])
      await Promise.all([reportes.search(query(raw)), desk.search(query(raw))])
    // A second palette in the same page reuses it too.
    createDeskProviders({ boot: ref(boot()), modules: ref(modules) })
    expect(state.call).toHaveBeenCalledTimes(1)
    // Every word, any order, accents aside: «ventas registro» finds «Registro de ventas».
    expect(
      (await reportes.search(query('ventas registro'))).map((i) => i.id),
    ).toEqual(['reporte:Sales Register'])
    // A report named by the term comes before one that only reports on its DocType.
    expect((await reportes.search(query('factura'))).map((i) => i.id)).toEqual([
      'reporte:Sales Register',
    ])
    expect(
      (await reportes.search(query('inventario'))).map((i) => i.id),
    ).toEqual(['reporte:Stock Ledger'])
  })

  it('a failed read leaves the groups empty and the next search asks again', async () => {
    state.call.mockImplementationOnce(async () => {
      throw new Error('offline')
    })
    const [reportes] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    expect(await reportes.search(query('stock'))).toEqual([])
    expect((await reportes.search(query('stock'))).map((i) => i.id)).toEqual([
      'reporte:Stock Ledger',
    ])
    expect(state.call).toHaveBeenCalledTimes(2)
  })

  it('the registry carries every provider with its scopes once', () => {
    const providers = createShellProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    const keys = providers.map((p) => p.key)
    expect(keys).toEqual([...new Set(keys)])
    for (const key of [
      'tipos',
      'reportes',
      'desk',
      'reporte_vistas',
      'desk_tipos',
      'asistente',
    ])
      expect(keys).toContain(key)
    expect(providers.find((p) => p.key === 'asistente').scopes).toEqual([
      'assistant',
    ])
  })
})

describe('what only Desk opens: settings, trees, pages, dashboards, report views', () => {
  const providers = () => {
    const [reportes, desk, vistas, tipos] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    return { reportes, desk, vistas, tipos }
  }
  const ids = (items) => items.map((item) => item.id)

  it('a single is found by its name, a word of it, its initials or a slip, and opens its Desk form', async () => {
    const { tipos } = providers()
    for (const raw of [
      'Books Assistant Settings',
      'books assi',
      'assistant',
      'settings books',
      'bas',
      'boks asistant',
    ]) {
      const [first] = await tipos.search(query(raw))
      expect(first, raw).toMatchObject({
        id: 'desk_tipo:single:Books Assistant Settings',
        group: 'desk',
        title: 'Books Assistant Settings',
        subtitle: 'Desk · Docoutils',
        icon: 'lucide-settings',
        desk: '/app/books-assistant-settings',
      })
    }
    // By its Spanish label or its English name.
    expect(ids(await tipos.search(query('stock settings')))).toEqual([
      'desk_tipo:single:Stock Settings',
    ])
    expect(ids(await tipos.search(query('configuracion inv')))).toEqual([
      'desk_tipo:single:Stock Settings',
    ])
    expect(await tipos.search(query('s'))).toEqual([])
    expect(await tipos.search(query(''))).toEqual([])
  })

  it('a tree says «Árbol» and opens the tree view; a virtual type opens its Desk list', async () => {
    const { tipos } = providers()
    expect(await tipos.search(query('almacen'))).toEqual([
      {
        id: 'desk_tipo:tree:Warehouse',
        group: 'desk',
        title: 'Almacén',
        subtitle: 'Desk · Tree',
        keywords: 'Warehouse',
        icon: 'lucide-list-tree',
        desk: '/app/warehouse/view/tree',
        named: true,
      },
    ])
    expect((await tipos.search(query('rq job')))[0]).toMatchObject({
      id: 'desk_tipo:list:RQ Job',
      subtitle: 'Desk · Núcleo',
      icon: 'lucide-list',
      desk: '/app/rq-job',
    })
  })

  it('pages: one row per title, never one a shell module already is', async () => {
    const { desk } = providers()
    expect((await desk.search(query('permisos')))[0]).toMatchObject({
      id: 'pagina:permission-manager',
      group: 'desk',
      title: 'Administrador de permisos',
      subtitle: 'Desk · Page',
      keywords: 'permission-manager',
      icon: 'lucide-app-window',
      desk: '/app/permission-manager',
    })
    // By the English title too.
    expect(ids(await desk.search(query('role perm')))).toEqual([
      'pagina:permission-manager',
    ])
    expect(ids(await desk.search(query('pos awesome')))).toEqual(['pagina:pos'])
    // Compras is a shell module: neither its workspace nor its Desk page is a row.
    expect(await desk.search(query('compras'))).toEqual([])
  })

  it('dashboards open in Desk; the closest name leads across workspaces, pages and dashboards', async () => {
    const { desk } = providers()
    expect((await desk.search(query('reparacion')))[0]).toMatchObject({
      id: 'tablero:Repair Orders',
      group: 'desk',
      title: 'Órdenes de reparación',
      subtitle: 'Desk · Dashboard',
      icon: 'lucide-layout-dashboard',
      desk: '/app/dashboard-view/Repair%20Orders',
    })
    // «inventario»: the dashboard is called that; the workspace and the page only mention it.
    expect(ids(await desk.search(query('inventario')))).toEqual([
      'tablero:Stock',
      'desk:Muelle Inventario',
      'pagina:stock-balance',
    ])
    // A slip is guessed only when nothing answers as typed, in any of the three.
    expect(ids(await desk.search(query('permision manager')))).toEqual([
      'pagina:permission-manager',
    ])
    expect(ids(await desk.search(query('stock sumary')))).toEqual([
      'pagina:stock-balance',
    ])
  })

  it('a list’s report view: only the types the term names, two at most, where the worker may report', async () => {
    const { vistas } = providers()
    const items = await vistas.search(query('sales invoice'))
    expect(items).toEqual([
      {
        id: 'reporte_vista:Sales Invoice',
        group: 'reportes',
        title: 'Factura de venta',
        subtitle: 'Desk · Report view',
        keywords: 'Sales Invoice',
        icon: 'lucide-table-2',
        desk: '/app/sales-invoice/view/report',
        named: true,
      },
      expect.objectContaining({ id: 'reporte_vista:Sales Invoice Timesheet' }),
    ])
    // A type that only mentions the term, or that the worker may not report on, has no row.
    expect(await vistas.search(query('venta'))).toEqual([])
    expect(await vistas.search(query('item group'))).toEqual([])
    expect(await vistas.search(query('grupo de articulos'))).toEqual([])
  })

  it('«books assistant settings» ↵ opens it: the form the term names leads «Nuevo contacto»', async () => {
    const all = createShellProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    async function rows(raw) {
      const q = query(raw)
      const states = await federatedSearch(providersFor(all, q), q, {
        signal: new AbortController().signal,
        onUpdate() {},
      })
      return orderPaletteSections(groupPaletteItems(states)).flatMap(
        (section) =>
          section.items.map((item) => `${section.group}/${item.title}`),
      )
    }
    expect(await rows('books assistant settings')).toEqual([
      'desk/Books Assistant Settings',
      'acciones/New contact «books assistant settings»',
    ])
    expect((await rows('books assi'))[0]).toBe('desk/Books Assistant Settings')
    // A word of it finds it, below the worker's own free text.
    expect(await rows('assistant')).toEqual([
      'acciones/New contact «assistant»',
      'desk/Books Assistant Settings',
    ])
  })
})
