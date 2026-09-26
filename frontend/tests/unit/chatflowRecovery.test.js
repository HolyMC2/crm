import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const state = vi.hoisted(() => ({
  call: vi.fn(),
  confirm: null,
  leave: null,
  resource: null,
}))
vi.mock('frappe-ui', () => ({
  call: (...args) => state.call(...args),
  toast: { error: vi.fn(), success: vi.fn() },
  createResource: () =>
    (state.resource = reactive({
      data: [{ name: 'FLOW-1', flow_name: 'Existing flow' }],
      error: null,
      loading: false,
      reload: vi.fn(),
    })),
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard) => {
    state.leave = guard
  },
  onBeforeRouteUpdate: () => {},
}))
vi.mock('@/utils/dialogs', () => ({
  confirmDialog: (options) => {
    state.confirm = options
  },
}))
vi.mock('@/utils/crmCapabilities', () => ({ hasApp: () => false }))
vi.mock('@/components/doco/flows/StepCardList.vue', () => ({
  default: { render: () => null },
}))
import Chatflows from '@/pages/Chatflows.vue'
let app, root
async function tick() {
  await Promise.resolve()
  await nextTick()
}
function button(text) {
  return [...root.querySelectorAll('button')].find((el) =>
    el.textContent.includes(text),
  )
}
beforeEach(async () => {
  state.call.mockReset()
  state.confirm = null
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(Chatflows) })
  app.config.globalProperties.__ = (text) => text
  app.config.globalProperties.$router = { push: vi.fn() }
  app.component('RouterLink', { render: () => null })
  app.mount(root)
  await tick()
})
afterEach(() => {
  app.unmount()
  root.remove()
})
async function newDraft() {
  button('Nuevo flujo').click()
  await tick()
  const input = root.querySelector('input[placeholder^="Nombre del flujo"]')
  input.value = 'Keep this draft'
  input.dispatchEvent(new Event('input'))
  await tick()
  return input
}
describe('legacy customer flow recovery', () => {
  it('keeps unsaved text when discarding is cancelled and clears only after explicit confirmation', async () => {
    const input = await newDraft()
    button('Nuevo flujo').click()
    await tick()
    expect(state.confirm).not.toBeNull()
    state.confirm.onCancel()
    await tick()
    expect(input.value).toBe('Keep this draft')
    button('Nuevo flujo').click()
    await tick()
    state.confirm.onConfirm()
    await tick()
    expect(
      root.querySelector('input[placeholder^="Nombre del flujo"]').value,
    ).toBe('')
  })
  it('blocks leaving during a save and retains the draft after failure', async () => {
    let reject
    state.call.mockImplementation(
      () =>
        new Promise((resolve, fail) => {
          reject = fail
        }),
    )
    await newDraft()
    button('Guardar').click()
    await tick()
    await expect(state.leave()).resolves.toBe(false)
    expect(button('Nuevo flujo').disabled).toBe(true)
    reject(new Error('Offline'))
    await tick()
    await tick()
    expect(
      root.querySelector('input[placeholder^="Nombre del flujo"]').value,
    ).toBe('Keep this draft')
    const leaving = state.leave()
    state.confirm.onCancel()
    await expect(leaving).resolves.toBe(false)
  })
  it('shows a retryable list error instead of reporting no flows', async () => {
    state.resource.data = []
    state.resource.error = new Error('Offline')
    await tick()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'No se pudo cargar',
    )
    expect(root.textContent).not.toContain('Sin flujos')
    button('Reintentar').click()
    expect(state.resource.reload).toHaveBeenCalledOnce()
  })
  it('does not fetch another flow until dirty selection is explicitly discarded', async () => {
    await newDraft()
    button('Existing flow').click()
    await tick()
    expect(state.call).not.toHaveBeenCalled()
    state.confirm.onCancel()
    await tick()
    expect(
      root.querySelector('input[placeholder^="Nombre del flujo"]').value,
    ).toBe('Keep this draft')
    button('Existing flow').click()
    await tick()
    state.call.mockResolvedValue({
      name: 'FLOW-1',
      flow_name: 'Existing flow',
      steps: [],
    })
    state.confirm.onConfirm()
    await tick()
    await tick()
    expect(state.call).toHaveBeenCalledWith(
      'doco_marketing.api.chatflow.get_flow',
      { name: 'FLOW-1' },
    )
    await expect(state.leave()).resolves.toBe(true)
  })
})
