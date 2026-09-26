/* eslint-disable vue/one-component-per-file, vue/no-reserved-component-names -- Test-local rendering and API boundaries. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
const api = vi.hoisted(() => ({
  resources: [],
  push: vi.fn(),
  replace: vi.fn(),
  leave: null,
  route: null,
  canLeave: vi.fn(),
  toast: vi.fn(),
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
  useRouter: () => ({ push: api.push, replace: api.replace }),
  useRoute: () => api.route,
  onBeforeRouteLeave: (fn) => {
    api.leave = fn
  },
  onBeforeRouteUpdate: () => {},
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
vi.mock('@/components/Modals/DataFieldsModal.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/VerticalSlot.vue', () => ({
  default: { render: () => h('div', { 'data-vertical': true }) },
}))
vi.mock('@/components/doco/RepairOrdersSection.vue', () => ({
  default: defineComponent({
    props: {
      docname: { type: String, required: true },
      initiallyOpen: Boolean,
    },
    setup(props, { expose }) {
      expose({ canLeave: () => api.canLeave() })
      return () =>
        h(
          'div',
          {
            'data-intake-deal': props.docname,
            'data-open': props.initiallyOpen,
          },
          'Canonical repair intake',
        )
    },
  }),
}))
import DealModal from '@/components/Modals/DealModal.vue'
import DataFields from '@/components/Activities/DataFields.vue'
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
  api.replace.mockReset()
  api.toast.mockReset()
  api.canLeave.mockReturnValue(true)
  api.route = reactive({
    query: { repair_intake: '1', returnTo: '/deals?owner=me' },
    hash: '#data',
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})
async function mount(component, props) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(component, props)
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
async function submit(requested) {
  await mount(DealModal, {
    modelValue: true,
    redirect: { name: 'Deal 360', query: { returnTo: '/deals?owner=me' } },
  })
  if (requested) {
    root.querySelector('input[type="checkbox"]').click()
    await settle()
  }
  button('Create').click()
  await settle()
  const command = api.resources.find((row) => row.url.endsWith('create_deal'))
  command.validate()
  command.onSuccess('DEAL-NEW')
  await settle()
  return api.resources.find((row) =>
    row.url.endsWith('sync_deal_contacts_to_erpnext'),
  )
}

describe('saved Deal to explicit repair intake', () => {
  it('waits for the existing customer sync and guards pending navigation, then opens canonical native intake without creating an RO', async () => {
    const sync = await submit(true)
    expect(api.push).not.toHaveBeenCalled()
    expect(api.leave()).toBe(false)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    sync.onSuccess([])
    await settle()
    expect(api.push).toHaveBeenCalledExactlyOnceWith({
      name: 'Deal',
      params: { dealId: 'DEAL-NEW' },
      query: { returnTo: '/deals?owner=me', repair_intake: '1' },
      hash: '#data',
    })
    expect(
      api.resources.some((row) =>
        row.url.includes('create_and_link_repair_order'),
      ),
    ).toBe(false)
  })
  it('keeps sync failure visible and preserves the saved-Deal intake continuation', async () => {
    const sync = await submit(true)
    sync.onError({ message: 'Customer link denied' })
    await settle()
    expect(api.toast).toHaveBeenCalledWith(
      expect.stringContaining('Customer link denied'),
    )
    expect(api.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Deal', params: { dealId: 'DEAL-NEW' } }),
    )
  })
  it('keeps the original immediate redirect when repair intake is not selected', async () => {
    await submit(false)
    expect(api.push).toHaveBeenCalledExactlyOnceWith({
      name: 'Deal 360',
      query: { returnTo: '/deals?owner=me' },
      params: { dealId: 'DEAL-NEW' },
    })
    expect(api.leave()).toBe(true)
  })
  it('mounts only the canonical intake in the data tab and guards finishing while preserving queue and hash', async () => {
    await mount(DataFields, { doctype: 'CRM Deal', docname: 'DEAL-NEW' })
    expect(root.querySelector('[data-intake-deal]').dataset.intakeDeal).toBe(
      'DEAL-NEW',
    )
    expect(root.querySelector('[data-open]').dataset.open).toBe('true')
    expect(root.querySelector('[data-vertical]')).toBeNull()
    api.canLeave.mockReturnValueOnce(false)
    button('Terminar recepción').click()
    await settle()
    expect(api.replace).not.toHaveBeenCalled()
    button('Terminar recepción').click()
    await settle()
    expect(api.replace).toHaveBeenCalledExactlyOnceWith({
      query: { returnTo: '/deals?owner=me' },
      hash: '#data',
    })
  })
})
