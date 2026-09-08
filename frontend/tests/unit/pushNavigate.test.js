// Push click → in-app route (utils/pushNavigate.js). The SW cannot navigate the
// uncontrolled /crm tab, so it posts the URL and the page routes itself.
import { describe, it, expect, vi } from 'vitest'
import {
  toInAppRoute,
  isNavigateMessage,
  listenForPushNavigation,
} from '@/utils/pushNavigate'

const ORIGIN = 'https://ventas.example.com'

describe('toInAppRoute', () => {
  it('strips the /crm base and keeps query + hash', () => {
    expect(toInAppRoute('/crm/inbox?deal=CRM-DEAL-1', ORIGIN)).toBe(
      '/inbox?deal=CRM-DEAL-1',
    )
    expect(
      toInAppRoute(`${ORIGIN}/crm/inbox?deal=X&doctype=CRM%20Lead`, ORIGIN),
    ).toBe('/inbox?deal=X&doctype=CRM%20Lead')
    expect(toInAppRoute('/crm/deals/D-1#tasks', ORIGIN)).toBe(
      '/deals/D-1#tasks',
    )
  })
  it('maps the bare /crm to the SPA root', () => {
    expect(toInAppRoute('/crm', ORIGIN)).toBe('/')
  })
  it('refuses foreign origins, Desk paths and garbage', () => {
    expect(toInAppRoute('https://evil.example/crm/inbox', ORIGIN)).toBeNull()
    expect(toInAppRoute('/app/crm-deal/D-1', ORIGIN)).toBeNull()
    expect(toInAppRoute('/crmx/inbox', ORIGIN)).toBeNull()
    expect(toInAppRoute('', ORIGIN)).toBeNull()
    expect(toInAppRoute(null, ORIGIN)).toBeNull()
  })
})

describe('listenForPushNavigation', () => {
  function fakeContainer() {
    const handlers = {}
    return {
      addEventListener: (t, fn) => (handlers[t] = fn),
      removeEventListener: vi.fn(),
      emit: (data) => handlers.message && handlers.message({ data }),
    }
  }

  it('routes a crm:navigate message and ignores everything else', () => {
    const router = { push: vi.fn(() => Promise.resolve()) }
    const c = fakeContainer()
    vi.stubGlobal('location', { origin: ORIGIN })
    listenForPushNavigation(router, c)
    c.emit({ type: 'crm:navigate', url: '/crm/inbox?deal=CRM-DEAL-9' })
    expect(router.push).toHaveBeenCalledWith('/inbox?deal=CRM-DEAL-9')
    c.emit({ type: 'other', url: '/crm/inbox' })
    c.emit({ type: 'crm:navigate', url: 'https://evil.example/crm/inbox' })
    c.emit(null)
    expect(router.push).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('swallows NavigationDuplicated (same conversation clicked twice)', async () => {
    const router = { push: vi.fn(() => Promise.reject(new Error('dup'))) }
    const c = fakeContainer()
    vi.stubGlobal('location', { origin: ORIGIN })
    listenForPushNavigation(router, c)
    expect(() =>
      c.emit({ type: 'crm:navigate', url: '/crm/inbox?deal=A' }),
    ).not.toThrow()
    await Promise.resolve()
    vi.unstubAllGlobals()
  })

  it('is a no-op without a service worker container', () => {
    expect(listenForPushNavigation({ push: vi.fn() }, undefined)).toBeTypeOf(
      'function',
    )
  })

  it('isNavigateMessage guards shape', () => {
    expect(isNavigateMessage({ type: 'crm:navigate', url: '/crm' })).toBe(true)
    expect(isNavigateMessage({ type: 'crm:navigate' })).toBe(false)
    expect(isNavigateMessage(undefined)).toBe(false)
  })
})
