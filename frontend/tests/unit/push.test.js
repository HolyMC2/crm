// Web-push state machine — the prod bug class: SW scope vs page control.
// refreshPushState must resolve via getRegistration(scope), never .ready.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...a) => call(...a),
  toast: { success: vi.fn(), error: vi.fn() },
}))

function mockSW({ reg = null, registerOk = true } = {}) {
  const registration = reg === undefined ? null : reg
  const sw = {
    getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => {
      if (!registerOk) throw new Error('nope')
      return { active: {}, pushManager: { getSubscription: async () => null } }
    }),
  }
  Object.defineProperty(globalThis.navigator, 'serviceWorker', { value: sw, configurable: true })
  return sw
}

function mockNotification(permission = 'default') {
  globalThis.Notification = { permission, requestPermission: vi.fn(async () => 'granted') }
}

function mockPushManager() {
  globalThis.PushManager = function () {}
}

async function fresh() {
  vi.resetModules()
  return await import('@/composables/push')
}

beforeEach(() => {
  call.mockReset()
})

describe('refreshPushState', () => {
  it('unsupported when the browser lacks push APIs', async () => {
    delete globalThis.PushManager
    const push = await fresh()
    await push.refreshPushState()
    expect(push.pushState.value).toBe('unsupported')
  })

  it('unconfigured when the server has no VAPID keys', async () => {
    mockPushManager()
    mockNotification('default')
    mockSW({})
    call.mockResolvedValueOnce({ configured: false })
    const push = await fresh()
    await push.refreshPushState()
    expect(push.pushState.value).toBe('unconfigured')
  })

  it('denied when browser-level permission is blocked', async () => {
    mockPushManager()
    mockNotification('denied')
    mockSW({})
    call.mockResolvedValueOnce({ configured: true, subscribed: false })
    const push = await fresh()
    await push.refreshPushState()
    expect(push.pushState.value).toBe('denied')
  })

  it('resolves the SW by SCOPE (not .ready) and lands on off when unsubscribed', async () => {
    mockPushManager()
    mockNotification('default')
    const sw = mockSW({
      reg: { active: {}, pushManager: { getSubscription: async () => null } },
    })
    call.mockResolvedValueOnce({ configured: true, subscribed: false })
    const push = await fresh()
    await push.refreshPushState()
    expect(push.pushState.value).toBe('off')
    expect(sw.getRegistration).toHaveBeenCalledWith('/assets/crm/frontend/')
  })

  it('self-registers the SW when the scope registration is missing', async () => {
    mockPushManager()
    mockNotification('default')
    const sw = mockSW({ reg: null })
    call.mockResolvedValueOnce({ configured: true, subscribed: false })
    const push = await fresh()
    await push.refreshPushState()
    expect(sw.register).toHaveBeenCalledWith('/assets/crm/frontend/sw.js', {
      scope: '/assets/crm/frontend/',
    })
  })

  it('on when both a browser subscription and a server row exist', async () => {
    mockPushManager()
    mockNotification('granted')
    mockSW({
      reg: { active: {}, pushManager: { getSubscription: async () => ({ endpoint: 'e' }) } },
    })
    call.mockResolvedValueOnce({ configured: true, subscribed: true })
    const push = await fresh()
    await push.refreshPushState()
    expect(push.pushState.value).toBe('on')
  })
})
