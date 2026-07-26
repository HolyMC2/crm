// Queue pagination/merge/debounce + cold-start cache — the logic behind the
// 2026-07-25 duplicate-rows bug and its fixes. inbox.js is a module singleton
// with import-time side effects (cache seed), so each scenario re-imports it
// fresh via vi.resetModules().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// frappe-ui mock: every createResource is registered by url so tests can drive
// `data` + observe `submit` params. call/toast are inert.
vi.mock('frappe-ui', () => {
  const resources = {}
  // NOTE: `call` routes through a swappable plain behavior fn (NOT a vi.fn
  // returning rejections — vitest-4 false-unhandled trap, see outbox.test.js).
  const callState = { behavior: async () => ({}) }
  return {
    __resources: resources,
    __callState: callState,
    createResource: (opts = {}) => {
      const r = {
        url: opts.url,
        data: null,
        loading: false,
        filters: {},
        lastParams: null,
        submit: vi.fn(async (params) => {
          r.lastParams = params
          return r.data
        }),
        fetch: vi.fn(),
        reload: vi.fn(),
      }
      resources[opts.url] = r
      return r
    },
    call: (...a) => callState.behavior(...a),
    toast: { success: vi.fn(), error: vi.fn() },
  }
})
// statusGuard pulls dialog machinery — irrelevant here
vi.mock('@/utils/statusGuard', () => ({ guardStatusChange: vi.fn((_, __, cb) => cb && cb()) }))

const QUEUE_URL = 'doco_marketing.api.inbox.get_conversation_queue'

async function freshInbox({ cache, cookie = 'user_id=tester%40x.com' } = {}) {
  vi.resetModules()
  localStorage.clear()
  document.cookie = cookie
  if (cache) localStorage.setItem(cache.key, JSON.stringify(cache.value))
  const inbox = await import('@/composables/inbox')
  const { __resources } = await import('frappe-ui')
  return { inbox, queue: __resources[QUEUE_URL] }
}

const row = (name, extra = {}) => ({ name, deal: name, ref_doctype: 'CRM Deal', ...extra })

describe('queue pagination + merge', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('loadMoreQueue dedupes rows that crossed the page boundary', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A'), row('B')]
    await inbox.reloadQueue()
    inbox.queueHasMore.value = true
    queue.data = [row('B'), row('C')] // B moved down between fetches
    await inbox.loadMoreQueue()
    expect(inbox.queueRows.value.map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('loadMoreQueue sends the tail row as a keyset cursor', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A', { sort_ts: '2026-07-26 10:00:00', sort_rank: 1 })]
    await inbox.reloadQueue()
    inbox.queueHasMore.value = true
    queue.data = [row('B')]
    await inbox.loadMoreQueue()
    expect(queue.lastParams.cursor_ts).toBe('2026-07-26 10:00:00')
    expect(queue.lastParams.cursor_name).toBe('A')
    expect(queue.lastParams.cursor_rank).toBe(1)
  })

  it('loadMoreQueue falls back to offset when the tail has no sort key', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A')] // pre-keyset backend / cached row without sort_ts
    await inbox.reloadQueue()
    inbox.queueHasMore.value = true
    queue.data = [row('B')]
    await inbox.loadMoreQueue()
    expect(queue.lastParams.cursor_ts).toBeUndefined()
    expect(queue.lastParams.cursor_name).toBeUndefined()
    expect(queue.lastParams.start).toBe(50)
  })

  it('merge reload keeps the scrolled-in tail below the fresh first page', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A'), row('B'), row('C')]
    await inbox.reloadQueue()
    queue.data = [row('D'), row('A')] // D new on top; B/C not in page 1 anymore
    await inbox.reloadQueue({ merge: true })
    expect(inbox.queueRows.value.map((r) => r.name)).toEqual(['D', 'A', 'B', 'C'])
  })

  it('non-merge reload replaces the list (filter/search semantics)', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A'), row('B')]
    await inbox.reloadQueue()
    queue.data = [row('C')]
    await inbox.reloadQueue()
    expect(inbox.queueRows.value.map((r) => r.name)).toEqual(['C'])
  })

  it('scheduleQueueReload coalesces bursts and skips when a reload just ran', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = []
    // burst of three events → exactly one submit after the debounce window
    inbox.scheduleQueueReload()
    inbox.scheduleQueueReload()
    inbox.scheduleQueueReload()
    expect(queue.submit).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(450)
    expect(queue.submit).toHaveBeenCalledTimes(1)
    // a direct reload NOW → a scheduled one inside the 500ms guard is suppressed
    await inbox.reloadQueue()
    expect(queue.submit).toHaveBeenCalledTimes(2)
    inbox.scheduleQueueReload()
    await vi.advanceTimersByTimeAsync(450)
    expect(queue.submit).toHaveBeenCalledTimes(2) // suppressed
  })
})

describe('cold-start cache', () => {
  it('seeds queueRows from a fresh per-user cache', async () => {
    const key = 'doco-inbox-queue-v2:tester@x.com'
    const { inbox } = await freshInbox({
      cache: { key, value: { t: Date.now(), rows: [row('CACHED')] } },
    })
    expect(inbox.queueRows.value.map((r) => r.name)).toEqual(['CACHED'])
    expect(inbox.queueFromCache.value).toBe(true)
  })

  it('ignores an expired cache (24h TTL)', async () => {
    const key = 'doco-inbox-queue-v2:tester@x.com'
    const { inbox } = await freshInbox({
      cache: { key, value: { t: Date.now() - 25 * 3600 * 1000, rows: [row('STALE')] } },
    })
    expect(inbox.queueRows.value).toEqual([])
    expect(inbox.queueFromCache.value).toBe(false)
  })

  it("never seeds another user's cache (per-user key)", async () => {
    const key = 'doco-inbox-queue-v2:other@x.com'
    const { inbox } = await freshInbox({
      cache: { key, value: { t: Date.now(), rows: [row('LEAK')] } },
    })
    expect(inbox.queueRows.value).toEqual([])
  })

  it('persists only trimmed previews for the unfiltered first page', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('A', { last_message: 'x'.repeat(500) })]
    await inbox.reloadQueue()
    const stored = JSON.parse(localStorage.getItem('doco-inbox-queue-v2:tester@x.com'))
    expect(stored.rows[0].last_message.length).toBe(60)
  })
})

describe('optimistic stage change (spec 3.7)', () => {
  it('patches the queue row immediately and keeps it on success', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('D-1', { status: 'Abierto' })]
    await inbox.reloadQueue()
    inbox.activeDealDoctype.value = 'CRM Deal'
    inbox.activeDeal.value = 'D-1'
    let resolveCall
    const { __callState } = await import('frappe-ui')
    __callState.behavior = () => new Promise((res) => (resolveCall = res))
    const p = inbox.setStage('Ganado')
    // BEFORE the server answers, the chip already moved
    expect(inbox.queueRows.value[0].status).toBe('Ganado')
    resolveCall({})
    await p
    expect(inbox.queueRows.value[0].status).toBe('Ganado')
  })

  it('reverts the row and toasts when the server rejects', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = [row('D-2', { status: 'Abierto' })]
    await inbox.reloadQueue()
    inbox.activeDealDoctype.value = 'CRM Deal'
    inbox.activeDeal.value = 'D-2'
    const { __callState, toast } = await import('frappe-ui')
    __callState.behavior = async () => {
      throw new Error('validacion')
    }
    await inbox.setStage('Ganado')
    expect(inbox.queueRows.value[0].status).toBe('Abierto')
    expect(toast.error).toHaveBeenCalled()
  })
})

describe('snooze/tag params', () => {
  it('passes snoozed=1 only on the Pospuestas tab and tag when filtering', async () => {
    const { inbox, queue } = await freshInbox()
    queue.data = []
    await inbox.reloadQueue()
    expect(queue.lastParams.snoozed).toBeUndefined()
    inbox.inboxTab.value = 'snoozed'
    await inbox.reloadQueue()
    expect(queue.lastParams.snoozed).toBe(1)
    inbox.inboxTab.value = 'all'
    inbox.queueTag.value = 'garantía'
    await inbox.reloadQueue()
    expect(queue.lastParams.tag).toBe('garantía')
  })
})
