// Idle prefetch of hot route chunks (spec 3.2). First tap into Inbox/Deal360
// used to pay the dynamic-import latency; after the landing page paints we pull
// the heavy chunks during browser idle time, one per idle slot so the prefetch
// never competes with user interaction or the SW precache burst (429 history).
// Import specifiers MUST match router.js exactly — same specifier = same chunk.

const HOT_CHUNKS = [
  () => import('@/pages/Inbox.vue'),
  () => import('@/pages/Deal360.vue'),
  () => import('@/pages/LeadsView.vue'),
  () => import('@/pages/DealsView.vue'),
  () => import('@/components/Activities/Activities.vue'),
]

const idle =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 8000 })
    : (cb) => setTimeout(cb, 2000)

// The first page paints and loads its data first: the warm-up starts this
// long after mount, so it never counts against the first route's budget
// (SPEC §4: ≤ 60 scripts, ≤ 2.5 MB) nor competes with its requests.
export const PREFETCH_DELAY_MS = 4000

export function prefetchHotChunks({ delay = PREFETCH_DELAY_MS } = {}) {
  let i = 0
  const next = () => {
    if (i >= HOT_CHUNKS.length) return
    const load = HOT_CHUNKS[i++]
    // failures are irrelevant — the router will import for real on navigation
    load()
      .catch(() => {})
      .finally(() => idle(next))
  }
  setTimeout(() => idle(next), delay)
}
