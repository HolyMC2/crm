// «Cambios propuestos»: the deck where the owner applies or skips what
// «Enriquecer» proposed (doco.workspaces.revisar). Pure helpers, shared by the
// deck and its tests: what a swipe decides, how sure and where from in words,
// the progress line.

function tr(message, replace, context = 'Revisar') {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// a card moved this share of its width (or flicked this fast) decides
export const SWIPE_SHARE = 0.3
export const FLICK_SPEED = 0.6 // px per ms
export const EDIT_SHARE = 0.25 // of the card's height, upwards

/** What a release decides: 'apply' (right), 'skip' (left), 'edit' (up) or ''
 *  (back to the middle). `dx`/`dy` in px, `ms` the drag's duration. */
export function swipeAction({ dx = 0, dy = 0, ms = 1, width = 1, height = 1 }) {
  const speed = Math.abs(dx) / Math.max(ms, 1)
  if (-dy > height * EDIT_SHARE && Math.abs(dy) > Math.abs(dx)) return 'edit'
  if (
    Math.abs(dx) > width * SWIPE_SHARE ||
    (speed > FLICK_SPEED && Math.abs(dx) > 30)
  )
    return dx > 0 ? 'apply' : 'skip'
  return ''
}

/** How far into a decision the card is, 0..1, for the tint and the label. */
export function swipeProgress(dx = 0, width = 1) {
  return Math.min(Math.abs(dx) / (width * SWIPE_SHARE), 1)
}

export function sureText(value, safe = 0.85) {
  const n = Number(value) || 0
  if (n >= safe) return tr('Very sure')
  if (n >= 0.6) return tr('Fairly sure')
  return tr('Check it')
}

const SOURCES = {
  historial: () => tr('Your products'),
  proveedor: () => tr('Supplier list'),
  taller: () => tr('Taller models'),
  web: () => tr('Internet'),
  regla: () => tr('Rule'),
}

export function sourceText(source) {
  return SOURCES[source] ? SOURCES[source]() : ''
}

/** A compatibility list reads as models, one chip each. */
export function listOf(card = {}) {
  if (card.campo !== 'doco_compatible_con') return null
  return String(card.despues || '')
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean)
}

/** «12 de 80» and the share decided, for the bar. */
export function progressOf(conteo = {}) {
  const total = Number(conteo.total) || 0
  const done = total - (Number(conteo.pendientes) || 0)
  return { done, total, share: total ? done / total : 0 }
}

/** The cards to add from a fresh read: the ones not shown or already decided here. */
export function freshCards(shown = [], incoming = [], decided = new Set()) {
  const have = new Set(shown.map((c) => c.name))
  return incoming.filter((c) => !have.has(c.name) && !decided.has(c.name))
}
