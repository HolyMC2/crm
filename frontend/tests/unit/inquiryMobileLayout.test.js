// Exercise the real App, RouterView, responsive layouts and native inquiry page.
// Peripheral shell widgets are isolated; the route slot and breakpoint are real.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ calls: [] }))
vi.mock('frappe-ui', async () => {
  const dates = await import('../../node_modules/frappe-ui/src/utils/dayjs.ts')
  const config =
    await import('../../node_modules/frappe-ui/src/utils/config.ts')
  return {
    dayjs: dates.dayjs,
    dayjsLocal: dates.dayjsLocal,
    getConfig: config.getConfig,
    setConfig: config.setConfig,
    useTheme: () => ({ setTheme: () => {} }),
    FrappeUIProvider: defineComponent({
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    call: async (url) => {
      api.calls.push(url)
      if (url.endsWith('get_assignees'))
        return [{ name: 'staff@example.test', full_name: 'Staff' }]
      if (url.endsWith('list_inquiries'))
        return {
          items: [
            {
              name: 'INQ-MOBILE',
              title: 'Visible mobile inquiry',
              status: 'New',
            },
          ],
          has_more: false,
        }
      if (url.endsWith('get_inquiry'))
        return {
          name: 'INQ-MOBILE',
          title: 'Visible mobile inquiry',
          status: 'New',
          modified: '2026-09-09 09:00:00',
          assigned_to: 'staff@example.test',
          can_write: true,
          source_type: 'Manual',
          source_text: 'Fictional mobile rendering fixture',
          people: [],
        }
      throw new Error(`Unexpected request: ${url}`)
    },
  }
})
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'staff@example.test', isLoggedIn: true }),
}))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $socket: { on() {}, off() {} } }),
}))
vi.mock('@/utils/prefetch', () => ({ prefetchHotChunks() {} }))
vi.mock('@/composables/telemetry', () => ({ initTelemetry() {} }))
vi.mock('@/utils/dialogs', () => ({ Dialogs: { render: () => null } }))
vi.mock('@/pages/NotPermitted.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/EventNotificationPopup.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Modals/DoctypeModals.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Modals/GlobalModals.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Layouts/AppHeader.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Layouts/DocoNavRail.vue', () => ({
  default: { render: () => h('nav', { 'data-testid': 'desktop-rail' }) },
}))
vi.mock('@/components/Mobile/MobileSidebar.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Mobile/MobileAppHeader.vue', () => ({
  default: { render: () => h('header', { 'data-testid': 'mobile-header' }) },
}))
vi.mock('@/components/Mobile/MobileTabBar.vue', () => ({
  default: { render: () => h('nav', { 'data-testid': 'mobile-tabs' }) },
}))
vi.mock('@/components/Mobile/OutboxStrip.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/installNudge', async () => {
  const { ref } = await import('vue')
  return {
    initInstallNudge() {},
    installNudgeVisible: ref(false),
    acceptInstall() {},
    dismissInstallNudge() {},
  }
})

import App from '@/App.vue'
import Inquiries from '@/pages/Inquiries.vue'

let app, root
const originalWidth = window.innerWidth
const originalHeight = window.innerHeight
function resize(width, height = 844) {
  window.innerWidth = width
  window.innerHeight = height
  window.dispatchEvent(new Event('resize'))
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  resize(originalWidth, originalHeight)
})

describe('native inquiry responsive layout rendering', () => {
  it('renders the real inquiry content and actions after desktop/mobile layout swaps and direct mobile navigation', async () => {
    resize(1440, 1000)
    api.calls = []
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ name: 'Inquiries', path: '/inquiries', component: Inquiries }],
    })
    await router.push({ name: 'Inquiries', query: { name: 'INQ-MOBILE' } })
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp(App)
    app.config.globalProperties.__ = globalThis.__
    app.use(router).mount(root)

    async function expectInquiryContent(layoutMarker) {
      await vi.waitFor(() => {
        expect(
          root.querySelector(`[data-testid="${layoutMarker}"]`),
        ).not.toBeNull()
        const page = root.querySelector('[data-testid="inquiries-page"]')
        expect(page).not.toBeNull()
        expect(page.querySelector('h1').textContent).toContain('Consultas')
        expect(
          page.querySelector('[data-testid="open-capture"]').textContent,
        ).toContain('Capturar consulta')
        expect(
          page.querySelector('[data-testid="inquiry-detail"]').textContent,
        ).toContain('Fictional mobile rendering fixture')
      })
    }

    await expectInquiryContent('desktop-rail')
    resize(390)
    await expectInquiryContent('mobile-header')
    expect(root.querySelector('[data-testid="mobile-tabs"]')).not.toBeNull()
    expect(
      root.querySelector('.page-in [data-testid="inquiries-page"]'),
    ).not.toBeNull()
    expect(root.querySelector('[data-testid="desktop-rail"]')).toBeNull()

    // Direct navigation while the mobile layout is active also retains the slot.
    await router.push({
      name: 'Inquiries',
      query: { name: 'INQ-MOBILE', capture: '1' },
    })
    await expectInquiryContent('mobile-header')
    expect(
      root.querySelector('[data-testid="inquiry-capture"]').style.display,
    ).not.toBe('none')
    resize(1440, 1000)
    await expectInquiryContent('desktop-rail')
    resize(390)
    await expectInquiryContent('mobile-header')
    expect(api.calls.length).toBeGreaterThan(0)
    expect(api.calls.every((url) => url.startsWith('crm.api.inquiries.'))).toBe(
      true,
    )
  })
})
