// A System Manager's full user list fetches after the first route has settled,
// not inside the first screen's own read window; other roles never ask for it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'

const api = vi.hoisted(() => ({
  resources: [],
  router: { isReady: () => Promise.resolve() },
  afterFirstRoute: vi.fn(),
}))
vi.mock('frappe-ui', () => ({
  createResource: (options) => {
    const resource = reactive({ ...options, data: null, fetch: vi.fn() })
    api.resources.push(resource)
    return resource
  },
}))
vi.mock('vue-router', () => ({ useRouter: () => api.router }))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ana@example.test' }),
}))
vi.mock('@/utils/prefetch', () => ({
  afterFirstRoute: (...args) => api.afterFirstRoute(...args),
}))

import { usersStore } from '@/stores/users'

const resource = (match) => api.resources.find(match)

function boot(role) {
  setActivePinia(createPinia())
  const store = usersStore()
  const users = resource(
    (r) => r.url === 'crm.api.session.get_users' && !r.params,
  )
  const me = { name: 'ana@example.test', email: 'ana@example.test', role }
  users.data = users.transform([[me], [me]])
  users.onSuccess()
  return {
    store,
    full: resource((r) => r.params?.include_all === 1),
  }
}

beforeEach(() => {
  api.resources.length = 0
  api.afterFirstRoute.mockReset()
})

describe('the full user list', () => {
  it('waits for the first route for a System Manager, then fetches once', () => {
    const { full } = boot('System Manager')
    expect(api.afterFirstRoute).toHaveBeenCalledTimes(1)
    const [router, work] = api.afterFirstRoute.mock.calls[0]
    expect(router).toBe(api.router)
    expect(full.fetch).not.toHaveBeenCalled()
    work()
    expect(full.fetch).toHaveBeenCalledTimes(1)
  })

  it('is never scheduled for a Sales User', () => {
    const { full } = boot('Sales User')
    expect(api.afterFirstRoute).not.toHaveBeenCalled()
    expect(full.fetch).not.toHaveBeenCalled()
  })
})
