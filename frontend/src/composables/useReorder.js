import { onBeforeUnmount, unref, watch } from 'vue'

// Drag to reorder a list (Pendientes, Shell-S8). Desk: grab a row's grip
// (`[data-drag-handle]`) with the mouse. Phone: hold a row for LONG_PRESS ms,
// then drag; a quick tap or a scroll never starts a drag. What the finger holds
// stays under it (1:1), the other rows make room by transform only, and the
// drop reports the new order. Rows are `[data-reorder-key]` inside one
// `[data-reorder-list]`; a drag never leaves its list.

export const LONG_PRESS = 380
const SLOP = 8
const EDGE = 56
const LIFTED = ['bg-surface-base', 'shadow-lg', 'rounded-6']

/** Where a row lands: the index among the others whose middle is above `center`. */
export function dropIndex(mids, from, center) {
  let to = 0
  mids.forEach((mid, index) => {
    if (index !== from && mid < center) to++
  })
  return to
}

/** The list's keys after moving `from` to `to`. */
export function moved(keys, from, to) {
  const out = keys.slice()
  const [key] = out.splice(from, 1)
  out.splice(to, 0, key)
  return out
}

export function useReorder(container, { onDrop, enabled = () => true } = {}) {
  let drag = null
  let press = null
  let swallowClick = false
  const reduced = () =>
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  function begin(row, y) {
    const list = row.closest('[data-reorder-list]')
    if (!list) return
    const rows = [...list.querySelectorAll('[data-reorder-key]')]
    const from = rows.indexOf(row)
    if (from < 0 || rows.length < 2) return
    const scroller = unref(container)?.$el ?? unref(container)
    const rects = rows.map((el) => el.getBoundingClientRect())
    drag = {
      list,
      rows,
      from,
      to: from,
      row,
      startY: y,
      y,
      rects,
      mids: rects.map((rect) => rect.top + rect.height / 2),
      height: rects[from].height,
      scroller,
      scroll0: scroller?.scrollTop || 0,
    }
    row.style.willChange = 'transform'
    row.style.zIndex = '20'
    row.style.position = 'relative'
    // Lifted: the tokens' surface and shadow, so dark mode follows.
    row.classList.add(...LIFTED)
    for (const other of rows)
      if (other !== row)
        other.style.transition = reduced() ? '' : 'transform 150ms ease-out'
    document.documentElement.style.userSelect = 'none'
    globalThis.navigator?.vibrate?.(10)
    paint()
  }

  function paint() {
    if (!drag) return
    const scrolled = (drag.scroller?.scrollTop || 0) - drag.scroll0
    const first = drag.rects[0].top
    const last = drag.rects.at(-1).bottom
    const top = drag.rects[drag.from].top
    // Never past the list's own ends.
    const dy = Math.min(
      Math.max(drag.y - drag.startY + scrolled, first - top),
      last - drag.rects[drag.from].bottom,
    )
    drag.row.style.transform = `translateY(${dy}px) scale(1.02)`
    const center = drag.mids[drag.from] + dy
    drag.to = dropIndex(drag.mids, drag.from, center)
    drag.rows.forEach((other, index) => {
      if (other === drag.row) return
      let shift = 0
      if (index > drag.from && index <= drag.to) shift = -drag.height
      else if (index < drag.from && index >= drag.to) shift = drag.height
      other.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }

  function autoScroll() {
    const scroller = drag?.scroller
    if (!scroller) return
    const box = scroller.getBoundingClientRect()
    if (drag.y < box.top + EDGE) scroller.scrollTop -= 10
    else if (drag.y > box.bottom - EDGE) scroller.scrollTop += 10
  }

  function move(y) {
    if (!drag) return
    drag.y = y
    autoScroll()
    paint()
  }

  function clear() {
    if (!drag) return
    for (const el of drag.rows) {
      el.style.transform = ''
      el.style.transition = ''
      el.style.willChange = ''
      el.style.zIndex = ''
      el.style.position = ''
      el.classList.remove(...LIFTED)
    }
    document.documentElement.style.userSelect = ''
  }

  function finish(commit = true) {
    if (!drag) return
    const { rows, from, to, list } = drag
    clear()
    drag = null
    swallowClick = true
    setTimeout(() => (swallowClick = false), 0)
    if (!commit || from === to) return
    const keys = rows.map((el) => el.dataset.reorderKey)
    onDrop?.({
      list: list.dataset.reorderList,
      key: keys[from],
      from,
      to,
      keys: moved(keys, from, to),
    })
  }

  function cancelPress() {
    clearTimeout(press?.timer)
    press = null
  }

  // ── mouse and pen: the grip ──
  function onPointerDown(event) {
    if (event.pointerType === 'touch' || event.button !== 0 || !enabled())
      return
    const handle = event.target.closest?.('[data-drag-handle]')
    const row = handle?.closest('[data-reorder-key]')
    if (!row) return
    event.preventDefault()
    press = { row, y: event.clientY, pointer: event.pointerId }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }
  function onPointerMove(event) {
    if (!drag && press && Math.abs(event.clientY - press.y) > 4)
      begin(press.row, press.y)
    move(event.clientY)
  }
  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    press = null
    finish(true)
  }

  // ── touch: long-press, then drag ──
  function onTouchStart(event) {
    if (event.touches.length !== 1 || !enabled()) return
    const row = event.target.closest?.('[data-reorder-key]')
    if (!row) return
    const touch = event.touches[0]
    cancelPress()
    press = {
      row,
      x: touch.clientX,
      y: touch.clientY,
      timer: setTimeout(() => {
        if (press) begin(press.row, press.y)
      }, LONG_PRESS),
    }
  }
  function onTouchMove(event) {
    const touch = event.touches[0]
    if (drag) {
      // Holding a row: the page stays put while the row follows the finger.
      event.preventDefault()
      move(touch.clientY)
      return
    }
    if (
      press &&
      Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > SLOP
    )
      cancelPress()
  }
  function onTouchEnd(event) {
    cancelPress()
    if (drag) {
      event.preventDefault()
      finish(event.type === 'touchend')
    }
  }
  // A long-press on a link would open the browser's menu over the drag.
  function onContextMenu(event) {
    if (drag || press) event.preventDefault()
  }
  // The tap that ends a drag must not open the row.
  function onClick(event) {
    if (!swallowClick) return
    event.preventDefault()
    event.stopPropagation()
  }
  function onKey(event) {
    if (drag && event.key === 'Escape') finish(false)
  }

  let bound = null
  function bind(el) {
    if (bound === el) return
    unbind()
    if (!el) return
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey)
    bound = el
  }
  function unbind() {
    if (!bound) return
    bound.removeEventListener('pointerdown', onPointerDown)
    bound.removeEventListener('touchstart', onTouchStart)
    bound.removeEventListener('touchmove', onTouchMove)
    bound.removeEventListener('touchend', onTouchEnd)
    bound.removeEventListener('touchcancel', onTouchEnd)
    bound.removeEventListener('contextmenu', onContextMenu)
    bound.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKey)
    bound = null
  }
  const stop = watch(
    () => {
      const value = unref(container)
      return value?.$el ?? value ?? null
    },
    bind,
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(() => {
    stop()
    cancelPress()
    finish(false)
    unbind()
  })
  return { dragging: () => Boolean(drag) }
}
