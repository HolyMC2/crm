import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({
  list: null,
  access: null,
  call: vi.fn(),
  step: vi.fn(),
}))
vi.mock('frappe-ui', () => ({
  createResource: ({ url }) =>
    url.endsWith('get_assignment_rule_access') ? api.access : api.list,
  call: (...args) => api.call(...args),
  createDocumentResource: vi.fn(),
  getCachedDocumentResource: vi.fn(),
  Button: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    setup(p, { emit }) {
      return () =>
        h(
          'button',
          { disabled: p.disabled || p.loading, onClick: () => emit('click') },
          p.label,
        )
    },
  },
  Switch: {
    props: ['disabled'],
    render() {
      return h('input', { type: 'checkbox', disabled: this.disabled })
    },
  },
  Dialog: {
    render() {
      return null
    },
  },
  Dropdown: {
    render() {
      return h('div', { 'data-actions': true })
    },
  },
  FormControl: {
    render() {
      return null
    },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('frappe-ui/frappe', () => ({
  useTelemetry: () => ({ capture: vi.fn() }),
}))
vi.mock('@/utils', () => ({ ConfirmDelete: () => [{ label: 'Delete' }] }))
vi.mock(
  '@/components/Settings/AssignmentRules/AssignmentRulesList.vue',
  () => ({
    default: {
      render() {
        return h('div', { 'data-rule-list': true }, 'Allowed rules')
      },
    },
  }),
)
import List from '@/components/Settings/AssignmentRules/AssignmentRules.vue'
import Row from '@/components/Settings/AssignmentRules/AssignmentRuleListItem.vue'
const cleanups = []
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.provide('updateStep', api.step)
  app.provide('assignmentRulesList', api.list)
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
beforeEach(() => {
  api.call.mockReset()
  api.step.mockReset()
  api.list = reactive({
    loading: false,
    error: null,
    data: [],
    reload: vi.fn(async () => {
      api.list.error = null
    }),
  })
  api.access = reactive({
    loading: false,
    error: null,
    data: { can_create: true, document_types: ['CRM Lead', 'CRM Deal'] },
    reload: vi.fn(async () => {
      api.access.error = null
    }),
  })
})
afterEach(() => cleanups.splice(0).forEach((fn) => fn()))
describe('assignment settings scope and recovery', () => {
  it('shows permission denial rather than an empty list or create action', async () => {
    api.list.error = { exc_type: 'PermissionError' }
    const el = await mount(List)
    expect(el.textContent).toContain('do not have permission')
    expect(el.querySelector('[data-rule-list]')).toBeNull()
    expect(
      [...el.querySelectorAll('button')].find((n) => n.textContent === 'New')
        .disabled,
    ).toBe(true)
  })
  it('retries a transient read failure and restores the native list', async () => {
    api.list.error = { status: 503 }
    const el = await mount(List)
    expect(el.textContent).toContain('could not be loaded')
    expect(el.textContent).not.toContain('do not have permission')
    ;[...el.querySelectorAll('button')]
      .find((n) => n.textContent === 'Retry')
      .click()
    await flush()
    expect(api.list.reload).toHaveBeenCalledOnce()
    expect(el.querySelector('[data-rule-list]')).toBeTruthy()
  })
  it('keeps a readable rule accessible without offering unauthorized mutations', async () => {
    const data = {
      name: 'RULE-1',
      priority: 1,
      disabled: 0,
      users_exists: true,
      can_write: false,
      can_delete: false,
      can_duplicate: false,
    }
    const el = await mount(Row, { data })
    expect(el.querySelector('select').disabled).toBe(true)
    expect(el.querySelector('input[type=checkbox]').disabled).toBe(true)
    expect(el.querySelector('[data-actions]')).toBeNull()
    el.querySelector('button').click()
    expect(api.step).toHaveBeenCalledWith('view', data)
    expect(api.call).not.toHaveBeenCalled()
  })
})
