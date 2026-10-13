// Bringing a list back to where the worker left it (Pendientes first; any list
// with a sessionStorage key and `data-scroll-key` rows can reuse it).
//
// The position is remembered as the row at the top of the list and how far it
// was scrolled past, plus the raw scrollTop as a fallback, so a row completed or
// added elsewhere does not shift the worker to another task. It is restored only
// once the rows have rendered and the page around the list has settled: a single
// scrollTop write right after the data arrives lands short, because the browser
// clamps it to the height the list has at that moment, and on phones the shell
// header slides away after the first scroll, which resizes the list again.

const ROW = '[data-scroll-key]'
const USER_INPUT = ['wheel', 'touchstart', 'pointerdown', 'keydown']

/** The first row still visible at the list's top edge, and its offset. */
export function captureScroll(el) {
  if (!el) return null
  const top = Math.max(0, Math.round(el.scrollTop))
  const edge = el.getBoundingClientRect().top
  for (const row of el.querySelectorAll(ROW)) {
    const box = row.getBoundingClientRect()
    if (box.bottom > edge + 1)
      return {
        top,
        key: row.getAttribute('data-scroll-key'),
        offset: Math.round(box.top - edge),
      }
  }
  return { top, key: null, offset: 0 }
}

/** The scrollTop that puts the remembered row back at the same place. */
export function scrollTarget(el, saved) {
  if (!el || !saved) return 0
  if (saved.key) {
    for (const row of el.querySelectorAll(ROW)) {
      if (row.getAttribute('data-scroll-key') !== saved.key) continue
      const edge = el.getBoundingClientRect().top
      const at = el.scrollTop + row.getBoundingClientRect().top - edge
      return Math.max(0, Math.round(at - (saved.offset || 0)))
    }
  }
  return Math.max(0, Number(saved.top) || 0)
}

/** sessionStorage, or null where reading the property itself throws. */
export function sessionStore() {
  try {
    return globalThis.sessionStorage || null
  } catch {
    return null
  }
}

/** A remembered position; plain numbers are the format before 2026-10-13. */
export function readScroll(storage, key) {
  let raw
  try {
    raw = storage?.getItem(key)
  } catch {
    return null
  }
  if (raw == null || raw === '') return null
  if (/^\d+$/.test(raw)) return { top: Number(raw), key: null, offset: 0 }
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    return {
      top: Math.max(0, Number(value.top) || 0),
      key: typeof value.key === 'string' ? value.key : null,
      offset: Number(value.offset) || 0,
    }
  } catch {
    return null
  }
}

export function writeScroll(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // private mode or a full store: the list simply opens at the top
  }
}

/**
 * Keep writing `target()` into el.scrollTop on every frame until the list can
 * hold it and its size has not changed for a few frames (and at least `minMs`
 * have passed, enough for the phone header to slide away), or the worker
 * scrolls, taps or types, or `maxMs` runs out. Returns a function that stops it.
 */
export function settleScroll(
  el,
  target,
  {
    raf = globalThis.requestAnimationFrame?.bind(globalThis),
    caf = globalThis.cancelAnimationFrame?.bind(globalThis),
    now = () => Date.now(),
    minMs = 250,
    maxMs = 1500,
    stableFrames = 6,
    onDone,
  } = {},
) {
  if (!el || !raf) return () => {}
  const started = now()
  let stopped = false
  let handle = 0
  let stable = 0
  let shape = ''
  const stop = () => {
    if (stopped) return
    stopped = true
    if (handle) caf?.(handle)
    for (const type of USER_INPUT) el.removeEventListener(type, stop)
    onDone?.()
  }
  for (const type of USER_INPUT)
    el.addEventListener(type, stop, { passive: true })
  const tick = () => {
    handle = 0
    if (stopped) return
    const want = target()
    if (Math.abs(el.scrollTop - want) > 1) el.scrollTop = want
    const next = `${el.scrollHeight}:${el.clientHeight}:${Math.round(el.scrollTop)}`
    stable = next === shape ? stable + 1 : 0
    shape = next
    const elapsed = now() - started
    if ((stable >= stableFrames && elapsed >= minMs) || elapsed >= maxMs)
      return stop()
    handle = raf(tick)
  }
  tick()
  return stop
}
