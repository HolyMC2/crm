// On the phone the Ventas frame resets its scroll container per page with the
// same key the runtime gives the page: a record that rewrites its query
// (?tab=) stays mounted; another record remounts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ setups: 0 }))
const stub = vi.hoisted(() => (name) => ({
  default: { name, template: '<span />' },
}))
vi.mock('@/components/Layouts/AppHeader.vue', () => stub('AppHeader'))
vi.mock('@/components/Modals/GlobalModals.vue', () => stub('GlobalModals'))
vi.mock('@/components/shell/OutboxStrip.vue', () => stub('OutboxStrip'))
vi.mock('@/components/Telephony/CallUI.vue', () => stub('CallUI'))
vi.mock('@/components/shell/VentasSidebar.vue', () => stub('VentasSidebar'))
vi.mock('@/composables/breakpoint', () => ({ isMobile: ref(true) }))

import VentasFrame from '@/components/shell/VentasFrame.vue'

const Page = defineComponent({
  setup() {
    state.setups++
    return () => h('div', { class: 'page' })
  },
})

let app
let root
afterEach(() => {
  app?.unmount()
  root?.remove()
})

async function mountAt(routes, path) {
  state.setups = 0
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(VentasFrame, null, { default: () => h(Page) }),
  })
  app.use(router)
  app.mount(root)
  await nextTick()
  return router
}

describe('VentasFrame page key on the phone', () => {
  it('keeps a stableKey record mounted through a query rewrite, remounts on another record', async () => {
    const router = await mountAt(
      [
        {
          path: '/ventas/deal/:dealId',
          component: { template: '<div />' },
          meta: { stableKey: true },
        },
      ],
      '/ventas/deal/A',
    )
    expect(state.setups).toBe(1)
    await router.replace({ query: { tab: 'overview' } })
    await nextTick()
    expect(state.setups).toBe(1)
    await router.push('/ventas/deal/B')
    await nextTick()
    expect(state.setups).toBe(2)
  })
  it('still remounts a page without stableKey when its query changes', async () => {
    const router = await mountAt(
      [{ path: '/deals', component: { template: '<div />' } }],
      '/deals',
    )
    expect(state.setups).toBe(1)
    await router.replace({ query: { view: 'kanban' } })
    await nextTick()
    expect(state.setups).toBe(2)
  })
})
