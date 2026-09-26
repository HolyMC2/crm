import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
const state = vi.hoisted(() => ({ resource: null }))
vi.mock('frappe-ui', () => ({
  createResource: () => state.resource,
  FormControl: defineComponent({
    props: ['options', 'modelValue', 'disabled', 'label'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            value: props.modelValue,
            disabled: props.disabled,
            'aria-label': props.label,
            onChange: (e) => emit('update:modelValue', e.target.value),
          },
          props.options.map((option) =>
            h(
              'option',
              { value: option.value, disabled: option.disabled },
              option.label,
            ),
          ),
        )
    },
  }),
}))
vi.mock('@/utils/statusGuard', () => ({
  guardStatusChange: (_status, fn) => fn(),
}))
import PipelineSelector from '@/components/Pipeline/PipelineSelector.vue'
const apps = []
function mount(doc, extra = {}) {
  const change = vi.fn()
  const element = document.createElement('div')
  document.body.appendChild(element)
  const app = createApp(PipelineSelector, { doc, onChange: change, ...extra })
  app.config.globalProperties.__ = (s) => s
  app.mount(element)
  apps.push([app, element])
  return { element, change }
}
afterEach(() => {
  apps.forEach(([app, element]) => {
    app.unmount()
    element.remove()
  })
  apps.length = 0
})
const rows = [
  {
    name: 'a',
    pipeline_name: 'Retail',
    sales_company: '',
    is_default: 1,
    probability_policy: 'Stage',
    stages: [{ name: 'New', type: 'Open', archived: 0 }],
  },
  {
    name: 'b',
    pipeline_name: 'Services',
    sales_company: 'Services company',
    currency: 'EUR',
    probability_policy: 'Manual',
    stages: [{ name: 'Assess', type: 'Open', archived: 0 }],
  },
  {
    name: 'old',
    pipeline_name: 'Old pipeline',
    archived: 1,
    stages: [{ name: 'Historic', archived: 1 }],
  },
]
describe('pipeline selector UI', () => {
  it('keeps existing archived history unchanged on load', () => {
    state.resource = reactive({ data: rows, loading: false })
    const { element, change } = mount({ pipeline: 'old', status: 'Historic' })
    expect(element.textContent).toContain('Old pipeline · Archived')
    expect(element.querySelector('option[value="old"]').disabled).toBe(true)
    expect(change).not.toHaveBeenCalled()
  })
  it('chooses pipeline and start stage together, retaining an existing currency', async () => {
    state.resource = reactive({ data: rows, loading: false })
    const { element, change } = mount({
      pipeline: 'a',
      status: 'New',
      currency: 'USD',
    })
    const select = element.querySelector('select')
    select.value = 'b'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    expect(change).toHaveBeenCalledWith({
      pipeline: 'b',
      sales_company: 'Services company',
      status: 'Assess',
    })
    expect(element.querySelector('option[value="old"]')).toBeNull()
  })
  it('reports discovery failure and provides retry without altering the record', async () => {
    const reload = vi.fn()
    state.resource = reactive({
      data: null,
      error: new Error('offline'),
      loading: false,
      reload,
    })
    const { element, change } = mount({ pipeline: 'a', status: 'New' })
    expect(element.querySelector('[role="alert"]').textContent).toContain(
      'could not load',
    )
    element.querySelector('button').click()
    await nextTick()
    expect(reload).toHaveBeenCalledOnce()
    expect(change).not.toHaveBeenCalled()
  })
})
