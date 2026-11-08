import { comprasApi, money } from '@/composables/useCompras'
import {
  matchTokens,
  safeReturn,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

// Resultados: the owner's numbers for a period, each one opening the list
// that owns its records (Ventas tickets, cash closings, Cobranza, Taller
// orders) and coming back to the same board. The apps that own the numbers
// compute every card (crm.api.resultados composes them); this file keeps the
// URL state, the formatting and the drill links pure so tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'crm.api.resultados'
export const CTX = 'Resultados'
export const HOME = '/resultados'
export const RETURN_LABEL = 'Resultados'

/** POST to the Resultados API; a refusal keeps the server's message and type. */
export function resultadosApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

export const PERIODS = Object.freeze([
  { value: 'hoy', label: 'Today' },
  { value: 'ayer', label: 'Yesterday' },
  { value: 'semana', label: 'This week' },
  { value: 'mes', label: 'This month' },
  { value: 'mes_anterior', label: 'Last month' },
  { value: 'rango', label: 'Dates' },
])
export const COMPARES = Object.freeze([
  { value: 'anterior', label: 'vs previous period' },
  { value: 'anio', label: 'vs last year' },
  { value: 'no', label: 'No comparison' },
])
export const TIPOS = Object.freeze([
  { value: 'ventas', label: 'Sales' },
  { value: 'canceladas', label: 'Cancelled' },
  { value: 'devoluciones', label: 'Returns' },
  { value: 'cierres', label: 'Cash closings' },
  { value: 'clientes', label: 'Customers' },
])
export const periodLabel = (v) =>
  tr(PERIODS.find((p) => p.value === v)?.label || 'This month', null, CTX)
export const compareLabel = (v) =>
  tr(
    COMPARES.find((c) => c.value === v)?.label || 'vs previous period',
    null,
    CTX,
  )
export const tipoLabel = (v) =>
  tr(TIPOS.find((t) => t.value === v)?.label || 'Sales', null, CTX)

const one = (value) =>
  typeof value === 'string' ? value : Array.isArray(value) ? one(value[0]) : ''
const text = (value) => one(value).trim().slice(0, 140)
const ISO = /^\d{4}-\d{2}-\d{2}$/
// A view: one of Muelle's (resumen) or a Tablero's name.
const VISTA = /^[A-Za-z0-9_-]{1,140}$/
const isoDate = (value) => {
  const v = one(value).trim()
  if (!ISO.test(v)) return ''
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
    ? v
    : ''
}

/** The board's state from the URL; unknown values fall back to Mes vs anterior.
 * Rango needs both `desde` and `hasta` (ordered); without them it is Mes.
 * `vista`, when the link names one, is the view it opens. */
export function readQuery(query = {}) {
  let periodo = one(query.periodo)
  const compara = one(query.compara)
  if (!PERIODS.some((p) => p.value === periodo)) periodo = 'mes'
  const state = {
    periodo,
    compara: COMPARES.some((c) => c.value === compara) ? compara : 'anterior',
    empresa: text(query.empresa),
    tienda: text(query.tienda),
  }
  if (periodo === 'rango') {
    const ends = [isoDate(query.desde), isoDate(query.hasta)]
    if (ends[0] && ends[1]) {
      ends.sort()
      state.desde = ends[0]
      state.hasta = ends[1]
    } else state.periodo = 'mes'
  }
  const vista = one(query.vista).trim()
  if (VISTA.test(vista)) state.vista = vista
  return state
}

/** The URL query for a state: defaults stay out, so links stay short. */
export function toQuery(state) {
  const q = {}
  if (state.periodo && state.periodo !== 'mes') q.periodo = state.periodo
  if (state.periodo === 'rango') {
    q.desde = state.desde
    q.hasta = state.hasta
  }
  if (state.compara && state.compara !== 'anterior') q.compara = state.compara
  if (state.empresa) q.empresa = state.empresa
  if (state.tienda) q.tienda = state.tienda
  if (state.vista) q.vista = state.vista
  return q
}

/** A short local date («14 oct») for an ISO day. */
export function dayText(iso, options = { day: 'numeric', month: 'short' }) {
  const [y, m, d] = String(iso || '')
    .split('-')
    .map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, options)
}

/** «9 h» for an hour, «lun» for a weekday (0 = Monday), in the browser locale. */
export function axisLabel(axis, key, long = false) {
  if (axis === 'weekday') {
    // 2024-01-01 was a Monday.
    return new Date(2024, 0, 1 + Number(key)).toLocaleDateString(undefined, {
      weekday: long ? 'long' : 'short',
    })
  }
  if (axis === 'hour') {
    return new Date(2024, 0, 1, Number(key)).toLocaleTimeString(undefined, {
      hour: 'numeric',
    })
  }
  return String(key)
}

/** A compact amount for chart axes and tight cells: «12.4 k», «1.2 M». */
export function compactValue(value, format, currency) {
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  if (format !== 'money') return formatValue(n, format, currency)
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'MXN',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)
  } catch {
    return formatValue(n, format, currency)
  }
}

/** The documents lens state: the board's query plus the list it shows. */
export function readLensQuery(query = {}) {
  const tipo = one(query.tipo)
  return {
    ...readQuery(query),
    tipo: TIPOS.some((t) => t.value === tipo) ? tipo : 'ventas',
  }
}

/** Where «Volver a Resultados» goes from the lens: the same period and scope. */
export function boardHref(state) {
  const params = new URLSearchParams(toQuery(state))
  const search = params.toString()
  return `/crm${HOME}${search ? `?${search}` : ''}`
}

function search(query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {}))
    if (value !== null && value !== undefined && value !== '')
      params.set(key, String(value))
  const out = params.toString()
  return out ? `?${out}` : ''
}

/**
 * A card drill as a local URL carrying `return_to`/`return_label`, so the
 * owning list shows «Volver a Resultados» and comes back to this board.
 * `drill` is `{path, query}` (an app path) or `{href}`; null when unsafe.
 */
export function drillHref(drill, back, label = RETURN_LABEL) {
  if (!drill) return null
  const target = drill.href || `${drill.path || ''}${search(drill.query)}`
  if (!safeReturn(target)) return null
  return back ? withReturn(target, { to: back, label }) : target
}

/** In-SPA routes stay in the router; other apps open by plain link. */
export function routerPath(href) {
  return typeof href === 'string' && href.startsWith('/crm/')
    ? href.slice(4)
    : null
}

// The walk-in customer (ERPNext's «Publico en General») reads with its accent
// and in sentence case, on the list and on the record.
const WALK_IN = /^p[uú]blico en general$/i
export function walkInName(name) {
  return WALK_IN.test(String(name || '').trim())
    ? tr('Público en general')
    : name
}

/** The value of a card or fact, in the site currency and es-MX numbers. */
export function formatValue(value, format, currency) {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  if (format === 'money') return money(n, currency)
  if (format === 'signed_money')
    return n > 0 ? `+${money(n, currency)}` : money(n, currency)
  // Encuestas' recommendation number (-100..100), written as its page writes it.
  if (format === 'signed') return n > 0 ? `+${n}` : String(n)
  if (format === 'percent')
    return `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`
  if (format === 'hours')
    return tr('{0} h', [
      n.toLocaleString('es-MX', { maximumFractionDigits: 1 }),
    ])
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

/** «+6 %», «−1.4 pp» or null when there is nothing to compare. */
export function deltaChip(card, compara) {
  if (
    compara === 'no' ||
    card?.delta_pct === null ||
    card?.delta_pct === undefined
  )
    return null
  const n = Number(card.delta_pct)
  const unit = card.delta_unit === 'pp' ? 'pp' : '%'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  // `invert`: a rise is bad news (returns, cancellations).
  const good = card.invert ? n < 0 : n > 0
  return {
    label: `${sign}${Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${unit}`,
    tone: n === 0 ? 'flat' : good ? 'up' : 'down',
    arrow: n > 0 ? 'up' : n < 0 ? 'down' : 'flat',
  }
}

/** One card's state for the page: loading, blocked, error, empty or ready. */
export function cardState(card, { loading = false } = {}) {
  if (loading && !card) return 'loading'
  if (!card) return 'empty'
  if (card.blocked_reason) return card.retry ? 'error' : 'blocked'
  if (card.value === null || card.value === undefined) return 'empty'
  return 'ready'
}

/** The access request a blocked card copies for the manager. */
export function accessRequest(card) {
  return tr(
    'I need access to «{0}» in Muelle Resultados. The screen says: {1}',
    [card?.label || cardTitle(card?.key), card?.blocked_reason || ''],
  )
}

const TITLES = {
  ventas: 'Sales',
  tickets: 'Tickets',
  ticket_promedio: 'Average ticket',
  promedio_diario: 'Daily average',
  tendencia: 'Daily trend',
  meta: 'Monthly goal',
  presupuesto: 'Budget used',
  margen: 'Margin',
  descuentos: 'Discounts',
  devoluciones: 'Returns',
  cancelaciones: 'Cancellations',
  efectivo: 'Cash',
  clientes: 'Customers',
  por_cobrar: 'To collect',
  reparaciones: 'Repairs',
  encuestas: 'Recommendation',
  tiendas: 'Sales by shop',
  mix_grupos: 'Sales by group',
  top_articulos: 'Top products',
  vendedores: 'Sales by seller',
  formas_pago: 'Payment methods',
  por_hora: 'Sales by hour',
  dia_semana: 'Sales by weekday',
  hora_dia: 'Hour × day',
}

const WIDTH = { '': 1, wide: 2, full: 4 }
const LG_SPAN = {
  1: '',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
}

/** Grid span for a card's `size` (wide two columns, full the row); `lg`
 * overrides the 4-column width when the board widens it to close a gap. */
export function cardSpan(size, lg = 0) {
  const sm = size === 'wide' || size === 'full' ? 'sm:col-span-2' : ''
  const wide = LG_SPAN[lg || WIDTH[size] || 1]
  return [sm, wide].filter(Boolean).join(' ')
}

/** A card's title even when its provider only sent a reason. */
export function cardTitle(key) {
  return tr(TITLES[key] || key || '', null, CTX)
}

/** Where a lens row opens: its Ventas deal, its customer, or the ticket. */
export function rowRoute(row, lensPath) {
  const back = { to: lensPath, label: RETURN_LABEL }
  if (row.deal)
    return withReturn(`/crm/ventas/deal/${encodeURIComponent(row.deal)}`, back)
  if (row.doctype === 'Customer')
    return withReturn(
      `/crm/contactos/customer/${encodeURIComponent(row.name)}`,
      back,
    )
  // `list` points the shell's back arrow at this lens, not the board.
  const list = routerPath(lensPath)
  const path = `/crm/resultados/documento/${encodeURIComponent(row.doctype)}/${encodeURIComponent(row.name)}`
  return withReturn(
    list ? `${path}?${new URLSearchParams({ list })}` : path,
    back,
  )
}

/** A sold item opens its product and comes back to `back` (a /crm/ path). */
export function productHref(itemCode, back, label) {
  if (!itemCode) return null
  const path = `/crm/productos/${encodeURIComponent(itemCode)}`
  return back ? withReturn(path, { to: back, label }) : path
}

/** Every word of the search in the customer, the ticket, the deal, the
 * cashier or what was sold (any order, accent-blind). */
export function lensMatch(row, query) {
  const items = row.items || []
  return matchTokens(
    query,
    row.title,
    row.name,
    row.deal,
    row.owner,
    ...items.map((i) => i.item_name),
    ...items.map((i) => i.item_code),
  )
}

/** How the rows were paid, the biggest mode first: `[{mode, amount, share}]`
 * with `share` 0–100 of everything paid. */
export function paymentSplit(rows) {
  const by = new Map()
  for (const row of rows || [])
    for (const p of row.payments || []) {
      const amount = Number(p.amount) || 0
      if (amount) by.set(p.mode, (by.get(p.mode) || 0) + amount)
    }
  const paid = [...by.values()].reduce((sum, v) => sum + Math.abs(v), 0)
  return [...by.entries()]
    .map(([mode, amount]) => ({
      mode,
      amount,
      share: paid ? Math.round((Math.abs(amount) / paid) * 100) : 0,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}

/** «16:23» for a posting time («16:23:05.1», «9:05:00»); '' when unreadable. */
export function clockText(value) {
  const [hours, minutes] = String(value || '').split(':')
  return /^\d{1,2}$/.test(hours || '') && /^\d{2}/.test(minutes || '')
    ? `${hours.padStart(2, '0')}:${minutes.slice(0, 2)}`
    : ''
}

/** What a ticket row says under its name (its time leads the row): how it
 * was paid and who rang it. */
export function saleLine(row, modeLabel = (m) => m, person = (p) => p) {
  const modes = [...new Set((row.payments || []).map((p) => p.mode))]
  return [modes.map(modeLabel).join(' + '), row.owner ? person(row.owner) : '']
    .filter(Boolean)
    .join(' · ')
}

/** The state a ticket row shows: only when it changes what the worker does
 * (owed, a return). A paid sale shows none. */
export function saleState(row) {
  if (row.return_against) return { status: 'Return' }
  if (Number(row.outstanding) > 0.005)
    return { status: row.status === 'Overdue' ? 'Overdue' : 'Unpaid' }
  return null
}

// The lens and its tickets answer from memory while the server refreshes, so
// going back to a list or opening a ticket twice never shows a skeleton.
const LENS_MEMORY = 12
const lensMemory = new Map()
const docMemory = new Map()
const rowMemory = new Map()
const docKey = (doctype, name) => `${doctype}\n${name}`

function remember(map, key, value, max) {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) map.delete(map.keys().next().value)
}

/** The last answer for a lens query (`{rows, capped, period}`), if any. */
export function lensFromMemory(key) {
  return lensMemory.get(key) || null
}
export function lensToMemory(key, value) {
  remember(lensMemory, key, value, LENS_MEMORY)
  for (const row of value.rows || [])
    remember(rowMemory, docKey(row.doctype, row.name), row, 1000)
}

/** The lens row a ticket was opened from: its header shows at once. */
export function rowFromMemory(doctype, name) {
  return rowMemory.get(docKey(doctype, name)) || null
}

/** One ticket or closing; a read started in the last 30 s is reused, so a
 * press that prefetched it makes the open instant. */
export function fetchDocument(doctype, name, { maxAge = 30_000 } = {}) {
  const key = docKey(doctype, name)
  const known = docMemory.get(key)
  if (known && Date.now() - known.at < maxAge) return known.promise
  const entry = {
    at: Date.now(),
    value: known?.value || null,
    promise: resultadosApi('document', { doctype, name }).then(
      (doc) => {
        entry.value = doc
        return doc
      },
      (error) => {
        if (docMemory.get(key) === entry) docMemory.delete(key)
        throw error
      },
    ),
  }
  entry.promise.catch(() => {})
  remember(docMemory, key, entry, 40)
  return entry.promise
}

/** The ticket as last read, for an instant first paint. */
export function documentFromMemory(doctype, name) {
  return docMemory.get(docKey(doctype, name))?.value || null
}
