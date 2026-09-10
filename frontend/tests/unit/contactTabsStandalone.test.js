import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const h = vi.hoisted(() => ({ enabled: null, options: null, resource: null, fetches: 0 }))
vi.mock('@/utils/crmCapabilities', () => ({ get addonAvailable() { return h.enabled } }))
vi.mock('frappe-ui', () => ({ createResource: (options) => {
  h.options = options
  return h.resource
} }))

describe('optional Contact 360 tabs', () => {
  let scope
  beforeEach(() => {
    h.enabled = ref(false)
    h.fetches = 0
    h.resource = { data: { sections: [{ section_key: 'overview', label: 'Overview', vue_component: 'ContactOverviewTab' }] }, fetch: () => { h.fetches++ } }
    scope = effectScope()
  })
  afterEach(() => scope.stop())

  it('keeps stale cached addon tabs hidden until the addon is available', async () => {
    const { useContact360Tabs } = await import('@/components/doco/contact/useContact360Tabs')
    const { contactTabs } = scope.run(useContact360Tabs)
    expect(h.options.auto).toBe(false)
    expect(h.fetches).toBe(0)
    expect(contactTabs.value).toEqual([])
    h.enabled.value = true
    await nextTick()
    expect(h.fetches).toBe(1)
    expect(contactTabs.value[0].name).toBe('overview')
    h.enabled.value = false
    await nextTick()
    expect(contactTabs.value).toEqual([])
  })
})
