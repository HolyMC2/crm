// Live lists (composables/liveList.js): a teammate's save refreshes the list
// once, the worker's own does not, a hidden tab waits, a reconnect catches up.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

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

let app
let root
function mount(doctype, refresh, socket) {
  let live
  root = document.createElement('div')
  app = createApp({
    setup() {
      live = useLiveList(doctype, refresh, {
        socket,
        delay: 100,
        freshFor: 500,
      })
      return () => h('div')
    },
  })
  app.mount(root)
  return live
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
})

describe('live list', () => {
  it('joins the doctype room and refreshes once for a burst of saves by others', () => {
    const socket = fakeSocket()
    const refresh = vi.fn()
    mount('Stock Entry', refresh, socket)
    expect(socket.emitted).toEqual([['doctype_subscribe', 'Stock Entry']])
    socket.fire('list_update', {
      doctype: 'Stock Entry',
      name: 'A',
      user: 'ana@shop',
    })
    socket.fire('list_update', {
      doctype: 'Stock Entry',
      name: 'B',
      user: 'ana@shop',
    })
    socket.fire('list_update', { doctype: 'Item', name: 'X', user: 'ana@shop' })
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores the worker’s own saves', () => {
    const socket = fakeSocket()
    const refresh = vi.fn()
    mount('Stock Entry', refresh, socket)
    socket.fire('list_update', {
      doctype: 'Stock Entry',
      name: 'A',
      user: 'me@shop',
    })
    vi.advanceTimersByTime(150)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('waits while the tab is hidden and refreshes on return', () => {
    const socket = fakeSocket()
    const refresh = vi.fn()
    mount('CRM Deal', refresh, socket)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    socket.fire('list_update', {
      doctype: 'CRM Deal',
      name: 'D',
      user: 'ana@shop',
    })
    vi.advanceTimersByTime(150)
    expect(refresh).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).toHaveBeenCalledTimes(1)
    hidden.mockRestore()
  })

  it('follows the doctype, joins several, and leaves on unmount', async () => {
    const socket = fakeSocket()
    const doctype = ref(['Contact', 'Customer'])
    mount(doctype, vi.fn(), socket)
    doctype.value = ['Customer', 'Supplier']
    await nextTick()
    app.unmount()
    app = null
    expect(socket.emitted).toEqual([
      ['doctype_subscribe', 'Contact'],
      ['doctype_subscribe', 'Customer'],
      ['doctype_unsubscribe', 'Contact'],
      ['doctype_subscribe', 'Supplier'],
      ['doctype_unsubscribe', 'Customer'],
      ['doctype_unsubscribe', 'Supplier'],
    ])
    expect(socket.count('list_update')).toBe(0)
  })

  it('after a dropped connection joins again and catches up', () => {
    const socket = fakeSocket()
    const refresh = vi.fn()
    mount('CRM Call Log', refresh, socket)
    socket.fire('connect')
    expect(socket.emitted.at(-1)).toEqual(['doctype_subscribe', 'CRM Call Log'])
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('highlights only the rows that just appeared, for a moment', () => {
    const live = mount('CRM Lead', vi.fn(), fakeSocket())
    live.mark(['a', 'b'], ['c', 'a', 'b'])
    expect([...live.fresh.value]).toEqual(['c'])
    vi.advanceTimersByTime(600)
    expect(live.fresh.value.size).toBe(0)
  })
})
