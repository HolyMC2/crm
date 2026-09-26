import { createApp, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardItem from '@/components/Dashboard/DashboardItem.vue'

vi.mock('frappe-ui', () => ({
  NumberChart: {
    props: ['config'],
    render() {
      return h('span', { 'data-chart': '' }, this.config.value)
    },
  },
  AxisChart: {
    render() {
      return h('span', { 'data-chart': '' })
    },
  },
  DonutChart: {
    render() {
      return h('span', { 'data-chart': '' })
    },
  },
  Tooltip: {
    render() {
      return this.$slots.default()
    },
  },
}))

describe('dashboard metric availability', () => {
  const mounted = []
  afterEach(() => {
    mounted.splice(0).forEach(({ app, el }) => {
      app.unmount()
      el.remove()
    })
  })
  const render = (data) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(DashboardItem, {
      index: 0,
      item: { type: 'number_chart', data },
    })
    app.config.globalProperties.__ = (text) => text
    app.mount(el)
    mounted.push({ app, el })
    return el
  }

  it('does not render a denied or absent metric as a zero chart', () => {
    const view = render({
      unavailable: true,
      reason: 'This metric requires record permission.',
    })
    expect(view.querySelector('[role="status"]').textContent).toContain(
      'requires record permission',
    )
    expect(view.querySelector('[data-chart]')).toBeNull()
  })

  it('still renders a real permitted zero', () => {
    const view = render({ title: 'Deals', tooltip: 'Visible deals', value: 0 })
    expect(view.querySelector('[data-chart]').textContent).toBe('0')
    expect(view.querySelector('[role="status"]')).toBeNull()
  })

  it('keeps missing-rate and commercial-amount definitions visible alongside the chart', () => {
    const view = render({
      value: 252.5,
      metric_note:
        'Open expected amount. Excluded 1 deals with missing exchange rates.',
    })
    expect(view.querySelector('[data-chart]').textContent).toBe('252.5')
    expect(view.querySelector('[role="note"]').textContent).toContain(
      'Excluded 1',
    )
    expect(view.querySelector('[role="note"]').textContent).toContain(
      'Open expected amount',
    )
  })

  it('does not show a chart or a second note when every rate is unknown', () => {
    const view = render({
      unavailable: true,
      value: 0,
      reason: 'Excluded 2 deals with missing exchange rates.',
      metric_note: 'Open expected amount.',
    })
    expect(view.querySelector('[role="status"]').textContent).toContain(
      'Excluded 2',
    )
    expect(view.querySelector('[data-chart]')).toBeNull()
    expect(view.querySelector('[role="note"]')).toBeNull()
  })
})
