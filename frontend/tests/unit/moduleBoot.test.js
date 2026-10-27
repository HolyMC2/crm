import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createModuleBoot } from '@/utils/moduleBoot'
import { readCachedList, writeCachedList } from '@/utils/listCache'

beforeEach(() => {
  // currentScope() reads the page boot's scope and the user cookie.
  window.site_name = 'muelle.test'
  window.shell_scope = 'abc123'
  document.cookie = 'user_id=ana%40example.test'
  localStorage.clear()
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const flush = () => new Promise((done) => setTimeout(done))

describe('a module boot is kept like the shell boot', () => {
  it('a first visit waits for the server and keeps its answer', async () => {
    const fetch = vi.fn().mockResolvedValue({ enabled: true, can_buy: true })
    const { boot, load } = createModuleBoot('compras', fetch)
    await expect(load()).resolves.toEqual({ enabled: true, can_buy: true })
    expect(boot.value).toEqual({ enabled: true, can_buy: true })
    expect(readCachedList('boot:compras')).toEqual({
      enabled: true,
      can_buy: true,
    })
    // The same page load asks once.
    await load()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a fresh visit answers from the saved copy while the server answers', async () => {
    writeCachedList('boot:compras', { enabled: true, can_buy: false })
    const server = deferred()
    const fetch = vi.fn(() => server.promise)
    const { boot, load } = createModuleBoot('compras', fetch)
    await expect(load()).resolves.toEqual({ enabled: true, can_buy: false })
    expect(fetch).toHaveBeenCalledTimes(1)
    server.resolve({ enabled: true, can_buy: true })
    await flush()
    expect(boot.value).toEqual({ enabled: true, can_buy: true })
    expect(readCachedList('boot:compras')).toEqual({
      enabled: true,
      can_buy: true,
    })
    await load()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a refusal drops the copy and shows the module as unavailable', async () => {
    writeCachedList('boot:gastos', { enabled: true })
    const fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('no'), { exc_type: 'PermissionError' }),
      )
    const { boot, load } = createModuleBoot('gastos', fetch)
    await load()
    await flush()
    expect(boot.value).toEqual({ enabled: false, failed: true })
    expect(readCachedList('boot:gastos')).toBeNull()
  })

  it('offline keeps the saved copy; without one the page sees the failure', async () => {
    writeCachedList('boot:equipo', { enabled: true })
    const offline = Object.assign(new Error('offline'), { offline: true })
    const kept = createModuleBoot('equipo', () => Promise.reject(offline))
    await kept.load()
    await flush()
    expect(kept.boot.value).toEqual({ enabled: true })
    expect(readCachedList('boot:equipo')).toEqual({ enabled: true })

    const fresh = createModuleBoot(
      'productos',
      () => Promise.reject(Object.assign(offline, { messages: ['Sin red'] })),
      {
        failed: (error) => ({
          enabled: false,
          failed: true,
          reason: error.messages.join(' '),
        }),
      },
    )
    await expect(fresh.load()).resolves.toEqual({
      enabled: false,
      failed: true,
      reason: 'Sin red',
    })
  })

  it('a retry waits for the server even with a copy on screen', async () => {
    writeCachedList('boot:manual', { enabled: false })
    const fetch = vi.fn().mockResolvedValue({ enabled: true })
    const { load } = createModuleBoot('manual', fetch)
    await expect(load({ refresh: true })).resolves.toEqual({ enabled: true })
  })

  it('another user never sees the copy', async () => {
    writeCachedList('boot:cobranza', { enabled: true })
    document.cookie = 'user_id=beto%40example.test'
    const server = deferred()
    const { load } = createModuleBoot('cobranza', () => server.promise)
    const answer = load()
    server.resolve({ enabled: false })
    await expect(answer).resolves.toEqual({ enabled: false })
  })

  it('a blank answer stands in with the module default', async () => {
    const { load } = createModuleBoot('captura', () => Promise.resolve(null), {
      empty: { targets: {} },
    })
    await expect(load()).resolves.toEqual({ targets: {} })
    expect(readCachedList('boot:captura')).toBeNull()
  })
})
