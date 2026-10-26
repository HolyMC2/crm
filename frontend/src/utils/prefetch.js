// Idle prefetch of hot route chunks (spec 3.2). First tap into Inbox/Deal360
// used to pay the dynamic-import latency; after the landing page paints we pull
// the heavy chunks during browser idle time, one per idle slot so the prefetch
// never competes with user interaction (429 history).
// Import specifiers MUST match router.js exactly — same specifier = same chunk.

const HOT_CHUNKS = [
  () => import('@/pages/Inbox.vue'),
  () => import('@/pages/Deal360.vue'),
  () => import('@/pages/LeadsView.vue'),
  () => import('@/pages/DealsView.vue'),
  () => import('@/components/Activities/Activities.vue'),
]

// On a phone or a slow line only the view a tap on the current list opens is
// warmed: the deal from Deals, the conversation's deal panel from Inbox
// (ConversationLegacyWorkspace imports it with this specifier). The full set
// is about 60 files, 400-475 KB, competing with that tap (F22).
const NEXT_VIEW = {
  Deals: () => import('@/pages/Deal360.vue'),
  Inbox: () => import('@/components/doco/inbox/DealContextPanel.vue'),
}

const SLOW_LINES = new Set(['slow-2g', '2g', '3g'])
// The shell's phone breakpoint (composables/breakpoint.js isMobile, < 640px),
// read without importing it: this module is in the entry chunk.
const PHONE = '(max-width: 639.98px)'

/**
 * A phone or a slow line: data saver on, a connection Chrome rates below 4g,
 * or the phone layout. Warm-ups there wait for the tap that needs them.
 */
export function constrainedLine({
  connection = globalThis.navigator?.connection,
  matchMedia = globalThis.matchMedia,
} = {}) {
  return Boolean(
    connection?.saveData ||
      SLOW_LINES.has(connection?.effectiveType) ||
      matchMedia?.(PHONE).matches,
  )
}

const idle =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 8000 })
    : (cb) => setTimeout(cb, 2000)

// The first page paints and loads its data first: the warm-up starts this
// long after mount, so it never counts against the first route's budget
// (SPEC §4: ≤ 60 scripts, ≤ 2.5 MB) nor competes with its requests.
export const PREFETCH_DELAY_MS = 4000

/**
 * Run `work` in an idle slot once the first route has resolved and
 * PREFETCH_DELAY_MS have passed: warm-ups never compete with the first page.
 */
export function afterFirstRoute(
  router,
  work,
  { delay = PREFETCH_DELAY_MS, maxWait = 10000 } = {},
) {
  let started = false
  const start = () => {
    if (started) return
    started = true
    setTimeout(() => idle(work), delay)
  }
  Promise.resolve(router?.isReady?.()).then(start, start)
  // A first navigation that never settles must not hold the work back.
  setTimeout(start, maxWait)
}

/** afterFirstRoute, skipped on a constrained line: the work loads on first use. */
export function warmAfterFirstRoute(router, work, options) {
  if (constrainedLine()) return
  afterFirstRoute(router, work, options)
}

export function prefetchHotChunks(router, { delay = PREFETCH_DELAY_MS } = {}) {
  let chunks = HOT_CHUNKS
  let i = 0
  const next = () => {
    if (i >= chunks.length) return
    const load = chunks[i++]
    // failures are irrelevant — the router will import for real on navigation
    load()
      .catch(() => {})
      .finally(() => idle(next))
  }
  setTimeout(
    () =>
      idle(() => {
        if (constrainedLine()) {
          const view = NEXT_VIEW[router?.currentRoute?.value?.name]
          chunks = view ? [view] : []
        }
        next()
      }),
    delay,
  )
}
