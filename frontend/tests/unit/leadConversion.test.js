/* eslint-disable vue/one-component-per-file -- Render stubs isolate the real conversion modal. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  push: vi.fn(),
  modal: vi.fn(),
  route: { name: 'Leads List', fullPath: '/leads?view=mine', query: {} },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => mocks.route,
  onBeforeRouteLeave() {},
}))
vi.mock('frappe-ui', () => ({
  call: (...args) => mocks.call(...args),
  createResource: () => reactive({ data: [] }),
  Dialog: defineComponent({
    setup(_, { slots }) {
      return () =>
        h('div', [
          slots['body-header']?.(),
          slots.default?.(),
          slots.actions?.(),
        ])
    },
  }),
  Switch: defineComponent({
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          { onClick: () => emit('update:modelValue', !props.modelValue) },
          String(props.modelValue),
        )
    },
  }),
}))
vi.mock('frappe-ui/frappe', () => ({
  useOnboarding: () => ({ updateOnboardingStep() {} }),
  useTelemetry: () => ({ capture() {} }),
}))
vi.mock('@/data/document', () => ({
  useDocument: () => ({
    triggerConvertToDeal: async () => {},
    document: reactive({ doc: {} }),
  }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => false }),
}))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'seller@example.test' }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({ statusOptions: () => [], getDealStatus: () => ({}) }),
}))
vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ doctypeMeta: ref({ fields: [] }) }),
}))
vi.mock('@/composables/modals', () => ({
  showQuickEntryModal: ref(false),
  quickEntryProps: ref({}),
}))
vi.mock('@/composables/settings', () => ({ isMobileView: ref(false) }))
vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: mocks.modal }),
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/FieldLayout/FieldLayout.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Pipeline/PipelineSelector.vue', () => ({
  default: { render: () => null },
}))
import Modal from '@/components/Modals/ConvertToDealModal.vue'
import {
  conversionQueueReturn,
  safeQueueReturn,
} from '@/utils/salesQueueContext'
const context = () => ({
  lead: {
    name: 'LEAD-1',
    lead_owner: 'owner@example.test',
    pipeline: 'sales-a',
    sales_company: 'Company A',
  },
  modified: '2026-09-26 10:00:00',
  contacts: [],
  organizations: [],
})
let cleanups = []
beforeEach(() => {
  mocks.call.mockReset()
  mocks.push.mockReset()
  mocks.modal.mockReset()
})
afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
})
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const values = reactive({
    modelValue: true,
    lead: { name: 'LEAD-1' },
    ...props,
  })
  const app = createApp({ render: () => h(Modal, values) })
  app.config.globalProperties.__ = globalThis.__
  app.component(
    // eslint-disable-next-line vue/no-reserved-component-names -- frappe-ui registers this global name.
    'Button',
    defineComponent({
      props: {
        label: { type: String, default: '' },
        disabled: Boolean,
        loading: Boolean,
      },
      setup(p, { attrs }) {
        return () =>
          h(
            'button',
            { ...attrs, disabled: p.disabled || p.loading },
            p.label || attrs.icon,
          )
      },
    }),
  )
  app.component(
    'ErrorMessage',
    defineComponent({
      props: { message: { type: String, default: '' } },
      setup(p) {
        return () => h('p', { role: 'alert' }, p.message)
      },
    }),
  )
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, values }
}
const button = (el, label) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === label)
const conversions = () =>
  mocks.call.mock.calls.filter(([method]) => method.endsWith('convert_to_deal'))

describe('reviewed conversion UI', () => {
  it('does not convert until the current review loads, and reports a retryable load error', async () => {
    mocks.call
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(context())
    const { el } = await mount()
    expect(button(el, 'Convert').disabled).toBe(true)
    expect(el.textContent).toContain('Could not load conversion review')
    button(el, 'Retry review').click()
    await flush()
    expect(button(el, 'Convert').disabled).toBe(false)
    expect(conversions()).toHaveLength(0)
  })
  it('retains explicit identity, pipeline and same UUID across an unknown result', async () => {
    mocks.call
      .mockResolvedValueOnce({
        ...context(),
        contacts: [{ name: 'CONTACT-A', full_name: 'Reviewed person' }],
      })
      .mockRejectedValueOnce(new TypeError('lost response'))
      .mockResolvedValueOnce('DEAL-1')
    const converted = vi.fn()
    const { el } = await mount({ onConverted: converted })
    button(el, 'Reviewed person').click()
    await flush()
    button(el, 'Convert').click()
    await flush()
    const original = structuredClone(conversions()[0][1])
    expect(original).toMatchObject({
      lead: 'LEAD-1',
      existing_contact: 'CONTACT-A',
      create_new_contact: false,
      expected_modified: context().modified,
      deal: { pipeline: 'sales-a', sales_company: 'Company A' },
    })
    expect(el.querySelector('fieldset').disabled).toBe(true)
    button(el, 'Check conversion').click()
    await flush()
    expect(conversions()[1][1]).toEqual(original)
    expect(converted).toHaveBeenCalledWith('DEAL-1')
    expect(mocks.push).not.toHaveBeenCalled()
    button(el, 'Schedule next step').click()
    await flush()
    expect(mocks.modal).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: 'CRM Task',
        defaults: expect.objectContaining({
          reference_doctype: 'CRM Deal',
          reference_docname: 'DEAL-1',
          assigned_to: 'owner@example.test',
        }),
      }),
    )
    button(el, 'Open deal').click()
    await flush()
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'Deal',
      params: { dealId: 'DEAL-1' },
      query: { returnTo: '/leads?view=mine' },
    })
  })
  it('locks a double-click and reconciles an existing result without another write', async () => {
    let resolve
    mocks.call.mockResolvedValueOnce(context()).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { el } = await mount()
    button(el, 'Convert').click()
    button(el, 'Convert').click()
    await flush()
    expect(conversions()).toHaveLength(1)
    resolve('DEAL-1')
    await flush()
    expect(el.textContent).toContain('Lead converted to DEAL-1')
  })
  it('retains a refused draft and requires a fresh review after stale source data', async () => {
    mocks.call.mockResolvedValueOnce(context()).mockRejectedValueOnce({
      exc_type: 'TimestampMismatchError',
      messages: ['Lead changed'],
    })
    const failed = vi.fn()
    const { el } = await mount({ onFailed: failed })
    button(el, 'Convert').click()
    await flush()
    expect(failed).toHaveBeenCalledWith('Lead changed')
    expect(button(el, 'Convert').disabled).toBe(true)
    expect(button(el, 'Retry review')).toBeDefined()
  })
  it('returns a native record conversion to its originating work queue', async () => {
    const prior = { ...mocks.route }
    mocks.route.name = 'Lead'
    mocks.route.fullPath = '/leads/LEAD-1'
    mocks.route.query = { returnTo: '/tasks/view/list?view=today' }
    try {
      mocks.call.mockResolvedValueOnce({
        ...context(),
        existing_deal: 'DEAL-OLD',
      })
      const { el } = await mount()
      button(el, 'Return to queue').click()
      await flush()
      expect(mocks.push).toHaveBeenCalledWith('/tasks/view/list?view=today')
    } finally {
      Object.assign(mocks.route, prior)
    }
  })
  it('offers the authorized existing deal without issuing conversion again', async () => {
    mocks.call.mockResolvedValueOnce({
      ...context(),
      existing_deal: 'DEAL-OLD',
    })
    const converted = vi.fn()
    const { el } = await mount({ onConverted: converted })
    expect(button(el, 'Convert')).toBeUndefined()
    expect(converted).toHaveBeenCalledWith('DEAL-OLD')
    expect(conversions()).toHaveLength(0)
  })
})

describe('bounded queue return', () => {
  it('preserves list view context and rejects external or record destinations', () => {
    expect(safeQueueReturn('/tasks/view/kanban?view=mine')).toBe(
      '/tasks/view/kanban?view=mine',
    )
    for (const path of [
      'https://example.test',
      '//example.test',
      '/app/sales-order/X',
      '/leads/PRIVATE',
      '/leads\\evil',
    ])
      expect(safeQueueReturn(path)).toBe('')
    expect(
      conversionQueueReturn({
        fullPath: '/leads/LEAD-1',
        query: { view: 'Team A', viewType: 'kanban' },
      }),
    ).toBe('/leads/view/kanban?view=Team+A')
  })
})
