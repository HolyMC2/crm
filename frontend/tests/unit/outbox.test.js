// Offline outbox: enqueue/persist, FIFO flush, transient-vs-permanent failures,
// per-user key. Module has boot-time listeners → fresh import per scenario.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: `call` is deliberately NOT a vi.fn(). vitest 4's spy-results
// bookkeeping flags rejected promises returned through a spy as unhandled
// whenever any mock hook (mockReset/mockClear) exists in the file — a false
// positive (probe-tested 2026-07-25). Plain function + manual log sidesteps it.
const calls = []
let callBehavior = async () => ({})
const call = (...a) => {
  calls.push(a)
  return callBehavior(...a)
}
vi.mock('frappe-ui', () => ({
  call: (...a) => call(...a),
  toast: { success: vi.fn(), error: vi.fn() },
}))

async function fresh({ user = 'me%40x.com' } = {}) {
  vi.resetModules()
  localStorage.clear()
  document.cookie = `user_id=${user}`
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  return await import('@/composables/outbox')
}

const item = (msg = 'hola', over = {}) => ({
  reference_doctype: 'CRM Deal',
  reference_name: 'D-1',
  message: msg,
  to: '5216690000000',
  ...over,
})

beforeEach(() => {
  calls.length = 0
  callBehavior = async () => ({})
})

describe('outbox', () => {
  it('enqueues + persists under the per-user key', async () => {
    const ob = await fresh()
    ob.enqueueOutbox(item())
    expect(ob.outbox.value).toHaveLength(1)
    const stored = JSON.parse(localStorage.getItem('doco-wa-outbox-v1:me@x.com'))
    expect(stored[0].message).toBe('hola')
  })

  it('flushes FIFO and clears the queue on success', async () => {
    const ob = await fresh()
    callBehavior = async () => 'WAMSG-1'
    ob.enqueueOutbox(item('uno'))
    ob.enqueueOutbox(item('dos'))
    await ob.flushOutbox()
    expect(calls.length).toBe(2)
    expect(calls[0][1].message).toBe('uno')
    expect(calls[1][1].message).toBe('dos')
    expect(ob.outbox.value).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('doco-wa-outbox-v1:me@x.com'))).toEqual([])
  })

  it('a transient failure stops the flush and keeps the item for retry', async () => {
    const ob = await fresh()
    let first = true
    callBehavior = async () => {
      if (first) {
        first = false
        throw new Error('net')
      }
      return 'WAMSG-2'
    }
    ob.enqueueOutbox(item('uno'))
    ob.enqueueOutbox(item('dos'))
    await ob.flushOutbox()
    expect(ob.outbox.value).toHaveLength(2)
    expect(ob.outbox.value[0]._attempts).toBe(1)
    // next trigger succeeds for both (behavior already flipped after first failure)
    await ob.flushOutbox()
    expect(ob.outbox.value).toHaveLength(0)
  })

  it('drops an item after MAX_ATTEMPTS with a warning (never loops forever)', async () => {
    const ob = await fresh()
    const { toast } = await import('frappe-ui')
    callBehavior = async () => {
      throw new Error('perm')
    }
    ob.enqueueOutbox(item('maldito'))
    for (let i = 0; i < 5; i++) await ob.flushOutbox()
    expect(ob.outbox.value).toHaveLength(0)
    expect(toast.error).toHaveBeenCalled()
  })

  it('does not flush while offline', async () => {
    const ob = await fresh()
    ob.enqueueOutbox(item())
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    await ob.flushOutbox()
    expect(calls.length).toBe(0)
    expect(ob.outbox.value).toHaveLength(1)
  })

  it('discardOutbox removes exactly one item', async () => {
    const ob = await fresh()
    ob.enqueueOutbox(item('uno'))
    ob.enqueueOutbox(item('dos'))
    ob.discardOutbox(0)
    expect(ob.outbox.value.map((m) => m.message)).toEqual(['dos'])
  })
})
