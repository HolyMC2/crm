// Real DealWorkspace tabs, canonical Inbox selectors and intake state; rendering/API edges doubled.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), intake: null }))
vi.mock('@/stores/session', () => ({ sessionStore: () => api.session }))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  createResource: (options) =>
    reactive({
      url: options?.url,
      data: null,
      loading: false,
      submit: vi.fn(async () => []),
      fetch: vi.fn(),
      reload: vi.fn(),
    }),
  toast: { success: vi.fn(), error: vi.fn() },
  Tabs: { render: () => null },
}))
vi.mock('@/utils/statusGuard', () => ({ guardStatusChange: vi.fn() }))
vi.mock('@/utils/crmCapabilities', () => ({
  ADDON_APP: 'doco_marketing',
  hasApp: () => false,
  loadCapabilities: async () => ({}),
}))
vi.mock('@/components/Activities/Activities.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/ItemWorkspace.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/DealHeader.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/LostStagePrompt.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/DealOverview.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/ThreadSummary.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/IntentChips.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/ThreadSearch.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/DealConversations.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/RepairOrdersSection.vue', () => ({
  default: defineComponent({
    props: { docname: { type: String, required: true } },
    setup(props) {
      api.intake = useRepairOrders(() => props.docname)
      return () =>
        h(
          'div',
          { 'data-repair-owner': true },
          api.intake.state.value.draft.falla_reportada,
        )
    },
  }),
}))
import { useRepairOrders } from '@/composables/repairOrders'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import {
  activeDeal,
  activeDealDoctype,
  activeTab,
  activeUnassigned,
  activeCommentPost,
  features,
  selectDeal,
  selectUnassigned,
  selectCommentGroup,
} from '@/composables/inbox'
let app, root
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm')
beforeEach(() => {
  api.session = reactive({ user: 'repair-agent@example.test' })
  sessionStorage.clear()
  document.cookie = 'user_id=repair-agent%40example.test'
  api.call.mockImplementation(async () => ({
    orders: [],
    can_create: true,
    defaults: {},
    laboratorios: [],
  }))
  features.data = { has_taller: true }
  activeDeal.value = 'DEAL-1'
  activeDealDoctype.value = 'CRM Deal'
  activeUnassigned.value = activeCommentPost.value = null
  activeTab.value = 'repair'
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  })
})
afterEach(async () => {
  app?.unmount()
  root?.remove()
  app = null
  activeDeal.value = null
  await settle()
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm)
  else delete window.confirm
  api.call.mockReset()
})
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(DealWorkspace)
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  Object.assign(api.intake.state.value.draft, {
    device_model: 'PHONE',
    falla_reportada: 'Original human draft',
  })
}
const overviewTab = () =>
  [...root.querySelectorAll('[role="tab"]')].find((node) =>
    node.textContent.includes('Resumen'),
  )

describe('legacy Inbox repair navigation', () => {
  it('blocks actual tab and every queue selector during a pending create, then resumes ordinary selection after completion/disposal', async () => {
    await mount()
    let resolve
    api.call.mockImplementation((method) =>
      method.endsWith('create_and_link_repair_order')
        ? new Promise((yes) => {
            resolve = yes
          })
        : Promise.resolve({
            orders: [],
            can_create: true,
            defaults: {},
            laboratorios: [],
          }),
    )
    const creating = api.intake.create()
    overviewTab().click()
    await settle()
    expect(activeTab.value).toBe('repair')
    expect(root.querySelector('[data-repair-owner]')).not.toBeNull()
    expect(selectDeal('DEAL-2')).toBe(false)
    expect(selectUnassigned('PHONE-2')).toBe(false)
    expect(selectCommentGroup('POST-2')).toBe(false)
    expect(activeDeal.value).toBe('DEAL-1')
    expect(activeUnassigned.value).toBeNull()
    expect(activeCommentPost.value).toBeNull()
    expect(api.intake.state.value.draft.falla_reportada).toBe(
      'Original human draft',
    )
    resolve('RO-1')
    await creating
    overviewTab().click()
    await settle()
    expect(activeTab.value).toBe('overview')
    expect(root.querySelector('[data-repair-owner]')).toBeNull()
    selectDeal('DEAL-2')
    await settle()
    expect(activeDeal.value).toBe('DEAL-2')
  })
  it('asks once to discard a dirty intake and leaves the original tab/draft on refusal', async () => {
    await mount()
    window.confirm.mockReturnValueOnce(false)
    overviewTab().click()
    await settle()
    expect(activeTab.value).toBe('repair')
    expect(api.intake.state.value.draft.falla_reportada).toBe(
      'Original human draft',
    )
    expect(window.confirm).toHaveBeenCalledTimes(1)
    window.confirm.mockClear()
    selectDeal('DEAL-2')
    await settle()
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(activeDeal.value).toBe('DEAL-2')
    expect(activeTab.value).toBe('overview')
  })
})
