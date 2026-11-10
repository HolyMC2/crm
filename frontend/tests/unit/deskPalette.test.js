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
import {
  createEtiquetasProvider,
  createOtrosProvider,
  createTiposProvider,
  findIn,
} from '@/documentos/palette'
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
  {
    doctype: 'Customer',
    label: 'Cliente',
    module: 'Ventas',
    create: true,
    report: false,
  },
  {
    doctype: 'Item',
    label: 'Artículo',
    module: 'Inventario',
    create: true,
    report: false,
  },
  {
    doctype: 'Work In Progress',
    label: 'Trabajo en curso',
    module: 'Manufactura',
    create: false,
    report: false,
  },
]

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  _resetAssistant()
  _resetPaletteReach()
  state.tags = []
  state.records = []
  state.tagged = {}
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
        tags: state.tags,
      }
    if (method === 'crm.api.shell.search_records') return state.records
    if (method === 'crm.api.shell.tagged') return state.tagged[args.tag] || []
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

describe('parity with the awesomebar: abbreviations, kinds, «X en Y», records, tags, sums', () => {
  const signal = new AbortController().signal
  const ids = (items) => items.map((item) => item.id)
  const desk = () => {
    const [reportes, places, vistas, tipos] = createDeskProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    return { reportes, places, vistas, tipos }
  }
  async function rows(raw, overrides) {
    const all = createShellProviders({
      boot: ref(boot(overrides)),
      modules: ref(modules),
    })
    const q = query(raw)
    const states = await federatedSearch(providersFor(all, q), q, {
      signal,
      onUpdate() {},
    })
    return orderPaletteSections(groupPaletteItems(states)).flatMap((section) =>
      section.items.map((item) => `${section.group}/${item.title}`),
    )
  }

  it('an abbreviation finds its settings form, its report view and its list', async () => {
    const { tipos, vistas } = desk()
    expect(ids(await tipos.search(query('basset')))).toEqual([
      'desk_tipo:single:Books Assistant Settings',
    ])
    expect(ids(await tipos.search(query('stksett')))).toEqual([
      'desk_tipo:single:Stock Settings',
    ])
    // An abbreviation does not name the row: no report view for it.
    expect(await vistas.search(query('slsinv'))).toEqual([])
    const listas = createTiposProvider({ boot: ref(boot()) })
    expect(ids(await listas.search(query('itgrp')))).toEqual([
      'tipos:Item Group',
    ])
  })

  it('a last word names the kind: «… report», «… árbol», «… dashboard», «… list»', async () => {
    const { reportes, places, vistas, tipos } = desk()
    expect(ids(await reportes.search(query('stock ledger report')))).toEqual([
      'reporte:Stock Ledger',
    ])
    expect(ids(await vistas.search(query('sales invoice report')))[0]).toBe(
      'reporte_vista:Sales Invoice',
    )
    expect(ids(await tipos.search(query('almacén árbol')))).toEqual([
      'desk_tipo:tree:Warehouse',
    ])
    expect(ids(await tipos.search(query('warehouse tree')))).toEqual([
      'desk_tipo:tree:Warehouse',
    ])
    expect(ids(await places.search(query('stock dashboard')))).toEqual([
      'tablero:Stock',
    ])
    const listas = createTiposProvider({ boot: ref(boot()) })
    expect(ids(await listas.search(query('item group list')))).toEqual([
      'tipos:Item Group',
    ])
  })

  it('«X en Y» searches that list for X: Contactos, Productos, a curated list, the generic floor', async () => {
    expect(findIn('juan en clientes')).toEqual({
      what: 'juan',
      where: 'clientes',
    })
    expect(findIn('funda en uso in item')).toEqual({
      what: 'funda en uso',
      where: 'item',
    })
    expect(findIn('en clientes')).toBeNull()
    expect(findIn('juan en')).toBeNull()
    const buscar = (overrides) =>
      createShellProviders({
        boot: ref(boot(overrides)),
        modules: ref(modules),
      }).find((provider) => provider.key === 'buscar_en')
    const found = async (raw, overrides) =>
      (await buscar(overrides).search(query(raw))).map((item) => [
        item.title,
        item.href,
      ])
    // Contactos lists the customers: by the segment's name, the type's label or its English name.
    for (const raw of [
      'karla en clientes',
      'karla en cliente',
      'karla in customer',
      'karla in customers',
    ])
      expect((await found(raw))[0], raw).toEqual([
        'Find «karla» in Clientes',
        '/contactos?segment=customers&q=karla',
      ])
    expect(
      (
        await found('funda en productos', {
          productos: { key: 'productos', enabled: true, capabilities: {} },
        })
      )[0],
    ).toEqual(['Find «funda» in Productos', '/productos?q=funda'])
    // A curated list is searched on its own page, by the name the shell gives it.
    for (const raw of [
      'juan pérez en facturas',
      'juan pérez in sales invoice',
      'juan pérez en factura de venta',
    ])
      expect((await found(raw))[0], raw).toEqual([
        'Find «juan pérez» in Facturas',
        '/documentos/facturas?q=juan%20p%C3%A9rez',
      ])
    // Any other readable type, on the generic floor.
    expect(await found('telas en grupo de articulos')).toEqual([
      [
        'Find «telas» in Grupo de artículos',
        '/documentos/tipo/Item%20Group?q=telas',
      ],
    ])
    // Without Contactos the customers are a list like any other.
    expect(
      (
        await found('karla en cliente', {
          contactos: { key: 'contactos', enabled: false, capabilities: {} },
        })
      )[0],
    ).toEqual(['Find «karla» in Cliente', '/documentos/tipo/Customer?q=karla'])
    // The boot says this worker does not read invoices here: no row for them.
    const sinFacturas = await found('juan in sales invoice', {
      documentos: {
        key: 'documentos',
        enabled: true,
        capabilities: { doctypes: [], create: [] },
      },
    })
    expect(sinFacturas.map(([, href]) => href)).not.toContain(
      '/documentos/facturas?q=juan',
    )
    // «en» that names no list is just a word of the term, and a list whose
    // own name has an «in» is that list.
    expect(await found('funda en silicon')).toEqual([])
    expect(await found('work in progress')).toEqual([])
    // It leads the palette (a longer phrase is first a question for Muelle).
    expect((await rows('karla en clientes'))[0]).toBe(
      'acciones/Find «karla» in Clientes',
    )
  })

  it('a curated list is found by an abbreviation, initials, a slip or its plural, as its place', async () => {
    const listas = createTiposProvider({ boot: ref(boot()) })
    for (const raw of ['slsinv', 'sinv', 'si', 'slaes invoice', 'factven']) {
      const [place] = await listas.search(query(raw))
      expect(place, raw).toMatchObject({
        id: 'documentos.facturas',
        group: 'ir_a',
        title: 'Documentos › Facturas',
        href: '/documentos/facturas',
      })
    }
    // What the shell's own rule already finds is not listed twice.
    for (const raw of ['sales invoice', 'facturas'])
      expect(ids(await listas.search(query(raw))), raw).not.toContain(
        'documentos.facturas',
      )
    // By the type's full label too, which the place itself does not carry.
    for (const raw of ['slsinv', 'facturas', 'factura de venta'])
      expect(
        (await rows(raw)).filter((row) => row === 'ir_a/Documentos › Facturas'),
        raw,
      ).toHaveLength(1)
    // A list is named in the singular and asked for in the plural.
    expect(ids(await listas.search(query('almacenes')))).toContain(
      'tipos:Warehouse',
    )
    expect(ids(await listas.search(query('warehouses')))).toContain(
      'tipos:Warehouse',
    )
  })

  it('on a list, the term can be searched right there', async () => {
    const listas = createTiposProvider({ boot: ref(boot()) })
    const before = window.location.pathname
    try {
      window.history.replaceState({}, '', '/crm/documentos/tipo/Item%20Group')
      expect((await listas.search(query('telas')))[0]).toEqual({
        id: 'buscar.aqui',
        group: 'acciones',
        title: 'Find «telas» in Grupo de artículos',
        icon: 'lucide-search',
        href: '/documentos/tipo/Item%20Group?q=telas',
        rank: 2,
      })
      window.history.replaceState({}, '', '/crm/documentos/facturas')
      expect((await listas.search(query('juan')))[0]).toMatchObject({
        id: 'buscar.aqui',
        href: '/documentos/facturas?q=juan',
      })
      // A record or another page is no list.
      window.history.replaceState({}, '', '/crm/documentos/facturas/SINV-1')
      expect(ids(await listas.search(query('juan')))).not.toContain(
        'buscar.aqui',
      )
    } finally {
      window.history.replaceState({}, '', before)
    }
  })

  it('a record of any other type is found and opens where the shell has it', async () => {
    state.records = [
      {
        doctype: 'Employee',
        label: 'Empleado',
        name: 'HR-EMP-00007',
        title: 'Karla Méndez',
        status: 'Active',
      },
      { doctype: 'ToDo', label: 'Tarea', name: 'a1b2c3d4e5', title: '' },
      { doctype: 'Account', label: 'Cuenta', name: 'Caja Tienda - GD' },
    ]
    const otros = createOtrosProvider({ boot: ref(boot()) })
    const items = await otros.search(query('karla'), signal)
    expect(state.call).toHaveBeenCalledWith('crm.api.shell.search_records', {
      q: 'karla',
    })
    expect(items[0]).toMatchObject({
      id: 'registro:Employee:HR-EMP-00007',
      group: 'registros',
      title: 'Karla Méndez',
      href: '/documentos/tipo/Employee/HR-EMP-00007',
      record: { doctype: 'Employee', name: 'HR-EMP-00007' },
    })
    expect(items[0].subtitle).toMatch(/^Empleado · HR-EMP-00007 · /)
    // A task opens in Pendientes; a record without a title reads as its type,
    // or as its name when that is one a worker reads.
    expect(items[1]).toMatchObject({
      title: 'Tarea',
      subtitle: 'a1b2c3d4e5',
      href: '/pendientes/todo/a1b2c3d4e5',
    })
    expect(items[2]).toMatchObject({
      title: 'Caja Tienda - GD',
      subtitle: 'Cuenta',
    })
    // Without Documentos the shell has no page for it: its Desk form.
    const sinModulo = createOtrosProvider({
      boot: ref(
        boot({
          documentos: { key: 'documentos', enabled: false, capabilities: {} },
        }),
      ),
    })
    expect((await sinModulo.search(query('karla'), signal))[0]).toMatchObject({
      desk: '/app/employee/HR-EMP-00007',
    })
    // Two letters, a phone or an empty palette ask nothing.
    state.call.mockClear()
    for (const raw of ['ka', '6691234567', ''])
      expect(await otros.search(query(raw), signal)).toEqual([])
    expect(state.call).not.toHaveBeenCalled()
    // Ctrl+G reaches it too.
    const all = createShellProviders({
      boot: ref(boot()),
      modules: ref(modules),
    })
    expect(
      providersFor(all, query('karla'), 'contactos', 'records').map(
        (p) => p.key,
      ),
    ).toContain('otros')
  })

  it('«#etiqueta» lists the documents that carry the tag; a site without tags asks nothing', async () => {
    const etiquetas = createEtiquetasProvider({ boot: ref(boot()) })
    expect(await etiquetas.search(query('#urgente'), signal)).toEqual([])
    expect(state.call).not.toHaveBeenCalledWith(
      'crm.api.shell.tagged',
      expect.anything(),
    )
    _resetPaletteReach()
    localStorage.clear()
    state.tags = ['urgente', 'urgente proveedor', 'vip']
    state.tagged = {
      urgente: [
        {
          doctype: 'ToDo',
          label: 'Tarea',
          name: 'a1b2c3',
          title: 'Llamar a Juan',
        },
      ],
      'urgente proveedor': [
        {
          doctype: 'ToDo',
          label: 'Tarea',
          name: 'a1b2c3',
          title: 'Llamar a Juan',
        },
        {
          doctype: 'Employee',
          label: 'Empleado',
          name: 'HR-EMP-00007',
          title: 'Karla Méndez',
        },
      ],
    }
    const items = await etiquetas.search(query('#urg'), signal)
    expect(items.map((item) => [item.title, item.subtitle])).toEqual([
      ['Llamar a Juan', 'Tarea · a1b2c3 · #urgente'],
      ['Karla Méndez', 'Empleado · HR-EMP-00007 · #urgente proveedor'],
    ])
    // Only after «#»: an unprefixed term is not a tag search.
    expect(await etiquetas.search(query('urgente'), signal)).toEqual([])
    expect(await etiquetas.search(query('#zzz'), signal)).toEqual([])
  })

  it('a sum leads the palette with its result', async () => {
    const list = await rows('1250*1.16')
    expect(list[0]).toBe('acciones/1250*1.16 = 1,450')
    expect(await rows('juan')).not.toContain('acciones/juan = NaN')
  })
})
