// The desktop rail's Ventas tile links to /ventas. Since everyone lands on Hoy
// (Home → Hoy), /ventas has its own landing: through the real router it opens
// the Inbox, never Hoy (which carries no Ventas sidebar).
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ isLoggedIn: true, user: 'ana@example.test' }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: {
      fetched: true,
      data: { crmUsers: [{ name: 'ana@example.test' }] },
    },
    isCrmUser: () => true,
    isAdmin: () => false,
    isManager: () => false,
  }),
}))
vi.mock('@/utils/hoyPrefetch', () => ({ prefetchHoy: () => {} }))
vi.mock('@/pages/Hoy.vue', () => ({ default: { render: () => null } }))
vi.mock('@/pages/Inbox.vue', () => ({ default: { render: () => null } }))

window.installed_apps = ['frappe', 'erpnext', 'crm', 'doco_marketing']
const { default: router } = await import('@/router')

beforeEach(async () => {
  delete window.muelle_module
  await router.push('/hoy')
})

describe('the Ventas module home', () => {
  it('/ventas opens the Inbox, not Hoy', async () => {
    await router.push('/ventas')
    expect(router.currentRoute.value.name).toBe('Inbox')
  })

  it('/ (Home) still lands on Hoy', async () => {
    await router.push('/inbox')
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('Hoy')
  })
})
