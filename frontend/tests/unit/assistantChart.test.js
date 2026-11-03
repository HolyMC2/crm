import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
// echarts does not draw in jsdom: each chart prints what it was asked to draw.
vi.mock('frappe-ui/charts', () => {
  const stub = (name) => ({
    props: [
      'data',
      'x',
      'y',
      'category',
      'value',
      'title',
      'subtitle',
      'stacked',
    ],
    setup: (props) => () =>
      h('div', {
        'data-chart': name,
        'data-title': props.title,
        'data-points': props.data?.length,
        'data-stacked': props.stacked ? '1' : undefined,
      }),
  })
  return {
    BarChart: stub('bar'),
    DonutChart: stub('donut'),
    LineChart: stub('line'),
  }
})

import {
  chartOf,
  chartProps,
  formatLabel,
  formatValue,
  tableOf,
} from '@/components/assistant/assistantChart'
import { normalizeRow } from '@/components/assistant/assistantText'
import {
  _resetAssistant,
  assistant,
  onMessage,
} from '@/components/assistant/useAssistant'
import AssistantLog from '@/components/assistant/AssistantLog.vue'

// The answer prod sent for «Dame una gráfica de las ventas del mes» (2026-10-31),
// cut to three days.
const report = {
  id: '9c85a7902ccfdec6e077',
  lane: 'analytics',
  title: 'Ventas',
  subtitle: '2026-10-01 → 2026-10-03',
  spec: { doctype: 'Sales Invoice', group_by: 'day', currency: 'MXN' },
  insights: ['El 1 de octubre fue el mejor día.'],
  stats: [{ label: 'Total', value: '$12,520.00' }],
  table: {
    columns: ['Día', 'Facturas', 'Total facturado'],
    rows: [
      ['2026-10-01', '4', '$6,620.00'],
      ['2026-10-02', '2', '$2,225.00'],
      ['2026-10-03', '3', '$3,675.00'],
    ],
  },
  chart: {
    kind: 'line',
    title: 'Total facturado',
    subtitle: '2026-10-01 → 2026-10-03',
    labels: ['2026-10-01', '2026-10-02', '2026-10-03'],
    series: [{ name: 'Total facturado', values: [6620, 2225, 3675] }],
    format: 'money',
  },
}
const reportText =
  '**Ventas por día**\n2026-10-01 → 2026-10-03\n• 2026-10-01: $6,620.00 MXN\n• 2026-10-02: $2,225.00 MXN\n• 2026-10-03: $3,675.00 MXN'

beforeEach(() => {
  _resetAssistant()
  mocks.call.mockReset()
  mocks.call.mockResolvedValue([])
})

function mount(component, props) {
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
  return { el, app }
}

describe('the chart an answer carries', () => {
  it('reads the contract and refuses what it cannot draw', () => {
    const chart = chartOf(report)
    expect(chart).toMatchObject({
      kind: 'line',
      title: 'Total facturado',
      labels: ['2026-10-01', '2026-10-02', '2026-10-03'],
      format: 'money',
      currency: 'MXN',
    })
    expect(chartOf(null)).toBeNull()
    expect(
      chartOf({ chart: { kind: 'line', labels: [], series: [] } }),
    ).toBeNull()
    // a series one value short is not drawn
    expect(
      chartOf({ chart: { labels: ['a', 'b'], series: [{ values: [1] }] } }),
    ).toBeNull()
    expect(
      chartOf({ chart: { labels: ['a'], series: [{ values: ['x'] }] } }),
    ).toBeNull()
  })

  it('takes the older shapes the Desk bubble takes', () => {
    expect(
      chartOf({
        chart: { type: 'pie', labels: ['A'], values: [3], label: 'Ventas' },
      }),
    ).toMatchObject({
      kind: 'donut',
      title: 'Ventas',
      series: [{ name: 'Ventas', values: [3] }],
    })
    expect(
      chartOf({
        chart: { type: 'percentage', labels: ['A'], series: [{ values: [1] }] },
      }).kind,
    ).toBe('stacked')
    expect(
      chartOf({
        chart: { kind: 'radar', labels: ['A'], series: [{ values: [1] }] },
      }).kind,
    ).toBe('bar')
  })

  it('maps each kind to its frappe-ui chart', () => {
    const line = chartProps(chartOf(report))
    expect(line.component).toBe('line')
    expect(line.props.data[0]).toEqual({ label: '2026-10-01', s0: 6620 })
    expect(line.props.y).toEqual(['s0'])
    expect(line.props.seriesConfig.s0.label).toBe('Total facturado')
    expect(line.props.yAxis.format(12500)).toBe('$12.5 mil')
    expect(line.props.seriesConfig.s0.format(12500)).toBe('$12,500.00')
    const stacked = chartProps(
      chartOf({
        chart: {
          kind: 'stacked',
          labels: ['Lun'],
          series: [
            { name: 'Contado', values: [1] },
            { name: 'Crédito', values: [2] },
          ],
        },
      }),
    )
    expect(stacked).toMatchObject({
      component: 'bar',
      props: { stacked: true, y: ['s0', 's1'] },
    })
    const donut = chartProps(
      chartOf({
        chart: {
          kind: 'donut',
          labels: ['A', 'B'],
          series: [{ values: [1, 2] }],
        },
      }),
    )
    expect(donut).toMatchObject({
      component: 'donut',
      props: { category: 'label', value: 's0' },
    })
    // twelve slices: the eight largest and one «Otros» with the rest
    const ring = chartProps(
      chartOf({
        chart: {
          kind: 'donut',
          labels: 'ABCDEFGHIJKL'.split(''),
          series: [
            { name: 'Ventas', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
          ],
        },
      }),
    ).props
    expect(ring.data.map((r) => r.label)).toEqual([...'LKJIHGFE', 'Others'])
    expect(ring.data.at(-1).s0).toBe(10)
    expect(ring.centerLabel).toBe('Ventas')
  })

  it('names days and months in Spanish, other labels as they come', () => {
    expect(formatLabel('2026-10-05')).toBe('5 oct')
    expect(formatLabel('2026-10')).toMatch(/^oct\.? 2026$/)
    expect(formatLabel('Pantalla SM A20')).toBe('Pantalla SM A20')
    expect(chartProps(chartOf(report)).props.xAxis).toMatchObject({
      type: 'category',
    })
  })

  it('prints values the way the table does', () => {
    const money = chartOf(report)
    expect(formatValue(6620, money)).toBe('$6,620.00')
    expect(formatValue(12, { format: 'int' })).toBe('12')
    expect(formatValue(8.54, { format: 'pct' })).toBe('8.5 %')
  })

  it("keeps the answer's table, else builds one row per label", () => {
    const chart = chartOf(report)
    expect(tableOf(report, chart).columns).toEqual([
      'Día',
      'Facturas',
      'Total facturado',
    ])
    expect(tableOf({}, chart)).toEqual({
      columns: ['Period', 'Total facturado'],
      rows: [
        ['2026-10-01', '$6,620.00'],
        ['2026-10-02', '$2,225.00'],
        ['2026-10-03', '$3,675.00'],
      ],
    })
  })
})

describe('the log draws it', () => {
  it('a history row keeps its answer', () => {
    expect(
      normalizeRow({
        kind: 'bot',
        mid: 'm1',
        message: reportText,
        answer: report,
      }).answer,
    ).toBe(report)
    expect(
      normalizeRow({ kind: 'user', message: 'hola', answer: report }).answer,
    ).toBeNull()
  })

  it('a report shows its chart, its findings and its values, not the list', async () => {
    onMessage({ mid: 'm1', text: reportText, answer: report })
    const { el, app } = mount(AssistantLog, {})
    await vi.waitFor(() =>
      expect(el.querySelector('[data-chart="line"]')).not.toBeNull(),
    )
    const chart = el.querySelector('[data-chart="line"]')
    expect(chart.dataset.title).toBe('Total facturado')
    expect(chart.dataset.points).toBe('3')
    expect(el.textContent).toContain('El 1 de octubre fue el mejor día.')
    expect(el.querySelector('dd').textContent.trim()).toBe('$12,520.00')
    expect(el.textContent).toContain('View chart values')
    expect(el.textContent).not.toContain('• 2026-10-01')
    const cells = [...el.querySelectorAll('[data-testid="assistant-chart"] td')]
    expect(cells.map((c) => c.textContent.trim()).slice(0, 3)).toEqual([
      '2026-10-01',
      '4',
      '$6,620.00',
    ])
    app.unmount()
  })

  it("a chart the model drew keeps the model's words above it", async () => {
    const drawn = { chart: { ...report.chart, kind: 'bar' } }
    assistant.messages = [
      {
        role: 'bot',
        id: 'b1',
        text: 'Aquí está la gráfica de este mes.',
        answer: drawn,
      },
    ]
    const { el, app } = mount(AssistantLog, {})
    await vi.waitFor(() =>
      expect(el.querySelector('[data-chart="bar"]')).not.toBeNull(),
    )
    expect(el.textContent).toContain('Aquí está la gráfica de este mes.')
    app.unmount()
  })

  it('an answer without a chart draws none', async () => {
    assistant.messages = [
      {
        role: 'bot',
        id: 'b1',
        text: 'Vendiste $1,300.00 hoy.',
        answer: { spec: {} },
      },
    ]
    const { el, app } = mount(AssistantLog, {})
    await nextTick()
    expect(el.textContent).toContain('Vendiste $1,300.00 hoy.')
    expect(el.querySelector('[data-testid="assistant-chart"]')).toBeNull()
    app.unmount()
  })
})
