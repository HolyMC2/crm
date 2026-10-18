import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))

import {
  BOOT_CACHE_PREFIX,
  loadShell,
  resetShellForTests,
  shellBoot,
  shellBootStale,
  shellError,
} from '@/composables/muelleShell'
import { bootScope } from '@/vendor/muelle-shell/contracts'

const fresh = (extra = {}) => ({
  user: { name: 'ana@example.test' },
  modules: { productos: { key: 'productos', enabled: true } },
  ...extra,
})
const key = () =>
  BOOT_CACHE_PREFIX + bootScope(window.site_name || location.host, '')
function save(boot, at = Date.now()) {
  localStorage.setItem(key(), JSON.stringify({ at, boot }))
}
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  resetShellForTests()
  state.call.mockReset()
})

describe('the shell boots from the saved boot, then the fresh one', () => {
  it('a reload paints the saved modules at once and swaps in the fresh boot', async () => {
    save(fresh({ company: 'Old' }))
    const answer = deferred()
    state.call.mockReturnValue(answer.promise)
    const loading = loadShell({ refresh: true })
    // Before the server answers: the worker already has their modules.
    expect(shellBoot.value.company).toBe('Old')
    expect(shellBootStale.value).toBe(true)
    answer.resolve(fresh({ company: 'New' }))
    await loading
    expect(shellBoot.value.company).toBe('New')
    expect(shellBootStale.value).toBe(false)
    expect(JSON.parse(localStorage.getItem(key())).boot.company).toBe('New')
  })

  it('without a saved boot it waits for the server, as before', async () => {
    state.call.mockResolvedValue(fresh())
    const loading = loadShell()
    expect(shellBoot.value).toBeNull()
    await loading
    expect(shellBoot.value.user.name).toBe('ana@example.test')
  })

  it('a saved boot older than a week is ignored', async () => {
    save(fresh(), Date.now() - 8 * 24 * 3600 * 1000)
    state.call.mockReturnValue(new Promise(() => {}))
    loadShell()
    expect(shellBoot.value).toBeNull()
  })

  it('a refusal from the server drops the saved boot and shows the reason', async () => {
    save(fresh())
    const error = Object.assign(new Error('nope'), {
      status: 403,
      exc_type: 'PermissionError',
      messages: ['No tienes permiso para abrir esta app.'],
    })
    state.call.mockRejectedValue(error)
    await expect(loadShell({ refresh: true })).rejects.toBe(error)
    expect(shellBoot.value).toBeNull()
    expect(shellError.value).toBe('No tienes permiso para abrir esta app.')
    expect(localStorage.getItem(key())).toBeNull()
  })

  it('offline, the worker keeps working on the saved boot without an error', async () => {
    save(fresh({ company: 'Saved' }))
    state.call.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(loadShell({ refresh: true })).resolves.toMatchObject({
      company: 'Saved',
    })
    expect(shellBoot.value.company).toBe('Saved')
    expect(shellError.value).toBe('')
    expect(localStorage.getItem(key())).not.toBeNull()
  })

  it('sign-out sweeps the saved boot with the other per-user shell keys', () => {
    const session = readFileSync(
      resolve(__dirname, '../../src/stores/session.js'),
      'utf8',
    )
    expect(session).toContain("k.startsWith('muelle:boot:')")
  })
})

describe('the saved boot follows the roles+permissions scope (DD18)', () => {
  const site = () => window.site_name || location.host
  const scoped = (scope) => BOOT_CACHE_PREFIX + bootScope(site(), '', scope)
  afterEach(() => {
    delete window.shell_scope
  })

  it('after a role change the old copy is not painted and is dropped', async () => {
    localStorage.setItem(
      scoped('old123'),
      JSON.stringify({ at: Date.now(), boot: fresh({ company: 'Old' }) }),
    )
    window.shell_scope = 'new456'
    const answer = deferred()
    state.call.mockReturnValue(answer.promise)
    const loading = loadShell({ refresh: true })
    expect(shellBoot.value).toBeNull()
    answer.resolve(fresh({ company: 'New' }))
    await loading
    expect(shellBoot.value.company).toBe('New')
    expect(localStorage.getItem(scoped('new456'))).not.toBeNull()
    expect(localStorage.getItem(scoped('old123'))).toBeNull()
  })

  it('the same scope paints the saved copy at once', () => {
    window.shell_scope = 'same789'
    localStorage.setItem(
      scoped('same789'),
      JSON.stringify({ at: Date.now(), boot: fresh({ company: 'Saved' }) }),
    )
    state.call.mockReturnValue(new Promise(() => {}))
    loadShell({ refresh: true })
    expect(shellBoot.value.company).toBe('Saved')
  })
})
