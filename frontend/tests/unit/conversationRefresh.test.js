import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const context = vi.hoisted(() => ({
  call: vi.fn(),
  listeners: {},
  replace: vi.fn(),
}))
vi.mock('frappe-ui', () => ({ call: (...args) => context.call(...args) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { conversation: 'conv1' } }),
  useRouter: () => ({ replace: context.replace }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'agent@example.invalid' }),
}))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $socket: {
      on: (name, handler) => {
        context.listeners[name] = handler
      },
      off: (name) => {
        delete context.listeners[name]
      },
    },
  }),
}))
import Workspace from '@/components/Inbox/ConversationWorkspace.vue'

const account = {
  provider: 'Webchat',
  account_id: 'a'.repeat(64),
  label: 'Test store',
  active: true,
}
const conversation = {
  ...account,
  name: 'conv1',
  peer_id: 'b'.repeat(64),
  generation: 1,
  control_state: 'Human',
  human_owner: 'agent@example.invalid',
  allowed_actions: ['release'],
  send_available: true,
  display_name: 'Visitante BBBBBBBB',
}
const history = { conversation, messages: [], next_cursor: null }
const cleanups = []
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function base(method) {
  if (method.endsWith('list_accounts')) return { accounts: [account] }
  if (method.endsWith('list_threads')) return { items: [], next_cursor: null }
  if (method.endsWith('get_history')) return history
  if (method.endsWith('list_intents')) return []
  throw new Error('Unexpected test RPC')
}
async function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(Workspace) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
async function type(el, text) {
  const input = el.querySelector('textarea')
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function submit(el) {
  el.querySelector('textarea')
    .closest('form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}
beforeEach(() => {
  vi.useFakeTimers()
  context.call.mockReset()
  context.listeners = {}
  context.call.mockImplementation(base)
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
})

describe('mounted workspace refresh preserves drafts and commands', () => {
  it('keeps the actual composer mounted after a transient realtime refresh failure', async () => {
    const el = await mount()
    await type(el, 'Retained draft')
    context.call.mockImplementation((method) => {
      if (method.endsWith('get_history'))
        throw new TypeError('Temporary network failure')
      return base(method)
    })
    context.listeners.crm_conversation_updated({ name: 'conv1' })
    await flush()
    expect(el.querySelector('textarea').value).toBe('Retained draft')
    expect(el.textContent).toContain('No se pudo cargar')
  })
  it('does not refresh while a queue request is uncertain and reuses its exact frozen command', async () => {
    const el = await mount()
    await type(el, 'Frozen reply')
    context.call.mockImplementation((method) => {
      if (method.endsWith('queue_message')) throw new TypeError('Response lost')
      return base(method)
    })
    await submit(el)
    const first = structuredClone(
      context.call.mock.calls.find(([m]) => m.endsWith('queue_message'))[1],
    )
    const count = context.call.mock.calls.filter(([m]) =>
      m.endsWith('get_history'),
    ).length
    context.listeners.crm_conversation_updated({ name: 'conv1' })
    await flush()
    expect(
      context.call.mock.calls.filter(([m]) => m.endsWith('get_history')),
    ).toHaveLength(count)
    expect(el.textContent).toContain('Comprobar solicitud')
    await submit(el)
    expect(
      context.call.mock.calls
        .filter(([m]) => m.endsWith('queue_message'))
        .map(([, args]) => args),
    ).toEqual([first, first])
  })
  it('rechecks pending state when the polling queue request finishes after a send starts', async () => {
    const el = await mount(),
      queue = deferred()
    const count = context.call.mock.calls.filter(([m]) =>
      m.endsWith('get_history'),
    ).length
    context.call.mockImplementation((method) => {
      if (method.endsWith('list_threads')) return queue.promise
      if (method.endsWith('queue_message')) throw new TypeError('Response lost')
      return base(method)
    })
    await vi.advanceTimersByTimeAsync(15000)
    expect(
      context.call.mock.calls.filter(([m]) => m.endsWith('list_threads')),
    ).toHaveLength(2)
    await type(el, 'Started while queue refreshed')
    await submit(el)
    queue.resolve({ items: [], next_cursor: null })
    await flush()
    expect(
      context.call.mock.calls.filter(([m]) => m.endsWith('get_history')),
    ).toHaveLength(count)
    expect(el.textContent).toContain('Comprobar solicitud')
    expect(el.querySelector('textarea').value).toBe(
      'Started while queue refreshed',
    )
  })
})
