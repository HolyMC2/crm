/* eslint-disable vue/one-component-per-file -- Test-local UI boundary doubles. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), leave: null, update: null }))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity',
  }),
  onBeforeRouteLeave: (fn) => {
    api.leave = fn
  },
  onBeforeRouteUpdate: (fn) => {
    api.update = fn
  },
}))
vi.mock('@/stores/session', () => ({ sessionStore: () => api.session }))
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
  ErrorMessage: defineComponent({
    props: { message: { type: String, default: '' } },
    setup: (props) => () => h('p', { role: 'alert' }, props.message),
  }),
  Dialog: defineComponent({
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup:
      (props, { slots, emit }) =>
      () =>
        props.modelValue
          ? h('div', { role: 'dialog' }, [
              h(
                'button',
                { onClick: () => emit('update:modelValue', false) },
                'Close dialog',
              ),
              slots['body-content']?.(),
            ])
          : null,
  }),
}))
vi.mock('@/components/Modals/RepairOrderInlineForm.vue', () => ({
  default: defineComponent({
    props: {
      modelValue: { type: Object, required: true },
      currency: { type: String, default: null },
    },
    emits: ['update:modelValue'],
    setup:
      (props, { emit }) =>
      () =>
        h('input', {
          'data-intake': true,
          value: props.modelValue.falla_reportada,
          onInput: (event) =>
            emit('update:modelValue', {
              ...props.modelValue,
              device_model: 'PHONE',
              falla_reportada: event.target.value,
            }),
        }),
  }),
}))
vi.mock('@/composables/salesDocs', () => ({ reloadSalesSummary: vi.fn() }))
vi.mock('@/components/doco/inbox/WorkspaceItemPicker.vue', () => ({
  default: defineComponent({ render: () => null }),
}))
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import ItemWorkspace from '@/components/doco/inbox/ItemWorkspace.vue'
const context = (extra = {}) => ({
  orders: [],
  can_create: true,
  defaults: { laboratorio: 'LAB' },
  laboratorios: [{ name: 'LAB', label: 'Laboratorio', currency: 'USD' }],
  currency: 'USD',
  ...extra,
})
let app, root
const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm')
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
const click = async (label) => {
  expect(button(label), label).toBeTruthy()
  // Vue's capture guard rejects events stamped in the listener's attachment turn.
  await new Promise((resolve) => setTimeout(resolve, 1))
  button(label).click()
  await settle()
}
const input = async (value) => {
  const node = root.querySelector('[data-intake]')
  node.value = value
  node.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
async function mount(
  component = RepairOrdersSection,
  values = { docname: 'DEAL-1', initiallyOpen: true },
) {
  const props = reactive(values)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ setup: () => () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  return props
}
beforeEach(() => {
  api.session = reactive({ user: 'repair-agent@example.test' })
  sessionStorage.clear()
  document.cookie = 'user_id=repair-agent%40example.test'
  api.call.mockReset()
  api.leave = api.update = null
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm)
  else delete window.confirm
})

describe('CRM repair panel (real component, API and field-control doubles)', () => {
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
    expect(root.textContent).not.toContain('No repair orders linked')
    resolve(context())
    await settle()
    expect(root.textContent).toContain('No repair orders linked')
    app.unmount()
    app = null
    root.remove()
    api.call
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(context())
    await mount()
    expect(root.textContent).toContain('No se pudieron cargar')
    expect(root.textContent).not.toContain('No repair orders linked')
    const callsBeforeRetry = api.call.mock.calls.length
    await click('Reintentar consulta')
    expect(api.call).toHaveBeenCalledTimes(callsBeforeRetry + 1)
    expect(api.call).toHaveBeenLastCalledWith(
      'taller.repair.repair_orders.get_deal_repair_context',
      { deal_name: 'DEAL-1' },
    )
    expect(root.textContent).toContain('No repair orders linked')
  })
  it('gates creation/printing and renders zero with permitted currency plus a same-window CRM return', async () => {
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
    await mount(RepairOrdersSection, { docname: 'DEAL-1' })
    expect(root.textContent).toContain('Solo lectura')
    expect(root.textContent).toMatch(/USD.*0[.,]00/)
    expect(button('Add Repair Order')).toBeUndefined()
    expect(root.querySelector('[title="Print Ticket"]')).toBeNull()
    expect(root.textContent).not.toContain('Crear borrador')
    const link = root.querySelector('a[href^="/taller/"]')
    expect(link.getAttribute('target')).toBeNull()
    expect(new URL(link.href).searchParams.get('crm_return_to')).toBe(
      '/crm/deals/DEAL-1?returnTo=%2Fdeals%3Fowner%3Dme#activity',
    )
  })
  it('freezes pending inputs and blocks route, browser and dialog close until the same command is confirmed', async () => {
    let resolve, request
    api.call.mockImplementation((method, args) => {
      if (method.endsWith('get_workspace'))
        return Promise.resolve({
          documents: [],
          customers: [],
          customer_totals: [],
          totals: [],
          can_write: true,
          can_invoice: true,
        })
      if (method.endsWith('get_deal_repair_context'))
        return Promise.resolve(context())
      request = args
      return new Promise((yes) => {
        resolve = yes
      })
    })
    await mount(ItemWorkspace, {
      deal: 'DEAL-1',
      doctype: 'CRM Deal',
      enabled: true,
      hasTaller: true,
    })
    const opener = [...root.querySelectorAll('button')].find((node) =>
      node.textContent.toLowerCase().includes('reparaci'),
    )
    expect(opener).toBeTruthy()
    opener.click()
    await settle()
    await input('No enciende')
    await click('Create')
    expect(request.client_uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(root.querySelector('fieldset').disabled).toBe(true)
    expect(api.leave()).toBe(false)
    expect(api.update()).toBe(false)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await click('Close dialog')
    expect(root.querySelector('[role="dialog"]')).not.toBeNull()
    expect(root.querySelector('[data-intake]').value).toBe('No enciende')
    resolve('RO-NEW')
    await settle()
    expect(root.textContent).toContain('Reparación vinculada:')
    expect(root.textContent).toContain('RO-NEW')
    await click('Close dialog')
    expect(root.querySelector('[role="dialog"]')).toBeNull()
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
    expect(root.textContent).toContain('No repair orders linked')
  })
})
