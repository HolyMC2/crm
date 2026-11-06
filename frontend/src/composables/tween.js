// A figure that eases to its new value instead of jumping (muelle-ui feel.md).
// It starts from the value on screen, so a change that lands mid-flight
// re-targets without a jump. The first value shows at once; under
// prefers-reduced-motion every change does.
import { onBeforeUnmount, ref, watch } from 'vue'

const still = () =>
  typeof requestAnimationFrame !== 'function' ||
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/** A ref that follows `source()` (a number) over `duration` ms, easing out. */
export function useTween(source, { duration = 480 } = {}) {
  const shown = ref(Number(source()) || 0)
  let frame = 0
  const stop = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
  watch(source, (value) => {
    const to = Number(value) || 0
    stop()
    const from = shown.value
    if (from === to || still()) {
      shown.value = to
      return
    }
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      shown.value = t === 1 ? to : from + (to - from) * (1 - (1 - t) ** 3)
      frame = t === 1 ? 0 : requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  })
  onBeforeUnmount(stop)
  return shown
}
