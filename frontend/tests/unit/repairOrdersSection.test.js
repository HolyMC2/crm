/* eslint-disable vue/one-component-per-file -- Test-local UI boundary doubles. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({
  call: vi.fn(),
  hasTaller: null,
  requestTallerPhotos: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity',
  }),
}))
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  api.hasTaller = ref(true)
  return {
    hasTaller: api.hasTaller,
    requestTallerPhotos: (...args) => api.requestTallerPhotos(...args),
  }
})
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  createResource: vi.fn(),
  Button: defineComponent({
    props: {
      label: { type: String, default: '' },
      disabled: Boolean,
      loading: Boolean,
    },
    setup:
      (props, { slots }) =>
      () =>
        h(
          'button',
          { disabled: props.disabled || props.loading },
          props.label || slots.default?.(),
        ),
  }),
  Badge: defineComponent({
    props: { label: { type: String, default: '' } },
    setup: (props) => () => h('span', props.label),
  }),
}))
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
const context = (extra = {}) => ({ orders: [], can_create: true, ...extra })
let app, root
const settle = async () => {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const button = (label) =>
  [...root.querySelectorAll('button')].find(
    (node) => node.textContent.trim() === label,
  )
const intakeLink = () =>
  [...root.querySelectorAll('a')].find(
    (node) => node.textContent.trim() === 'Nueva reparación',
  )
async function mount(values = { docname: 'DEAL-1' }) {
  const props = reactive(values)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ setup: () => () => h(RepairOrdersSection, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  return props
}
beforeEach(() => {
  api.call.mockReset()
  api.hasTaller.value = true
  api.requestTallerPhotos.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

describe('CRM repair panel (real component, API doubles)', () => {
  it('renders loading/error/retry distinctly and never shows a failed read as empty', async () => {
    let resolve
    api.call.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes
        }),
    )
    await mount()
    expect(root.textContent).toContain('Cargando reparaciones')
    expect(root.textContent).not.toContain('aún no tiene órdenes de reparación')
    resolve(context())
    await settle()
    expect(root.textContent).toContain('aún no tiene órdenes de reparación')
    app.unmount()
    app = null
    root.remove()
    api.call
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(context())
    await mount()
    expect(root.textContent).toContain('No se pudieron cargar')
    expect(root.textContent).not.toContain('aún no tiene órdenes de reparación')
    const callsBeforeRetry = api.call.mock.calls.length
    button('Reintentar consulta').click()
    await settle()
    expect(api.call).toHaveBeenCalledTimes(callsBeforeRetry + 1)
    expect(api.call).toHaveBeenLastCalledWith(
      'taller.repair.repair_orders.get_deal_repair_context',
      { deal_name: 'DEAL-1' },
    )
    expect(root.textContent).toContain('aún no tiene órdenes de reparación')
  })

  it('hands «Nueva reparación» to taller Intake in the same tab with a CRM return', async () => {
    api.call.mockResolvedValue(context())
    await mount()
    const link = intakeLink()
    expect(link).toBeTruthy()
    expect(link.getAttribute('target')).toBeNull()
    const url = new URL(link.href)
    expect(url.pathname).toBe('/taller/intake')
    expect(url.searchParams.get('deal')).toBe('DEAL-1')
    expect(url.searchParams.get('return')).toBe(
      '/crm/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity',
    )
    expect(root.querySelector('input, select, textarea, fieldset')).toBeNull()
    expect(button('Add Repair Order')).toBeUndefined()
  })

  it('shows no intake handoff without taller', async () => {
    api.hasTaller.value = false
    api.call.mockResolvedValue(context())
    await mount()
    expect(intakeLink()).toBeUndefined()
    api.hasTaller.value = true
    await settle()
    expect(intakeLink()).toBeTruthy()
  })

  it('gates the handoff and printing on taller capabilities and keeps a same-window order link', async () => {
    api.call.mockResolvedValue(
      context({
        can_create: false,
        create_blocked_reason: 'Solo lectura',
        orders: [
          {
            name: 'RO-1',
            status: 'Por Revisar',
            quote_amount: 0,
            currency: 'USD',
            capabilities: { can_read: true, can_print: false },
          },
        ],
      }),
    )
    await mount()
    expect(root.textContent).toContain('Solo lectura')
    expect(root.textContent).toMatch(/USD.*0[.,]00/)
    expect(intakeLink()).toBeUndefined()
    expect(root.querySelector('[title="Print Ticket"]')).toBeNull()
    const link = root.querySelector('a[href^="/taller/orders/"]')
    expect(link.getAttribute('target')).toBeNull()
    expect(new URL(link.href).searchParams.get('crm_return_to')).toBe(
      '/crm/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity',
    )
  })

  it('shows the Repair Order received in taller once the operator returns', async () => {
    api.call.mockResolvedValueOnce(context())
    await mount()
    expect(root.textContent).toContain('aún no tiene órdenes de reparación')
    api.call.mockResolvedValueOnce(
      context({
        orders: [{ name: 'RO-NEW', status: 'Por Revisar', capabilities: {} }],
      }),
    )
    const restored = new Event('pageshow')
    restored.persisted = true
    window.dispatchEvent(restored)
    await settle()
    expect(root.textContent).toContain('RO-NEW')
    expect(api.call).toHaveBeenCalledTimes(2)
  })

  it('does not render the previous Deal while its replacement is loading', async () => {
    let resolve
    api.call.mockResolvedValueOnce(
      context({
        orders: [
          { name: 'RO-PRIVATE-A', status: 'Por Revisar', capabilities: {} },
        ],
      }),
    )
    const props = await mount()
    expect(root.textContent).toContain('RO-PRIVATE-A')
    api.call.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes
        }),
    )
    props.docname = 'DEAL-2'
    await settle()
    expect(root.textContent).not.toContain('RO-PRIVATE-A')
    expect(root.textContent).toContain('Cargando reparaciones')
    resolve(context())
    await settle()
    expect(root.textContent).toContain('aún no tiene órdenes de reparación')
  })

  it('leads each order with what the seller tells the customer', async () => {
    api.call.mockResolvedValue(
      context({
        orders: [
          {
            name: 'RO-READY',
            device_model: 'iPhone 13',
            repair_to_be_done: 'Cambio de pantalla',
            status: 'Listo para Entregar',
            estimate_decision: 'Aprobado',
            quote_amount: 1800,
            advance_amount: 500,
            balance_due: 1300,
            currency: 'MXN',
            falla_reportada: 'Pantalla estrellada',
            diagnosis_summary: 'Display roto, touch sin respuesta',
            photo_count: 0,
            photos: [],
            capabilities: {},
          },
        ],
      }),
    )
    await mount()
    const card = root.querySelector('[data-order="RO-READY"]')
    expect(card.textContent).toContain('iPhone 13')
    expect(card.textContent).toContain('Cambio de pantalla')
    expect(card.querySelector('[data-next-step]').textContent).toMatch(
      /avisa al cliente y cobra .*1,300/,
    )
    expect(card.textContent).toContain('Aprobada')
    expect(card.textContent).toContain('Display roto, touch sin respuesta')
    expect(card.textContent).toContain('El técnico las sube en Taller')
    // reception and billing detail stay folded until asked for
    expect(card.textContent).not.toContain('Mano de obra')
    button('Más detalles').click()
    await settle()
    expect(card.textContent).toContain('Mano de obra')
  })

  it('puts open orders first and folds a delivered one while another is open', async () => {
    api.call.mockResolvedValue(
      context({
        orders: [
          {
            name: 'RO-OLD',
            status: 'Entregado',
            falla_reportada: 'Batería',
            capabilities: {},
          },
          {
            name: 'RO-OPEN',
            status: 'En Reparación',
            falla_reportada: 'No carga',
            pending_action: 'Probar centro de carga',
            capabilities: {},
          },
        ],
      }),
    )
    await mount()
    const cards = [...root.querySelectorAll('[data-order]')]
    expect(cards.map((c) => c.dataset.order)).toEqual(['RO-OPEN', 'RO-OLD'])
    expect(cards[0].textContent).toContain('Probar centro de carga')
    expect(cards[1].textContent).not.toContain('Batería')
    button('Ver orden').click()
    await settle()
    expect(cards[1].textContent).toContain('Batería')
  })

  it('sends an order’s photos to the open chat only beside the conversation', async () => {
    const order = {
      name: 'RO-PH',
      status: 'En Diagnóstico',
      photo_count: 12,
      photos: [
        { name: 'PH-1', image: '/private/files/a.jpg', thumbnail_url: '' },
      ],
      capabilities: {},
    }
    api.call.mockResolvedValue(context({ orders: [order] }))
    await mount()
    expect(root.textContent).toContain('Fotos del taller')
    expect(button('Enviar al chat')).toBeUndefined()
    app.unmount()
    root.remove()
    await mount({ docname: 'DEAL-1', chat: true })
    expect(root.querySelector('[data-photos]').textContent).toContain('+11')
    button('Enviar al chat').click()
    expect(api.requestTallerPhotos).toHaveBeenCalledWith({
      deal: 'DEAL-1',
      order: 'RO-PH',
    })
  })
})
