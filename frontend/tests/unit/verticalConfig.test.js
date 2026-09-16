import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  resolveVerticalSections,
  verticalSlotEligible,
  verticalUnavailable,
} from '@/utils/verticalSections'

const h = vi.hoisted(() => ({
  available: true,
  calls: [],
  behavior: async () => ({ schemaVersion: 1, providers: [] }),
}))
vi.mock('@/utils/crmCapabilities', () => ({ hasApp: () => h.available }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    h.calls.push(args)
    return h.behavior(...args)
  },
}))
import { useVerticalConfig } from '@/composables/verticalConfig'

const provider = (app) => ({
  id: `${app}:workspace`,
  app,
  schemaVersion: 1,
  label: app,
  modules: [],
  slots: [
    {
      id: 'workspace',
      slot: 'data_tab',
      component: 'ProviderWorkspace',
      route: `/${app}`,
    },
  ],
})
const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('vertical discovery lifecycle', () => {
  let scope
  beforeEach(() => {
    h.calls = []
    h.available = true
    h.behavior = async () => ({
      schemaVersion: 1,
      providers: [provider('clinica')],
    })
    scope = effectScope()
  })
  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('does not request an optional registry on core-only CRM', async () => {
    h.available = false
    const config = scope.run(() => useVerticalConfig(() => 'deal-1'))
    await flush()
    expect(h.calls).toEqual([])
    expect(config.value).toBeNull()
  })

  it('calls CRM-owned endpoint with only the authorized record context', async () => {
    const config = scope.run(() => useVerticalConfig(() => 'deal-1'))
    await flush()
    expect(h.calls).toEqual([
      [
        'crm.api.capabilities.get_vertical_config',
        {
          entity: { doctype: 'CRM Deal', name: 'deal-1' },
        },
      ],
    ])
    expect(config.value.providers).toHaveLength(1)
  })

  it('discards an earlier reply after navigating to another deal', async () => {
    const finish = []
    h.behavior = () => new Promise((resolve) => finish.push(resolve))
    const name = ref('old')
    const config = scope.run(() => useVerticalConfig(() => name.value))
    name.value = 'new'
    await flush()
    finish[1]({ schemaVersion: 1, providers: [] })
    await flush()
    finish[0]({ schemaVersion: 1, providers: [provider('clinica')] })
    await flush()
    expect(config.value.providers).toEqual([])
  })

  it('retains same-record cards during refresh and keeps late replies out', async () => {
    const config = scope.run(() => useVerticalConfig(() => 'deal-1'))
    await flush()
    const finish = []
    h.behavior = () => new Promise((resolve) => finish.push(resolve))
    window.dispatchEvent(new Event('focus'))
    expect(config.value.providers).toHaveLength(1)
    window.dispatchEvent(new Event('focus'))
    finish[1]({ schemaVersion: 1, providers: [] })
    await flush()
    finish[0]({ schemaVersion: 1, providers: [provider('clinica')] })
    await flush()
    expect(config.value.providers).toEqual([])
  })

  it('contains a failed lookup, refreshes a continuously open view and cleans up', async () => {
    vi.useFakeTimers()
    const config = scope.run(() => useVerticalConfig(() => 'deal-1'))
    await flush()
    h.behavior = async () => {
      throw new Error('provider unavailable')
    }
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.calls).toHaveLength(2)
    expect(config.value.providers).toHaveLength(1)
    scope.stop()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.calls).toHaveLength(2)
  })

  it('preserves a same-record legacy draft on transport errors but clears it on access denial', async () => {
    const sections = [
      { section_key: 'repair', vue_component: 'RepairOrdersSection' },
    ]
    h.behavior = async () => ({
      schemaVersion: 1,
      sections,
      providers: [provider('clinica')],
    })
    const config = scope.run(() => useVerticalConfig(() => 'deal-1'))
    await flush()
    h.behavior = async () => {
      throw new Error('Network disconnected')
    }
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(config.value.sections).toEqual(sections)
    expect(config.value.providers).toHaveLength(1)
    h.behavior = async () => {
      throw Object.assign(new Error('Denied'), { status: 403 })
    }
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(config.value).toBeNull()
  })
})

describe('compiled vertical contributions', () => {
  it('renders both authorized providers without a selected vertical', () => {
    const result = resolveVerticalSections(
      {
        schemaVersion: 1,
        providers: [provider('clinica'), provider('taller')],
      },
      'data_tab',
      () => true,
    )
    expect(result.map((s) => s.config.route)).toEqual(['/clinica', '/taller'])
  })

  it('filters unsupported routes/components and missing app dependencies', () => {
    const bad = provider('clinica')
    bad.slots[0].route = '//external.invalid'
    const result = resolveVerticalSections(
      {
        schemaVersion: 1,
        providers: [bad, provider('taller')],
        sections: [
          {
            enabled: 1,
            render_in: 'data_tab',
            vue_component: 'DealDocumentsSection',
          },
          {
            enabled: 1,
            render_in: 'data_tab',
            vue_component: 'ArbitraryComponent',
          },
        ],
      },
      'data_tab',
      (app) => app === 'clinica',
    )
    expect(result).toEqual([])
  })

  it('preserves existing repair layout order and hides marketing documents without marketing', () => {
    const result = resolveVerticalSections(
      {
        schemaVersion: 1,
        sections: [
          {
            section_key: 'docs',
            enabled: 1,
            render_in: 'data_tab',
            vue_component: 'DealDocumentsSection',
            idx: 1,
          },
          {
            section_key: 'repair',
            enabled: 1,
            render_in: 'data_tab',
            vue_component: 'RepairOrdersSection',
            idx: 2,
          },
        ],
      },
      'data_tab',
      (app) => ['doco', 'taller', 'erpnext'].includes(app),
    )
    expect(result.map((s) => s.section_key)).toEqual(['legacy:repair'])
  })
})

describe('clinic entry points and optional slots', () => {
  it('passes Lead and Contact context without assuming a Deal', async () => {
    h.calls = []
    h.available = true
    h.behavior = async () => ({ schemaVersion: 1, providers: [] })
    const scope = effectScope()
    const type = ref('CRM Lead')
    scope.run(() =>
      useVerticalConfig(
        () => 'record-1',
        () => type.value,
      ),
    )
    await flush()
    expect(h.calls[0][1].entity).toEqual({
      doctype: 'CRM Lead',
      name: 'record-1',
    })
    type.value = 'Contact'
    await flush()
    expect(h.calls[1][1].entity).toEqual({
      doctype: 'Contact',
      name: 'record-1',
    })
    scope.stop()
  })

  it('does not discover a deals-list slot when no compiled provider can use it', async () => {
    h.calls = []
    h.available = true
    const apps = (app) => ['doco', 'clinica'].includes(app)
    const scope = effectScope()
    scope.run(() =>
      useVerticalConfig(
        () => '',
        () => 'CRM Deal',
        () => verticalSlotEligible('deals_list_header', 'CRM Deal', apps),
      ),
    )
    await flush()
    expect(h.calls).toEqual([])
    scope.stop()
  })

  it('keeps repair and deal document components Deal-only', () => {
    const config = {
      schemaVersion: 1,
      providers: [provider('clinica'), provider('taller')],
      sections: [
        {
          section_key: 'repair',
          enabled: 1,
          render_in: 'data_tab',
          vue_component: 'RepairOrdersSection',
        },
        {
          section_key: 'docs',
          enabled: 1,
          render_in: 'data_tab',
          vue_component: 'DealDocumentsSection',
        },
      ],
    }
    for (const doctype of ['CRM Lead', 'Contact']) {
      expect(
        resolveVerticalSections(config, 'data_tab', () => true, doctype).map(
          (row) => row.config.route,
        ),
      ).toEqual(['/clinica'])
    }
  })

  it('shows only a generic configuration note for recognized authorized unavailable providers', () => {
    const apps = (app) => ['doco', 'clinica'].includes(app)
    const config = {
      schemaVersion: 1,
      unavailable: [{ id: 'clinica:clinic', reason: 'provider_unavailable' }],
    }
    expect(verticalUnavailable(config, 'data_tab', 'Contact', apps)).toBe(true)
    expect(
      verticalUnavailable(config, 'deals_list_header', 'CRM Deal', apps),
    ).toBe(false)
    expect(
      verticalUnavailable(
        {
          ...config,
          unavailable: [{ id: 'clinica:clinic', reason: 'permission_denied' }],
        },
        'data_tab',
        'Contact',
        apps,
      ),
    ).toBe(false)
  })
})
