import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const context = vi.hoisted(() => ({
  call: vi.fn(),
  listeners: {},
  replace: vi.fn(),
  conversation: null,
}))
vi.mock('frappe-ui', () => ({ call: (...args) => context.call(...args) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { conversation: 'conv-ig' } }),
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
import Composer from '@/components/Inbox/ConversationComposer.vue'
import Outbox from '@/components/Inbox/ConversationOutbox.vue'
import Workspace from '@/components/Inbox/ConversationWorkspace.vue'

const actor = 'agent@example.invalid'
const social = (provider, extra = {}) => ({
  name: provider === 'Instagram' ? 'conv-ig' : 'conv-fb',
  provider,
  account_id: provider === 'Instagram' ? '178400000000001' : '100000000000001',
  peer_id: provider === 'Instagram' ? '990000000000001' : '880000000000001',
  display_name: 'Cliente de prueba',
  generation: 4,
  control_state: 'Human',
  human_owner: actor,
  allowed_actions: ['transfer', 'release', 'pause', 'close'],
  provider_control: 'Ours',
  send_available: true,
  ...extra,
})
const intent = (extra = {}) => ({
  name: 'f'.repeat(64),
  conversation: 'conv-ig',
  conversation_generation: 4,
  provider: 'Instagram',
  actor_user: actor,
  origin: 'Human',
  creation: '2026-09-23 23:00:00',
  modified: '2026-09-23 23:00:00',
  state: 'Queued',
  text: 'Hola',
  can_cancel: true,
  can_retry: false,
  ...extra,
})
const cleanups = []
beforeEach(() => {
  context.call.mockReset()
  context.listeners = {}
  context.replace.mockReset()
})
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount(component, values = {}) {
  const props = reactive(values),
    el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return { el, props }
}
async function type(el, value) {
  const body = el.querySelector('textarea')
  body.value = value
  body.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function submit(el) {
  el.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
  await flush()
}
const sendButton = (el) => el.querySelector('button[type="submit"]')
const queueCalls = () =>
  context.call.mock.calls.filter(([m]) => m === 'crm.api.outbox.queue_message')

describe('Messenger/Instagram native composer gating', () => {
  it('offers the Instagram composer only to the current Human owner with server send_available', async () => {
    const { el, props } = mount(Composer, {
      conversation: social('Instagram'),
      actor,
    })
    expect(el.querySelector('form')).not.toBeNull()
    expect(el.textContent).toContain('Instagram solo acepta texto')
    expect(el.textContent).toContain('24 horas')
    expect(el.textContent).toContain('0/1000')
    for (const change of [
      { human_owner: 'other@example.invalid' },
      { human_owner: null },
      { control_state: 'Bot', human_owner: null },
      { control_state: 'Paused' },
      { send_available: false },
      { send_available: 'true' },
      { generation: undefined },
    ]) {
      props.conversation = social('Instagram', change)
      await nextTick()
      expect(el.querySelector('form'), JSON.stringify(change)).toBeNull()
    }
    props.conversation = social('Instagram', {
      human_owner: 'other@example.invalid',
    })
    await nextTick()
    expect(el.textContent).toContain('necesitas el control humano vigente')
    props.conversation = social('Instagram', { send_available: false })
    await nextTick()
    expect(el.textContent).toContain('no está disponible ahora')
    expect(context.call).not.toHaveBeenCalled()
  })

  it('explains an unconfirmed Meta thread owner instead of offering a reply', () => {
    const { el } = mount(Composer, {
      conversation: social('Messenger', {
        provider_control: 'Unknown',
        send_available: false,
      }),
      actor,
    })
    expect(el.querySelector('form')).toBeNull()
    expect(el.textContent).toContain(
      'Messenger aún no confirma que esta tienda controla la conversación',
    )
  })

  it('keeps unsupported providers without a composer', () => {
    const { el } = mount(Composer, {
      conversation: social('Instagram', { provider: 'TikTok' }),
      actor,
    })
    expect(el.querySelector('form')).toBeNull()
    expect(el.textContent).toContain('aún no está disponible')
  })
})

describe('exact provider text bounds (server code points)', () => {
  it('Instagram accepts exactly 1000 code points, including astral characters, and refuses 1001', async () => {
    context.call.mockResolvedValue(intent())
    const { el } = mount(Composer, { conversation: social('Instagram'), actor })
    await type(el, '👋'.repeat(1001))
    expect(el.textContent).toContain('1001/1000')
    expect(el.querySelector('[data-reply-problem]').textContent).toContain(
      'límite de 1000',
    )
    expect(sendButton(el).disabled).toBe(true)
    await submit(el)
    expect(context.call).not.toHaveBeenCalled()
    // 1000 emoji are 2000 UTF-16 units but 1000 characters for the server.
    const exact = '👋'.repeat(1000)
    await type(el, exact)
    expect(el.textContent).toContain('1000/1000')
    expect(el.querySelector('[data-reply-problem]')).toBeNull()
    await submit(el)
    expect(queueCalls()).toHaveLength(1)
    expect(queueCalls()[0][1]).toEqual({
      conversation: 'conv-ig',
      expected_generation: 4,
      request_id: expect.any(String),
      payload: { type: 'text', text: exact },
    })
  })

  it('Messenger accepts 2000 and refuses 2001; control characters are refused, tab and newline kept', async () => {
    context.call.mockResolvedValue(intent({ provider: 'Messenger' }))
    const { el } = mount(Composer, { conversation: social('Messenger'), actor })
    expect(el.textContent).toContain('0/2000')
    await type(el, 'x'.repeat(2001))
    expect(sendButton(el).disabled).toBe(true)
    await type(el, 'Hola\u000bmundo')
    expect(el.querySelector('[data-reply-problem]').textContent).toContain(
      'caracteres de control',
    )
    expect(sendButton(el).disabled).toBe(true)
    await submit(el)
    await type(el, 'x'.repeat(1999) + '\ud800')
    expect(el.querySelector('[data-reply-problem]').textContent).toContain(
      'no válidos',
    )
    await submit(el)
    expect(context.call).not.toHaveBeenCalled()
    const text = 'Línea 1\n\tLínea 2\n' + 'x'.repeat(1983)
    expect(Array.from(text).length).toBe(2000)
    await type(el, text)
    expect(sendButton(el).disabled).toBe(false)
    await submit(el)
    expect(queueCalls()).toHaveLength(1)
    expect(queueCalls()[0][1].payload.text).toBe(text)
  })

  it('does not apply the social control-character rule to WhatsApp and keeps its 4096 bound', async () => {
    const { el } = mount(Composer, {
      conversation: social('Instagram', { provider: 'WhatsApp' }),
      actor,
    })
    expect(el.textContent).toContain('0/4096')
    expect(el.textContent).not.toContain('24 horas')
    await type(el, 'Hola\u000bmundo')
    expect(el.querySelector('[data-reply-problem]')).toBeNull()
  })
})

describe('pending request retry and human takeover', () => {
  it('reuses the exact frozen Instagram request after a lost response and after another operator takes over', async () => {
    context.call
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockRejectedValueOnce({ exc_type: 'ReplyRequestPending' })
      .mockResolvedValueOnce(intent({ state: 'Queued' }))
    const queued = vi.fn()
    const { el, props } = mount(Composer, {
      conversation: social('Instagram'),
      actor,
      onQueued: queued,
    })
    await type(el, 'Tu equipo está listo')
    await submit(el)
    const frozen = structuredClone(queueCalls()[0][1])
    expect(el.textContent).toContain('Comprobar solicitud')
    expect(el.querySelector('textarea').disabled).toBe(true)
    // Another operator takes the conversation while the request is uncertain.
    props.conversation = social('Instagram', {
      human_owner: 'other@example.invalid',
      generation: 5,
      send_available: false,
    })
    await nextTick()
    expect(el.querySelector('form')).not.toBeNull()
    await submit(el)
    await submit(el)
    expect(queueCalls().map(([, request]) => request)).toEqual([
      frozen,
      frozen,
      frozen,
    ])
    expect(frozen.expected_generation).toBe(4)
    expect(queued).toHaveBeenCalledOnce()
    // Confirmed: the stale owner's composer closes instead of drafting again.
    expect(el.querySelector('form')).toBeNull()
    expect(
      context.call.mock.calls.every(
        ([method]) => method === 'crm.api.outbox.queue_message',
      ),
    ).toBe(true)
  })

  it('drops the frozen request on an authoritative refusal and asks for a refresh', async () => {
    context.call.mockRejectedValueOnce({ exc_type: 'TimestampMismatchError' })
    const refresh = vi.fn()
    const { el } = mount(Composer, {
      conversation: social('Messenger'),
      actor,
      onRefresh: refresh,
    })
    await type(el, 'Hola')
    await submit(el)
    expect(refresh).toHaveBeenCalledOnce()
    expect(el.textContent).toContain('Revisa el control vigente')
    expect(el.textContent).not.toContain('Comprobar solicitud')
    expect(el.querySelector('textarea').value).toBe('Hola')
  })
})

describe('social Envíos states', () => {
  it('labels accepted social replies by their provider without claiming delivery or read', async () => {
    context.call.mockResolvedValue([
      intent({
        state: 'Accepted',
        can_cancel: false,
        provider_message_id: 'mid.1',
      }),
    ])
    const { el } = mount(Outbox, { conversation: social('Instagram'), actor })
    await flush()
    expect(el.textContent).toContain('Aceptado por Instagram')
    expect(el.textContent).not.toContain('WhatsApp')
    expect(el.textContent).not.toContain('Entregado')
    expect(el.textContent).not.toContain('Leído')
  })

  it('shows a blocked 24-hour window reason and retries the same intent once for its owner', async () => {
    context.call.mockImplementation(async (method) => {
      if (method.endsWith('list_intents'))
        return [
          intent({
            provider: 'Messenger',
            conversation: 'conv-fb',
            state: 'Blocked',
            reason_code: 'customer_window_unverified',
            can_retry: true,
          }),
        ]
      if (method.endsWith('retry_intent'))
        return intent({ provider: 'Messenger', conversation: 'conv-fb' })
      throw new Error('Unexpected RPC ' + method)
    })
    const { el } = mount(Outbox, { conversation: social('Messenger'), actor })
    await flush()
    expect(el.textContent).toContain(
      'No hay una ventana de respuesta verificada',
    )
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Reintentar envío')
      .click()
    await flush()
    const retries = context.call.mock.calls.filter(([m]) =>
      m.endsWith('retry_intent'),
    )
    expect(retries).toEqual([
      ['crm.api.outbox.retry_intent', { name: 'f'.repeat(64) }],
    ])
    expect(el.textContent).toContain('En cola')
  })

  it('never offers retry or cancel for an Unknown social send', async () => {
    context.call.mockResolvedValue([
      intent({
        state: 'Unknown',
        reason_code: 'provider_response_uncertain',
        can_retry: true,
        can_cancel: true,
      }),
    ])
    const { el } = mount(Outbox, { conversation: social('Instagram'), actor })
    await flush()
    expect(el.textContent).toContain('Resultado incierto')
    expect(el.textContent).not.toContain('Reintentar envío')
    expect(el.textContent).not.toContain('Cancelar envío')
  })
})

describe('customer workspace for Instagram', () => {
  const account = {
    provider: 'Instagram',
    account_id: '178400000000001',
    label: 'Tienda de prueba',
    active: true,
  }
  function rpc(method) {
    if (method.endsWith('list_accounts')) return { accounts: [account] }
    if (method.endsWith('list_threads')) return { items: [], next_cursor: null }
    if (method.endsWith('get_history'))
      return {
        conversation: context.conversation,
        messages: [
          {
            id: 'mm-native-' + 'f'.repeat(64),
            direction: 'out',
            content: 'Respuesta aceptada',
            content_type: 'text',
            timestamp: '2026-09-23 23:00:00',
            status: 'sent',
          },
        ],
        next_cursor: null,
      }
    if (method.endsWith('list_intents')) return []
    if (method.endsWith('queue_message')) return intent()
    throw new Error('Unexpected test RPC ' + method)
  }
  const historyCalls = () =>
    context.call.mock.calls.filter(([m]) => m.endsWith('get_history')).length

  it('mounts Envíos and the native composer, and reloads only on this exact peer’s social event', async () => {
    context.conversation = social('Instagram')
    context.call.mockImplementation(async (method) => rpc(method))
    const { el } = mount(Workspace)
    await flush()
    expect(el.querySelector('[aria-label="Envíos"]')).not.toBeNull()
    expect(
      context.call.mock.calls.some(
        ([m, args]) =>
          m === 'crm.api.outbox.list_intents' &&
          args.conversation === 'conv-ig',
      ),
    ).toBe(true)
    expect(el.querySelector('textarea')).not.toBeNull()
    expect(el.textContent).toContain('Respuesta aceptada')
    const before = historyCalls()
    context.listeners.messenger_message({ psid: '990000000000002' })
    await flush()
    expect(historyCalls()).toBe(before)
    context.listeners.messenger_message({ psid: '990000000000001' })
    await flush()
    expect(historyCalls()).toBe(before + 1)
  })

  it('sends through the native outbox only and keeps a pending reply from being refreshed away', async () => {
    context.conversation = social('Instagram')
    let resolve
    context.call.mockImplementation(async (method) =>
      method.endsWith('queue_message')
        ? new Promise((done) => {
            resolve = done
          })
        : rpc(method),
    )
    const { el } = mount(Workspace)
    await flush()
    await type(el, 'Hola desde la tienda')
    el.querySelector('textarea')
      .closest('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const before = historyCalls()
    context.listeners.messenger_message({ psid: '990000000000001' })
    context.listeners.crm_conversation_updated({ name: 'conv-ig' })
    await flush()
    expect(historyCalls()).toBe(before)
    resolve(intent())
    await flush()
    const methods = context.call.mock.calls.map(([m]) => m)
    expect(
      methods.filter((m) => m === 'crm.api.outbox.queue_message'),
    ).toHaveLength(1)
    expect(
      methods.some((m) => /messenger|whatsapp_message|send_text/i.test(m)),
    ).toBe(false)
  })
})
