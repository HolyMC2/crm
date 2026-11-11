// Every route has exactly one home: the module whose rail item a deep link
// lights (moduleKeyFor) is the route's own meta.app, the module its path sits
// under, or Ventas, never two of them at odds, and never Ventas by accident.
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn(async () => null),
}))

const { default: router } = await import('@/router')
const { hostedModules, moduleKeyFor } = await import(
  '@/composables/muelleShell'
)
const { moduleForPath } = await import('@/vendor/muelle-shell/contracts')
const { ACCOUNT_PAGES } = await import('@/utils/shellRoutes')
const { routeGroup } = await import('@/composables/navModel')
const { ventasSectionOf } = await import('@/composables/ventasNav')

const HOSTED = new Set(hostedModules.map((module) => module.key))
// The shell's own pages outside every module (Mi cuenta, Mi perfil).
const ACCOUNT = new Set(ACCOUNT_PAGES)
// Ventas pages no list leads to (reached from a record, a setting or a link):
// Ventas is their home on purpose. A new route lands here only by choice.
const VENTAS_WITHOUT_A_LIST = new Set([
  '/',
  '/:invalidpath',
  '/notes',
  '/notes/view/:viewType?',
  '/scripts',
  '/data-import',
  '/data-import/:importName',
  '/data-import/doctype/:doctype',
  '/ajustes/:slug/:name',
  '/onboarding',
])

const pages = router.getRoutes().filter((route) => !route.redirect)

describe('every route has exactly one home', () => {
  it('a route’s own module is one the shell hosts, or an account page', () => {
    const strays = pages
      .filter(
        (route) =>
          route.meta?.app &&
          !HOSTED.has(route.meta.app) &&
          !ACCOUNT.has(route.meta.app),
      )
      .map((route) => `${route.path} → ${route.meta.app}`)
    expect(strays).toEqual([])
  })

  it('its module and the module its path sits under never disagree', () => {
    const torn = pages.flatMap((route) => {
      const byPath = moduleForPath(route.path, hostedModules)?.key
      return route.meta?.app && byPath && byPath !== route.meta.app
        ? [`${route.path}: ${route.meta.app} or ${byPath}`]
        : []
    })
    expect(torn).toEqual([])
  })

  it('a route that names no module is a Ventas page, so a deep link lights Ventas and opens its section', () => {
    const orphans = []
    for (const route of pages) {
      if (route.meta?.app || moduleForPath(route.path, hostedModules)) continue
      expect(moduleKeyFor({ path: route.path, meta: route.meta })).toBe(
        'ventas',
      )
      if (VENTAS_WITHOUT_A_LIST.has(route.path)) continue
      if (!routeGroup(route.path) || !ventasSectionOf(route.path))
        orphans.push(route.path)
    }
    expect(orphans).toEqual([])
  })

  it('the Ventas pages without a list still exist', () => {
    const paths = new Set(pages.map((route) => route.path))
    expect(
      [...VENTAS_WITHOUT_A_LIST].filter((path) => !paths.has(path)),
    ).toEqual([])
  })

  it('each rail item opens a page of its own module', () => {
    const wrong = hostedModules.flatMap((module) => {
      const to = router.resolve(module.to)
      const page = to.matched.at(-1)
      const home = moduleKeyFor({ path: to.path, meta: to.meta })
      return !page || page.path === '/:invalidpath' || home !== module.key
        ? [`${module.key}: ${module.to} → ${page?.path} (${home})`]
        : []
    })
    expect(wrong).toEqual([])
  })
})

describe('the account pages', () => {
  it('are one route each, outside every module and every rail item', () => {
    const account = pages.filter((route) => ACCOUNT.has(route.meta?.app))
    expect(account.map((route) => [route.path, route.meta.app])).toEqual([
      ['/cuenta', 'cuenta'],
      ['/perfil', 'perfil'],
    ])
    for (const route of account) {
      expect(moduleForPath(route.path, hostedModules)).toBeNull()
      expect(moduleKeyFor({ path: route.path, meta: route.meta })).toBe(
        route.meta.app,
      )
    }
  })
})
