import { comprasApi, money } from '@/composables/useCompras'
import { safeReturn, withReturn } from '@/vendor/muelle-shell/contracts'

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
 * Rango needs both `desde` and `hasta` (ordered); without them it is Mes. */
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

/** The value of a card or fact, in the site currency and the browser's locale. */
export function formatValue(value, format, currency) {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  if (format === 'money') return money(n, currency)
  if (format === 'signed_money')
    return n > 0 ? `+${money(n, currency)}` : money(n, currency)
  if (format === 'percent')
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} %`
  if (format === 'hours')
    return tr('{0} h', [
      n.toLocaleString(undefined, { maximumFractionDigits: 1 }),
    ])
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
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
    label: `${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`,
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
  margen: 'Margin',
  descuentos: 'Discounts',
  devoluciones: 'Returns',
  cancelaciones: 'Cancellations',
  efectivo: 'Cash',
  clientes: 'Customers',
  por_cobrar: 'To collect',
  reparaciones: 'Repairs',
  tiendas: 'Sales by shop',
  mix_grupos: 'Sales by group',
  top_articulos: 'Top products',
  vendedores: 'Sales by seller',
  formas_pago: 'Payment methods',
  por_hora: 'Sales by hour',
  dia_semana: 'Sales by weekday',
  hora_dia: 'Hour × day',
}

/** Board order and width while the first answer is on its way. */
export const SKELETON = Object.freeze([
  ['ventas', ''],
  ['tickets', ''],
  ['ticket_promedio', ''],
  ['promedio_diario', ''],
  ['tendencia', 'full'],
  ['margen', ''],
  ['efectivo', ''],
  ['por_cobrar', ''],
  ['reparaciones', ''],
])

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

/**
 * The 4-column layout in board order with no hole at a row's end. When the
 * next card does not fit, a later card that fits the gap moves up; with none,
 * the row's last card widens to fill it. `cards` is [[key, size], ...];
 * returns {order: [[key, size], ...], spans: {key: columns}}.
 */
export function packRows(cards, columns = 4) {
  const width = ([, size]) => Math.min(columns, WIDTH[size] || 1)
  const queue = [...cards]
  const order = []
  const spans = {}
  let row = []
  let used = 0
  const close = () => {
    if (row.length && used < columns)
      spans[row[row.length - 1]] += columns - used
    row = []
    used = 0
  }
  while (queue.length) {
    let i = 0
    if (used + width(queue[0]) > columns) {
      i = queue.findIndex((card) => used + width(card) <= columns)
      if (i < 0) {
        close()
        i = 0
      }
    }
    const [card] = queue.splice(i, 1)
    order.push(card)
    spans[card[0]] = width(card)
    row.push(card[0])
    used += width(card)
    if (used === columns) close()
  }
  close()
  return { order, spans }
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
  return withReturn(
    `/crm/resultados/documento/${encodeURIComponent(row.doctype)}/${encodeURIComponent(row.name)}`,
    back,
  )
}

// «Personalizar»: the cards a user hides follow them to every device (the
// user default behind crm.api.resultados.save_hidden). This device keeps a
// copy so the board opens without the hidden cards before the server answers.
export const HIDDEN_KEY = 'muelle:resultados:hidden'

/** Card keys only, once each; anything else is dropped, never an error. */
export function cleanHidden(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v) => typeof v === 'string' && v))]
}

export function readHiddenCopy(storage = globalThis.localStorage) {
  try {
    return cleanHidden(JSON.parse(storage?.getItem(HIDDEN_KEY) || '[]'))
  } catch {
    return []
  }
}

export function writeHiddenCopy(keys, storage = globalThis.localStorage) {
  try {
    storage?.setItem(HIDDEN_KEY, JSON.stringify(keys))
  } catch {
    // Private mode: the account still keeps the choice.
  }
}

/**
 * What the board hides after the server answers. The account's choice wins;
 * a user who never chose on the server brings this device's older choice
 * with them (`push`), so nothing they hid before comes back.
 */
export function adoptHidden(server, copy) {
  if (Array.isArray(server)) return { hidden: cleanHidden(server), push: false }
  const hidden = cleanHidden(copy)
  return { hidden, push: hidden.length > 0 }
}
