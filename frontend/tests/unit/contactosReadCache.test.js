import { describe, expect, it, vi } from 'vitest'
import { createReadCache } from '../../src/utils/contactos.js'

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('Contactos read cache', () => {
  it('shares one in-flight request between callers of the same key', async () => {
    const cache = createReadCache()
    const answer = deferred()
    const fetcher = vi.fn(() => answer.promise)
    const first = cache.load('k', fetcher)
    const second = cache.load('k', fetcher)
    answer.resolve({ rows: [1] })
    expect(await first).toEqual({ rows: [1] })
    expect(await second).toBe(await first)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(cache.get('k').value).toEqual({ rows: [1] })
  })

  it('asks again with fresh even while a request is in flight', async () => {
    const cache = createReadCache()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new')
    const stale = cache.load('k', fetcher)
    const fresh = cache.load('k', fetcher, { fresh: true })
    expect(await stale).toBe('old')
    expect(await fresh).toBe('new')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps at most max entries, dropping the least recently used', async () => {
    const cache = createReadCache({ max: 2 })
    await cache.load('a', () => 1)
    await cache.load('b', () => 2)
    cache.get('a')
    await cache.load('c', () => 3)
    expect(cache.get('b')).toBeNull()
    expect(cache.get('a').value).toBe(1)
    expect(cache.size).toBe(2)
  })

  it('does not store an answer that arrives after clear()', async () => {
    const cache = createReadCache()
    const answer = deferred()
    const pending = cache.load('k', () => answer.promise)
    cache.clear()
    answer.resolve('before the write')
    expect(await pending).toBe('before the write')
    expect(cache.get('k')).toBeNull()
  })

  it('does not cache failures and lets the next caller retry', async () => {
    const cache = createReadCache()
    await expect(
      cache.load('k', () => Promise.reject(new Error('403'))),
    ).rejects.toThrow('403')
    expect(cache.get('k')).toBeNull()
    expect(await cache.load('k', () => 'ok')).toBe('ok')
  })
})
