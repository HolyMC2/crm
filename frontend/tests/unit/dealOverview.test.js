import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
const mocks = vi.hoisted(() => ({ call: vi.fn(), modal: vi.fn(), resources: [], reload: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call, createResource: () => mocks.resources.shift(), toast: { success: vi.fn() } }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({ getUser: () => ({ full_name: 'Ana' }) }) }))
vi.mock('@/stores/statuses', () => ({ statusesStore: () => ({ getDealStatus: () => ({ type: 'Open' }) }) }))
vi.mock('@/composables/doctypeModal', () => ({ useDoctypeModal: () => ({ showModal: mocks.modal }) }))
vi.mock('@/composables/inbox', () => ({ hasTaller: { value: false }, salesDocsEnabled: { value: false }, reloadQueue: mocks.reload }))
vi.mock('@/composables/salesDocs', () => ({ reloadSalesSummary: vi.fn() }))
vi.mock('@/components/doco/NextActivityChip.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/components/doco/inbox/DealConversations.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/doco/inbox/SalesDocsSection.vue', () => ({ default: { template: '<div />' } }))
import DealOverview from '@/components/doco/inbox/DealOverview.vue'

const cleanup = []
afterEach(() => { cleanup.splice(0).forEach((fn) => fn()); vi.clearAllMocks() })
async function mount(doc = {}) {
  const record = reactive({ data: { deal_owner: 'ana@example.invalid', ...doc }, fetch: vi.fn(), loading: false })
  mocks.resources = [record, reactive({ data: [], fetch: vi.fn() })]
  const el = document.createElement('div'); document.body.appendChild(el)
  const app = createApp(DealOverview, { name: 'DEAL-42' })
  app.config.globalProperties.__ = (s) => s
  app.mount(el)
  cleanup.push(() => { app.unmount(); el.remove() })
  await nextTick()
  return { el, record, button: (label) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === label) }
}
describe('deal overview follow-up workflow', () => {
  it('prefills a new task with the current deal and responsible person', async () => {
    const ui = await mount()
    expect(ui.el.textContent).toContain('Sin seguimiento programado')
    ui.button('Programar seguimiento').click()
    expect(mocks.modal).toHaveBeenCalledWith(expect.objectContaining({ doctype: 'CRM Task', name: null, defaults: expect.objectContaining({ reference_doctype: 'CRM Deal', reference_docname: 'DEAL-42', assigned_to: 'ana@example.invalid' }) }))
  })
  it('completes the canonical next task once and refreshes the queue', async () => {
    let finish
    mocks.call.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const ui = await mount({ next_activity_task: 'TASK-9', next_activity_title: 'Confirmar presupuesto' })
    const button = ui.button('Marcar como hecha')
    button.click(); button.click()
    expect(mocks.call).toHaveBeenCalledTimes(1)
    expect(mocks.call).toHaveBeenCalledWith('frappe.client.set_value', expect.objectContaining({ name: 'TASK-9', fieldname: 'status', value: 'Done' }))
    finish(); await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  })
  it('keeps a failed task actionable and does not claim it was completed', async () => {
    mocks.call.mockRejectedValue(new Error('PermissionError'))
    const ui = await mount({ next_activity_task: 'TASK-9', next_activity_title: 'Confirmar presupuesto' })
    ui.button('Marcar como hecha').click()
    await vi.waitFor(() => expect(ui.el.querySelector('[role="alert"]')).not.toBeNull())
    expect(mocks.reload).not.toHaveBeenCalled()
    expect(ui.el.textContent).toContain('Confirmar presupuesto')
  })
})
