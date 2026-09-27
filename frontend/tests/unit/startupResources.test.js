import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  roots: [],
  settings: null,
  notifications: null,
}))

// Keep the pinned document/resource/config/request implementation. Only browser
// storage and transport, plus unrelated app plugins, are controlled here.
vi.mock('../../node_modules/frappe-ui/src/resources/local', () => ({
  getLocal: async () => null,
  saveLocal: vi.fn(),
  deleteLocal: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const config = await import('../../node_modules/frappe-ui/src/utils/config')
  const request = await import(
    '../../node_modules/frappe-ui/src/utils/frappeRequest'
  )
  const documents = await import(
    '../../node_modules/frappe-ui/src/resources/documentResource.js'
  )
  const resources = await import(
    '../../node_modules/frappe-ui/src/resources/resources.js'
  )
  const component = { render: () => null }
  return {
    ...config,
    ...request,
    ...documents,
    ...resources,
    FrappeUI: { install() {} },
    Button: component,
    Input: component,
    TextInput: component,
    FormControl: component,
    ErrorMessage: component,
    Dialog: component,
    Alert: component,
    Badge: component,
    FeatherIcon: component,
  }
})
vi.mock('frappe-ui/icons', () => ({ spritePlugin: { install() {} } }))
vi.mock('@/socket', () => ({ initSocket: () => ({}) }))
vi.mock('@/router', () => ({ default: { install() {} } }))
vi.mock('@/translation', () => ({ default: { install() {} } }))
vi.mock('@/utils/dialogs', () => ({ createDialog: vi.fn() }))
vi.mock('@/utils/pushNavigate', () => ({ listenForPushNavigation: vi.fn() }))
vi.mock('@/utils/startupTelemetry', () => ({ installTelemetry: vi.fn() }))
vi.mock('@/App.vue', async () => {
  // These real stores eagerly start requests while main's dependencies load,
  // before the body of main.js can configure the resource adapter.
  const { getSettings } = await import('@/stores/settings')
  const { notifications } = await import('@/stores/notifications')
  fixture.settings = getSettings()
  fixture.notifications = notifications
  const { getCurrentInstance, h } = await import('vue')
  return {
    default: {
      setup() {
        fixture.roots.push(getCurrentInstance())
        return () => h('div', 'CRM startup')
      },
    },
  }
})

let requests, listeners, originalLocation
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  fixture.roots.length = 0
  originalLocation = window.location.href
  document.body.innerHTML = '<div id="app"></div>'
  window.installed_apps = ['frappe', 'crm']
  window.csrf_token = 'fixture-csrf'
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      requests.push({ url: new URL(url, window.location.href), options })
      const message = String(url).includes('frappe.client.get')
        ? {
            doctype: 'FCRM Settings',
            name: 'FCRM Settings',
            brand_name: 'Tenant Sales',
          }
        : [{ name: 'fixture-notification', read: 0 }]
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
  listeners = vi.spyOn(document, 'addEventListener')
})
afterEach(() => {
  fixture.roots.forEach((root) => root.appContext.app.unmount())
  for (const [name, handler] of listeners.mock.calls) {
    if (name === 'visibilitychange') document.removeEventListener(name, handler)
  }
  window.location.href = originalLocation
  delete window.csrf_token
  delete window.installed_apps
  document.body.innerHTML = ''
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('uses native RPC and unwraps eager settings/notifications before mounting a deep link', async () => {
  window.location.href =
    'http://crm-roadmap.localhost:18060/crm/deals/fixture-deal'
  await import('@/main')
  await Promise.all([
    fixture.settings._settings.get.promise,
    fixture.notifications.promise,
  ])
  expect(requests.map(({ url }) => url.pathname).sort()).toEqual([
    '/api/method/crm.api.notifications.get_notifications',
    '/api/method/frappe.client.get',
  ])
  const settings = requests.find(({ url }) =>
    url.pathname.endsWith('frappe.client.get'),
  )
  expect(settings.url.searchParams.get('doctype')).toBe('FCRM Settings')
  expect(settings.url.searchParams.get('name')).toBe('FCRM Settings')
  for (const { options } of requests) {
    expect(options.headers['X-Frappe-CSRF-Token']).toBe('fixture-csrf')
    expect(options.headers.Accept).toBe('application/json')
  }
  expect(fixture.settings.settings.value.name).toBe('FCRM Settings')
  expect(fixture.settings.brand.name).toBe('Tenant Sales')
  expect(fixture.notifications.data).toEqual([
    { name: 'fixture-notification', read: 0 },
  ])
})
