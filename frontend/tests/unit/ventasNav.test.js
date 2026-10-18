// CRM-S5.1: Ventas shows the daily lists first; the rest folds under «Más»
// and «Configuración» (managers), with no shell module repeated inside it.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('frappe-ui', () => ({
  createResource: () => ({ data: null, fetch: () => {} }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => false }),
}))
vi.mock('@/utils/crmCapabilities', () => ({
  addonAvailable: { value: true },
  loadCapabilities: () => {},
  navItemVisible: () => true,
}))

const { VENTAS_SECTIONS, ventasSection, ventasSectionOf } = await import(
  '@/composables/ventasNav'
)
const { navItems, navItemsBottom, navItemAllowed } = await import(
  '@/composables/navModel'
)

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Map()
for (const m of po.matchAll(
  /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
))
  catalog.set(m[1], m[2])

const keys = (section) => ventasSection(section).map((item) => item.key)

describe('Ventas navigation (S5.1)', () => {
  it('opens on three daily lists: Tratos, Prospectos, Bandeja de entrada', () => {
    expect(keys('daily')).toEqual(['deals', 'prospectos', 'inbox'])
    expect(ventasSection('daily').map((item) => item.label)).toEqual([
      'Deals',
      'Prospectos',
      'Inbox',
    ])
  })

  it('never repeats a shell module (Agenda, Contactos) inside Ventas', () => {
    const all = [...keys('daily'), ...keys('more'), ...keys('settings')]
    expect(all).not.toContain('calendar')
    expect(all).not.toContain('contactos')
  })

  it('places every other Ventas screen exactly once', () => {
    const all = [...keys('daily'), ...keys('more'), ...keys('settings')]
    expect(new Set(all).size).toBe(all.length)
    const expected = [...navItems, ...navItemsBottom]
      .map((item) => item.key)
      // «Por aprobar» (wa-queue) is an Inbox space since CRM-S3.4, not a list.
      .filter((key) => !['calendar', 'contactos', 'wa-queue'].includes(key))
    expect([...all].sort()).toEqual([...expected].sort())
  })

  it('keeps set-up screens and the workload view for managers', () => {
    for (const item of ventasSection('settings')) {
      expect(navItemAllowed(item, { isManager: false })).toBe(false)
      expect(navItemAllowed(item, { isManager: true })).toBe(true)
    }
    const workload = ventasSection('more').find(
      (item) => item.key === 'workload',
    )
    expect(navItemAllowed(workload, { isManager: false })).toBe(false)
    for (const item of ventasSection('daily'))
      expect(navItemAllowed(item, { isManager: false })).toBe(true)
  })

  it('knows which section a page lives in, so its section opens', () => {
    expect(ventasSectionOf('/deals/view/list')).toBe('daily')
    expect(ventasSectionOf('/prospectos')).toBe('daily')
    expect(ventasSectionOf('/leads')).toBe('more')
    expect(ventasSectionOf('/inbox')).toBe('daily')
    expect(ventasSectionOf('/dashboard')).toBe('more')
    expect(ventasSectionOf('/whatsapp-queue')).toBe('daily')
    expect(ventasSectionOf('/automations/x')).toBe('settings')
    expect(ventasSectionOf('/agenda')).toBe('')
  })

  it('shows every label in Spanish', () => {
    // Labels written in Spanish in navModel are shown as they are.
    const spanishSource = new Set([
      'Prospectos',
      'Consultas',
      'Embudo',
      'Carga de trabajo',
    ])
    const labels = Object.keys(VENTAS_SECTIONS)
      .flatMap((section) => ventasSection(section))
      .map((item) => item.label)
      .concat(['Ventas', 'More', 'Other lists', 'Settings', 'Ventas sections'])
      .filter((label) => !spanishSource.has(label))
    const missing = labels.filter((label) => !catalog.get(label))
    expect(missing).toEqual([])
    expect(catalog.get('Lead list')).toBe('Lista de leads')
    expect(catalog.get('Deals')).toBe('Tratos')
  })
})

describe('legacy screens (Shell D3, S1.3)', () => {
  const router = readFileSync(resolve(here, '../../src/router.js'), 'utf8')
  const routeBlock = (path) => {
    const start = router.indexOf(`path: '${path}',`)
    expect(start, path).toBeGreaterThan(-1)
    return router.slice(start, router.indexOf('\n  },', start))
  }

  it('desk-only set-up screens are flagged in Más and on their routes', () => {
    const flagged = ['more', 'settings']
      .flatMap((section) => ventasSection(section))
      .filter((item) => item.desktopOnly)
      .map((item) => item.key)
    expect(flagged).toEqual([
      'leads',
      'campaigns',
      'forms',
      'social',
      'automations',
      'score-rules',
      'webshop',
    ])
    expect(ventasSection('daily').some((item) => item.desktopOnly)).toBe(false)
    for (const path of [
      '/campaigns',
      '/campaigns/:campaignId',
      '/chatflows',
      '/forms',
      '/forms/:formId',
      '/automations',
      '/score-rules',
      '/webshop',
      '/social',
      '/social/evergreen',
      '/social/mentions',
    ])
      expect(routeBlock(path), path).toMatch(/desktopOnly: true/)
  })

  it('the Consultas list, data import and the welcome page are retired', () => {
    expect(Object.values(VENTAS_SECTIONS).flat()).not.toContain('inquiries')
    expect([...navItems, ...navItemsBottom].map((i) => i.key)).not.toContain(
      'inquiries',
    )
    // A bare /inquiries opens Prospectos › Consultas; ?name= still opens one.
    expect(routeBlock('/inquiries')).toMatch(
      /to\.query\.name\s*\? true\s*: \{ path: '\/prospectos', query: \{ tipo: 'inquiry' \}/,
    )
    expect(router).toMatch(
      /\{ path: '\/welcome', name: 'Welcome', redirect: '\/hoy' \}/,
    )
    for (const path of [
      '/data-import',
      '/data-import/doctype/:doctype',
      '/data-import/:importName',
    ])
      expect(routeBlock(path), path).toMatch(/toDesk\(/)
    expect(router).not.toMatch(/pages\/(Welcome|DataImport)\.vue/)
  })

  it('the palette jumps to the Ventas lists from VENTAS_SECTIONS, never a retired one', async () => {
    vi.doMock('@/composables/useContactos', () => ({ contactosApi: vi.fn() }))
    const { VENTAS_PLACES } = await import('@/utils/shellPalette')
    expect(VENTAS_PLACES.map(([path]) => path)).toEqual([
      '/deals',
      '/prospectos',
      '/inbox',
      '/dashboard',
      '/call-logs',
      '/reports',
    ])
  })
})
