// Live lists (composables/liveList.js): a teammate's save refreshes the list
// once, the worker's own does not, a hidden tab waits, a reconnect catches up,
// and two lists of one doctype share its room through the tab's hub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createLiveSync } from '@/vendor/muelle-shell/live-sync'

vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'me@shop' }),
}))

import { useLiveList } from '@/composables/liveList'

function fakeSocket() {
  const handlers = {}
  return {
    connected: true,
    emitted: [],
    on: (event, fn) => ((handlers[event] ||= []).push(fn), undefined),
    off: (event, fn) =>
      (handlers[event] = (handlers[event] || []).filter((f) => f !== fn)),
    emit(...args) {
      this.emitted.push(args)
    },
    fire: (event, data) => (handlers[event] || []).forEach((fn) => fn(data)),
    count: (event) => (handlers[event] || []).length,
  }
}

const save = (doctype, name, user = 'ana@shop') => ({ doctype, name, user })

let apps = []
let socket
let hub
// The hub as the app runs it, minus the sibling-tab channel and the
// reconciliation timer; its first connect happens before any list mounts.
async function connect() {
  socket = fakeSocket()
  hub = createLiveSync({
    socket,
    channel: false,
    reconcileMs: 0,
    env: { random: () => 0 },
  })
  await Promise.resolve()
  await Promise.resolve()
}
function mount(doctype, refresh) {
  let live
  const app = createApp({
    setup() {
      live = useLiveList(doctype, refresh, {
        socket,
        hub,
        delay: 100,
        freshFor: 500,
      })
      return () => h('div')
    },
  })
  app.mount(document.createElement('div'))
  apps.push(app)
  return { live, app }
}
function unmount(app) {
  app.unmount()
  apps = apps.filter((a) => a !== app)
}

beforeEach(async () => {
  vi.useFakeTimers()
  await connect()
})
afterEach(() => {
  apps.forEach((app) => app.unmount())
  apps = []
  hub.destroy()
  vi.useRealTimers()
})

describe('live list', () => {
  it('joins the doctype room and refreshes once for a burst of saves by others', () => {
    const refresh = vi.fn()
    mount('Stock Entry', refresh)
    expect(socket.emitted).toEqual([['doctype_subscribe', 'Stock Entry']])
    socket.fire('list_update', save('Stock Entry', 'A'))
    socket.fire('list_update', save('Stock Entry', 'B'))
    socket.fire('list_update', save('Item', 'X'))
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores the worker’s own saves', () => {
    const refresh = vi.fn()
    mount('Stock Entry', refresh)
    socket.fire('list_update', save('Stock Entry', 'A', 'me@shop'))
    vi.advanceTimersByTime(150)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes when a teammate saved in the same burst as the worker', () => {
    const refresh = vi.fn()
    mount('Stock Entry', refresh)
    socket.fire('list_update', save('Stock Entry', 'A', 'me@shop'))
    socket.fire('list_update', save('Stock Entry', 'B'))
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits while the tab is hidden and refreshes on return', () => {
    const refresh = vi.fn()
    mount('CRM Deal', refresh)
    const state = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    socket.fire('list_update', save('CRM Deal', 'D'))
    vi.advanceTimersByTime(150)
    expect(refresh).not.toHaveBeenCalled()
    state.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
    state.mockRestore()
  })

  it('follows the doctype, joins several, and leaves on unmount', async () => {
    const doctype = ref(['Contact', 'Customer'])
    const { app } = mount(doctype, vi.fn())
    const listeners = socket.count('list_update')
    doctype.value = ['Customer', 'Supplier']
    await nextTick()
    unmount(app)
    expect(socket.emitted).toEqual([
      ['doctype_subscribe', 'Contact'],
      ['doctype_subscribe', 'Customer'],
      ['doctype_subscribe', 'Supplier'],
      ['doctype_unsubscribe', 'Contact'],
      ['doctype_unsubscribe', 'Customer'],
      ['doctype_unsubscribe', 'Supplier'],
    ])
    expect(socket.count('list_update')).toBe(listeners - 1)
  })

  it('keeps a room another list still shows when one of them leaves', () => {
    const leaving = mount('ToDo', vi.fn())
    const refresh = vi.fn()
    mount('ToDo', refresh)
    unmount(leaving.app)
    expect(socket.emitted).toEqual([['doctype_subscribe', 'ToDo']])
    socket.fire('list_update', save('ToDo', 'T1'))
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('after a dropped connection joins again and catches up', () => {
    const refresh = vi.fn()
    mount('CRM Call Log', refresh)
    socket.fire('connect')
    expect(socket.emitted.at(-1)).toEqual(['doctype_subscribe', 'CRM Call Log'])
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits for the socket before reading the list again', async () => {
    const refresh = vi.fn()
    mount('Communication', refresh)
    socket.connected = false
    hub.resync(false, 'reconcile')
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).not.toHaveBeenCalled()
    socket.connected = true
    socket.fire('connect')
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('is not live without a doctype', () => {
    const refresh = vi.fn()
    mount('', refresh)
    socket.fire('connect')
    vi.advanceTimersByTime(150)
    expect(socket.emitted).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('highlights only the rows that just appeared, for a moment', () => {
    const { live } = mount('CRM Lead', vi.fn())
    live.mark(['a', 'b'], ['c', 'a', 'b'])
    expect([...live.fresh.value]).toEqual(['c'])
    vi.advanceTimersByTime(600)
    expect(live.fresh.value.size).toBe(0)
  })
})
