import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const context = vi.hoisted(() => ({ route: { query: {} }, replace: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => context.route,
  useRouter: () => ({ replace: context.replace }),
}))
vi.mock('@/utils/crmCapabilities', async () => ({
  addonAvailable: (await import('vue')).ref(false),
}))
vi.mock('@/components/Inbox/ConversationWorkspace.vue', async () => ({
  __esModule: true,
  default: {
    emits: ['pending'],
    setup(_, { emit }) {
      return () =>
        h(
          'button',
          { 'data-native': '', onClick: () => emit('pending', true) },
          'Native conversation',
        )
    },
  },
}))
vi.mock('@/components/Inbox/ConversationLegacyWorkspace.vue', () => ({
  __esModule: true,
  default: { template: '<div data-legacy>Existing deal workspace</div>' },
}))
import Inbox from '@/pages/Inbox.vue'
import { addonAvailable } from '@/utils/crmCapabilities'
const cleanups = []
beforeEach(() => {
  addonAvailable.value = false
  context.route.query = {}
  context.replace.mockReset()
})
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(Inbox) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}
describe('one Inbox launcher', () => {
  it('opens the native workspace without importing or mounting optional activity UI', async () => {
    const el = mount()
    await vi.waitFor(() =>
      expect(el.querySelector('[data-native]')).not.toBeNull(),
    )
    expect(el.querySelector('[data-legacy]')).toBeNull()
    expect(el.querySelector('nav')).toBeNull()
  })
  it('preserves the existing deal deep link when the addon is installed', async () => {
    addonAvailable.value = true
    context.route.query = { deal: 'CRM-DEAL-1' }
    const el = mount()
    await vi.waitFor(() =>
      expect(el.querySelector('[data-legacy]')).not.toBeNull(),
    )
    expect(el.querySelector('[data-native]')).toBeNull()
  })
  it('defaults to Negocios y actividad when the addon is installed', async () => {
    addonAvailable.value = true
    const el = mount()
    await vi.waitFor(() =>
      expect(el.querySelector('[data-legacy]')).not.toBeNull(),
    )
    expect(el.querySelector('[data-native]')).toBeNull()
    const buttons = [...el.querySelectorAll('nav button')]
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    buttons[0].click()
    expect(context.replace).toHaveBeenCalledWith({
      query: {
        workspace: 'conversations',
        deal: undefined,
        conversation: undefined,
      },
    })
  })
  it('opens the conversation queue on request or on a conversation deep link', async () => {
    addonAvailable.value = true
    context.route.query = { workspace: 'conversations' }
    const first = mount()
    await vi.waitFor(() =>
      expect(first.querySelector('[data-native]')).not.toBeNull(),
    )
    context.route.query = { conversation: 'a'.repeat(64) }
    const second = mount()
    await vi.waitFor(() =>
      expect(second.querySelector('[data-native]')).not.toBeNull(),
    )
  })
  it('keeps an uncertain command in its native workspace until resolved', async () => {
    addonAvailable.value = true
    context.route.query = { workspace: 'conversations' }
    const el = mount()
    await vi.waitFor(() =>
      expect(el.querySelector('[data-native]')).not.toBeNull(),
    )
    el.querySelector('[data-native]').click()
    await nextTick()
    const buttons = [...el.querySelectorAll('nav button')]
    expect(buttons.every((button) => button.disabled)).toBe(true)
    buttons[1].click()
    expect(context.replace).not.toHaveBeenCalled()
  })
})
