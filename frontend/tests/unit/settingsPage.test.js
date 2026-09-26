import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), fields: null, doc: null }))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  createResource: () => api.fields,
  createDocumentResource: () => api.doc,
  getCachedDocumentResource: () => null,
  Button: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            disabled: props.disabled || props.loading,
            onClick: () => emit('click'),
          },
          props.label,
        )
    },
  },
  LoadingIndicator: {
    render() {
      return null
    },
  },
  Badge: {
    render() {
      return null
    },
  },
  ErrorMessage: {
    props: ['message'],
    render() {
      return h('p', this.message?.message || this.message)
    },
  },
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/utils', () => ({ getRandom: () => 'stable-test' }))
vi.mock('@/components/FieldLayout/FieldLayout.vue', () => ({
  default: {
    props: ['data'],
    render() {
      return h('input', {
        value: this.data.title,
        onInput: (e) => (this.data.title = e.target.value),
      })
    },
  },
}))
import SettingsPage from '@/components/Settings/SettingsPage.vue'
const cleanups = []
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({
    render: () => h(SettingsPage, { doctype: 'Marketing Settings' }),
  })
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
  api.fields = reactive({
    data: null,
    fetch: vi.fn(async () => {
      api.fields.data = [{ fieldname: 'title', type: 'Data' }]
    }),
  })
  api.doc = reactive({
    doc: null,
    isDirty: false,
    save: { loading: false, submit: vi.fn() },
    get: {
      fetch: vi.fn(async () => {
        api.doc.doc = { title: 'Original' }
      }),
    },
  })
})
afterEach(() => cleanups.splice(0).forEach((fn) => fn()))
describe('native settings document loading', () => {
  it('checks native read permission before metadata and does not expose a write control', async () => {
    api.call.mockResolvedValue({ has_permission: false })
    const el = await mount()
    expect(el.textContent).toContain('do not have permission')
    expect(api.fields.fetch).not.toHaveBeenCalled()
    expect(api.doc.get.fetch).not.toHaveBeenCalled()
    expect(el.querySelector('button').disabled).toBe(true)
  })
  it('loads allowed read-only settings while keeping Save disabled', async () => {
    api.call.mockImplementation((method, args) =>
      Promise.resolve({ has_permission: args.perm_type === 'read' }),
    )
    const el = await mount()
    expect(api.doc.get.fetch).toHaveBeenCalledOnce()
    expect(el.textContent).toContain('Saving requires additional permission')
    expect(el.querySelector('fieldset').disabled).toBe(true)
    expect(el.querySelector('button').disabled).toBe(true)
  })
  it.each([
    ['DoesNotExistError', 'not configured'],
    ['NetworkError', 'could not be loaded'],
  ])('offers honest %s recovery', async (type, copy) => {
    api.call.mockRejectedValueOnce({ exc_type: type })
    const el = await mount()
    expect(el.textContent).toContain(copy)
    api.call.mockResolvedValue({ has_permission: true })
    ;[...el.querySelectorAll('button')]
      .find((n) => n.textContent === 'Retry')
      .click()
    await flush()
    expect(el.querySelector('input').value).toBe('Original')
    expect(el.querySelector('button').disabled).toBe(false)
  })
})
