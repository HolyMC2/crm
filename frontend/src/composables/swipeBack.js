// Edge swipe-back (mobile drill-down panes): a rightward swipe starting near the
// left edge triggers history.back() — same contract as the in-pane ← buttons, so
// the inbox/deal mobileView history mirroring handles the actual pane pop.
// Edge-only start avoids fighting the horizontal scrollers (tab strips, chip rows).
// Returns spreadable listeners: v-on="swipeBackHandlers".
import { isMobile } from '@/composables/breakpoint'

const EDGE_PX = 36
const TRIGGER_PX = 72
const MAX_DRIFT_Y = 48

let _st = null

export const swipeBackHandlers = {
  touchstart(e) {
    _st = null
    if (!isMobile.value) return
    const t = e.touches[0]
    if (t.clientX > EDGE_PX) return
    _st = { x: t.clientX, y: t.clientY, fired: false }
  },
  touchmove(e) {
    if (!_st || _st.fired) return
    const t = e.touches[0]
    const dx = t.clientX - _st.x
    const dy = Math.abs(t.clientY - _st.y)
    if (dy > MAX_DRIFT_Y) {
      _st = null
      return
    }
    if (dx > TRIGGER_PX) {
      _st.fired = true
      try {
        navigator.vibrate?.(10)
      } catch (err) {}
      window.history.back()
    }
  },
  touchend() {
    _st = null
  },
}
