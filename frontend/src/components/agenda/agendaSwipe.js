// Phone paging like a native calendar: a horizontal swipe drags the current range with the
// finger, a long or quick swipe slides it out and the next range in; a short one springs
// back. Vertical moves stay native scrolling. Buttons (Today, the month strip) reuse the
// same slide-in. Respects «reduce motion».
import { nextTick, onBeforeUnmount, onMounted, unref, watch } from 'vue'

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const LOCK = 10 // px before a touch picks an axis
const RATIO = 1.3 // |dx| must beat |dy| by this much to page horizontally
const DISTANCE = 0.22 // share of the width that commits a page
const VELOCITY = 0.45 // px/ms that commits a page even when short
const IGNORE =
  '[data-no-swipe], input, textarea, select, [contenteditable="true"]'

/** Pure: does a finished horizontal drag page, and which way (+1 next, -1 previous)? */
export function swipeOutcome(dx, ms, width) {
  const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, ms) > VELOCITY
  if (Math.abs(dx) < Math.max(24, width * DISTANCE) && !fast) return 0
  return dx < 0 ? 1 : -1
}

/** Pure: which axis a touch move decides on, '' while still undecided. */
export function swipeAxis(dx, dy) {
  if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return ''
  return Math.abs(dx) > Math.abs(dy) * RATIO ? 'x' : 'y'
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  )

export function useSwipeNav(target, { onNavigate, enabled = () => true }) {
  let touch = null
  let busy = false
  let bound = null

  const reduced = () =>
    Boolean(
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    )
  const node = () => unref(target)

  function paint(x, ms = 0) {
    const el = node()
    if (!el) return
    const width = el.clientWidth || globalThis.innerWidth || 360
    el.style.transition = ms
      ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}`
      : 'none'
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''
    el.style.opacity = x ? String(Math.max(0.35, 1 - Math.abs(x) / width)) : ''
  }
  function clear() {
    const el = node()
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    el.style.opacity = ''
  }

  function onStart(event) {
    touch = null
    if (busy || !enabled() || event.touches.length !== 1) return
    if (event.target?.closest?.(IGNORE)) return
    const point = event.touches[0]
    touch = {
      x: point.clientX,
      y: point.clientY,
      at: performance.now(),
      axis: '',
      dx: 0,
    }
  }
  function onMove(event) {
    if (!touch) return
    if (event.touches.length !== 1) return cancel()
    const point = event.touches[0]
    const dx = point.clientX - touch.x
    const dy = point.clientY - touch.y
    if (!touch.axis) {
      touch.axis = swipeAxis(dx, dy)
      if (!touch.axis) return
      if (touch.axis === 'y') {
        touch = null
        return
      }
    }
    if (event.cancelable) event.preventDefault()
    touch.dx = dx
    paint(dx)
  }
  function cancel() {
    if (touch?.axis === 'x') paint(0, 180)
    touch = null
  }
  async function onEnd() {
    const current = touch
    touch = null
    if (!current || current.axis !== 'x') return
    const el = node()
    const width = el?.clientWidth || globalThis.innerWidth || 360
    const direction = swipeOutcome(
      current.dx,
      performance.now() - current.at,
      width,
    )
    if (!direction) return paint(0, 200)
    await page(direction, width)
  }

  /** Slide the current range out and the next one in (a committed swipe). */
  async function page(direction, width) {
    busy = true
    try {
      const ms = reduced() ? 0 : 170
      paint(-direction * width, ms)
      if (ms) await wait(ms)
      onNavigate(direction)
      await nextTick()
      await enter(direction, width, ms + 40)
    } finally {
      busy = false
    }
  }

  /** The new range arrives from the side it came from (also after a button). */
  async function enter(direction, distance = 56, ms = 200) {
    if (reduced() || !direction) return clear()
    paint(direction * distance, 0)
    await frame()
    paint(0, ms)
    await wait(ms)
    if (!touch) clear()
  }

  function bind(el) {
    unbind()
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', cancel, { passive: true })
    bound = el
  }
  function unbind() {
    if (!bound) return
    bound.removeEventListener('touchstart', onStart)
    bound.removeEventListener('touchmove', onMove)
    bound.removeEventListener('touchend', onEnd)
    bound.removeEventListener('touchcancel', cancel)
    bound = null
  }
  onMounted(() => bind(node()))
  watch(
    () => node(),
    (el) => bind(el),
  )
  onBeforeUnmount(unbind)

  return { enter }
}
