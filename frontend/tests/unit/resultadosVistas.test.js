import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Button: {
    props: ['label'],
    emits: ['click'],
    setup:
      (props, { emit, attrs }) =>
      () =>
        h(
          'button',
          { 'data-testid': attrs['data-testid'], onClick: () => emit('click') },
          props.label,
        ),
  },
  FormControl: { render: () => null },
}))
vi.mock('@/components/ui/BottomSheet.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (props, { slots }) =>
      () =>
        props.open
          ? h('div', [slots.default?.(), slots.actions?.(), slots.footer?.()])
          : null,
  },
}))
const api = vi.fn()
vi.mock('@/composables/useCompras', async (importOriginal) => ({
  ...(await importOriginal()),
  comprasApi: (...args) => api(...args),
}))

import {
  DEFAULT_VISTA,
  VISTAS,
  boardDataArgs,
  cardKeyOf,
  cardPayload,
  copyTitle,
  forkWidgets,
  ownCopy,
  pickVista,
  readVistaCopy,
  vistaTabs,
  vistaWidgets,
  writeVistaCopy,
  VISTA_KEY,
} from '@/composables/resultadosVistas'
import { readQuery, toQuery } from '@/composables/useResultados'
import {
  COLS,
  paramFields,
  paramValue,
  startParams,
  withParam,
} from '@/tableros/board'
import { useBoard } from '@/tableros/useBoard'
import VersionsSheet from '@/components/tableros/VersionsSheet.vue'
import LibrarySheet from '@/components/tableros/LibrarySheet.vue'
import WidgetSheet from '@/components/tableros/WidgetSheet.vue'
import TableroWidget from '@/components/tableros/TableroWidget.vue'

let mounted = []
beforeEach(() => {
  api.mockReset()
})
afterEach(() => {
  for (const app of mounted) app.unmount()
  mounted = []
  document.body.innerHTML = ''
})

async function settle() {
  await vi.dynamicImportSettled()
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}
async function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const events = []
  const listeners = Object.fromEntries(
    ['onRestored', 'onInserted', 'onUpdate:open', 'onSave', 'onKept'].map(
      (name) => [name, (...args) => events.push([name, ...args])],
    ),
  )
  const app = createApp({
    render: () => h(component, { ...props, ...listeners }),
  })
  app.mount(el)
  mounted.push(app)
  await settle()
  return { el, events }
}
const click = async (el) => {
  el.dispatchEvent(new Event('click', { bubbles: true }))
  await settle()
}
const byTestId = (el, id) => el.querySelector(`[data-testid="${id}"]`)

describe('Muelle’s three views', () => {
  it('fill every row of the grid, once per card, with Resumen first', () => {
    expect(VISTAS.map((v) => v.id)).toEqual(['resumen', 'ventas', 'dinero'])
    expect(DEFAULT_VISTA).toBe('resumen')
    for (const vista of VISTAS) {
      const keys = vista.filas.flat().map((c) => c.key)
      expect(new Set(keys).size, vista.id).toBe(keys.length)
      for (const row of vista.filas)
        expect(
          row.reduce((sum, c) => sum + c.w, 0),
          vista.id,
        ).toBe(COLS)
    }
  })

  it('a card the person does not have leaves its row to the others', () => {
    const [resumen] = VISTAS
    const present = new Set(['ventas', 'margen', 'por_cobrar', 'tendencia'])
    const widgets = vistaWidgets(resumen, present)
    expect(widgets.map((w) => w.id)).toEqual([
      'ventas',
      'margen',
      'por_cobrar',
      'tendencia',
    ])
    const first = widgets.slice(0, 3)
    expect(first.reduce((sum, w) => sum + w.layout.w, 0)).toBe(COLS)
    expect(first.map((w) => w.layout.x)).toEqual([0, 7, 14])
    expect(widgets[3].layout).toMatchObject({ x: 0, y: 10, w: 20 })
    expect(widgets[0]).toMatchObject({
      tipo: 'numero',
      fuente: { id: 'resultados.ventas', params: {} },
    })
    // before the board answers, every card holds its place
    expect(vistaWidgets(resumen, null)).toHaveLength(
      resumen.filas.flat().length,
    )
  })

  it('a copy starts as the person’s own board and is found again', () => {
    const [resumen] = VISTAS
    const copy = forkWidgets(resumen, new Set(['ventas', 'tendencia']))
    expect(copy.every((w) => !('id' in w))).toBe(true)
    expect(copy.map((w) => w.tipo)).toEqual(['numero', 'grafica'])
    expect(copyTitle(resumen)).toBe('Mi resumen')
    const boards = [
      { name: 'b1', title: 'Mi resumen', mine: false },
      { name: 'b2', title: 'Mi resumen', mine: true },
    ]
    expect(ownCopy(resumen, boards).name).toBe('b2')
    expect(ownCopy(resumen, [])).toBeNull()
  })

  it('draws a card from the page’s own board, still on its way or not', () => {
    const cards = { ventas: { key: 'ventas', label: 'Ventas' } }
    expect(cardPayload('ventas', cards, { currency: 'MXN' })).toMatchObject({
      kind: 'card',
      card: { label: 'Ventas' },
      currency: 'MXN',
    })
    expect(cardPayload('margen', cards, null).card).toBeNull()
  })

  it('only a plain card is drawn from the page: one with params is asked for', () => {
    const card = (params) => ({
      tipo: 'numero',
      fuente: { id: 'resultados.margen', params },
    })
    expect(cardKeyOf(card({}))).toBe('margen')
    expect(cardKeyOf(card({ compara: '' }))).toBe('margen')
    expect(cardKeyOf(card({ compara: 'anio' }))).toBe('')
    expect(cardKeyOf({ tipo: 'grafica', fuente: { id: 'consulta' } })).toBe('')
    expect(
      cardKeyOf({ tipo: 'custom', fuente: { id: 'resultados.margen' } }),
    ).toBe('')
    expect(cardKeyOf({ tipo: 'nota' })).toBe('')
  })
})

describe('the period bar drives every view', () => {
  it('reads the page’s period and filters as a board’s', () => {
    expect(boardDataArgs(readQuery({}))).toEqual({ periodo: 'este_mes' })
    expect(
      boardDataArgs(
        readQuery({ periodo: 'semana', compara: 'anio', tienda: 'Norte' }),
      ),
    ).toEqual({
      periodo: 'esta_semana',
      filtros: { compara: 'anio', tienda: 'Norte' },
    })
    expect(
      boardDataArgs(
        readQuery({
          periodo: 'rango',
          desde: '2026-10-31',
          hasta: '2026-10-01',
        }),
      ),
    ).toEqual({ periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-31' })
  })

  it('the link carries the view, and the cards query stays as it was', () => {
    expect(readQuery({ vista: 'dinero' }).vista).toBe('dinero')
    expect(readQuery({ vista: '<b>' })).not.toHaveProperty('vista')
    expect(readQuery({})).not.toHaveProperty('vista')
    expect(toQuery({ ...readQuery({}), vista: 'ventas' })).toEqual({
      vista: 'ventas',
    })
  })
})

describe('which view opens', () => {
  const boards = [{ name: 'abc123', title: 'Lunes', mine: true }]
  it('the link, then the account, then this device, then Resumen', () => {
    expect(pickVista({ query: 'ventas', saved: 'dinero', boards })).toBe(
      'ventas',
    )
    expect(pickVista({ saved: 'dinero', local: 'ventas', boards })).toBe(
      'dinero',
    )
    expect(pickVista({ local: 'abc123', boards })).toBe('abc123')
    expect(pickVista({ boards })).toBe('resumen')
  })

  it('skips a board that is gone, trusts one while the list is on its way', () => {
    expect(pickVista({ query: 'gone', saved: 'abc123', boards })).toBe('abc123')
    expect(pickVista({ query: 'gone', boards: [] })).toBe('resumen')
    expect(pickVista({ query: 'gone', boards: null })).toBe('gone')
  })

  it('this device keeps its copy and survives private mode', () => {
    const data = {}
    const storage = {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => (data[k] = v),
      removeItem: (k) => delete data[k],
    }
    writeVistaCopy('dinero', storage)
    expect(data[VISTA_KEY]).toBe('dinero')
    expect(readVistaCopy(storage)).toBe('dinero')
    writeVistaCopy('', storage)
    expect(readVistaCopy(storage)).toBe('')
    const broken = {
      getItem: () => {
        throw new Error('private')
      },
      setItem: () => {
        throw new Error('private')
      },
    }
    expect(readVistaCopy(broken)).toBe('')
    expect(() => writeVistaCopy('x', broken)).not.toThrow()
  })

  it('tabs: Muelle’s, then the person’s own, then the shared ones', () => {
    const tabs = vistaTabs([
      { name: 's1', title: 'De Ana', mine: false, owner_name: 'Ana' },
      { name: 'm1', title: 'Mi resumen', mine: true },
    ])
    expect(tabs.map((t) => t.label)).toEqual([
      'Resumen',
      'Ventas',
      'Dinero',
      'Mi resumen',
      'De Ana',
    ])
    expect(tabs.at(-1)).toMatchObject({ shared: true, owner: 'Ana' })
  })
})

describe('the chart builder', () => {
  const params = {
    doctype: {
      default: 'Sales Invoice',
      opciones: ['Sales Invoice', 'Purchase Invoice'],
      etiquetas: ['Ventas', 'Compras'],
      etiqueta: 'De qué',
    },
    group_by: {
      default: 'none',
      opciones: ['none', 'day', 'usuario'],
      etiquetas: ['Un solo número', 'Día', 'Vendedor'],
      etiqueta: 'Por',
    },
    top: {
      default: 20,
      opciones: null,
      min: 1,
      max: 20,
      etiqueta: 'Cuántos mostrar',
    },
    party: {
      default: null,
      opciones: null,
      etiqueta: 'Solo del cliente o proveedor',
    },
    periodo: {
      default: 'esta_semana',
      opciones: ['esta_semana'],
      etiqueta: 'Periodo',
    },
    secreto: { default: null, opciones: null },
  }

  it('asks each param in the owner’s words, never one it cannot name', () => {
    const fields = paramFields(params)
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ['doctype', 'choice'],
      ['group_by', 'choice'],
      ['top', 'number'],
      ['party', 'text'],
    ])
    expect(fields[0].choices).toEqual([
      { value: 'Sales Invoice', label: 'Ventas' },
      { value: 'Purchase Invoice', label: 'Compras' },
    ])
  })

  it('keeps a number in its limits and drops an emptied param', () => {
    const [, by, top, party] = paramFields(params)
    expect(withParam({}, top, '50')).toEqual({ top: 20 })
    expect(withParam({ top: 5 }, top, '')).toEqual({})
    expect(withParam({}, party, 'Ana')).toEqual({ party: 'Ana' })
    expect(paramValue({}, by)).toBe('none')
    expect(paramValue({ group_by: 'day' }, by)).toBe('day')
  })

  it('a new chart of a query starts drawn by day, a number as one number', () => {
    expect(startParams(params, 'grafica')).toEqual({
      doctype: 'Sales Invoice',
      group_by: 'day',
    })
    expect(startParams(params, 'numero')).toEqual({
      doctype: 'Sales Invoice',
      group_by: 'none',
    })
  })
})

describe('a board on screen', () => {
  it('never asks doco for what the page already draws', async () => {
    api.mockImplementation(async (method) =>
      method.endsWith('.abrir')
        ? {
            name: 'b1',
            revision: 1,
            widgets: [
              {
                id: 'w1',
                tipo: 'numero',
                fuente: { id: 'resultados.ventas', params: {} },
              },
              {
                id: 'w2',
                tipo: 'grafica',
                fuente: { id: 'consulta', params: {} },
              },
            ],
          }
        : { datos: { w2: { kind: 'number', text: '5' } } },
    )
    let board
    const Probe = defineComponent({
      setup() {
        board = useBoard({
          name: () => 'b1',
          dataArgs: () => ({ periodo: 'hoy' }),
          local: (w) => Boolean(cardKeyOf(w)),
        })
        return () => null
      },
    })
    await mount(Probe, {})
    await board.load()
    await settle()
    const datos = api.mock.calls.find(([m]) => m.endsWith('.datos'))
    expect(datos[1]).toEqual({ name: 'b1', periodo: 'hoy', ids: ['w2'] })
    expect(Object.keys(board.datos)).toEqual(['w2'])
    api.mockClear()
    await board.loadData(['w1'])
    expect(api).not.toHaveBeenCalled()
  })
})

describe('versions of a view', () => {
  const versiones = {
    name: 'b1',
    revision: 4,
    can_write: true,
    versiones: [
      {
        name: 'v1',
        etiqueta: 'Antes de diciembre',
        revision: 2,
        por: 'page',
        mine: true,
        owner_name: 'Dueña',
        at: '2026-11-06 12:00:00',
        widgets: 3,
      },
    ],
    cambios: [
      {
        revision: 3,
        by: 'bot',
        mine: true,
        resumen: 'agregó «Por vendedor»',
        at: '2026-11-06 12:05:00',
      },
      {
        revision: 2,
        by: 'page',
        mine: false,
        user_name: 'Ana',
        resumen: 'quitó una nota',
        at: '2026-11-06 12:01:00',
      },
    ],
  }

  it('says who changed what, and a restore takes two taps', async () => {
    api.mockImplementation(async (method) =>
      method.endsWith('.versiones') ? versiones : { name: 'b1', widgets: [] },
    )
    const { el, events } = await mount(VersionsSheet, {
      open: true,
      board: { name: 'b1', title: 'Mi resumen', can_write: true, revision: 4 },
    })
    expect(byTestId(el, 'versions').textContent).toContain('Antes de diciembre')
    expect(byTestId(el, 'versions').textContent).toContain('3 piezas')
    const changes = byTestId(el, 'changes').textContent
    expect(changes).toContain('Muelle agregó «Por vendedor»')
    expect(changes).toContain('Ana: quitó una nota')
    const restore = byTestId(el, 'version-restore-v1')
    await click(restore)
    expect(api.mock.calls.some(([m]) => m.endsWith('.restaurar'))).toBe(false)
    await click(byTestId(el, 'version-restore-v1'))
    const call = api.mock.calls.find(([m]) => m.endsWith('.restaurar'))
    expect(call[1]).toEqual({ name: 'b1', version: 'v1' })
    expect(events.find(([name]) => name === 'onRestored')).toBeTruthy()
  })
})

describe('the library', () => {
  it('lists what the person kept and puts a copy on the view', async () => {
    api.mockImplementation(async (method) =>
      method.endsWith('.componentes')
        ? [
            {
              name: 'c1',
              title: 'Ventas por vendedor',
              revision: 3,
              mine: true,
              widget: { tipo: 'grafica' },
            },
          ]
        : { name: 'b1', widgets: [] },
    )
    const { el, events } = await mount(LibrarySheet, {
      open: true,
      tablero: 'b1',
      canWrite: true,
    })
    expect(byTestId(el, 'library').textContent).toContain('Ventas por vendedor')
    expect(byTestId(el, 'library').textContent).toContain('versión 3')
    await click(byTestId(el, 'component-insert-c1'))
    const call = api.mock.calls.find(([m]) =>
      m.endsWith('.insertar_componente'),
    )
    expect(call[1]).toEqual({ name: 'c1', tablero: 'b1' })
    expect(events.find(([name]) => name === 'onInserted')).toBeTruthy()
  })

  it('an empty library says how to fill it', async () => {
    api.mockResolvedValue([])
    const { el } = await mount(LibrarySheet, { open: true, tablero: 'b1' })
    expect(byTestId(el, 'library-empty').textContent).toContain(
      'Guardar en la biblioteca',
    )
  })
})

describe('the widget editor builds charts', () => {
  const consulta = {
    id: 'consulta',
    titulo: 'Consulta',
    tipos: ['grafica', 'numero', 'tabla'],
    params: {
      doctype: {
        default: 'Sales Invoice',
        opciones: ['Sales Invoice'],
        etiquetas: ['Ventas'],
        etiqueta: 'De qué',
      },
      group_by: {
        default: 'none',
        opciones: ['none', 'day'],
        etiquetas: ['Un solo número', 'Día'],
        etiqueta: 'Por',
      },
    },
  }

  it('offers «Arma tu gráfica», asks in words and previews with the page’s period', async () => {
    api.mockImplementation(async (method) =>
      method.endsWith('.fuentes')
        ? { fuentes: [consulta], assistant: true }
        : { kind: 'number', text: '$1,200' },
    )
    const { el } = await mount(WidgetSheet, {
      open: true,
      widget: { tipo: 'grafica', titulo: '', layout: { w: 10, h: 8 } },
      tablero: 'b1',
      periodArgs: {
        periodo: 'rango',
        desde: '2026-10-01',
        hasta: '2026-10-31',
      },
      periodLabel: '1 oct – 31 oct',
    })
    await click(byTestId(el, 'fuente-consulta'))
    const params = byTestId(el, 'widget-params')
    expect(params.textContent).toContain('De qué')
    expect(params.textContent).toContain('Ventas')
    expect(
      byTestId(el, 'param-group_by-day').getAttribute('aria-pressed'),
    ).toBe('true')
    // the preview waits for the person to stop choosing
    await new Promise((r) => setTimeout(r, 400))
    await settle()
    const probe = api.mock.calls.find(([m]) => m.endsWith('.probar'))
    expect(probe[1]).toEqual({
      fuente: {
        id: 'consulta',
        params: { doctype: 'Sales Invoice', group_by: 'day' },
      },
      periodo: 'rango',
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(byTestId(el, 'widget-preview').textContent).toContain(
      '1 oct – 31 oct',
    )
    expect(byTestId(el, 'widget-keep')).toBeTruthy()
  })
})

describe('a Resultados card on a board being edited', () => {
  it('keeps its pencil in the card’s own title row, over nothing', async () => {
    const { el } = await mount(TableroWidget, {
      widget: {
        id: 'w1',
        tipo: 'lista',
        titulo: '',
        fuente: { id: 'resultados.top_articulos', params: {} },
        vista: {},
        layout: { x: 0, y: 0, w: 10, h: 13 },
      },
      payload: { kind: 'card', key: 'top_articulos', card: null },
      canEdit: true,
    })
    const pencil = byTestId(el, 'widget-edit')
    expect(pencil.closest('header')).toBeTruthy()
    expect(pencil.getAttribute('aria-label')).toContain('Editar')
  })
})

describe('the workspace reads in Spanish', () => {
  it('every Resultados string of the page has its es-MX entry', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const page = readFileSync(
      resolve(here, '../../src/pages/Resultados.vue'),
      'utf8',
    )
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const keys = [
      ...page.matchAll(
        /__\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(?:null|\[[^\]]*\])\s*,\s*CTX/g,
      ),
    ].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(30)
    const missing = keys.filter(
      (key) =>
        !po.includes(
          `msgctxt "Resultados"\nmsgid "${key.replace(/"/g, '\\"')}"\nmsgstr "`,
        ),
    )
    expect(missing).toEqual([])
  })
})
