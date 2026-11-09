// Ventas' own lists follow the same three layers as the bar (suggested →
// puesto → mine): the daily lists and «Más» as the boot's module layout
// arranges them, and «Ordenar Ventas» opens the sheet with both parts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  createResource: () => ({ data: null, fetch: () => {} }),
}))
// A manager sees every list, so the lists compare with the sections as shipped.
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => true }),
}))
vi.mock('@/utils/crmCapabilities', () => ({
  addonAvailable: { value: true },
  loadCapabilities: () => {},
  navItemVisible: () => true,
}))

globalThis.__ = (text) => text

const { useVentasNav, ventasSection } = await import('@/composables/ventasNav')
const { sectionsSheet, shellBoot } = await import('@/composables/muelleShell')

const keys = (items) => items.map((item) => item.key)

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
  return { nav, app }
}

describe('Ventas lists arranged per worker', () => {
  let mounted
  afterEach(() => {
    mounted?.app.unmount()
    shellBoot.value = null
    sectionsSheet.value = null
  })

  it('ships its daily lists first and the rest in Más when nobody arranged them', () => {
    shellBoot.value = { modules: {} }
    mounted = mountNav()
    expect(keys(mounted.nav.primary.value)).toEqual(
      keys(ventasSection('daily')),
    )
    expect(keys(mounted.nav.more.value)).toEqual(keys(ventasSection('more')))
  })

  it('follows the layout: its daily lists lead, a list moved down joins Más in order, a hidden one leaves Más', () => {
    const extra = keys(ventasSection('more'))
    shellBoot.value = {
      modules: {},
      module_layouts: {
        ventas: {
          dock: ['inbox', 'deals', extra[0]],
          order: ['prospectos', extra[2], extra[1]],
          hidden: [extra[1]],
          source: 'personal',
        },
      },
    }
    mounted = mountNav()
    // Fidelidad was named nowhere: a suggested daily list stays on top.
    expect(keys(mounted.nav.primary.value)).toEqual([
      'inbox',
      'deals',
      extra[0],
      'fidelidad',
    ])
    const more = keys(mounted.nav.more.value)
    expect(more.slice(0, 2)).toEqual(['prospectos', extra[2]])
    expect(more).not.toContain(extra[1])
    expect(more).not.toContain(extra[0])
  })

  it('«Ordenar Ventas» opens the sheet with the daily lists and the others', () => {
    shellBoot.value = { modules: {} }
    mounted = mountNav()
    mounted.nav.arrange()
    expect(sectionsSheet.value).toMatchObject({
      module: 'ventas',
      title: 'Ventas',
      top: keys(ventasSection('daily')),
      parts: { top: 'Daily lists', rest: 'Other lists' },
    })
    expect(keys(sectionsSheet.value.items)).toEqual([
      ...keys(ventasSection('daily')),
      ...keys(ventasSection('more')),
    ])
  })
})
