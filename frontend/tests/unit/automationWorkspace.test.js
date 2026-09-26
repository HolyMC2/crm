import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const state = vi.hoisted(() => ({ call: vi.fn(), query: {} }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query, fullPath: '/automations' }),
}))
import AutomationWorkspace from '@/pages/AutomationWorkspace.vue'
let app, root
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.call.mockReset()
  state.query = {}
})
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(AutomationWorkspace) })
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await Promise.resolve()
  await nextTick()
}
describe('CRM automation workspace continuation', () => {
  it('forwards exact source and return queue and does not activate anything', async () => {
    state.query = {
      reference_doctype: 'CRM Deal',
      reference_name: 'DEAL-1',
      return_to: '/crm/deals?owner=me#offers',
    }
    state.call.mockResolvedValue({
      available: true,
      reference: { doctype: 'CRM Deal', name: 'DEAL-1' },
      workspace_url: '/desk/automatizaciones?dept=sales&crm_name=DEAL-1',
    })
    await mount()
    expect(state.call).toHaveBeenCalledExactlyOnceWith(
      'crm.api.automation_workspace.get_context',
      state.query,
    )
    expect(root.querySelector('a').getAttribute('href')).toBe(
      '/desk/automatizaciones?dept=sales&crm_name=DEAL-1',
    )
    expect(root.textContent).toContain('DEAL-1')
  })
  it('renders missing integration as unavailable, with core sales still usable', async () => {
    state.call.mockResolvedValue({ available: false, reason: 'not_installed' })
    await mount()
    expect(root.textContent).toContain('not installed')
    expect(root.querySelector('a')).toBeNull()
  })
  it('retains a retry action after outage instead of showing empty success', async () => {
    state.call.mockRejectedValue(new Error('Service unavailable'))
    await mount()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'Service unavailable',
    )
    state.call.mockResolvedValue({
      available: true,
      workspace_url: '/desk/automatizaciones?dept=sales',
    })
    root.querySelector('button').click()
    await Promise.resolve()
    await nextTick()
    expect(root.querySelector('a')).not.toBeNull()
  })
  it('rejects an incomplete or external workspace destination', async () => {
    state.call.mockResolvedValue({
      available: true,
      workspace_url: 'https://evil.invalid/',
    })
    await mount()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'incomplete',
    )
    expect(root.querySelector('a')).toBeNull()
  })
})
