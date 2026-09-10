// Installed-app capability source + shell route gates (utils/crmCapabilities.js):
// boot-provided vs fetched lists, present / missing / unknown semantics, and the
// native fallbacks the router and nav rail apply without doco_marketing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `call` routes through a swappable plain behavior fn (NOT a vi.fn returning
// rejections — vitest-4 false-unhandled trap, see outbox.test.js).
const h = vi.hoisted(() => ({ behavior: async () => ({}), calls: 0 }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    h.calls++
    return h.behavior(...args)
  },
}))

const WITH_ADDON = ['frappe', 'erpnext', 'crm', 'doco_marketing']
const DEMO_SITE = ['frappe', 'erpnext', 'doco', 'posawesome', 'crm', 'print_designer']

async function fresh({ boot, apps } = {}) {
  vi.resetModules()
  delete window.installed_apps
  if (boot) window.installed_apps = boot
  h.calls = 0
  h.behavior = async () => (apps ? { installed_apps: apps } : {})
  return await import('@/utils/crmCapabilities')
}

describe('crmCapabilities: source', () => {
  beforeEach(() => delete window.installed_apps)
  afterEach(() => vi.useRealTimers())

  it('bounds a stalled lookup and ignores its late successful answer', async () => {
    const m = await fresh()
    vi.useFakeTimers()
    let finish
    h.behavior = () => new Promise((resolve) => { finish = resolve })
    const waiting = m.loadCapabilities()
    await vi.advanceTimersByTimeAsync(m.CAPABILITIES_TIMEOUT_MS)
    await waiting
    expect(m.capabilitiesState.value).toBe('unknown')
    expect(m.gateRoute({ name: 'Home' })).toEqual({ name: 'Leads' })
    finish({ installed_apps: WITH_ADDON })
    await Promise.resolve()
    expect(m.hasApp('doco_marketing')).toBe(false)
  })

  it('starts pending; nothing counts as present before the answer lands', async () => {
    const m = await fresh({ apps: WITH_ADDON })
    expect(m.capabilitiesState.value).toBe('pending')
    expect(m.appState('doco_marketing')).toBe('pending')
    expect(m.hasApp('doco_marketing')).toBe(false)
    expect(m.addonAvailable.value).toBe(false)
  })

  it('uses the boot-exported list when present, without a round-trip', async () => {
    const m = await fresh({ boot: WITH_ADDON })
    await m.loadCapabilities()
    expect(h.calls).toBe(0)
    expect(m.capabilitiesState.value).toBe('resolved')
    expect(m.hasApp('doco_marketing')).toBe(true)
    expect(m.hasApp('taller')).toBe(false)
  })

  it('fetches once and reports present / missing from the site list', async () => {
    const m = await fresh({ apps: DEMO_SITE })
    await Promise.all([m.loadCapabilities(), m.loadCapabilities()])
    await m.loadCapabilities()
    expect(h.calls).toBe(1)
    expect(m.appState('doco_marketing')).toBe('missing')
    expect(m.appState('posawesome')).toBe('present')
    expect(m.addonAvailable.value).toBe(false)
  })

  it('calls the capabilities endpoint by name', async () => {
    const m = await fresh({ apps: WITH_ADDON })
    let url = null
    h.behavior = async (u) => {
      url = u
      return { installed_apps: WITH_ADDON }
    }
    await m.loadCapabilities()
    expect(url).toBe(m.CAPABILITIES_URL)
    expect(m.addonAvailable.value).toBe(true)
  })

  it('a failed lookup is unknown (never present) and the next call retries', async () => {
    const m = await fresh()
    h.behavior = async () => {
      throw new Error('boom')
    }
    await m.loadCapabilities()
    expect(m.capabilitiesState.value).toBe('unknown')
    expect(m.appState('doco_marketing')).toBe('unknown')
    expect(m.hasApp('doco_marketing')).toBe(false)
    h.behavior = async () => ({ installed_apps: WITH_ADDON })
    await m.loadCapabilities()
    expect(h.calls).toBe(2)
    expect(m.hasApp('doco_marketing')).toBe(true)
  })

  it('a malformed answer is unknown, not an empty site', async () => {
    const m = await fresh()
    h.behavior = async () => ({ installed_apps: 'doco_marketing' })
    await m.loadCapabilities()
    expect(m.appState('doco_marketing')).toBe('unknown')
    expect(m.hasApp('doco_marketing')).toBe(false)
  })
})

describe('crmCapabilities: route gates', () => {
  it('preserves native saved-view filters when redirecting a custom list', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Deals List', query: { view: 'My deals' } })).toEqual({
      name: 'Deals', query: { view: 'My deals' },
    })
  })
  it('with the addon: Home lands in Inbox and every surface proceeds', async () => {
    const m = await fresh({ boot: WITH_ADDON })
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Home' })).toEqual({ name: 'Inbox' })
    for (const name of Object.keys(m.GATED_ROUTES)) {
      expect(m.gateRoute({ name, params: { dealId: 'D-1' } })).toBeNull()
    }
  })

  it('without the addon: Home lands in the native Leads list', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Home' })).toEqual({ name: 'Leads' })
  })

  it('without the addon: custom lists fall back to the upstream list routes', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Leads List' })).toEqual({ name: 'Leads' })
    expect(m.gateRoute({ name: 'Deals List' })).toEqual({ name: 'Deals' })
    expect(m.gateRoute({ name: 'Tasks List' })).toEqual({ name: 'Tasks' })
    expect(m.gateRoute({ name: 'Calls List' })).toEqual({ name: 'Call Logs' })
  })

  it('without the addon: Deal 360 keeps the record and opens the upstream Deal page', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Deal 360', params: { dealId: 'CRM-DEAL-7' } })).toEqual({
      name: 'Deal',
      params: { dealId: 'CRM-DEAL-7' },
    })
  })

  it('without the addon: addon-only surfaces go Home; native routes are untouched', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    for (const name of ['Campaigns', 'Chatflows', 'Social', 'Reports', 'Workload', 'Score Rules', 'Webshop', 'WhatsApp Queue', 'Pipeline Analysis']) {
      expect(m.gateRoute({ name })).toEqual({ name: 'Home' })
      expect(m.isAddonOnlyRoute(name)).toBe(true)
    }
    for (const name of ['Inbox', 'Leads', 'Deals', 'Deal', 'Lead', 'Contacts', 'Organizations', 'Notes', 'Tasks', 'Call Logs', 'Calendar', 'Dashboard', 'Notifications']) {
      expect(m.gateRoute({ name })).toBeNull()
      expect(m.isAddonOnlyRoute(name)).toBe(false)
    }
  })

  it('unknown availability gates like missing: native pages, never the addon ones', async () => {
    const m = await fresh()
    h.behavior = async () => {
      throw new Error('boom')
    }
    await m.loadCapabilities()
    expect(m.gateRoute({ name: 'Home' })).toEqual({ name: 'Leads' })
    expect(m.gateRoute({ name: 'Deals List' })).toEqual({ name: 'Deals' })
    expect(m.gateRoute({ name: 'Inbox' })).toBeNull()
  })

  it('accepts an explicit availability answer (router/tests decoupled from state)', async () => {
    const m = await fresh()
    expect(m.gateRoute({ name: 'Inbox' }, true)).toBeNull()
    expect(m.gateRoute({ name: 'Inbox' }, false)).toBeNull()
  })
})

describe('crmCapabilities: navigation visibility', () => {
  it('hides addon-only entries without the addon, keeps entries with a native fallback', async () => {
    const m = await fresh({ boot: DEMO_SITE })
    await m.loadCapabilities()
    expect(m.navItemVisible('Inbox')).toBe(true)
    expect(m.navItemVisible('Campaigns')).toBe(false)
    expect(m.navItemVisible('Score Rules')).toBe(false)
    expect(m.navItemVisible('Leads List')).toBe(true)
    expect(m.navItemVisible('Calls List')).toBe(true)
    expect(m.navItemVisible('Dashboard')).toBe(true)
    expect(m.navItemVisible('Calendar')).toBe(true)
  })

  it('shows everything with the addon, and hides addon-only entries while pending', async () => {
    const m = await fresh({ apps: WITH_ADDON })
    expect(m.navItemVisible('Inbox')).toBe(true) // native Inbox is available even while addon state is pending
    expect(m.navItemVisible('Leads List')).toBe(true)
    await m.loadCapabilities()
    expect(m.navItemVisible('Inbox')).toBe(true)
    expect(m.navItemVisible('Score Rules')).toBe(true)
  })
})
