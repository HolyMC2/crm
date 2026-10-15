// CRM-S5.4: no blank pane. A pane says it is loading, empty, denied or
// failed, with the action that moves the worker on.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const context = vi.hoisted(() => ({
  route: { query: {}, params: { dealId: 'CRM-DEAL-1' } },
  push: vi.fn(),
  call: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => context.route,
  useRouter: () => ({ replace: vi.fn(), push: context.push }),
  RouterLink: { props: ['to'], render: () => h('a') },
}))
vi.mock('frappe-ui', async () => ({
  ...(await vi.importActual('frappe-ui')),
  call: (...args) => context.call(...args),
}))
vi.mock('@/components/doco/inbox/DealWorkspace.vue', () => ({
  default: { render: () => h('div', { 'data-workspace': '' }, 'Workspace') },
}))
vi.mock('@/components/doco/inbox/DealContextPanel.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  return {
    activeDeal: ref(null),
    selectDeal: vi.fn(),
    mobileView: ref('thread'),
    openContext: vi.fn(),
    activeTab: ref('overview'),
    onPresenceEvent: vi.fn(),
  }
})
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))

import PaneState from '@/components/shell/PaneState.vue'
import Deal360 from '@/pages/Deal360.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  context.call.mockReset()
  context.push.mockReset()
})
function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('PaneState', () => {
  it('announces loading as a busy status', () => {
    const el = mount(PaneState, { state: 'loading' })
    const pane = el.querySelector('[data-pane-state="loading"]')
    expect(pane.getAttribute('role')).toBe('status')
    expect(pane.getAttribute('aria-busy')).toBe('true')
    expect(pane.textContent).toContain('Loading…')
  })

  it('explains an error and offers its action', async () => {
    const retry = vi.fn()
    const el = mount(PaneState, {
      state: 'error',
      action: 'Retry',
      onRetry: retry,
    })
    const pane = el.querySelector('[data-pane-state="error"]')
    expect(pane.getAttribute('role')).toBe('alert')
    expect(pane.textContent).toContain('This could not be loaded')
    pane.querySelector('button').click()
    expect(retry).toHaveBeenCalledOnce()
  })

  it('tells a denied worker what to do', () => {
    const el = mount(PaneState, { state: 'denied' })
    expect(el.textContent).toContain('Ask your manager for access')
  })
})

describe('Deal 360 never shows an empty record', () => {
  it('keeps the workspace while the deal is there', async () => {
    context.call.mockResolvedValue({ name: 'CRM-DEAL-1' })
    const el = mount(Deal360, { dealId: 'CRM-DEAL-1' })
    await flush()
    expect(el.querySelector('[data-workspace]')).not.toBeNull()
    expect(el.querySelector('[data-pane-state]')).toBeNull()
  })

  it('says a missing deal is missing and offers the way back', async () => {
    context.call.mockResolvedValue(undefined)
    const el = mount(Deal360, { dealId: 'CRM-DEAL-NOPE' })
    await flush()
    expect(el.querySelector('[data-workspace]')).toBeNull()
    const pane = el.querySelector('[data-pane-state="empty"]')
    expect(pane.textContent).toContain('We could not find this deal')
    pane.querySelector('button').click()
    expect(context.push).toHaveBeenCalledOnce()
  })

  it('says a forbidden deal is forbidden', async () => {
    context.call.mockRejectedValue(
      Object.assign(new Error('no'), {
        exc_type: 'PermissionError',
        status: 403,
      }),
    )
    const el = mount(Deal360, { dealId: 'CRM-DEAL-2' })
    await flush()
    expect(
      el.querySelector('[data-pane-state="denied"]').textContent,
    ).toContain('You cannot open this deal')
  })

  it('offers a retry when the check fails for another reason', async () => {
    context.call.mockRejectedValueOnce(new Error('network'))
    const el = mount(Deal360, { dealId: 'CRM-DEAL-3' })
    await flush()
    const pane = el.querySelector('[data-pane-state="error"]')
    expect(pane.textContent).toContain('The deal could not be loaded')
    context.call.mockResolvedValue({ name: 'CRM-DEAL-3' })
    pane.querySelector('button').click()
    await flush()
    expect(el.querySelector('[data-workspace]')).not.toBeNull()
  })
})
