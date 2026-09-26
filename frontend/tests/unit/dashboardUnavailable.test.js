import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DashboardItem from '@/components/Dashboard/DashboardItem.vue'

vi.mock('frappe-ui', () => ({
  NumberChart: { props: ['config'], template: '<span data-chart>{{ config.value }}</span>' },
  AxisChart: { template: '<span data-chart />' },
  DonutChart: { template: '<span data-chart />' },
  Tooltip: { template: '<slot />' },
}))

describe('dashboard metric availability', () => {
  const render = (data) => mount(DashboardItem, {
    props: { index: 0, item: { type: 'number_chart', data } },
    global: { mocks: { __: (text) => text } },
  })

  it('does not render a denied or absent metric as a zero chart', () => {
    const view = render({ unavailable: true, reason: 'This metric requires record permission.' })
    expect(view.find('[role="status"]').text()).toContain('requires record permission')
    expect(view.find('[data-chart]').exists()).toBe(false)
  })

  it('still renders a real permitted zero', () => {
    const view = render({ title: 'Deals', tooltip: 'Visible deals', value: 0 })
    expect(view.find('[data-chart]').text()).toBe('0')
    expect(view.find('[role="status"]').exists()).toBe(false)
  })
})
