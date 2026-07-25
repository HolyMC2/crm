// Collision-detection presence map: own-echo filtering, per-state TTLs, prune.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('frappe-ui', () => ({
  createResource: (opts = {}) => ({
    url: opts.url,
    data: null,
    submit: vi.fn(async () => null),
    fetch: vi.fn(),
    reload: vi.fn(),
  }),
  call: vi.fn(async () => ({})),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/utils/statusGuard', () => ({ guardStatusChange: vi.fn() }))

async function fresh() {
  vi.resetModules()
  localStorage.clear()
  document.cookie = 'user_id=me%40x.com'
  return await import('@/composables/inbox')
}

const ev = (over = {}) => ({
  doctype: 'CRM Deal',
  deal: 'D-1',
  user: 'peer@x.com',
  full_name: 'Peer',
  state: 'viewing',
  ...over,
})

describe('presence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('records a peer and exposes it for the active conversation', async () => {
    const inbox = await fresh()
    inbox.activeDeal.value = 'D-1'
    inbox.onPresenceEvent(ev())
    expect(inbox.activePresence.value).toHaveLength(1)
    expect(inbox.activePresence.value[0].full_name).toBe('Peer')
  })

  it('filters own echoes by the user_id cookie', async () => {
    const inbox = await fresh()
    inbox.activeDeal.value = 'D-1'
    inbox.onPresenceEvent(ev({ user: 'me@x.com' }))
    expect(inbox.activePresence.value).toHaveLength(0)
  })

  it('typing fades at 6s; viewing survives past its 20s heartbeat', async () => {
    const inbox = await fresh()
    inbox.activeDeal.value = 'D-1'
    inbox.onPresenceEvent(ev({ state: 'typing', user: 't@x.com' }))
    inbox.onPresenceEvent(ev({ state: 'viewing', user: 'v@x.com' }))
    await vi.advanceTimersByTimeAsync(9000) // > typing TTL, < viewing TTL
    const states = inbox.activePresence.value.map((p) => p.state)
    expect(states).toEqual(['viewing'])
    await vi.advanceTimersByTimeAsync(20000) // > viewing TTL
    expect(inbox.activePresence.value).toHaveLength(0)
  })

  it('a later event refreshes the same user instead of duplicating', async () => {
    const inbox = await fresh()
    inbox.activeDeal.value = 'D-1'
    inbox.onPresenceEvent(ev({ state: 'viewing' }))
    inbox.onPresenceEvent(ev({ state: 'typing' }))
    expect(inbox.activePresence.value).toHaveLength(1)
    expect(inbox.activePresence.value[0].state).toBe('typing')
  })

  it('other conversations do not leak into activePresence', async () => {
    const inbox = await fresh()
    inbox.activeDeal.value = 'D-2'
    inbox.onPresenceEvent(ev({ deal: 'D-1' }))
    expect(inbox.activePresence.value).toHaveLength(0)
  })
})
