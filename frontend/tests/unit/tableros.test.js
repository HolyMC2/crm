import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Button: { render: () => null },
  FormControl: { render: () => null },
}))
// echarts does not draw in jsdom: each chart prints what it was asked to draw.
vi.mock('frappe-ui/charts', () => {
  const stub = (name) => ({
    props: ['data', 'seriesConfig', 'title'],
    setup: (props) => () =>
      h('div', {
        'data-chart': name,
        'data-points': props.data?.length,
        'data-color': props.seriesConfig?.s0?.color || '',
      }),
  })
  return {
    BarChart: stub('bar'),
    DonutChart: stub('donut'),
    LineChart: stub('line'),
  }
})

import {
  BOX_CSP,
  boxDocument,
  editOps,
  gridOf,
  moveOps,
  newWidget,
  readingOrder,
  rowsFor,
  safeColor,
  safeOpenPath,
  sizeOf,
} from '@/tableros/board'
import TableroWidget from '@/components/tableros/TableroWidget.vue'
import WidgetBox from '@/components/tableros/WidgetBox.vue'

const ventas = {
  id: 'wv1',
  tipo: 'grafica',
  titulo: 'Ventas por día',
  fuente: { id: 'grafica.ventas_dia', params: {} },
  vista: { kind: 'bar', color: '#e34948' },
  layout: { x: 0, y: 0, w: 10, h: 8 },
}
const nota = {
  id: 'wn1',
  tipo: 'nota',
  titulo: '',
  texto: 'Meta del mes: **100 mil**',
  vista: {},
  layout: { x: 10, y: 0, w: 5, h: 4 },
}
const chartPayload = {
  kind: 'chart',
  chart: {
    kind: 'line',
    labels: ['2026-11-01', '2026-11-02'],
    series: [{ name: 'Ventas', values: [1200, 900] }],
    format: 'money',
  },
}

let mounted = []
afterEach(() => {
  for (const app of mounted) app.unmount()
  mounted = []
  document.body.innerHTML = ''
})

async function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(el)
  mounted.push(app)
  await router.isReady()
  // async children (the chart, the box) resolve after their imports
  await vi.dynamicImportSettled()
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return { el, router }
}

describe('the grid a board is drawn on', () => {
  it('turns widgets into grid items and a drag back into operations', () => {
    const grid = gridOf([ventas, nota])
    expect(grid[0]).toMatchObject({ i: 'wv1', x: 0, y: 0, w: 10, h: 8 })
    // nothing moved: nothing to save
    expect(moveOps([ventas, nota], grid)).toEqual([])
    grid[1] = { ...grid[1], x: 0, y: 8, w: 20 }
    expect(moveOps([ventas, nota], grid)).toEqual([
      { op: 'mover', id: 'wn1', layout: { x: 0, y: 8, w: 20, h: 4 } },
    ])
  })

  it('reads a phone column top to bottom, then left to right', () => {
    const low = { ...nota, id: 'wlow', layout: { x: 0, y: 9, w: 5, h: 4 } }
    expect(readingOrder([low, nota, ventas]).map((w) => w.id)).toEqual([
      'wv1',
      'wn1',
      'wlow',
    ])
  })

  it('names the size a layout reads as', () => {
    expect(sizeOf({ w: 10, h: 8 })).toBe('m')
    expect(sizeOf({ w: 7, h: 8 })).toBe('')
  })
})

describe('what the page sends', () => {
  it('a new widget leaves its place to the board', () => {
    expect(newWidget('numero', { id: 'resultados.ventas' })).toEqual({
      tipo: 'numero',
      titulo: '',
      layout: { w: 5, h: 4 },
      fuente: { id: 'resultados.ventas' },
    })
    expect(newWidget('custom', { id: 'consulta', params: {} }).fuentes).toEqual(
      [{ alias: 'datos', id: 'consulta', params: {} }],
    )
  })

  it('an edit sends only what changed, and clears a colour on purpose', () => {
    expect(editOps(ventas, { ...ventas })).toEqual([])
    const ops = editOps(ventas, {
      ...ventas,
      titulo: 'Ventas',
      vista: { kind: 'bar' },
    })
    expect(ops).toEqual([
      {
        op: 'editar',
        id: 'wv1',
        campos: { titulo: 'Ventas', vista: { kind: 'bar', color: '' } },
      },
    ])
  })

  it('paints named colours and hex only, never CSS', () => {
    expect(safeColor('Rojo')).toBe('#e34948')
    expect(safeColor('#ABC')).toBe('#abc')
    expect(safeColor('red; background: url(x)')).toBe('')
    expect(safeColor('url(https://x)')).toBe('')
  })
})

describe('the locked box', () => {
  it('carries a policy with no network and keeps the code inside its tags', () => {
    const doc = boxDocument({
      html: '<div id="x"></div>',
      css: 'body{color:red}</style><script>alert(1)</script>',
      js: 'muelle.onData(function(){}) </script><img src=x>',
    })
    expect(doc).toContain(`content="${BOX_CSP}"`)
    expect(BOX_CSP).toContain("default-src 'none'")
    expect(BOX_CSP).not.toContain('connect-src')
    // the widget's own `</style>` and `</script>` cannot close the page's tags
    expect(doc).not.toContain('color:red}</style>')
    expect(doc).not.toContain('{}) </script>')
    expect(doc).toContain('<div id="x"></div>')
  })

  it('opens only paths inside Muelle or the Desk', () => {
    expect(safeOpenPath('/crm/ventas/abc')).toBe('/crm/ventas/abc')
    expect(safeOpenPath('/app/sales-invoice/X')).toBe('/app/sales-invoice/X')
    for (const bad of [
      'https://evil.example',
      '//evil.example/crm/',
      'javascript:alert(1)',
      '/crm//evil',
      '/api/method/frappe.auth.logout',
      '/crm/x y',
    ])
      expect(safeOpenPath(bad)).toBe('')
  })

  it('runs with scripts but no same origin, and answers only its own frame', async () => {
    const { el, router } = await mount(WidgetBox, {
      codigo: { js: 'muelle.resize()' },
      data: { datos: chartPayload },
    })
    const frame = el.querySelector('iframe')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toContain('muelle.resize()')
    const push = vi.spyOn(router, 'push')
    // another window's message is ignored
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'muelle:open', value: '/crm/ventas' },
        source: window,
      }),
    )
    expect(push).not.toHaveBeenCalled()
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'muelle:open', value: '/crm/ventas' },
        source: frame.contentWindow,
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'muelle:open', value: 'https://evil.example' },
        source: frame.contentWindow,
      }),
    )
    expect(push.mock.calls).toEqual([['/ventas']])
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'muelle:height', value: 99999 },
        source: frame.contentWindow,
      }),
    )
    await nextTick()
    expect(frame.style.height).toBe('2400px')
  })
})

describe('a widget on the board', () => {
  it('draws its chart in its own kind and colour', async () => {
    const { el } = await mount(TableroWidget, {
      widget: ventas,
      payload: chartPayload,
      canEdit: true,
    })
    expect(el.textContent).toContain('Ventas por día')
    const chart = el.querySelector('[data-chart]')
    expect(chart.dataset.chart).toBe('bar')
    expect(chart.dataset.color).toBe('#e34948')
    expect(el.querySelector('[data-testid="widget-edit"]')).not.toBeNull()
  })

  it('a reader sees no pencil', async () => {
    const { el } = await mount(TableroWidget, {
      widget: ventas,
      payload: chartPayload,
      canEdit: false,
    })
    expect(el.querySelector('[data-testid="widget-edit"]')).toBeNull()
  })

  it('says why it is blocked and offers a retry only when one helps', async () => {
    const { el } = await mount(TableroWidget, {
      widget: ventas,
      payload: {
        kind: 'blocked',
        reason: 'No tienes acceso a la cobranza.',
        retry: false,
      },
    })
    expect(
      el.querySelector('[data-testid="widget-blocked"]').textContent,
    ).toContain('No tienes acceso a la cobranza.')
    expect(el.textContent).not.toContain('Reintentar')
  })

  it('a table shows rows, a number its figure', async () => {
    const { el } = await mount(TableroWidget, {
      widget: { ...ventas, tipo: 'tabla' },
      payload: {
        kind: 'table',
        columns: ['Cliente', 'Saldo'],
        rows: [['Ana', '$1,200.00']],
      },
    })
    expect(el.querySelector('tbody').textContent).toContain('Ana')
    const number = await mount(TableroWidget, {
      widget: { ...ventas, tipo: 'numero' },
      payload: { kind: 'number', text: '$12,520.00', label: 'Ventas del mes' },
    })
    expect(number.el.textContent).toContain('$12,520.00')
  })

  it('rows for every payload kind', () => {
    expect(rowsFor(chartPayload).rows).toEqual([
      ['2026-11-01', 1200],
      ['2026-11-02', 900],
    ])
    expect(
      rowsFor({
        kind: 'card',
        card: { items: [{ label: 'Ana', value_text: '$5' }] },
      }).rows,
    ).toEqual([['Ana', '$5']])
    expect(rowsFor({ kind: 'blocked' })).toBeNull()
  })
})
