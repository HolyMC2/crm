// Kardex («Movimientos», Shell D4.1, SPEC DD10): the stock ledger as a log.
// Doco's kardex service owns every read (doco.workspaces.kardex); these pure
// helpers turn the route query into its filters and its rows into what a row
// shows, so the page, Producto's «Movimientos recientes» and the tests share them.
import { comprasApi } from '@/composables/useCompras'
import { documentLink } from '@/composables/useProductos'
import { formatDate, formatQty } from '@/utils/display'

export const CTX = 'Inventario'
const SERVICE = 'doco.workspaces.kardex'

function tr(message, replace, context = CTX) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** POST to the kardex service; a refusal keeps the server's message and type. */
export function kardexApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

// Icon and tone by kind: what came in reads green, what went out red; an
// adjustment or a transfer is neither good nor bad news by itself.
const KIND_ICONS = Object.freeze({
  venta: 'lucide-shopping-cart',
  compra: 'lucide-truck',
  traspaso: 'lucide-arrow-left-right',
  ajuste: 'lucide-clipboard-check',
  devolucion: 'lucide-undo-2',
  produccion: 'lucide-factory',
  entrada: 'lucide-arrow-down-to-line',
  salida: 'lucide-arrow-up-from-line',
})
export function kindIcon(kind) {
  return KIND_ICONS[kind] || 'lucide-history'
}

/** «+3 pzas» / «−2 pzas»: the sign is part of the number, the minus a real one. */
export function signedQty(qty, uom) {
  const n = Number(qty) || 0
  const text = formatQty(Math.abs(n), uom)
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : text
}
export function qtyTone(qty) {
  const n = Number(qty) || 0
  return n > 0
    ? 'text-ink-green-7'
    : n < 0
      ? 'text-ink-red-7'
      : 'text-ink-gray-7'
}

/** What the row is about after the verb: the customer or supplier, or where a transfer went. */
export function rowDetail(row) {
  if (row.kind === 'traspaso' && row.other_store)
    return Number(row.qty) < 0
      ? tr('to {0}', [row.other_store], CTX)
      : tr('from {0}', [row.other_store], CTX)
  return row.party || ''
}
/** «Venta · Juan Pérez», «Traspaso a Bodega». */
export function rowAction(row) {
  const detail = rowDetail(row)
  if (!detail) return row.verb
  return row.kind === 'traspaso'
    ? `${row.verb} ${detail}`
    : `${row.verb} · ${detail}`
}
/** «Marco Ponce», or «Marco Ponce · capturó Rosa» when another person captured it. */
export function rowPeople(row) {
  if (!row.by) return ''
  return row.captured_by
    ? tr('{0} · captured by {1}', [row.by, row.captured_by], CTX)
    : row.by
}
export function rowBalance(row) {
  return tr('{0} left', [formatQty(row.balance, '')], CTX)
}

/**
 * Where a voucher opens in the shell. Only shell pages: a voucher without
 * one is a plain row, never a Desk (`/app/`) link (SPEC §1.5).
 */
export function voucherLink(voucher) {
  if (!voucher?.readable) return null
  const link = documentLink(voucher.doctype, voucher.name)
  return link?.to || null
}

// ── route query ⇄ filters ─────────────────────────────────────────────────

export const PERIODS = Object.freeze(['hoy', '7d'])
const DIRECTIONS = Object.freeze(['entrada', 'salida'])
const KEYS = Object.freeze([
  'articulo',
  'almacen',
  'tipo',
  'sentido',
  'periodo',
  'persona',
  'desde',
  'hasta',
  'q',
])
const DATE = /^\d{4}-\d{2}-\d{2}$/

function one(value) {
  const text = Array.isArray(value) ? value[0] : value
  return typeof text === 'string' ? text.trim().slice(0, 140) : ''
}

/** The page's state from its URL (unknown values fall away). */
export function kardexState(query = {}) {
  const state = Object.fromEntries(KEYS.map((key) => [key, one(query[key])]))
  if (!PERIODS.includes(state.periodo)) state.periodo = ''
  if (!DIRECTIONS.includes(state.sentido)) state.sentido = ''
  if (!DATE.test(state.desde)) state.desde = ''
  if (!DATE.test(state.hasta)) state.hasta = ''
  return state
}

/** The URL query of a state (empty values dropped, so links stay short). */
export function kardexQuery(state) {
  return Object.fromEntries(
    KEYS.filter((key) => state[key]).map((key) => [key, state[key]]),
  )
}

/** The service's arguments for a state (the server counts «hoy» and «7 días» in shop days). */
export function kardexArgs(state) {
  const args = {
    item: state.articulo,
    warehouse: state.almacen,
    kind: state.tipo,
    direction: state.sentido,
    user: state.persona,
    search: state.q,
    period: state.periodo,
    from_date: state.periodo ? '' : state.desde,
    to_date: state.periodo ? '' : state.hasta,
  }
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value))
}

// The chip row: Hoy · 7 días · Entradas · Salidas · Ajustes. Hoy and 7 días
// exclude each other, so do Entradas and Salidas; Ajustes is the kind.
export function chipValues(state) {
  return [
    state.periodo,
    state.sentido === 'entrada' ? 'entradas' : '',
    state.sentido === 'salida' ? 'salidas' : '',
    state.tipo === 'ajuste' ? 'ajustes' : '',
  ].filter(Boolean)
}
export function applyChips(state, values) {
  const before = new Set(chipValues(state))
  const added = values.filter((value) => !before.has(value))
  const on = new Set(values)
  const next = { ...state }
  next.periodo = added.includes('hoy')
    ? 'hoy'
    : added.includes('7d')
      ? '7d'
      : PERIODS.find((value) => on.has(value)) || ''
  if (next.periodo) {
    next.desde = ''
    next.hasta = ''
  }
  next.sentido = added.includes('entradas')
    ? 'entrada'
    : added.includes('salidas')
      ? 'salida'
      : on.has('entradas')
        ? 'entrada'
        : on.has('salidas')
          ? 'salida'
          : ''
  if (on.has('ajustes')) next.tipo = 'ajuste'
  else if (state.tipo === 'ajuste') next.tipo = ''
  return next
}
/** How many «Filtros» sheet filters are on (the chips count on their own). */
export function filtersOn(state) {
  return [
    state.almacen,
    state.tipo && state.tipo !== 'ajuste',
    state.persona,
    state.desde || state.hasta,
  ].filter(Boolean).length
}

/** Rows grouped by their posting day, newest first: [{ day, label, rows }]. */
export function groupByDay(rows, now = new Date()) {
  const groups = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.day === row.date) last.rows.push(row)
    else
      groups.push({
        day: row.date,
        label: dayLabel(row.date, now),
        rows: [row],
      })
  }
  return groups
}
export function dayLabel(day, now = new Date()) {
  const text = formatDate(day, { now, weekday: true })
  return text.charAt(0).toUpperCase() + text.slice(1)
}
