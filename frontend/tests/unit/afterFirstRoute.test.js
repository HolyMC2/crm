import { afterEach, describe, expect, it, vi } from 'vitest'
import { afterFirstRoute } from '@/utils/prefetch'

// SPEC §4: warm-ups (icon sprite, form widgets, calling SDKs) never run during
// the first route's load.
afterEach(() => vi.useRealTimers())

describe('afterFirstRoute', () => {
  it('waits for the first route, then the delay, then an idle slot', async () => {
    vi.useFakeTimers()
    let ready
    const router = { isReady: () => new Promise((r) => (ready = r)) }
    const work = vi.fn()
    afterFirstRoute(router, work, { delay: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(work).not.toHaveBeenCalled()
    ready()
    await vi.advanceTimersByTimeAsync(999)
    expect(work).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('still runs when the first navigation failed', async () => {
    vi.useFakeTimers()
    const work = vi.fn()
    afterFirstRoute(
      { isReady: () => Promise.reject(new Error('chunk')) },
      work,
      {
        delay: 10,
      },
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('runs anyway when the first navigation never settles', async () => {
    vi.useFakeTimers()
    const work = vi.fn()
    afterFirstRoute({ isReady: () => new Promise(() => {}) }, work, {
      delay: 10,
      maxWait: 1000,
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(work).toHaveBeenCalledTimes(1)
  })
})
