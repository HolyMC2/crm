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
async function mount(extra = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inbox', name: 'Inbox', component: { template: '<div />' } }] })
  await router.push('/inbox')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(DealConversations, { doctype: 'CRM Deal', name: 'DEAL-1', ...extra })
  app.config.globalProperties.__ = (s) => s
  app.use(router).mount(el)
  cleanups.push(() => { app.unmount(); el.remove() })
  await vi.waitFor(() => expect(el.querySelector('[role="status"]')).toBeNull())
  return { el, router }
}
const linked = { name: 'exact-thread', provider: 'WhatsApp', account_id: '123', peer_id: '5215550198766', display_name: 'Pablo', materialized: true, control_state: 'Human', preview: 'Muy bien gracias', last_message_at: '2026-09-09 16:17:59' }
const implied = { name: null, provider: 'WhatsApp', account_id: '123', peer_id: '5215550198766', display_name: 'Pablo', materialized: false, control_state: 'Human', preview: 'Muy bien gracias', last_message_at: '2026-09-09 16:17:59' }

describe('deal native conversations', () => {
  it('opens the exact conversation in the conversation space and keeps unrelated deal query parameters out', async () => {
    call.mockResolvedValue({ items: [linked], next_cursor: null })
    const { el } = await mount()
    expect(call).toHaveBeenCalledWith('crm.api.conversation_threads.list_for_reference', { doctype: 'CRM Deal', name: 'DEAL-1', cursor: null })
    expect(el.querySelector('li a').getAttribute('href')).toBe('/inbox?workspace=conversations&conversation=exact-thread')
    expect(el.querySelector('li').textContent).toContain('Pablo')
    expect(el.querySelector('li').textContent).toContain('Muy bien gracias')
  })
  it('materializes a thread implied by the record messages through the explicit open, then navigates to it', async () => {
    call.mockImplementation(async (method) => {
      if (method.endsWith('list_for_reference')) return { items: [implied], next_cursor: null }
      if (method.endsWith('open_thread')) return { name: 'opened-thread' }
      throw new Error('unexpected ' + method)
    })
    const { el, router } = await mount()
    const button = el.querySelector('li button')
    expect(button.textContent).toContain('Abrir historial')
    button.click()
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith('crm.api.conversation_threads.open_thread', { provider: 'WhatsApp', account_id: '123', peer_id: '5215550198766' }))
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ workspace: 'conversations', conversation: 'opened-thread' }))
  })
  it('explains an empty list and offers the conversation queue', async () => {
    call.mockResolvedValue({ items: [], next_cursor: null })
    const { el } = await mount()
    expect(el.textContent).toContain('No hay conversaciones vinculadas')
    expect(el.querySelector('a').getAttribute('href')).toBe('/inbox?workspace=conversations')
  })
  it('recovers from a denied or failed request with an explicit retry', async () => {
    call.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce({ items: [], next_cursor: null })
    const { el } = await mount()
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    el.querySelector('button').click()
    await nextTick()
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]')).toBeNull())
    expect(call).toHaveBeenCalledTimes(2)
  })
  it('compact line above the deal thread links each thread and stays hidden when there are none', async () => {
    call.mockResolvedValueOnce({ items: [linked], next_cursor: null })
    const { el } = await mount({ compact: true })
    await vi.waitFor(() => expect(el.querySelector('nav a')).not.toBeNull())
    expect(el.querySelector('nav a').getAttribute('href')).toBe('/inbox?workspace=conversations&conversation=exact-thread')
    expect(el.querySelector('nav').textContent).toContain('Pablo')
    expect(el.querySelector('section')).toBeNull()

    call.mockResolvedValueOnce({ items: [], next_cursor: null })
    const empty = await mount({ compact: true })
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2))
    await nextTick()
    expect(empty.el.querySelector('nav').style.display).toBe('none')
    expect(empty.el.textContent).not.toContain('No hay conversaciones vinculadas')
  })
})
