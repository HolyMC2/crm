import { createApp, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardItem from '@/components/Dashboard/DashboardItem.vue'

vi.mock('frappe-ui', () => ({
  NumberChart: { props: ['config'], render() { return h('span', { 'data-chart': '' }, this.config.value) } },
  AxisChart: { render() { return h('span', { 'data-chart': '' }) } },
  DonutChart: { render() { return h('span', { 'data-chart': '' }) } },
  Tooltip: { render() { return this.$slots.default() } },
}))

describe('dashboard metric availability', () => {
  const mounted = []
  afterEach(() => {
    mounted.splice(0).forEach(({ app, el }) => { app.unmount(); el.remove() })
  })
  const render = (data) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(DashboardItem, { index: 0, item: { type: 'number_chart', data } })
    app.config.globalProperties.__ = (text) => text
    app.mount(el)
    mounted.push({ app, el })
    return el
  }

  it('does not render a denied or absent metric as a zero chart', () => {
    const view = render({ unavailable: true, reason: 'This metric requires record permission.' })
    expect(view.querySelector('[role="status"]').textContent).toContain('requires record permission')
    expect(view.querySelector('[data-chart]')).toBeNull()
  })

  it('still renders a real permitted zero', () => {
    const view = render({ title: 'Deals', tooltip: 'Visible deals', value: 0 })
    expect(view.querySelector('[data-chart]').textContent).toBe('0')
    expect(view.querySelector('[role="status"]')).toBeNull()
  })
})
