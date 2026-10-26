import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// F22: a phone on a slow line warms only the view its next tap opens.
const loaded = []
const CHUNKS = {
  '@/pages/Inbox.vue': 'Inbox',
  '@/pages/Deal360.vue': 'Deal360',
  '@/pages/LeadsView.vue': 'LeadsView',
  '@/pages/DealsView.vue': 'DealsView',
  '@/components/Activities/Activities.vue': 'Activities',
  '@/components/doco/inbox/DealContextPanel.vue': 'DealContextPanel',
}

// A fresh module registry and fresh mocks per test, so every dynamic import
// the test triggers is recorded.
let constrainedLine, prefetchHotChunks, warmAfterFirstRoute
beforeEach(async () => {
  vi.resetModules()
  for (const [path, name] of Object.entries(CHUNKS))
    vi.doMock(path, () => (loaded.push(name), {}))
  ;({ constrainedLine, prefetchHotChunks, warmAfterFirstRoute } = await import(
    '@/utils/prefetch'
  ))
})

const media = (matches) => () => ({ matches })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const path of Object.keys(CHUNKS)) vi.doUnmock(path)
  loaded.length = 0
})

describe('constrainedLine', () => {
  it('is a wide screen on a fast line', () => {
    expect(
      constrainedLine({
        connection: { effectiveType: '4g' },
        matchMedia: media(false),
      }),
    ).toBe(false)
  })

  it('is data saver, a line below 4g, or the phone layout', () => {
    const wide = media(false)
    expect(
      constrainedLine({ connection: { saveData: true }, matchMedia: wide }),
    ).toBe(true)
    for (const effectiveType of ['slow-2g', '2g', '3g'])
      expect(
        constrainedLine({ connection: { effectiveType }, matchMedia: wide }),
      ).toBe(true)
    expect(
      constrainedLine({
        connection: { effectiveType: '4g' },
        matchMedia: media(true),
      }),
    ).toBe(true)
  })

  it('asks for the shell phone breakpoint', () => {
    const matchMedia = vi.fn(() => ({ matches: false }))
    constrainedLine({ connection: undefined, matchMedia })
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 639.98px)')
  })

  it('is false without the Network Information API or matchMedia', () => {
    expect(
      constrainedLine({ connection: undefined, matchMedia: undefined }),
    ).toBe(false)
  })
})

function phone(matches) {
  vi.stubGlobal('matchMedia', media(matches))
}

const on = (name) => ({ currentRoute: { value: { name } } })

describe('prefetchHotChunks', () => {
  it('warms every hot chunk on a wide screen', async () => {
    vi.useFakeTimers()
    phone(false)
    prefetchHotChunks(on('Deals'), { delay: 10 })
    await vi.advanceTimersByTimeAsync(30000)
    expect(loaded).toEqual([
      'Inbox',
      'Deal360',
      'LeadsView',
      'DealsView',
      'Activities',
    ])
  })

  it('warms only the deal a phone opens from Deals', async () => {
    vi.useFakeTimers()
    phone(true)
    prefetchHotChunks(on('Deals'), { delay: 10 })
    await vi.advanceTimersByTimeAsync(30000)
    expect(loaded).toEqual(['Deal360'])
  })

  it('warms only the deal panel a phone opens from Inbox', async () => {
    vi.useFakeTimers()
    phone(true)
    prefetchHotChunks(on('Inbox'), { delay: 10 })
    await vi.advanceTimersByTimeAsync(30000)
    expect(loaded).toEqual(['DealContextPanel'])
  })

  it('warms nothing on a phone elsewhere', async () => {
    vi.useFakeTimers()
    phone(true)
    prefetchHotChunks(on('Leads'), { delay: 10 })
    await vi.advanceTimersByTimeAsync(30000)
    expect(loaded).toEqual([])
  })

  it('reads the route when it starts, not when it is called', async () => {
    vi.useFakeTimers()
    phone(true)
    const router = on(undefined)
    prefetchHotChunks(router, { delay: 1000 })
    router.currentRoute.value = { name: 'Deals' }
    await vi.advanceTimersByTimeAsync(30000)
    expect(loaded).toEqual(['Deal360'])
  })
})

describe('warmAfterFirstRoute', () => {
  const ready = { isReady: () => Promise.resolve() }

  it('runs the warm-up on a wide screen', async () => {
    vi.useFakeTimers()
    phone(false)
    const work = vi.fn()
    warmAfterFirstRoute(ready, work, { delay: 10 })
    await vi.advanceTimersByTimeAsync(10000)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('leaves it to first use on a phone', async () => {
    vi.useFakeTimers()
    phone(true)
    const work = vi.fn()
    warmAfterFirstRoute(ready, work, { delay: 10 })
    await vi.advanceTimersByTimeAsync(20000)
    expect(work).not.toHaveBeenCalled()
  })
})
