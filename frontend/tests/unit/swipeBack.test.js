// Edge swipe-back: start band, trigger distance, vertical-drift cancel,
// OS edge-gesture dead zone (iOS double-pop mitigation).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('@/composables/breakpoint', () => ({ isMobile: ref(true) }))

import { swipeBackHandlers } from '@/composables/swipeBack'

const t = (x, y) => ({ touches: [{ clientX: x, clientY: y }] })

describe('swipeBack', () => {
  let back
  beforeEach(() => {
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    back.mockClear()
  })

  it('fires history.back on a rightward edge swipe past 72px', () => {
    swipeBackHandlers.touchstart(t(20, 300))
    swipeBackHandlers.touchmove(t(100, 305))
    expect(back).toHaveBeenCalledTimes(1)
    swipeBackHandlers.touchend()
  })

  it('fires only once per gesture', () => {
    swipeBackHandlers.touchstart(t(20, 300))
    swipeBackHandlers.touchmove(t(100, 305))
    swipeBackHandlers.touchmove(t(200, 305))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('ignores swipes starting outside the edge band (>40px)', () => {
    swipeBackHandlers.touchstart(t(60, 300))
    swipeBackHandlers.touchmove(t(200, 300))
    expect(back).not.toHaveBeenCalled()
  })

  it('ignores the OS edge-gesture dead zone (<14px)', () => {
    swipeBackHandlers.touchstart(t(5, 300))
    swipeBackHandlers.touchmove(t(150, 300))
    expect(back).not.toHaveBeenCalled()
  })

  it('cancels on vertical drift (scroll wins)', () => {
    swipeBackHandlers.touchstart(t(20, 300))
    swipeBackHandlers.touchmove(t(60, 380)) // 80px vertical drift before trigger
    swipeBackHandlers.touchmove(t(160, 380))
    expect(back).not.toHaveBeenCalled()
  })

  it('short swipes below the 72px trigger do nothing', () => {
    swipeBackHandlers.touchstart(t(20, 300))
    swipeBackHandlers.touchmove(t(80, 300)) // dx = 60
    swipeBackHandlers.touchend()
    expect(back).not.toHaveBeenCalled()
  })
})
