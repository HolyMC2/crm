// The Bandeja warms the deal pane's code one chunk per idle slot, after a
// delay, and never on a phone or a slow line.
import { afterEach, describe, expect, it, vi } from 'vitest'

const line = vi.hoisted(() => ({ constrained: false }))
vi.mock('@/utils/prefetch', () => ({
  constrainedLine: () => line.constrained,
}))

import { warmChunks } from '@/utils/idleWarm'

afterEach(() => {
  vi.useRealTimers()
  line.constrained = false
})

describe('warmChunks', () => {
  it('loads each chunk in turn after the delay', async () => {
    vi.useFakeTimers()
    const order = []
    const a = vi.fn(async () => order.push('a'))
    const b = vi.fn(async () => order.push('b'))
    warmChunks([a, b], { delay: 1000 })
    await vi.advanceTimersByTimeAsync(900)
    expect(a).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(order).toEqual(['a', 'b'])
  })

  it('stops when cancelled and keeps going past a failed chunk', async () => {
    vi.useFakeTimers()
    const failing = vi.fn(async () => {
      throw new Error('offline')
    })
    const next = vi.fn(async () => {})
    const cancel = warmChunks([failing, next], { delay: 10 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(next).toHaveBeenCalledOnce()

    const never = vi.fn(async () => {})
    warmChunks([never], { delay: 10 })()
    await vi.advanceTimersByTimeAsync(1000)
    expect(never).not.toHaveBeenCalled()
    cancel()
  })

  it('leaves the chunks for first use on a phone or a slow line', async () => {
    vi.useFakeTimers()
    line.constrained = true
    const load = vi.fn(async () => {})
    warmChunks([load], { delay: 10 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).not.toHaveBeenCalled()
  })
})
