// On the phone, Deal 360 mounts «Datos y contacto» the first time it opens
// (its reads stay off the cold open) and keeps it mounted afterwards.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ panelSetups: 0 }))

vi.mock('@/components/doco/inbox/DealContextPanel.vue', () => ({
  // The page imports this module lazily; the loader reads the ES-module marker.
  __esModule: true,
  default: defineComponent({
    name: 'DealContextPanel',
    setup() {
      state.panelSetups++
      return () => h('div', { class: 'ctx' })
    },
  }),
}))
vi.mock('@/components/doco/inbox/DealWorkspace.vue', () => ({
  default: { template: '<div class="ws" />' },
}))
vi.mock('@/components/shell/PaneState.vue', () => ({
  default: { template: '<div class="pane-state" />' },
}))
vi.mock('@/composables/breakpoint', () => ({ isMobile: ref(true) }))
vi.mock('@/composables/inbox', () => {
  const activeDeal = ref(null)
  const mobileView = ref('list')
  const activeTab = ref('conversation')
  return {
    activeDeal,
    mobileView,
    activeTab,
    selectDeal: (name) => {
      activeDeal.value = name
      mobileView.value = 'thread'
    },
    openContext: () => {
      mobileView.value = 'context'
    },
    onPresenceEvent: () => {},
    onCallEnded: () => {},
  }
})
vi.mock('@/composables/pageKeys', () => ({ useFormKeys: () => {} }))
vi.mock('@/composables/useNextStep', () => ({
  useNextStepKeys: () => {},
  requestNextStep: () => {},
}))
vi.mock('@/composables/useRecordPower', () => ({ useRecordPower: () => {} }))
vi.mock('@/composables/swipeBack', () => ({ swipeBackHandlers: {} }))
vi.mock('@/vendor/muelle-shell/contracts', () => ({
  isTypingTarget: () => false,
}))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))
vi.mock('frappe-ui', () => ({ call: async () => ({ name: 'CRM-DEAL-1' }) }))
vi.mock('@/utils/ventasRoutes', () => ({
  dealReturnLink: () => ({ to: '/deals', label: 'Deals' }),
  dealTab: (tab) =>
    ['overview', 'conversation', 'activity', 'repair'].includes(tab) ? tab : '',
}))

import Deal360 from '@/pages/Deal360.vue'
import { mobileView, openContext } from '@/composables/inbox'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
const until = async (probe) => {
  for (let i = 0; i < 100 && !probe(); i++) await flush()
}

let app
let root
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Deal 360 context pane on the phone', () => {
  it('mounts the pane on first open and keeps it afterwards', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ventas/deal/:dealId',
          component: Deal360,
          props: true,
          meta: { stableKey: true },
        },
      ],
    })
    await router.push('/ventas/deal/CRM-DEAL-1')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Deal360, { dealId: 'CRM-DEAL-1' }) })
    app.use(router)
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await flush()

    expect(root.querySelector('.ws')).not.toBeNull()
    expect(root.querySelector('.ctx')).toBeNull()
    expect(state.panelSetups).toBe(0)

    openContext()
    await until(() => root.querySelector('.ctx'))
    expect(root.querySelector('.ctx')).not.toBeNull()
    expect(state.panelSetups).toBe(1)

    mobileView.value = 'thread'
    await flush()
    expect(root.querySelector('.ctx')).not.toBeNull()
    expect(state.panelSetups).toBe(1)
  })
})
