import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, h, nextTick, ref } from 'vue'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { useConversations } from '@/composables/useConversations'
import ConversationControls from '@/components/Inbox/ConversationControls.vue'
import ConversationQueue from '@/components/Inbox/ConversationQueue.vue'
import MessengerArea from '@/components/Activities/MessengerArea.vue'

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
const account = {
  provider: 'WhatsApp',
  account_id: '123',
  label: 'Fictional account',
  active: true,
}
const doc = (extra = {}) => ({
  name: 'conv1',
  ...account,
  peer_id: '5215550100000',
  generation: 1,
  control_state: 'Human',
  allowed_actions: ['take'],
  ...extra,
})
const history = (extra = {}, messages = []) => ({
  conversation: doc(extra),
  messages,
  next_cursor: null,
})
function deferred() {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
function workspace(rpc) {
  const actor = ref('one@example.invalid'),
    scope = effectScope()
  const result = scope.run(() =>
    useConversations({
      actor: () => actor.value,
      rpc,
      commandId: () => 'stable-command',
    }),
  )
  cleanups.push(() => scope.stop())
  result.state.accounts = [account]
  return { ...result, actor }
}
function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}

describe('customer workspace response boundaries', () => {
  it('discards an old account response after exact-account selection changes', async () => {
    const old = deferred()
    const w = workspace((method, args) =>
      args.account_id === '123'
        ? old.promise
        : Promise.resolve({
            items: [{ peer_id: '222', preview: 'new' }],
            next_cursor: null,
          }),
    )
    const first = w.selectAccount(account)
    await w.selectAccount({ ...account, account_id: '456' })
    old.resolve({ items: [{ peer_id: '111', preview: 'old private data' }] })
    await first
    expect(w.state.threads.map((r) => r.preview)).toEqual(['new'])
  })
  it('discards a late old thread and a superseded refresh', async () => {
    const old = deferred(),
      refresh = deferred()
    let calls = 0
    const w = workspace((method, args) =>
      args.conversation === 'old'
        ? old.promise
        : ++calls === 2
          ? refresh.promise
          : Promise.resolve(history({ name: 'new', generation: calls })),
    )
    const first = w.selectThread({ name: 'old' })
    await w.selectThread({ name: 'new' })
    old.resolve(history({ name: 'old' }, [{ id: 'secret' }]))
    await first
    const stale = w.loadHistory()
    await w.loadHistory()
    refresh.resolve(history({ name: 'new', generation: 2 }))
    await stale
    expect(w.state.conversation.name).toBe('new')
    expect(w.state.conversation.generation).toBe(3)
    expect(w.state.messages).toEqual([])
  })
  it('clears sensitive state on actor change and ignores the old response', async () => {
    const pending = deferred(),
      w = workspace(() => pending.promise)
    w.state.messages = [{ id: 'private' }]
    const request = w.selectThread({ name: 'conv1' })
    w.actor.value = 'two@example.invalid'
    pending.resolve(history({}, [{ id: 'old actor' }]))
    await request
    expect(w.state.messages).toEqual([])
    expect(w.state.accounts).toEqual([])
    expect(w.state.conversation).toBeNull()
  })
  it('only materializes legacy history through the explicit selected account and peer', async () => {
    const rpc = vi.fn(async (method) =>
      method.endsWith('open_thread') ? doc() : history(),
    )
    const w = workspace(rpc)
    await w.selectThread({ ...account, peer_id: '5215550100000', name: null })
    expect(rpc.mock.calls[0]).toEqual([
      'crm.api.conversation_threads.open_thread',
      { provider: 'WhatsApp', account_id: '123', peer_id: '5215550100000' },
    ])
    expect(rpc.mock.calls.some(([name]) => /send|merge|lead/i.test(name))).toBe(
      false,
    )
  })
  it('retries an uncertain command with identical identity and fetches current state after replay', async () => {
    let fail = true
    const rpc = vi.fn(async (method) => {
      if (method.endsWith('apply_control')) {
        if (fail) throw new TypeError('Lost response')
        return doc({ generation: 2, replayed: true })
      }
      if (method.endsWith('get_history'))
        return history({ generation: 4, human_owner: 'other@example.invalid' })
      return { items: [], next_cursor: null }
    })
    const w = workspace(rpc)
    w.state.conversation = doc()
    w.state.account = account
    await w.applyControl('take', { reason: 'Explicit reason' })
    const frozen = { ...w.state.pending }
    expect(await w.selectAccount({ ...account, account_id: '456' })).toBe(false)
    expect(await w.selectThread({ name: 'other' })).toBe(false)
    fail = false
    await w.applyControl('close', {
      reason: 'must not replace pending command',
    })
    const commands = rpc.mock.calls.filter(([name]) =>
      name.endsWith('apply_control'),
    )
    expect(commands[0][1]).toEqual(frozen)
    expect(commands[1][1]).toEqual(frozen)
    expect(w.state.pending).toBeNull()
    expect(w.state.conversation.generation).toBe(4)
  })
  it('a generation conflict refreshes state and never automatically resubmits the action', async () => {
    const rpc = vi.fn(async (method) => {
      if (method.endsWith('apply_control'))
        throw { exc_type: 'TimestampMismatchError' }
      return history({ generation: 5 })
    })
    const w = workspace(rpc)
    w.state.conversation = doc()
    await w.applyControl('take')
    expect(w.state.pending).toBeNull()
    expect(w.state.conversation.generation).toBe(5)
    expect(w.state.error).toContain('Otra persona')
    expect(
      rpc.mock.calls.filter(([name]) => name.endsWith('apply_control')),
    ).toHaveLength(1)
  })
  it('a revoked permission clears history, ownership and pending command', async () => {
    const w = workspace(async () => {
      throw { exc_type: 'PermissionError' }
    })
    w.state.conversation = doc()
    w.state.messages = [{ id: 'sensitive' }]
    await w.applyControl('take')
    expect(w.state.pending).toBeNull()
    expect(w.state.conversation).toBeNull()
    expect(w.state.messages).toEqual([])
  })
  it('retains the mounted thread and history after a transient refresh failure, then recovers', async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network lost'))
      .mockResolvedValueOnce(history({ generation: 2 }, [{ id: 'fresh' }]))
    const w = workspace(rpc)
    w.state.conversation = doc()
    w.state.messages = [{ id: 'retained' }]
    expect(await w.loadHistory()).toBe(false)
    expect(w.state.conversation.name).toBe('conv1')
    expect(w.state.messages).toEqual([{ id: 'retained' }])
    expect(w.state.historyLoading).toBe(false)
    expect(w.state.error).toContain('No se pudo')
    expect(await w.loadHistory()).toBe(true)
    expect(w.state.conversation.generation).toBe(2)
    expect(w.state.messages).toEqual([{ id: 'fresh' }])
    expect(w.state.error).toBe('')
  })
  it('clears private state when a history refresh confirms revoked permission', async () => {
    const w = workspace(async () => {
      throw { exc_type: 'PermissionError' }
    })
    w.state.conversation = doc()
    w.state.messages = [{ id: 'sensitive' }]
    await w.loadHistory()
    expect(w.state.conversation).toBeNull()
    expect(w.state.messages).toEqual([])
    expect(w.state.historyLoading).toBe(false)
  })
})

describe('read-only customer presentation', () => {
  it('renders malicious message text inertly with no reply/reaction/send actions', () => {
    const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    const el = mount(MessengerArea, {
      messages: [
        {
          id: 'one',
          direction: 'in',
          content: attack,
          timestamp: '2026-01-01',
        },
      ],
    })
    expect(el.textContent).toContain(attack)
    expect(el.querySelector('img, script, button, form, textarea')).toBeNull()
    expect(el.querySelector('[class*="overflow-wrap:anywhere"]')).not.toBeNull()
  })
  it('renders exact account/peer choice and never creates from an arbitrary text entry', () => {
    const el = mount(ConversationQueue, {
      accounts: [account],
      account,
      threads: [
        {
          peer_id: '5215550100000',
          materialized: false,
          preview: '<script>no</script>',
        },
      ],
    })
    expect(el.textContent).toContain('123')
    expect(el.textContent).toContain('5215550100000')
    expect(el.textContent).toContain('Abrir historial de esta cuenta')
    expect(el.querySelector('input, textarea, script')).toBeNull()
  })
  it('offers only server-authorized control actions and preserves pending retry affordance', async () => {
    const retried = vi.fn()
    const el = mount(ConversationControls, {
      conversation: doc({ allowed_actions: ['request'] }),
      pending: { command_id: 'same' },
      onRetry: retried,
    })
    expect(el.querySelector('form')).toBeNull()
    expect(el.textContent).toContain('misma solicitud')
    el.querySelector('button').click()
    await nextTick()
    expect(retried).toHaveBeenCalledOnce()
  })
})
