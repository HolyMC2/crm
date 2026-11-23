// «Solicitudes de clientes» as a Ventas section: it shows only to whoever reads
// one of its queues on a site with an online store (the cell's counts), its
// count is the section's badge (and adds to the rail's Ventas badge on the
// cell), its page is /ventas/solicitudes-clientes, and the bell's links to
// /negocio/solicitudes-clientes land there for whoever has Ventas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({ counts: vi.fn(), call: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: (...args) => mocks.call(...args),
  createResource: () => ({ data: null, fetch: () => {} }),
}))
vi.mock('@/components/solicitudesClientes/api', () => ({
  readCounts: (...args) => mocks.counts(...args),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => false }),
}))
vi.mock('@/utils/crmCapabilities', async (importOriginal) => ({
  ...(await importOriginal()),
  addonAvailable: { value: true },
  loadCapabilities: () => {},
  navItemVisible: () => true,
}))

globalThis.__ = (text) => text

const counts = await import('@/components/solicitudesClientes/counts')
const { useVentasNav, ventasSection, ventasSectionOf } = await import(
  '@/composables/ventasNav'
)
const { routeGroup } = await import('@/composables/navModel')
const { shellBoot } = await import('@/composables/muelleShell')
const { default: appRouter } = await import('@/router')

const keys = (items) => items.map((item) => item.key)
const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

function mountNav() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)*', component: { render: () => null } }],
  })
  let nav
  const app = createApp({
    setup() {
      nav = useVentasNav()
      return () => h('div')
    },
  })
  app.use(router)
  app.mount(document.createElement('div'))
  return { nav, app, router }
}

let mounted
beforeEach(() => {
  mocks.counts.mockReset()
  mocks.call.mockReset()
  counts.resetSolicitudesCountsForTests()
})
afterEach(() => {
  mounted?.app.unmount()
  mounted = null
  shellBoot.value = null
})

describe('the Ventas section', () => {
  it('leads «Más» and lights its own group', () => {
    expect(keys(ventasSection('more'))[0]).toBe('solicitudes')
    const entry = ventasSection('more')[0]
    expect(entry).toMatchObject({
      label: 'Customer requests',
      to: '/ventas/solicitudes-clientes',
      badge: 'solicitudes',
      requires: 'solicitudes',
      managerOnly: false,
      desktopOnly: false,
    })
    expect(routeGroup('/ventas/solicitudes-clientes')).toBe('solicitudes')
    expect(ventasSectionOf('/ventas/solicitudes-clientes')).toBe('more')
    // the account page outside Ventas lights no Ventas list
    expect(routeGroup('/negocio/solicitudes-clientes')).toBe('')
  })

  it('shows to whoever reads a queue, with what waits as its badge', async () => {
    mocks.counts.mockResolvedValue({ count: 3, urgent: true })
    mounted = mountNav()
    expect(keys(mounted.nav.more.value)).not.toContain('solicitudes') // not read yet
    await flush()
    expect(mocks.counts).toHaveBeenCalledTimes(1)
    expect(keys(mounted.nav.more.value)[0]).toBe('solicitudes')
    expect(mounted.nav.badgeFor('solicitudes')).toBe(3)
    expect(mounted.nav.sectionBadge(mounted.nav.more.value)).toBe(3)
  })

  it('stays hidden from whoever reads no queue, or on a site without a store', async () => {
    mocks.counts.mockResolvedValue(null)
    mounted = mountNav()
    await flush()
    expect(keys(mounted.nav.more.value)).not.toContain('solicitudes')
    expect(mounted.nav.badgeFor('solicitudes')).toBe(0)
  })

  it('an older cell without the counts hides it, never breaks Ventas', async () => {
    mocks.counts.mockRejectedValue(new Error('not whitelisted'))
    mounted = mountNav()
    await flush()
    expect(counts.solicitudesCounts.value).toBeNull()
    expect(keys(mounted.nav.more.value)).not.toContain('solicitudes')
    expect(keys(mounted.nav.more.value)).toContain('dashboard')
  })

  it('reads again as the worker moves through Ventas, at most every 20 s', async () => {
    mocks.counts.mockResolvedValue({ count: 1, urgent: false })
    mounted = mountNav()
    await flush()
    await mounted.router.push('/deals')
    await flush()
    expect(mocks.counts).toHaveBeenCalledTimes(1) // fresher than the gap
    mocks.counts.mockResolvedValue({ count: 0, urgent: false })
    await counts.refreshSolicitudesCounts({ force: true })
    expect(mounted.nav.badgeFor('solicitudes')).toBe(0)
    // nothing waits: the section stays, with no badge
    expect(keys(mounted.nav.more.value)).toContain('solicitudes')
  })
})

describe('the counts it shares', () => {
  it('a failed read keeps the last figure it had', async () => {
    mocks.counts.mockResolvedValueOnce({ count: 2, urgent: false })
    await counts.refreshSolicitudesCounts()
    mocks.counts.mockRejectedValueOnce(new Error('blip'))
    await counts.refreshSolicitudesCounts({ force: true })
    expect(counts.solicitudesCounts.value).toEqual({ count: 2, urgent: false })
  })

  it('two asks at once read once', async () => {
    let resolve
    mocks.counts.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const first = counts.refreshSolicitudesCounts()
    const second = counts.refreshSolicitudesCounts({ force: true })
    resolve({ count: 1, urgent: true })
    await Promise.all([first, second])
    expect(mocks.counts).toHaveBeenCalledTimes(1)
    expect(counts.solicitudesBadge()).toBe(1)
  })
})

describe('its two pages', () => {
  const record = (name) => appRouter.getRoutes().find((r) => r.name === name)

  it('the Ventas section is a Ventas page', () => {
    const page = record('VentasSolicitudesClientes')
    expect(page.path).toBe('/ventas/solicitudes-clientes')
    expect(page.meta).toMatchObject({ app: 'ventas', ownPhoneHeader: true })
  })

  it('the bell’s link lands in Ventas for whoever has it', async () => {
    const enter = record('SolicitudesClientes').beforeEnter
    shellBoot.value = { modules: { ventas: { enabled: true } } }
    expect(
      await enter({ query: { id: 'rr:abc', cola: 'devoluciones' } }),
    ).toEqual({
      path: '/ventas/solicitudes-clientes',
      query: { id: 'rr:abc', cola: 'devoluciones' },
      replace: true,
    })
  })

  it('the accounts staff without Ventas keep the account page', async () => {
    const enter = record('SolicitudesClientes').beforeEnter
    shellBoot.value = { modules: { ventas: { enabled: false } } }
    expect(await enter({ query: { id: 'dp:SFDP-1' } })).toBeUndefined()
  })
})
