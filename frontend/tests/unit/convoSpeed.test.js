// A deal's conversation opens with its WhatsApp messages first and stays
// mounted when the worker looks at another tab and comes back (Marco
// 2026-11-12: every tab, the conversation most, took long to load).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const mounts = vi.hoisted(() => ({ activities: 0, refresh: vi.fn(), by: {} }))
const stub = vi.hoisted(() => (attr, onMount = () => {}) => ({
  __esModule: true,
  default: {
    props: ['docname', 'tabs', 'name', 'doctype'],
    setup(_, { expose }) {
      onMount()
      mounts.by[attr] = (mounts.by[attr] || 0) + 1
      expose({ refresh: () => mounts.refresh(attr) })
      return () => h('div', { [attr]: '' })
    },
  },
}))
vi.mock('@/components/Activities/Activities.vue', () =>
  stub('data-activities', () => mounts.activities++),
)
vi.mock('@/components/doco/inbox/DealHeader.vue', () => stub('data-header'))
vi.mock('@/components/doco/inbox/LostStagePrompt.vue', () => stub('data-lost'))
vi.mock('@/components/doco/inbox/DealOverview.vue', () => stub('data-overview'))
vi.mock('@/components/doco/inbox/ThreadSummary.vue', () => stub('data-summary'))
vi.mock('@/components/doco/inbox/IntentChips.vue', () => stub('data-intent'))
vi.mock('@/components/doco/inbox/ThreadSearch.vue', () => stub('data-search'))
vi.mock('@/components/doco/inbox/DealConversations.vue', () =>
  stub('data-threads'),
)
vi.mock('@/components/doco/inbox/ItemWorkspace.vue', () => stub('data-items'))
vi.mock('@/components/doco/RepairOrdersSection.vue', () => stub('data-repair'))
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  return {
    activeDeal: ref(null),
    activeDealDoctype: ref('CRM Deal'),
    activeTab: ref('conversation'),
    convoTemplateOpen: ref(false),
    hasTaller: ref(true),
    activePresence: ref([]),
    openCatalog: () => {},
    setComposerDraft: () => {},
    pulseSalesDocs: () => {},
    salesDocsEnabled: ref(true),
    threadSearchRequest: ref(0),
  }
})

import * as inbox from '@/composables/inbox'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import {
  HOLD_MS,
  afterThread,
  holdForThread,
  threadLoaded,
} from '@/utils/threadGate'

const flush = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('threadGate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    threadLoaded()
    vi.useRealTimers()
  })

  it('lets the extras through at once when no conversation is opening', async () => {
    const extra = vi.fn()
    await afterThread(extra)
    expect(extra).toHaveBeenCalledOnce()
  })

  it('holds the extras until the conversation’s messages are in', async () => {
    holdForThread()
    const extra = vi.fn()
    const done = afterThread(extra)
    await vi.advanceTimersByTimeAsync(HOLD_MS - 100)
    expect(extra).not.toHaveBeenCalled()
    threadLoaded()
    await done
    expect(extra).toHaveBeenCalledOnce()
  })

  it('never holds them longer than HOLD_MS', async () => {
    holdForThread()
    const extra = vi.fn()
    afterThread(extra)
    await vi.advanceTimersByTimeAsync(HOLD_MS)
    expect(extra).toHaveBeenCalledOnce()
  })
})

describe('DealWorkspace tabs', () => {
  const cleanups = []
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    mounts.activities = 0
    mounts.refresh.mockClear()
    mounts.by = {}
    inbox.activeDeal.value = null
    inbox.activeTab.value = 'conversation'
    threadLoaded()
  })
  async function mount() {
    const el = document.createElement('div')
    document.body.append(el)
    const app = createApp({ render: () => h(DealWorkspace) })
    app.config.globalProperties.__ = (s) => s
    app.component('Tabs', {
      setup(_, { slots }) {
        return () => h('div', slots['tab-panel']?.())
      },
    })
    app.mount(el)
    cleanups.push(() => {
      app.unmount()
      el.remove()
    })
    await flush()
    return el
  }
  const shown = (el, id) => {
    const pane = el.querySelector(`[data-testid="pane-${id}"]`)
    return pane ? pane.style.display !== 'none' : null
  }

  it('keeps the conversation mounted while another tab is on screen', async () => {
    inbox.activeDeal.value = 'CRM-DEAL-1'
    const el = await mount()
    expect(shown(el, 'conversation')).toBe(true)
    expect(mounts.activities).toBe(1)

    inbox.activeTab.value = 'repair'
    await flush()
    expect(shown(el, 'conversation')).toBe(false)
    expect(el.querySelector('[data-repair]')).not.toBeNull()

    inbox.activeTab.value = 'conversation'
    await flush()
    expect(shown(el, 'conversation')).toBe(true)
    // back on the conversation: nothing mounted again, only a quiet refresh
    expect(mounts.activities).toBe(1)
    expect(mounts.refresh).toHaveBeenCalledOnce()
  })

  it('opens a new record with only the tab on screen', async () => {
    inbox.activeDeal.value = 'CRM-DEAL-1'
    const el = await mount()
    inbox.activeTab.value = 'activity'
    await flush()
    expect(mounts.activities).toBe(2) // the conversation and Actividad

    inbox.activeDeal.value = 'CRM-DEAL-2'
    await flush()
    expect(shown(el, 'conversation')).toBeNull()
    expect(shown(el, 'activity')).toBe(true)
  })

  it('keeps every tab it opened and refreshes it on return', async () => {
    inbox.activeDeal.value = 'CRM-DEAL-1'
    const el = await mount()
    for (const tab of ['repair', 'overview', 'repair', 'items', 'repair']) {
      inbox.activeTab.value = tab
      await flush()
    }
    expect(mounts.by['data-repair']).toBe(1)
    expect(mounts.by['data-overview']).toBe(1)
    expect(
      mounts.refresh.mock.calls.filter(([pane]) => pane === 'data-repair'),
    ).toHaveLength(2)
    expect(el.querySelector('[data-repair]').parentElement.style.display).toBe(
      '',
    )
  })

  it('holds the extras while a conversation opens', async () => {
    inbox.activeDeal.value = 'CRM-DEAL-1'
    await mount()
    const extra = vi.fn()
    afterThread(extra)
    await flush()
    expect(extra).not.toHaveBeenCalled()
    threadLoaded() // Activities, when the WhatsApp messages are in
    await flush()
    expect(extra).toHaveBeenCalledOnce()
  })
})
