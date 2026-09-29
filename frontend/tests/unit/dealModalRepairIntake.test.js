/* eslint-disable vue/one-component-per-file, vue/no-reserved-component-names -- Test-local rendering and API boundaries. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
const api = vi.hoisted(() => ({
  resources: [],
  push: vi.fn(),
  assign: vi.fn(),
  toast: vi.fn(),
  hasTaller: null,
}))
vi.mock('frappe-ui', () => ({
  createResource: (options) => {
    const resource = reactive({
      ...options,
      data: [],
      fetch: vi.fn(),
      reload: vi.fn(),
    })
    api.resources.push(resource)
    return resource
  },
  call: vi.fn(),
  toast: { error: (...args) => api.toast(...args) },
  Switch: { render: () => null },
  FormControl: { render: () => null },
  Badge: { render: () => null },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: api.push,
    resolve: (to) => ({
      fullPath: `/${to.name === 'Deal 360' ? 'deal' : 'deals'}/${encodeURIComponent(to.params.dealId)}`,
    }),
  }),
}))
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  api.hasTaller = ref(true)
  return { hasTaller: api.hasTaller }
})
vi.mock('@/utils/repairOrders', async (importOriginal) => ({
  ...(await importOriginal()),
  goToTallerIntake: (href) => api.assign(href),
}))
vi.mock('frappe-ui/frappe', () => ({
  useTelemetry: () => ({ capture: vi.fn() }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({ name: 'seller@example.test' }),
    isManager: () => false,
  }),
}))
vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ doctypeMeta: ref({ fields: [] }) }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({}),
    statusOptions: () => [{ value: 'Open' }],
  }),
}))
vi.mock('@/utils/crmCapabilities', () => ({ hasApp: () => true }))
vi.mock('@/composables/settings', () => ({ isMobileView: false }))
vi.mock('@/composables/modals', () => ({
  showQuickEntryModal: ref(false),
  quickEntryProps: ref({}),
}))
vi.mock('@/data/document', () => ({
  useDocument: () => ({
    document: reactive({
      doc: { status: 'Open', name: 'DEAL-NEW' },
      get: { loading: false },
      save: { loading: false },
      originalDoc: {},
    }),
    triggerOnBeforeCreate: vi.fn(),
  }),
}))
vi.mock('@/components/Pipeline/PipelineSelector.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/FieldLayout/FieldLayout.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
import DealModal from '@/components/Modals/DealModal.vue'
const Button = defineComponent({
  props: {
    label: { type: String, default: '' },
    loading: Boolean,
    disabled: Boolean,
  },
  setup:
    (props, { slots }) =>
    () =>
      h(
        'button',
        { disabled: props.loading || props.disabled },
        props.label || slots.default?.(),
      ),
})
let app, root
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const button = (label) =>
  [...root.querySelectorAll('button')].find(
    (node) => node.textContent.trim() === label,
  )
beforeEach(() => {
  api.resources = []
  api.push.mockReset()
  api.assign.mockReset()
  api.toast.mockReset()
  api.hasTaller.value = true
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})
async function mount(redirect = { name: 'Deal' }) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(DealModal, { modelValue: true, redirect })
  app.config.globalProperties.__ = globalThis.__
  app.component('Button', Button)
  app.component('Dialog', {
    props: { open: Boolean },
    setup:
      (props, { slots }) =>
      () =>
        props.open ? h('div', slots.body?.()) : null,
  })
  app.component('ErrorMessage', {
    props: { message: { type: String, default: '' } },
    setup: (props) => () => h('p', props.message),
  })
  app.mount(root)
  await settle()
}
async function submit(label, redirect) {
  await mount(redirect)
  button(label).click()
  await settle()
  const command = api.resources.find((row) => row.url.endsWith('create_deal'))
  command.validate()
  command.onSuccess('DEAL NEW/1')
  await settle()
  return api.resources.find((row) =>
    row.url.endsWith('sync_deal_contacts_to_erpnext'),
  )
}

describe('DealModal hands repair intake to taller', () => {
  it('offers «Crear y recibir equipo» only when taller runs on the tenant', async () => {
    await mount()
    expect(button('Crear y recibir equipo')).toBeTruthy()
    expect(button('Create')).toBeTruthy()
    expect(root.querySelector('input[type="checkbox"]')).toBeNull()
    app.unmount()
    root.remove()
    api.hasTaller.value = false
    await mount()
    expect(button('Crear y recibir equipo')).toBeUndefined()
    expect(button('Create')).toBeTruthy()
  })

  it('creates the deal, waits for the customer sync, then opens taller Intake for it', async () => {
    const sync = await submit('Crear y recibir equipo')
    expect(sync.params.deal_name).toBe('DEAL NEW/1')
    expect(api.assign).not.toHaveBeenCalled()
    expect(api.push).not.toHaveBeenCalled()
    expect(button('Create').disabled).toBe(true)
    sync.onSuccess()
    await settle()
    expect(api.assign).toHaveBeenCalledOnce()
    expect(api.assign).toHaveBeenCalledWith(
      '/taller/intake?deal=DEAL%20NEW%2F1&return=' +
        encodeURIComponent('/crm/deals/DEAL%20NEW%2F1'),
    )
    expect(api.push).not.toHaveBeenCalled()
    expect(
      api.resources.some((row) => /repair_orders\.create/.test(row.url)),
    ).toBe(false)
  })

  it('still hands off after a failed sync and keeps the error visible', async () => {
    const sync = await submit('Crear y recibir equipo', { name: 'Deal 360' })
    sync.onError({ messages: ['ERP offline'] })
    await settle()
    expect(api.toast).toHaveBeenCalledOnce()
    expect(api.assign).toHaveBeenCalledWith(
      '/taller/intake?deal=DEAL%20NEW%2F1&return=' +
        encodeURIComponent('/crm/deal/DEAL%20NEW%2F1'),
    )
  })

  it('keeps plain «Create» on the immediate deal redirect', async () => {
    await submit('Create')
    expect(api.push).toHaveBeenCalledWith({
      name: 'Deal',
      params: { dealId: 'DEAL NEW/1' },
    })
    expect(api.assign).not.toHaveBeenCalled()
  })
})
