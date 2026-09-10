import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))
import Composer from '@/components/Inbox/ConversationComposer.vue'
import Outbox from '@/components/Inbox/ConversationOutbox.vue'
const actor = 'operator@example.invalid'
const conversation = (extra = {}) => ({
  name: 'conv1',
  provider: 'WhatsApp',
  peer_id: '5215550100000',
  generation: 2,
  control_state: 'Human',
  human_owner: actor,
  allowed_actions: ['release'],
  send_available: true,
  ...extra,
})
const intent = (extra = {}) => ({
  name: 'intent1',
  conversation: 'conv1',
  conversation_generation: 2,
  actor_user: actor,
  creation: '2026-01-01',
  state: 'Queued',
  text: 'Reply',
  can_cancel: true,
  can_retry: false,
  ...extra,
})
const cleanups = []
beforeEach(() => {
  api.call.mockReset()
})
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function mount(component, values) {
  const props = reactive(values),
    el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return { el, props }
}
async function reply(el, value) {
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
describe('manual reply durable request', () => {
  it('freezes text, generation and UUID across a lost response and does not treat malformed response as success', async () => {
    api.call
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(intent())
    const queued = vi.fn(),
      { el } = mount(Composer, {
        conversation: conversation(),
        actor,
        onQueued: queued,
      })
    await reply(el, 'Hello <script>inert</script>')
    await submit(el)
    const first = structuredClone(api.call.mock.calls[0][1])
    expect(el.querySelector('textarea').disabled).toBe(true)
    await submit(el)
    expect(queued).not.toHaveBeenCalled()
    await submit(el)
    expect(api.call.mock.calls.map(([, request]) => request)).toEqual([
      first,
      first,
      first,
    ])
    expect(queued).toHaveBeenCalledOnce()
    expect(el.querySelector('textarea').value).toBe('')
  })
  it('blocks new replies immediately when ownership or generation eligibility changes', async () => {
    const { el, props } = mount(Composer, {
      conversation: conversation(),
      actor,
    })
    await reply(el, 'Draft')
    props.conversation = conversation({
      human_owner: 'other',
      send_available: false,
      generation: 3,
    })
    await nextTick()
    expect(el.querySelector('form')).toBeNull()
    expect(api.call).not.toHaveBeenCalled()
  })
  it('can reconcile the original frozen queue request after another operator took over', async () => {
    api.call
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockResolvedValueOnce(intent({ state: 'Unknown', can_cancel: false }))
    const { el, props } = mount(Composer, {
      conversation: conversation(),
      actor,
    })
    await reply(el, 'Frozen reply')
    await submit(el)
    const original = structuredClone(api.call.mock.calls[0][1])
    props.conversation = conversation({
      human_owner: 'other',
      send_available: false,
      generation: 3,
    })
    await nextTick()
    await submit(el)
    expect(api.call.mock.calls[1][1]).toEqual(original)
    expect(
      api.call.mock.calls.every(
        ([method]) => method === 'crm.api.outbox.queue_message',
      ),
    ).toBe(true)
    expect(el.querySelector('textarea')).toBeNull()
  })
  it('never offers a composer for another channel or a core-only unavailable capability', () => {
    const { el } = mount(Composer, {
      conversation: conversation({
        provider: 'Instagram',
        send_available: false,
      }),
      actor,
    })
    expect(el.querySelector('form')).toBeNull()
    expect(api.call).not.toHaveBeenCalled()
  })
  it('clears the old actor draft and suppresses late queue results after user switch', async () => {
    let resolve
    api.call.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const queued = vi.fn(),
      { el, props } = mount(Composer, {
        conversation: conversation(),
        actor,
        onQueued: queued,
      })
    await reply(el, 'Private operator draft')
    await submit(el)
    props.actor = 'other'
    await nextTick()
    resolve(intent())
    await flush()
    expect(queued).not.toHaveBeenCalled()
    expect(el.textContent).not.toContain('Private operator draft')
  })
})
describe('durable outbound state', () => {
  it('never restores Unknown action buttons from a stale later response', async () => {
    api.call
      .mockResolvedValueOnce([intent({ state: 'Unknown', can_cancel: false })])
      .mockResolvedValueOnce([
        intent({ state: 'Failed', can_retry: true, can_cancel: true }),
      ])
    const { el } = mount(Outbox, { conversation: conversation(), actor })
    await flush()
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Actualizar envíos')
      .click()
    await flush()
    expect(el.textContent).toContain('Resultado incierto')
    expect(el.textContent).not.toContain('Reintentar envío')
    expect(el.textContent).not.toContain('Cancelar envío')
  })
  it('renders authoritative states and HTML as text; Unknown never offers retry/cancel even with bad flags', async () => {
    api.call.mockResolvedValue([
      intent({
        state: 'Unknown',
        text: '<img src=x onerror="alert(1)">',
        can_retry: true,
        can_cancel: true,
        reason_code: 'provider_response_uncertain',
      }),
    ])
    const { el } = mount(Outbox, { conversation: conversation(), actor })
    await flush()
    expect(el.textContent).toContain('Resultado incierto')
    expect(el.textContent).toContain('<img src=x')
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).not.toContain('Reintentar envío')
    expect(el.textContent).not.toContain('Cancelar envío')
    expect(api.call).toHaveBeenCalledOnce()
  })
  it('reconciles a lost retry response by reading the same row without repeating the retry action', async () => {
    api.call.mockImplementation(async (method) => {
      if (method.endsWith('list_intents'))
        return [intent({ state: 'Failed', can_retry: true })]
      if (method.endsWith('retry_intent')) throw new TypeError('Lost response')
      return intent({ state: 'Unknown', can_cancel: false })
    })
    const { el } = mount(Outbox, { conversation: conversation(), actor })
    await flush()
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Reintentar envío')
      .click()
    await flush()
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Comprobar estado del cambio')
      .click()
    await flush()
    expect(
      api.call.mock.calls.filter(([m]) => m.endsWith('retry_intent')),
    ).toHaveLength(1)
    expect(
      api.call.mock.calls.filter(([m]) => m.endsWith('get_intent'))[0][1],
    ).toEqual({ name: 'intent1' })
    expect(el.textContent).toContain('Resultado incierto')
    expect(el.textContent).not.toContain('Reintentar envío')
  })
  it('removes action buttons when ownership is invalidated and reflects refreshed delivery state', async () => {
    api.call
      .mockResolvedValueOnce([intent({ state: 'Failed', can_retry: true })])
      .mockResolvedValueOnce([intent({ state: 'Read', can_cancel: false })])
    const { el, props } = mount(Outbox, { conversation: conversation(), actor })
    await flush()
    expect(el.textContent).toContain('Reintentar envío')
    props.conversation = conversation({
      human_owner: 'other',
      generation: 3,
      send_available: false,
    })
    await nextTick()
    expect(el.textContent).not.toContain('Reintentar envío')
    expect(el.textContent).not.toContain('Cancelar envío')
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Actualizar envíos')
      .click()
    await flush()
    expect(el.textContent).toContain('Leído')
  })
})
