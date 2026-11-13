// PROD-4-a: the router's refusal branch (a Ventas route on a refused shell boot)
// asks the server who this browser is before it routes to Not Permitted, so
// that screen can offer sign-in instead of «Pedir acceso».
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: (...args) => state.call(...args),
}))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ isLoggedIn: true, user: 'ana@example.test' }),
}))
// Past the shell branch the guard reads the CRM users: that is as far as these
// tests need to see.
vi.mock('@/stores/users', () => ({
  usersStore: () => {
    throw new Error('past the shell refusal branch')
  },
}))

const { default: router } = await import('@/router')
const { resetShellForTests } = await import('@/composables/muelleShell')
const { resetSessionGuardForTests, sessionEnded } = await import(
  '@/utils/sessionGuard'
)

const refusal = () =>
  Object.assign(new Error('not whitelisted'), {
    status: 403,
    exc_type: 'PermissionError',
  })
const answer = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
})

beforeEach(() => {
  localStorage.clear()
  resetShellForTests()
  resetSessionGuardForTests()
  window.muelle_module = 'hoy'
  state.call.mockReset()
  state.call.mockRejectedValue(refusal())
  vi.unstubAllGlobals()
})

describe('the router after a refused shell boot', () => {
  it('Guest: Not Permitted with the route to come back to, and the session marked ended', async () => {
    const fetch = vi.fn(async () => answer(403, {}))
    vi.stubGlobal('fetch', fetch)
    await router.push('/deals?view=list')
    expect(router.currentRoute.value.name).toBe('Not Permitted')
    expect(router.currentRoute.value.query.intended).toBe('/deals?view=list')
    expect(fetch).toHaveBeenCalledWith(
      '/api/method/frappe.auth.get_logged_user',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(sessionEnded.value).toBe(true)
  })

  it('still signed in: Not Permitted as before, the session untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(200, { message: 'ana@example.test' })),
    )
    await router.push('/leads?view=list')
    expect(router.currentRoute.value.name).toBe('Not Permitted')
    expect(sessionEnded.value).toBe(false)
  })

  it('a server blip is no refusal: the route goes on and nobody asks', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    state.call.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(router.push('/deals?view=kanban')).rejects.toThrow(
      'past the shell refusal branch',
    )
    expect(router.currentRoute.value.query.intended).not.toBe(
      '/deals?view=kanban',
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
