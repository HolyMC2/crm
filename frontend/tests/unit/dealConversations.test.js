import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import DealConversations from '@/components/doco/inbox/DealConversations.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})
async function mount() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inbox', name: 'Inbox', component: { template: '<div />' } }] })
  await router.push('/inbox')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(DealConversations, { doctype: 'CRM Deal', name: 'DEAL-1' })
  app.config.globalProperties.__ = (s) => s
  app.use(router).mount(el)
  cleanups.push(() => { app.unmount(); el.remove() })
  await vi.waitFor(() => expect(el.querySelector('[role="status"]')).toBeNull())
  return el
}
describe('deal native conversations', () => {
  it('opens the exact conversation and keeps unrelated deal query parameters out', async () => {
    call.mockResolvedValue({ items: [{ name: 'exact-thread', provider: 'WhatsApp', account_id: '123', control_state: 'Human' }], next_cursor: null })
    const el = await mount()
    expect(call).toHaveBeenCalledWith('crm.api.conversation_threads.list_for_reference', { doctype: 'CRM Deal', name: 'DEAL-1', cursor: null })
    expect(el.querySelector('li a').getAttribute('href')).toBe('/inbox?conversation=exact-thread')
  })
  it('explains an empty list and offers the conversation queue', async () => {
    call.mockResolvedValue({ items: [], next_cursor: null })
    const el = await mount()
    expect(el.textContent).toContain('No hay conversaciones vinculadas')
    expect(el.querySelector('a').getAttribute('href')).toBe('/inbox')
  })
  it('recovers from a denied or failed request with an explicit retry', async () => {
    call.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce({ items: [], next_cursor: null })
    const el = await mount()
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    el.querySelector('button').click()
    await nextTick()
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]')).toBeNull())
    expect(call).toHaveBeenCalledTimes(2)
  })
})
