import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

const captured = vi.hoisted(() => ({ props: null, emit: null }))
vi.mock('frappe-ui/charts', () => ({
  BarChart: {
    props: ['data', 'x', 'y', 'horizontal', 'xAxis', 'yAxis', 'seriesConfig'],
    emits: ['select'],
    setup(props, { emit }) {
      captured.props = props
      captured.emit = emit
      return () => h('div')
    },
  },
}))
import ReportChart from '@/components/Reports/ReportChart.vue'
let app
let element
afterEach(() => {
  app?.unmount()
  element?.remove()
})

const mount = (props) => {
  element = document.createElement('div')
  document.body.append(element)
  app = createApp(ReportChart, props)
  app.config.globalProperties.__ = globalThis.__
  app.mount(element)
}

describe('report chart on frappe-ui/charts', () => {
  it('draws horizontal bars with bounded category labels and a count axis rooted at zero', () => {
    mount({
      title: 'Source wins',
      rows: [
        {
          label: 'A very long source name that must leave room for bars',
          value: 4,
        },
      ],
    })
    expect(captured.props.horizontal).toBe(true)
    expect(captured.props.x).toBe('label')
    expect(captured.props.y).toBe('value')
    expect(captured.props.xAxis.echartOptions.axisLabel).toMatchObject({
      width: 108,
      overflow: 'truncate',
    })
    expect(captured.props.yAxis.min).toBe(0)
    expect(captured.props.data[0]).toMatchObject({ index: 0, value: 4 })
    expect(captured.props.data[0].label).toMatch(/^1\. A very long/)
  })

  it("a selected bar emits the caller's row", () => {
    const onSelect = vi.fn()
    const rows = [
      { label: 'Web', value: 2, name: 'web' },
      { label: 'Phone', value: 1, name: 'phone' },
    ]
    mount({ title: 'Sources', rows, onSelect })
    captured.emit('select', {
      name: 'value',
      value: 1,
      row: captured.props.data[1],
    })
    expect(onSelect).toHaveBeenCalledWith(rows[1])
  })

  it('does not emit when not selectable', () => {
    const onSelect = vi.fn()
    mount({
      title: 'Sources',
      rows: [{ label: 'Web', value: 2 }],
      onSelect,
      selectable: false,
    })
    captured.emit('select', {
      name: 'value',
      value: 2,
      row: captured.props.data[0],
    })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
