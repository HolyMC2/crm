import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  contactosApi,
  contactosReads,
  prefetchRecord,
  readRecord,
  useContactosBootstrap,
} from '../../src/composables/useContactos.js'

function answer(message) {
  return { ok: true, status: 200, json: async () => ({ message }) }
}

describe('Contactos request reuse', () => {
  let calls
  beforeEach(() => {
    contactosReads.clear()
    calls = []
    globalThis.fetch = vi.fn(async (url, init) => {
      const method = url.split('.').pop()
      calls.push(method)
      return answer({ method, args: JSON.parse(init.body || '{}') })
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    delete globalThis.fetch
  })

  it('a hover prefetch and the record open share one get_record', async () => {
    const ref = { source: 'contact', name: 'Ana' }
    prefetchRecord(ref)
    const record = await readRecord(ref)
    expect(record.args).toEqual(ref)
    expect(calls).toEqual(['get_record'])
    await readRecord(ref)
    expect(calls).toEqual(['get_record'])
  })

  it('a write clears cached reads, so the next open asks the server', async () => {
    const ref = { source: 'contact', name: 'Ana' }
    await readRecord(ref)
    await contactosApi('save_record', { payload: {}, request_id: 'x' })
    await readRecord(ref)
    expect(calls).toEqual(['get_record', 'save_record', 'get_record'])
  })

  it('a record older than 15 s is fetched again; fresh always asks', async () => {
    vi.useFakeTimers()
    const ref = { source: 'customer', name: 'C1' }
    await readRecord(ref)
    vi.advanceTimersByTime(16_000)
    await readRecord(ref)
    await readRecord(ref, { fresh: true })
    expect(calls).toEqual(['get_record', 'get_record', 'get_record'])
  })

  it('pages share one bootstrap and render a cached copy at once', async () => {
    const list = useContactosBootstrap()
    await list.ensure()
    const record = useContactosBootstrap()
    expect(record.boot.value).toEqual(list.boot.value)
    await record.ensure()
    expect(calls).toEqual(['bootstrap'])
    await record.reload()
    expect(calls).toEqual(['bootstrap', 'bootstrap'])
  })

  it('a stale bootstrap revalidates in the background without blocking', async () => {
    vi.useFakeTimers()
    const first = useContactosBootstrap()
    await first.ensure()
    vi.advanceTimersByTime(61_000)
    const again = useContactosBootstrap()
    const pending = again.ensure()
    expect(again.boot.value).not.toBeNull()
    await pending
    await vi.runAllTimersAsync()
    expect(calls).toEqual(['bootstrap', 'bootstrap'])
  })
})
