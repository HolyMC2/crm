import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
const h = vi.hoisted(() => ({ handlers: {} }))
vi.mock('frappe-ui', () => ({ call: vi.fn(), toast: { error: vi.fn() } }))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $socket: {
      on: (name, fn) => {
        h.handlers[name] = fn
      },
      off: (name) => {
        delete h.handlers[name]
      },
    },
  }),
}))
import { call, toast } from 'frappe-ui'
import ConversationControlStrip from '@/components/doco/inbox/ConversationControlStrip.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})

async function mount(props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inbox', name: 'Inbox', component: { template: '<div />' } },
    ],
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(ConversationControlStrip, {
    referenceDoctype: 'CRM Deal',
    referenceName: 'DEAL-1',
    phone: '5215550100999',
    whatsappAccount: 'Branch',
    ...props,
  })
  app.config.globalProperties.__ = (s, args = []) =>
    s.replace(/\{(\d)\}/g, (_, i) => args[i])
  globalThis.__ = app.config.globalProperties.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await vi.waitFor(() => expect(call).toHaveBeenCalled())
  await nextTick()
  return el
}

const bot = {
  name: 'conv-1',
  control_state: 'Bot',
  human_owner: null,
  generation: 4,
  provider_control: 'Not Applicable',
  allowed_actions: ['take', 'pause'],
  manager_reason_required: true,
  actor: 'ana@x.invalid',
}

describe('conversation control strip', () => {
  it('reads the thread control for the active number and account, and stays hidden without a conversation', async () => {
    call.mockResolvedValue(null)
    const el = await mount()
    expect(call).toHaveBeenCalledWith('crm.api.outbox_bridge.thread_control', {
      reference_doctype: 'CRM Deal',
      reference_name: 'DEAL-1',
      phone: '5215550100999',
      whatsapp_account: 'Branch',
    })
    expect(el.querySelector('[role="status"]')).toBeNull()
  })

  it('takes over from the assistant with the current generation and a fresh command id, no reason asked', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('thread_control') ? bot : { generation: 5 },
    )
    const el = await mount()
    await vi.waitFor(() =>
      expect(el.textContent).toContain(
        'El asistente atiende esta conversación',
      ),
    )
    const take = [...el.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Tomar control'),
    )
    take.click()
    await vi.waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'crm.api.conversations.apply_control',
        expect.objectContaining({
          name: 'conv-1',
          action: 'take',
          expected_generation: 4,
          reason: undefined,
        }),
      ),
    )
    const args = call.mock.calls.find(([m]) => m.endsWith('apply_control'))[1]
    expect(args.command_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("asks a manager why before taking another person's conversation, and explains a conflict", async () => {
    const owned = {
      ...bot,
      control_state: 'Human',
      human_owner: 'luis@x.invalid',
      owner_name: 'Luis',
      allowed_actions: ['take', 'transfer', 'release'],
    }
    call.mockImplementation(async (method) => {
      if (method.endsWith('thread_control')) return owned
      throw {
        messages: ['La conversación cambió. Recárgala antes de reintentar.'],
      }
    })
    const el = await mount()
    await vi.waitFor(() =>
      expect(el.textContent).toContain('Luis atiende esta conversación'),
    )
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Tomar control'))
      .click()
    await nextTick()
    const input = el.querySelector('input[placeholder="Motivo"]')
    expect(input).not.toBeNull()
    input.value = 'Cliente de mi zona'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Confirmar'))
      .click()
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'La conversación cambió. Recárgala antes de reintentar.',
      ),
    )
    expect(call).toHaveBeenCalledWith(
      'crm.api.conversations.apply_control',
      expect.objectContaining({ action: 'take', reason: 'Cliente de mi zona' }),
    )
  })
})
