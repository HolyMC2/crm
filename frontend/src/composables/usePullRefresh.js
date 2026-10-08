import { onBeforeUnmount, onMounted, ref } from 'vue'

export const PULL_THRESHOLD = 64
const MAX_PULL = 96

/** Drag distance shown for a finger travel: resisted, capped. */
export function pullDistance(travel) {
  if (!(travel > 0)) return 0
  return Math.min(MAX_PULL, Math.round(travel * 0.5))
}

/**
 * Pull-to-refresh on touch screens (shell spec §2.4): drag down from the top
 * of `scroller` past 64 px, release, and `refresh` runs once. Desktop keeps
 * its refresh button; mouse and pen never trigger it.
 */
export function usePullRefresh(scroller, refresh) {
  const pull = ref(0)
  const refreshing = ref(false)
  let startY = null

  function start(event) {
    if (refreshing.value || event.touches.length !== 1) return
    startY =
      (scroller.value?.scrollTop || 0) <= 0 ? event.touches[0].clientY : null
  }
  function move(event) {
    if (startY === null) return
    pull.value = pullDistance(event.touches[0].clientY - startY)
  }
  async function end() {
    if (startY === null) return
    startY = null
    const ready = pull.value >= PULL_THRESHOLD
    pull.value = 0
    if (!ready || refreshing.value) return
    refreshing.value = true
    try {
      navigator.vibrate?.(8)
    } catch {
      /* not allowed */
    }
    try {
      await refresh()
    } finally {
      refreshing.value = false
    }
  }

  const listeners = [
    ['touchstart', start],
    ['touchmove', move],
    ['touchend', end],
    ['touchcancel', end],
  ]
  onMounted(() => {
    for (const [name, fn] of listeners)
      scroller.value?.addEventListener(name, fn, { passive: true })
  })
  onBeforeUnmount(() => {
    for (const [name, fn] of listeners)
      scroller.value?.removeEventListener(name, fn)
  })
  return { pull, refreshing }
}
