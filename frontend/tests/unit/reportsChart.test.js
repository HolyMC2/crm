import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import axisOptions from '../../node_modules/frappe-ui/src/components/Charts/axisChartOptions'

const captured = vi.hoisted(() => ({ config: null }))
vi.mock('frappe-ui', () => ({
  AxisChart: {
    props: ['config'],
    setup(props) {
      captured.config = props.config
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

describe('report chart compatibility with installed frappe-ui', () => {
  it('bounds horizontal category labels and keeps the count axis rooted at zero', () => {
    element = document.createElement('div')
    document.body.append(element)
    app = createApp(ReportChart, {
      title: 'Source wins',
      rows: [
        {
          label: 'A very long source name that must leave room for bars',
          value: 4,
        },
      ],
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(element)

    // Use the installed chart adapter: a top-level yAxis object is ignored when
    // its generated axes are arrays. Test the resulting options, not our config.
    const options = axisOptions(captured.config)
    expect(options.yAxis[0].axisLabel).toMatchObject({
      width: 108,
      overflow: 'truncate',
      color: 'var(--ink-gray-7)',
    })
    expect(options.xAxis.min).toBe(0)
    expect(options.series[0].data[0][0]).toBe(4)
  })
})
