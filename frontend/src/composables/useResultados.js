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
  { value: 'semana', label: 'This week' },
  { value: 'mes', label: 'This month' },
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

/** The board's state from the URL; unknown values fall back to Mes vs anterior. */
export function readQuery(query = {}) {
  const periodo = one(query.periodo)
  const compara = one(query.compara)
  return {
    periodo: PERIODS.some((p) => p.value === periodo) ? periodo : 'mes',
    compara: COMPARES.some((c) => c.value === compara) ? compara : 'anterior',
    empresa: text(query.empresa),
    tienda: text(query.tienda),
  }
}

/** The URL query for a state: defaults stay out, so links stay short. */
export function toQuery(state) {
  const q = {}
  if (state.periodo && state.periodo !== 'mes') q.periodo = state.periodo
  if (state.compara && state.compara !== 'anterior') q.compara = state.compara
  if (state.empresa) q.empresa = state.empresa
  if (state.tienda) q.tienda = state.tienda
  return q
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
  return {
    label: `${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`,
    tone: n > 0 ? 'up' : n < 0 ? 'down' : 'flat',
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
  margen: 'Margin',
  efectivo: 'Cash',
  por_cobrar: 'To collect',
  reparaciones: 'Repairs',
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
