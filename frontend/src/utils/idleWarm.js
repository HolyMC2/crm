// Idle-time warm-ups for a page the worker is about to use. Never on a phone or
// a slow line (utils/prefetch constrainedLine): there the work loads on first use.
import { constrainedLine } from '@/utils/prefetch'

/** Runs `fn` in the browser's next idle slot (or within `timeout` ms). */
export function whenIdle(fn, timeout = 2000) {
  if (typeof requestIdleCallback === 'function')
    return requestIdleCallback(fn, { timeout })
  return setTimeout(fn, 200)
}

/**
 * Imports each loader in turn, one per idle slot, starting after `delay` ms.
 * The specifiers must be the ones the page imports with, so the same chunks
 * load. Returns a cancel function.
 */
export function warmChunks(loaders, { delay = 1500 } = {}) {
  if (constrainedLine()) return () => {}
  let cancelled = false
  let i = 0
  const next = () => {
    if (cancelled || i >= loaders.length) return
    const load = loaders[i++]
    Promise.resolve()
      .then(load)
      .catch(() => {}) // the page imports for real when it needs the chunk
      .finally(() => whenIdle(next))
  }
  const timer = setTimeout(() => whenIdle(next), delay)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
