// The /cat picker's search: answers kept in memory paint at once, a stale one is asked
// again, and a late answer never paints over a newer search. Plus the photo it paints.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerCache } from '../../src/utils/answerCache.js'
import { catalogPhoto, originalPhoto } from '../../src/utils/catalogPhoto.js'

vi.mock('frappe-ui', () => {
  // `call` goes through a swappable behavior (not a vi.fn returning rejections:
  // the vitest-4 false-unhandled trap, see outbox.test.js).
  const callState = { behavior: async () => ({}), calls: [] }
  return {
    __callState: callState,
    createResource: () => ({
      data: null,
      loading: false,
      submit: vi.fn(),
      fetch: vi.fn(),
      reload: vi.fn(),
      setData: vi.fn(),
    }),
    call: (method, args) => {
      callState.calls.push([method, args])
      return callState.behavior(method, args)
    },
    toast: { success: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/utils/statusGuard', () => ({
  guardStatusChange: vi.fn((_, __, cb) => cb && cb()),
}))

const BROWSE = 'doco_marketing.api.catalog.browse'
const answer = (code) => ({
  items: [{ item_code: code }],
  groups: [],
  brands: [],
})

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function freshInbox() {
  vi.resetModules()
  const inbox = await import('@/composables/inbox')
  const { __callState } = await import('frappe-ui')
  __callState.calls.length = 0
  return { inbox, calls: __callState.calls, state: __callState }
}
const browseCalls = (calls) => calls.filter(([m]) => m === BROWSE)
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('answerCache', () => {
  it('keeps answers for keepMs and drops the oldest past the cap', () => {
    let t = 0
    const cache = answerCache({ max: 2, keepMs: 100, now: () => t })
    cache.set('a', 1)
    t = 10
    cache.set('b', 2)
    expect(cache.get('a')).toEqual({ data: 1, age: 10 })
    t = 50
    cache.set('c', 3)
    expect(cache.get('a')).toBeNull()
    expect(cache.get('b').data).toBe(2)
    t = 120
    expect(cache.get('b')).toBeNull()
    expect(cache.get('c')).toEqual({ data: 3, age: 70 })
  })
})

describe('catalogPhoto', () => {
  it('paints the small copies and keeps the original for the fallback', () => {
    const item = {
      image_url: 'https://ventas.test/files/a.jpg',
      media: {
        variants: {
          card: { url: '/files/doco-media/v1/ab/ab-card.webp', width: 240 },
          detail: { url: '/files/doco-media/v1/ab/ab-detail.webp', width: 480 },
        },
      },
    }
    expect(catalogPhoto(item)).toEqual({
      src: '/files/doco-media/v1/ab/ab-card.webp',
      srcset:
        '/files/doco-media/v1/ab/ab-card.webp 240w, /files/doco-media/v1/ab/ab-detail.webp 480w',
    })
    expect(originalPhoto(item)).toEqual({ src: item.image_url, srcset: '' })
  })

  it('takes a lone copy without widths, else the original', () => {
    expect(
      catalogPhoto({
        image_url: '/x.jpg',
        media: { variants: { card: { url: '/x_small.jpg' } } },
      }),
    ).toEqual({ src: '/x_small.jpg', srcset: '' })
    expect(catalogPhoto({ image_url: '/x.jpg' })).toEqual({
      src: '/x.jpg',
      srcset: '',
    })
    expect(catalogPhoto({})).toEqual({ src: '', srcset: '' })
  })
})

describe('runCatalogSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-21T12:00:00-07:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('paints a repeated search from memory without asking again', async () => {
    const { inbox, calls, state } = await freshInbox()
    state.behavior = async (_m, args) => answer(args.query || 'all')
    inbox.catalogQuery.value = 'funda'
    inbox.runCatalogSearch()
    await settle()
    expect(inbox.catalogResults.data).toEqual(answer('funda'))

    inbox.onCatalogQuery('funda i')
    await vi.advanceTimersByTimeAsync(300)
    expect(inbox.catalogResults.data).toEqual(answer('funda i'))

    // Erasing the last word: the kept answer paints at once, with no pause and no call.
    inbox.onCatalogQuery('Funda ')
    expect(inbox.catalogResults.data).toEqual(answer('funda'))
    expect(inbox.catalogResults.loading).toBe(false)
    expect(browseCalls(calls)).toHaveLength(2)
  })

  it('asks again for an answer older than a minute and paints the kept one meanwhile', async () => {
    const { inbox, calls, state } = await freshInbox()
    state.behavior = async () => answer('old')
    inbox.runCatalogSearch()
    await settle()
    vi.setSystemTime(Date.now() + 61_000)
    const next = deferred()
    state.behavior = () => next.promise
    inbox.runCatalogSearch()
    expect(inbox.catalogResults.data).toEqual(answer('old'))
    expect(inbox.catalogResults.loading).toBe(true)
    next.resolve(answer('new'))
    await settle()
    expect(inbox.catalogResults.data).toEqual(answer('new'))
    expect(inbox.catalogResults.loading).toBe(false)
    expect(browseCalls(calls)).toHaveLength(2)
  })

  it('never lets a late answer paint over a newer search', async () => {
    const { inbox, state } = await freshInbox()
    const slow = deferred()
    const fast = deferred()
    state.behavior = (_m, args) =>
      args.query === 'ip' ? slow.promise : fast.promise
    inbox.catalogQuery.value = 'ip'
    inbox.runCatalogSearch()
    inbox.catalogQuery.value = 'iphone 13'
    inbox.runCatalogSearch()
    fast.resolve(answer('iphone 13'))
    await settle()
    slow.resolve(answer('ip'))
    await settle()
    expect(inbox.catalogResults.data).toEqual(answer('iphone 13'))
    expect(inbox.catalogResults.loading).toBe(false)
    // The late answer is still kept for when the worker types «ip» again.
    inbox.onCatalogQuery('ip')
    expect(inbox.catalogResults.data).toEqual(answer('ip'))
  })

  it('shows the failure only when nothing is kept for that search', async () => {
    const { inbox, state } = await freshInbox()
    state.behavior = () => Promise.reject(new Error('offline'))
    inbox.catalogQuery.value = 'cargador'
    inbox.runCatalogSearch()
    await settle()
    expect(inbox.catalogResults.error).toBeTruthy()
    expect(inbox.catalogResults.loading).toBe(false)
  })
})
