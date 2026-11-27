// The shell's live sign (composables/liveConnection.js, shell/LiveSign.vue):
// nothing while the lists follow along or after a short drop; past the grace
// a grey cloud with the time they stopped; a tap reconnects at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'

const fixture = vi.hoisted(() => ({ socket: null, online: null }))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $socket: fixture.socket }),
}))
vi.mock('@vueuse/core', () => ({ useOnline: () => fixture.online }))

function fakeSocket() {
  const handlers = {}
  return {
    connected: true,
    on: (event, fn) => (handlers[event] ||= []).push(fn),
    off: (event, fn) =>
      (handlers[event] = (handlers[event] || []).filter((f) => f !== fn)),
    fire(event) {
      this.connected = event === 'connect'
      for (const fn of handlers[event] || []) fn()
    },
    disconnect: vi.fn(),
    connect: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 26, 12, 41, 30))
  vi.resetModules()
  fixture.socket = fakeSocket()
  fixture.online = ref(true)
})
let app
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
})

async function shell(props = {}) {
  const { default: LiveSign } = await import('@/components/shell/LiveSign.vue')
  const root = document.createElement('div')
  app = createApp(LiveSign, props)
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  return root
}
const sign = (root) => root.querySelector('[data-testid="live-sign"]')
const label = (root) => sign(root)?.getAttribute('aria-label')
async function tap(root) {
  sign(root).click()
  await nextTick()
}

describe('the live sign', () => {
  it('stays away while connected and through a drop shorter than the grace', async () => {
    const root = await shell()
    expect(sign(root)).toBeNull()
    fixture.socket.fire('disconnect')
    vi.advanceTimersByTime(9_000)
    fixture.socket.fire('connect')
    vi.advanceTimersByTime(5_000)
    await nextTick()
    expect(sign(root)).toBeNull()
  })

  it('shows the time the lists stopped once the drop outlasts the grace', async () => {
    const root = await shell()
    fixture.socket.fire('disconnect')
    vi.advanceTimersByTime(4_000)
    // socket.io's own attempts fail meanwhile; the drop keeps its first time.
    fixture.socket.fire('connect_error')
    vi.advanceTimersByTime(6_000)
    await nextTick()
    expect(label(root)).toBe('Reconnect: lists have not updated since 12:41')
    fixture.socket.fire('connect')
    await nextTick()
    expect(sign(root)).toBeNull()
  })

  it('reads the words and the time in the rail with names', async () => {
    const root = await shell({ rail: true, expanded: true })
    fixture.socket.fire('disconnect')
    vi.advanceTimersByTime(10_000)
    await nextTick()
    const words = [...sign(root).querySelectorAll('span:not([class*=lucide])')]
    expect(words.map((span) => span.textContent.trim())).toEqual([
      'Not updating',
      '12:41',
    ])
  })

  it('leaves an offline browser to the amber banner', async () => {
    const root = await shell()
    fixture.online.value = false
    fixture.socket.fire('disconnect')
    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(sign(root)).toBeNull()
    fixture.online.value = true
    await nextTick()
    expect(sign(root)).not.toBeNull()
  })

  it('reconnects at once on a tap instead of waiting for the next attempt', async () => {
    const root = await shell()
    fixture.socket.fire('disconnect')
    vi.advanceTimersByTime(10_000)
    await nextTick()
    await tap(root)
    expect(fixture.socket.disconnect).toHaveBeenCalledOnce()
    expect(fixture.socket.connect).toHaveBeenCalledOnce()
    expect(label(root)).toBe('Reconnecting…')
    // A second tap while it tries does not start another attempt.
    await tap(root)
    expect(fixture.socket.connect).toHaveBeenCalledOnce()
    // The attempt fails: the cloud and its first time come back.
    fixture.socket.fire('connect_error')
    await nextTick()
    expect(label(root)).toBe('Reconnect: lists have not updated since 12:41')
  })

  it('is never down without the app socket', async () => {
    fixture.socket = null
    const root = await shell()
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(sign(root)).toBeNull()
  })
})
