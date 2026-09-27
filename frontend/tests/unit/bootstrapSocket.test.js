import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  sockets: [],
  roots: [],
  mountedSockets: [],
  request: vi.fn(),
  setConfig: vi.fn(),
  cachedResource: vi.fn(),
  cachedList: vi.fn(),
  pushNavigation: vi.fn(),
  dialog: vi.fn(),
  router: { install: vi.fn() },
  translation: { install: vi.fn() },
  sprite: { install: vi.fn() },
  startupTelemetry: vi.fn(),
  resources: { install: vi.fn() },
}))

// The resource plugin imports extensionless JavaScript that Node cannot load
// when Vitest externalizes dependencies. Verify its real parent delegation;
// resource behavior itself is outside this bootstrap test.
vi.mock('../../node_modules/frappe-ui/src/resources/plugin', () => ({
  default: fixture.resources,
}))

vi.mock('socket.io-client', () => ({
  io: vi.fn((url, options) => {
    const socket = { url, options, on: vi.fn(), io: { on: vi.fn() } }
    fixture.sockets.push(socket)
    return socket
  }),
}))
vi.mock('frappe-ui', async () => {
  // Exercise the pinned plugin's real option defaults and socket initializer.
  const { default: FrappeUI } =
    await import('../../node_modules/frappe-ui/src/utils/plugin')
  const component = { render: () => null }
  return {
    FrappeUI,
    Button: component,
    Input: component,
    TextInput: component,
    FormControl: component,
    ErrorMessage: component,
    Dialog: component,
    Alert: component,
    Badge: component,
    FeatherIcon: component,
    setConfig: fixture.setConfig,
    frappeRequest: fixture.request,
    getCachedResource: fixture.cachedResource,
    getCachedListResource: fixture.cachedList,
  }
})
vi.mock('@/utils/startupTelemetry', () => ({
  installTelemetry: fixture.startupTelemetry,
}))
vi.mock('frappe-ui/icons', () => ({ spritePlugin: fixture.sprite }))
vi.mock('@/router', () => ({ default: fixture.router }))
vi.mock('@/translation', () => ({ default: fixture.translation }))
vi.mock('@/utils/dialogs', () => ({ createDialog: fixture.dialog }))
vi.mock('@/utils/pushNavigate', () => ({
  listenForPushNavigation: fixture.pushNavigation,
}))
vi.mock('@/App.vue', async () => {
  const { getCurrentInstance, h } = await import('vue')
  return {
    default: {
      setup() {
        const root = getCurrentInstance()
        fixture.roots.push(root)
        fixture.mountedSockets.push(root.proxy.$socket)
        return () => h('div', 'CRM bootstrap fixture')
      },
    },
  }
})

let listeners
let priorSite, priorPort, priorApps
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  fixture.sockets.length = 0
  fixture.roots.length = 0
  fixture.mountedSockets.length = 0
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    protocol: 'http:',
    hostname: 'crm-roadmap.localhost',
    port: '18771',
    reload: vi.fn(),
  })
  priorSite = window.site_name
  priorPort = window.socketio_port
  priorApps = window.installed_apps
  delete window.installed_apps
  document.body.innerHTML = '<div id="app"></div>'
  listeners = vi.spyOn(document, 'addEventListener')
})
afterEach(() => {
  fixture.roots.forEach((root) => root.appContext.app.unmount())
  for (const [name, handler] of listeners.mock.calls) {
    if (name === 'visibilitychange') document.removeEventListener(name, handler)
  }
  document
    .querySelectorAll('script[src*="printing_runtime.js"]')
    .forEach((el) => el.remove())
  document.body.innerHTML = ''
  window.site_name = priorSite
  window.socketio_port = priorPort
  window.installed_apps = priorApps
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function expectCanonicalSocket() {
  expect(fixture.sockets).toHaveLength(1)
  const socket = fixture.sockets[0]
  expect(socket.url).toBe(
    'http://crm-roadmap.localhost:18060/crm-roadmap.localhost',
  )
  expect(socket.options).toEqual({
    withCredentials: true,
    reconnectionDelayMax: 30000,
  })
  const root = fixture.roots[0]
  expect(root.proxy.$socket).toBe(socket)
  expect(fixture.mountedSockets).toEqual([socket])
  expect(root.proxy.$call).toBeTypeOf('function')
  expect(fixture.resources.install).toHaveBeenCalledWith(
    root.appContext.app,
    true,
  )
  expect(root.proxy.$dialog).toBe(fixture.dialog)
  expect(Object.keys(root.appContext.components)).toEqual([
    'Button',
    'TextInput',
    'Input',
    'FormControl',
    'ErrorMessage',
    'Dialog',
    'Alert',
    'Badge',
    'FeatherIcon',
  ])
  expect(fixture.setConfig).toHaveBeenCalledWith(
    'resourceFetcher',
    fixture.request,
  )
  expect(fixture.pushNavigation).toHaveBeenCalledWith(fixture.router)
  expect(fixture.startupTelemetry).toHaveBeenCalledWith(root.appContext.app)
  for (const plugin of [fixture.router, fixture.translation, fixture.sprite]) {
    expect(plugin.install).toHaveBeenCalledOnce()
  }
  return socket
}

const printRuntimeUrl = '/assets/doco/js/printing_runtime.js?v=20260812a'
const printingScripts = () =>
  document.querySelectorAll(
    'script[src*="/assets/doco/js/printing_runtime.js"]',
  )

describe('CRM socket bootstrap ownership', () => {
  it.each([
    [
      'https:',
      '18062',
      18062,
      'https://crm-roadmap.localhost:18062/crm-roadmap.localhost',
    ],
    ['https:', '', 9000, 'https://crm-roadmap.localhost/crm-roadmap.localhost'],
    ['http:', '', 9000, 'http://crm-roadmap.localhost/crm-roadmap.localhost'],
    [
      'http:',
      '5173',
      9000,
      'http://crm-roadmap.localhost:9000/crm-roadmap.localhost',
    ],
    [
      'http:',
      '5173',
      undefined,
      'http://crm-roadmap.localhost:9000/crm-roadmap.localhost',
    ],
  ])(
    'uses the page protocol %s with page port %s and boot port %s',
    async (protocol, port, socketPort, expected) => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol,
        hostname: 'crm-roadmap.localhost',
        port,
      })
      window.site_name = 'crm-roadmap.localhost'
      window.socketio_port = socketPort
      const { initSocket } = await import('@/socket')
      const socket = initSocket()
      expect(socket.url).toBe(expected)
      expect(fixture.sockets).toEqual([socket])
      expect(socket.options).toEqual({
        withCredentials: true,
        reconnectionDelayMax: 30000,
      })
    },
  )

  it('starts only the boot-aware CRM socket in production, preserving plugin services', async () => {
    vi.stubEnv('DEV', false)
    window.site_name = 'crm-roadmap.localhost'
    window.socketio_port = 18060
    window.installed_apps = ['frappe', 'crm']
    await import('@/main')
    expectCanonicalSocket()
    expect(fixture.request).not.toHaveBeenCalled()
    expect(printingScripts()).toHaveLength(0)
  })

  it.each([
    ['standalone', ['frappe', 'crm'], 0],
    ['Doco', ['frappe', 'crm', 'doco'], 1],
  ])(
    'waits for %s development boot before sockets, printing or consumers',
    async (_, installedApps, scripts) => {
      vi.stubEnv('DEV', true)
      delete window.site_name
      delete window.socketio_port
      let resolveBoot
      fixture.request.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveBoot = resolve
        }),
      )
      await import('@/main')
      expect(fixture.request).toHaveBeenCalledWith({
        url: '/api/method/crm.www.crm.get_context_for_dev',
      })
      expect(fixture.sockets).toHaveLength(0)
      expect(fixture.roots).toHaveLength(0)
      expect(printingScripts()).toHaveLength(0)
      resolveBoot({
        site_name: 'crm-roadmap.localhost',
        socketio_port: 18060,
        installed_apps: installedApps,
      })
      await Promise.resolve()
      expectCanonicalSocket()
      expect(printingScripts()).toHaveLength(scripts)
    },
  )

  it('loads the unchanged printing runtime once for an installed Doco owner', async () => {
    vi.stubEnv('DEV', false)
    window.site_name = 'crm-roadmap.localhost'
    window.socketio_port = 18060
    window.installed_apps = ['frappe', 'crm', 'doco']
    await import('@/main')
    expectCanonicalSocket()
    expect(printingScripts()).toHaveLength(1)
    expect(printingScripts()[0].getAttribute('src')).toBe(printRuntimeUrl)
  })

  it.each(['relative', 'absolute'])(
    'preserves an existing %s printing script without duplicating it',
    async (kind) => {
      vi.stubEnv('DEV', false)
      window.site_name = 'crm-roadmap.localhost'
      window.socketio_port = 18060
      window.installed_apps = ['frappe', 'crm', 'doco']
      const script = document.createElement('script')
      script.src =
        kind === 'absolute'
          ? new URL(printRuntimeUrl, document.baseURI).href
          : printRuntimeUrl
      document.head.append(script)
      await import('@/main')
      expectCanonicalSocket()
      expect(printingScripts()).toHaveLength(1)
      expect(printingScripts()[0]).toBe(script)
    },
  )

  it.each([undefined, 'doco'])(
    'keeps optional printing unloaded for absent or malformed boot apps (%s)',
    async (apps) => {
      vi.stubEnv('DEV', false)
      window.site_name = 'crm-roadmap.localhost'
      window.socketio_port = 18060
      window.installed_apps = apps
      await import('@/main')
      expectCanonicalSocket()
      expect(printingScripts()).toHaveLength(0)
    },
  )

  it('retains resource refresh and reconnect recovery on the published socket', async () => {
    vi.stubEnv('DEV', false)
    window.site_name = 'crm-roadmap.localhost'
    window.socketio_port = 18060
    const cached = { reload: vi.fn() }
    fixture.cachedResource.mockReturnValue(cached)
    await import('@/main')
    const socket = expectCanonicalSocket()
    const handlers = Object.fromEntries(socket.on.mock.calls)
    handlers.refetch_resource({ cache_key: 'synthetic-resource' })
    expect(fixture.cachedResource).toHaveBeenCalledWith('synthetic-resource')
    expect(cached.reload).toHaveBeenCalledOnce()
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    handlers.disconnect()
    socket.io.on.mock.calls.find(([event]) => event === 'reconnect')[1]()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'socket:reconnected' }),
    )
  })
})
