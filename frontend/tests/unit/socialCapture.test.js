import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({
  calls: [],
  resources: [],
  behavior: async () => ({}),
  session: null,
  push: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { reactive } = await import('vue')
  return {
    call: (...args) => {
      api.calls.push(args)
      return api.behavior(...args)
    },
    createResource: (options) => {
      const resource = reactive({
        data: options.url.endsWith('get_shops')
          ? { shops: [], is_manager: true }
          : [],
        loading: false,
        error: null,
        reload: vi.fn(),
      })
      api.resources.push(resource)
      return resource
    },
    toast: { success: vi.fn(), error: vi.fn() },
    dayjsLocal: vi.fn(),
    dayjs: vi.fn(),
    getConfig: vi.fn(),
  }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...args) => api.push(...args) }),
}))
vi.mock('@/stores/session', () => ({ sessionStore: () => api.session }))
vi.mock('@/components/SocialCaptureHealth.vue', () => ({
  default: defineComponent({
    props: ['shop'],
    setup(props) {
      return () =>
        h('div', { 'data-testid': 'capture-health', 'data-shop': props.shop })
    },
  }),
}))
import SocialMentions from '@/pages/SocialMentions.vue'

let app, el
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}
function mount(rows = []) {
  el = document.createElement('div')
  document.body.appendChild(el)
  app = createApp(SocialMentions)
  app.component(
    'RouterLink',
    defineComponent({
      props: ['to'],
      setup(props, { slots }) {
        return () =>
          h('a', { 'data-route': JSON.stringify(props.to) }, slots.default?.())
      },
    }),
  )
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  api.resources[1].data = rows
  return el
}
const row = {
  name: 'MENTION-1',
  mention_type: 'Reseña',
  author_username: 'referrer',
  status: 'Nuevo',
  text: 'Contexto público',
}
beforeEach(() => {
  api.calls = []
  api.resources = []
  api.session = reactive({ user: 'staff@example.test' })
  api.push.mockReset()
  api.push.mockResolvedValue(undefined)
  api.behavior = async () => ({ name: 'INQ-7' })
})
afterEach(() => {
  app?.unmount()
  el?.remove()
})

describe('Social Menciones inquiry capture', () => {
  it('uses the adapter with only the mention ID and opens the serialized inquiry result', async () => {
    mount([row])
    await nextTick()
    el.querySelector('[data-testid="mention-capture-0"]').click()
    await flush()
    expect(api.calls).toEqual([
      [
        'doco_marketing.services.social.referrals.capture_mention',
        { name: 'MENTION-1' },
      ],
    ])
    expect(api.push).toHaveBeenCalledWith({
      name: 'Inquiries',
      query: { name: 'INQ-7' },
    })
    expect(el.textContent).toContain('Abrir consulta capturada')
  })

  it('shows an inline failure and retries the same source without navigating', async () => {
    api.behavior = async () => {
      throw { exc_type: 'PermissionError' }
    }
    mount([row])
    await nextTick()
    el.querySelector('[data-testid="mention-capture-0"]').click()
    await flush()
    expect(el.querySelector('[role="alert"]').textContent).toContain(
      'No tienes permiso',
    )
    expect(api.push).not.toHaveBeenCalled()
    el.querySelector('[data-testid="mention-capture-0"]').click()
    await flush()
    expect(api.calls[1]).toEqual(api.calls[0])
  })

  it('does not navigate on a capture response from a previous actor', async () => {
    let finish
    api.behavior = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    mount([row])
    await nextTick()
    el.querySelector('[data-testid="mention-capture-0"]').click()
    api.session.user = 'different@example.test'
    finish({ name: 'INQ-SECRET' })
    await flush()
    expect(api.push).not.toHaveBeenCalled()
    expect(el.textContent).not.toContain('INQ-SECRET')
  })

  it('keeps manual capture visible and describes incomplete social coverage honestly', () => {
    mount()
    const manualLinks = [...el.querySelectorAll('[data-route]')].filter(
      (link) => JSON.parse(link.dataset.route) === '/inquiries?capture=1',
    )
    expect(manualLinks).toHaveLength(2)
    expect(el.textContent).toContain('no están garantizadas')
    expect(el.textContent).not.toContain('aparecerá aquí automáticamente')
    expect(
      el.querySelector('[data-testid="capture-health"]').dataset.shop,
    ).toBe('')
  })
})
