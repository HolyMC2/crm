// The desktop inbox keeps the WhatsApp thread readable: where queue, thread and
// «Datos del trato» don't fit side by side, the data pane folds to a strip and
// opening it folds the queue instead (Marco 2026-11-12: the thread was 238 px
// wide at 1280 with the rail open).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { ROOM_W, inboxPanes } from '@/utils/inboxPanes'

const env = vi.hoisted(() => ({ width: null }))
vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual('@vueuse/core')
  return { ...actual, useElementSize: () => ({ width: env.width }) }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, name: 'Inbox' }),
}))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: null }) }))
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(false) }
})
const { stub } = vi.hoisted(() => ({
  // h is read at render time, after the imports ran. __esModule lets
  // defineAsyncComponent take the default export of a mocked module.
  stub: (attr, text) => ({
    __esModule: true,
    default: { render: () => h('div', { [attr]: '' }, text) },
  }),
}))
vi.mock('@/components/doco/inbox/LegacyConversationQueue.vue', () =>
  stub('data-queue', 'Bandeja'),
)
vi.mock('@/components/doco/inbox/DealWorkspace.vue', () =>
  stub('data-thread', 'Conversación'),
)
vi.mock('@/components/doco/inbox/DealContextPanel.vue', () =>
  stub('data-context', 'Datos'),
)
vi.mock('@/components/doco/inbox/LedgerModal.vue', () => stub('data-ledger'))
vi.mock('@/components/doco/inbox/PostCallSheet.vue', () => stub('data-call'))
vi.mock('@/composables/inbox', async () => {
  const { ref, computed } = await import('vue')
  const { inboxPanes, ROOM_W } = await import('@/utils/inboxPanes')
  const queueCollapsed = ref(false),
    paneRoom = ref(true),
    panelChoice = ref(null)
  const noop = () => {}
  return {
    ROOM_W,
    activeDeal: ref('CRM-DEAL-1'),
    activeDealDoctype: ref('CRM Deal'),
    activeUnassigned: ref(null),
    activeCommentPost: ref(null),
    activeUnassignedChannel: ref('whatsapp'),
    queue: { data: [] },
    queueCollapsed,
    paneRoom,
    panelChoice,
    panes: computed(() =>
      inboxPanes({
        room: paneRoom.value,
        queueFolded: queueCollapsed.value,
        panelChoice: panelChoice.value,
      }),
    ),
    showQueue() {
      queueCollapsed.value = false
      if (!paneRoom.value) panelChoice.value = false
    },
    mobileView: ref('list'),
    lastSendAt: ref(0),
    initInbox: noop,
    reloadQueue: () => Promise.resolve(),
    reloadUnassigned: noop,
    reloadUnassignedThread: noop,
    selectDeal: noop,
    markRead: noop,
    onThreadUpdate: noop,
    onPresenceEvent: noop,
    onCommentUpdate: noop,
    onMessengerInbound: noop,
    catchUpInbox: noop,
  }
})

import * as inbox from '@/composables/inbox'
import ConversationLegacyWorkspace from '@/components/Inbox/ConversationLegacyWorkspace.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  inbox.queueCollapsed.value = false
  inbox.panelChoice.value = null
})
const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
async function mountAt(width) {
  env.width = ref(width)
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(ConversationLegacyWorkspace) })
  app.config.globalProperties.__ = (s) => s
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
const shown = (el) => ({
  queue: !!el.querySelector('[data-queue]'),
  thread: !!el.querySelector('[data-thread]'),
  context: !!el.querySelector('[data-context]'),
})

describe('inboxPanes', () => {
  it('shows every pane where they fit, and honours a folded queue', () => {
    expect(
      inboxPanes({ room: true, queueFolded: false, panelChoice: null }),
    ).toEqual({ queue: true, panel: true, fold: false })
    expect(
      inboxPanes({ room: true, queueFolded: true, panelChoice: false }),
    ).toEqual({ queue: false, panel: true, fold: false })
  })

  it('folds the data pane without room, and its opening folds the queue', () => {
    expect(
      inboxPanes({ room: false, queueFolded: false, panelChoice: null }),
    ).toEqual({ queue: true, panel: false, fold: true })
    expect(
      inboxPanes({ room: false, queueFolded: false, panelChoice: true }),
    ).toEqual({ queue: false, panel: true, fold: true })
  })
})

describe('desktop inbox panes', () => {
  it('keeps queue, conversation and data side by side on a wide screen', async () => {
    const el = await mountAt(ROOM_W + 40)
    expect(shown(el)).toEqual({ queue: true, thread: true, context: true })
    expect(el.querySelector('[data-testid="context-fold"]')).toBeNull()
  })

  it('gives the conversation the data pane’s room on a narrower screen', async () => {
    // 1280 px with the rail and Ventas' sections open: 844 px for the panes.
    const el = await mountAt(844)
    expect(shown(el)).toEqual({ queue: true, thread: true, context: false })
    const fold = el.querySelector('[data-testid="context-fold"]')
    expect(fold.getAttribute('aria-label')).toBe('Datos del trato')
    expect(fold.getAttribute('aria-expanded')).toBe('false')

    fold.click()
    await flush()
    expect(shown(el)).toEqual({ queue: false, thread: true, context: true })
    expect(fold.getAttribute('aria-label')).toBe('Ocultar datos')

    // «Mostrar bandeja» brings the list back and folds the data again.
    el.querySelector('[aria-label="Mostrar bandeja"]').click()
    await flush()
    expect(shown(el)).toEqual({ queue: true, thread: true, context: false })
  })

  it('shows every pane before the row is measured', async () => {
    const el = await mountAt(0)
    expect(shown(el)).toEqual({ queue: true, thread: true, context: true })
  })
})
