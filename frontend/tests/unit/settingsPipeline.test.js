import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), reload: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  createResource: ({ url }) => ({
    data: url.endsWith('get_pipelines')
      ? [
          { name: 'P1', pipeline_name: 'First' },
          { name: 'P2', pipeline_name: 'Second' },
        ]
      : url.endsWith('get_pipeline_editor_options')
        ? { stages: [], roles: [] }
        : null,
    reload: api.reload,
  }),
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
  FormControl: {
    props: ['modelValue', 'label', 'type'],
    emits: ['update:modelValue'],
    setup(p, { emit }) {
      return () =>
        h('input', {
          'aria-label': p.label,
          value: p.modelValue,
          type: p.type === 'checkbox' ? 'checkbox' : 'text',
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
    },
  },
  toast: { success: vi.fn() },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: {
    render() {
      return null
    },
  },
}))
import Pipeline from '@/components/Settings/PipelineSettings.vue'
const cleanups = []
const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm')
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const data = (name) => ({ name, pipeline_name: name, roles: [], stages: [] })
async function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(Pipeline) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
async function click(el, label) {
  ;[...el.querySelectorAll('button')]
    .find((n) => n.textContent === label)
    .click()
  await flush()
}
beforeEach(() => {
  api.call.mockReset()
  api.reload.mockResolvedValue()
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => false),
  })
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm)
  else delete window.confirm
})
describe('pipeline editor continuity', () => {
  it('does not replace a newer selection when an older read arrives late', async () => {
    let first, second
    api.call.mockImplementation(
      (m, a) =>
        new Promise((resolve) => {
          if (a.name === 'P1') first = resolve
          else second = resolve
        }),
    )
    const el = await mount()
    await click(el, 'First')
    await click(el, 'Second')
    second(data('P2'))
    await flush()
    first(data('P1'))
    await flush()
    expect(el.querySelector('[aria-label="Pipeline name"]').value).toBe('P2')
  })
  it('retains a dirty draft when switching is cancelled', async () => {
    api.call.mockImplementation((m, a) => Promise.resolve(data(a.name)))
    const el = await mount()
    await click(el, 'First')
    const input = el.querySelector('[aria-label="Pipeline name"]')
    input.value = 'Local draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    await click(el, 'Second')
    expect(input.value).toBe('Local draft')
    expect(api.call).toHaveBeenCalledOnce()
    expect(window.confirm).toHaveBeenCalledOnce()
  })
  it('retains invalid edits and blocks repeat submission while a save is pending', async () => {
    let rejectSave
    api.call.mockImplementation((m, a) =>
      m.endsWith('save_pipeline')
        ? new Promise((resolve, reject) => {
            rejectSave = reject
          })
        : Promise.resolve(data(a.name)),
    )
    const el = await mount()
    await click(el, 'First')
    const input = el.querySelector('[aria-label="Pipeline name"]')
    input.value = 'Draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    await click(el, 'Save pipeline')
    await click(el, 'Save pipeline')
    expect(
      api.call.mock.calls.filter(([m]) => m.endsWith('save_pipeline')),
    ).toHaveLength(1)
    rejectSave({ messages: ['This stage cannot be removed'] })
    await flush()
    expect(input.value).toBe('Draft')
    expect(el.textContent).toContain('This stage cannot be removed')
  })
})
