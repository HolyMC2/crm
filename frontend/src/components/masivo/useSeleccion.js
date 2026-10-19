// Selection state for a list (Shell D12, M3 contextual selection): toggle,
// shift-range, all on the page, clear; long-press on touch starts it; Esc
// clears it. The list stays the owner of its rows: pass their names in.
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from 'vue'

export const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 10

/**
 * @param {{ max?: number, onLimit?: (max: number) => void }} options
 * @returns a reactive object: names, count, active, and the actions below.
 */
export function useSeleccion({ max = 100, onLimit } = {}) {
  const names = ref([])
  const mode = ref(false)
  let anchor = -1

  const picked = computed(() => new Set(names.value))
  const count = computed(() => names.value.length)
  /** Selection mode: on with one row picked, or after «Seleccionar». */
  const active = computed(() => mode.value || names.value.length > 0)

  const isSelected = (name) => picked.value.has(name)

  function start() {
    mode.value = true
  }

  function add(list) {
    const next = [...names.value]
    const seen = new Set(next)
    for (const name of list) {
      if (!name || seen.has(name)) continue
      if (next.length >= max) {
        onLimit?.(max)
        break
      }
      next.push(name)
      seen.add(name)
    }
    names.value = next
  }

  function remove(list) {
    const drop = new Set(list)
    names.value = names.value.filter((name) => !drop.has(name))
  }

  function toggle(name, index) {
    if (isSelected(name)) remove([name])
    else add([name])
    if (index !== undefined) anchor = index
    mode.value = true
  }

  /** Shift-click: every row between the last one touched and this one. */
  function range(index, rows) {
    if (anchor < 0 || anchor >= rows.length) return toggle(rows[index], index)
    const [from, to] = anchor < index ? [anchor, index] : [index, anchor]
    add(rows.slice(from, to + 1))
    anchor = index
    mode.value = true
  }

  /** The visible page: picks them all, or unpicks them when all are picked. */
  function allOnPage(rows) {
    if (rows.length && rows.every((name) => picked.value.has(name)))
      remove(rows)
    else add(rows)
    mode.value = true
  }

  function clear() {
    names.value = []
    mode.value = false
    anchor = -1
  }

  /** After the list reloads: keep only the rows still there. */
  function prune(rows) {
    const keep = new Set(rows)
    if (names.value.some((name) => !keep.has(name)))
      names.value = names.value.filter((name) => keep.has(name))
  }

  // ── Keys: Esc leaves selection mode, unless a sheet is taking it ──
  function onKey(event) {
    if (event.key !== 'Escape' || !active.value || event.defaultPrevented)
      return
    if (globalThis.document?.querySelector?.('[role="dialog"]')) return
    clear()
  }
  const win = globalThis.window
  watch(
    active,
    (on) => {
      if (!win) return
      if (on) win.addEventListener('keydown', onKey)
      else win.removeEventListener('keydown', onKey)
    },
    { immediate: true },
  )

  // ── Touch: a long press picks the row; the click after it is swallowed ──
  let timer = null
  let origin = null
  let fired = false
  function cancelPress() {
    clearTimeout(timer)
    timer = null
    origin = null
  }

  /** v-on listeners for one row: `v-on="sel.press(row.name, index)"`. */
  function press(name, index) {
    return {
      pointerdown(event) {
        fired = false
        if (event.pointerType === 'mouse' || event.button > 0) return
        origin = { x: event.clientX, y: event.clientY }
        clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          fired = true
          toggle(name, index)
          globalThis.navigator?.vibrate?.(10)
        }, LONG_PRESS_MS)
      },
      pointermove(event) {
        if (!origin) return
        const dx = Math.abs(event.clientX - origin.x)
        const dy = Math.abs(event.clientY - origin.y)
        if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) cancelPress()
      },
      pointerup: cancelPress,
      pointercancel: cancelPress,
      pointerleave: cancelPress,
      // The phone's link menu would open on the same long press.
      contextmenu(event) {
        if (fired || timer || active.value) event.preventDefault()
      },
    }
  }

  /**
   * The row's click in the capture phase (`@click.capture`): while selecting, a
   * tap toggles instead of opening the record; shift-click picks a range.
   * Returns true when it handled the click (the link does not navigate).
   */
  function onRowClick(event, name, index, rows) {
    if (fired) {
      fired = false
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    if (!active.value) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey && rows) range(index, rows)
    else toggle(name, index)
    return true
  }

  function dispose() {
    cancelPress()
    win?.removeEventListener('keydown', onKey)
  }
  if (getCurrentInstance()) onBeforeUnmount(dispose)

  // reactive(): `sel.count`, `sel.active`, `sel.names` read as plain values in
  // templates and scripts alike.
  return reactive({
    names,
    count,
    active,
    isSelected,
    start,
    toggle,
    range,
    allOnPage,
    clear,
    prune,
    press,
    onRowClick,
    dispose,
  })
}
