import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ resources: [] }))
vi.mock('frappe-ui', async () => {
  const { h, reactive } = await import('vue')
  return {
    createResource: (options) => {
      const resource = reactive({
        options,
        data: state.next,
        loading: false,
        error: null,
        reload: vi.fn(),
      })
      state.resources.push(resource)
      return resource
    },
    Badge: { props: ['label'], setup: (p) => () => h('span', p.label) },
    Button: { props: ['label'], setup: (p) => () => h('button', p.label) },
  }
})
vi.mock('@/components/doco/MobileRecordCard.vue', () => ({
  default: { render: () => null },
}))

import ContactRepairsTab from '@/components/doco/contact/ContactRepairsTab.vue'
import ContactStorefrontTab from '@/components/doco/contact/ContactStorefrontTab.vue'
import { formatMoney, purgeContact360Cache } from '@/utils/contactos'

let app, root
async function mount(component, props, data) {
  state.next = data
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.resources = []
})

describe('Contact360 tabs keep no persistent cache (R2 H2)', () => {
  it('requests each selected account fresh, without a shared cache key', async () => {
    await mount(
      ContactRepairsTab,
      { docname: 'C-1', selectedCustomer: 'A' },
      null,
    )
    app.unmount()
    await mount(
      ContactRepairsTab,
      { docname: 'C-1', selectedCustomer: 'B' },
      null,
    )
    const [first, second] = state.resources
    expect(first.options.cache).toBeUndefined()
    expect(second.options.cache).toBeUndefined()
    expect(first).not.toBe(second)
    expect(second.options.params).toEqual({ contact: 'C-1', customer: 'B' })
  })

  it('purges Contact360 payloads persisted by older builds only', async () => {
    const store = {
      keys: vi.fn(async () => [
        '["contact360-documents","C-1"]',
        '["muelle-contact360-sections","s","u","C-1"]',
        '["crm-other","x"]',
      ]),
      delMany: vi.fn(async () => {}),
    }
    expect(await purgeContact360Cache(store)).toBe(2)
    expect(store.delMany).toHaveBeenCalledWith([
      '["contact360-documents","C-1"]',
      '["muelle-contact360-sections","s","u","C-1"]',
    ])
  })
})

describe('unknown amounts are not zero (R2 M8)', () => {
  it('formats protected or missing amounts as a dash', () => {
    expect(formatMoney(null, 'MXN')).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(0, 'MXN', 'es-MX')).toMatch(/0\.00/)
    expect(formatMoney(1800, null, 'es-MX')).toBe('1,800.00')
  })

  it('an unavailable section shows its resolver, not an empty or zero body', async () => {
    await mount(
      ContactRepairsTab,
      { docname: 'C-1' },
      {
        availability: {
          available: false,
          reason: 'field_access_denied',
          message: 'No puedes ver la cuenta seleccionada.',
          resolver: 'request_access',
        },
        summary: {
          total_repairs: null,
          active_warranties: null,
          total_amount: null,
        },
        repairs: [],
      },
    )
    expect(root.textContent).toContain('No puedes ver la cuenta seleccionada.')
    expect(root.textContent).not.toContain('Sin reparaciones registradas')
    expect(root.textContent).not.toContain('$0.00')
  })

  it('a masked storefront total renders as a dash and masked returns explain why', async () => {
    await mount(
      ContactStorefrontTab,
      { docname: 'C-1' },
      {
        orders: [],
        returns: [],
        returns_availability: {
          available: false,
          message:
            'No puedes ver a qué pedido corresponde cada devolución con tus permisos actuales.',
          resolver: 'request_access',
        },
        summary: {
          total_orders: 1,
          open_orders: 0,
          total_amount: null,
          currency: null,
          mixed_currency: false,
          matched_by: {},
        },
      },
    )
    expect(root.textContent).not.toContain('$0.00')
    expect(root.textContent).toContain('—')
    expect(root.textContent).toContain('a qué pedido corresponde')
  })
})
