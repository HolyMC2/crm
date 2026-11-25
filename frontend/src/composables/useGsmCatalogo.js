import { comprasApi, money } from '@/composables/useCompras'

// Servidor GSM › Catálogo: every offering the GSM server's suppliers list, what it
// costs, what the server would charge and whether it is on sale. One surface for the
// job: search, the views, a group, a tap to sell one, a selection to sell many, the
// price and «Quitar de venta» in the row's sheet. Reads and writes go only through
// dhru_connector.gsm_server.catalog_admin, which also decides what may never be sold.

const SERVICE = 'dhru_connector.gsm_server.catalog_admin'

export function gsmApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// `value` is the server's view; `key` its count; «Todas» leads (shell rule).
export const VIEWS = Object.freeze([
  { value: 'todas', label: 'All', key: 'todas' },
  { value: 'sin_publicar', label: 'Not on sale', key: 'sin_publicar' },
  { value: 'en_venta', label: 'On sale', key: 'en_venta' },
  { value: 'excluidos', label: 'Never sold', key: 'excluidos' },
  { value: 'no_disponibles', label: 'Unavailable', key: 'no_disponibles' },
])

export function normalizeView(value) {
  return VIEWS.some((v) => v.value === value) ? value : 'sin_publicar'
}

export function viewTitle(value) {
  return (
    {
      todas: tr('GSM catalog', null, 'Gsm'),
      sin_publicar: tr('Not on sale', null, 'Gsm'),
      en_venta: tr('On sale', null, 'Gsm'),
      excluidos: tr('Never sold', null, 'Gsm'),
      no_disponibles: tr('Unavailable', null, 'Gsm'),
    }[value] || tr('GSM catalog', null, 'Gsm')
  )
}

export function stateChip(state) {
  return (
    {
      en_venta: { label: tr('On sale', null, 'Gsm'), tone: 'success' },
      sin_publicar: { label: tr('Not on sale', null, 'Gsm'), tone: 'neutral' },
      excluido: { label: tr('Never sold', null, 'Gsm'), tone: 'danger' },
      no_disponible: { label: tr('Unavailable', null, 'Gsm'), tone: 'neutral' },
    }[state] || { label: '', tone: 'neutral' }
  )
}

/** What the row shows on the right: the price on sale, else what it would sell for. */
export function rowPrice(row, currency) {
  if (row?.state === 'en_venta') return money(row.price, currency)
  if (row?.sellable && row?.suggested) return money(row.suggested, currency)
  return ''
}

/** «Group, delivery» under the title; a reason instead when it cannot be sold. */
export function rowSubtitle(row) {
  if (row?.excluded) return row.excluded
  if (row?.blocked) return row.blocked
  return [row?.group, row?.delivery_time].filter(Boolean).join(', ')
}

/** Only rows that can go on sale are picked in a selection. */
export function selectable(row) {
  return Boolean(row?.sellable && row?.state === 'sin_publicar')
}

/** The price a markup gives, as the server rounds it: up to whole pesos. */
export function priceWithMarkup(cost, pct, step = 1) {
  const c = Number(cost)
  const p = Number(pct)
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(p) || p < 0) return null
  const raw = c * (1 + p / 100)
  return step > 0
    ? Math.ceil(raw / step - 1e-9) * step
    : Math.ceil(raw * 100) / 100
}

/** The publish answer as one toast line and the list of what stayed out. */
export function publishReceipt(result) {
  const done = (result?.published || []).filter((r) => !r.already).length
  const skipped = result?.skipped || []
  return {
    line: skipped.length
      ? tr('{0} on sale, {1} left out', [done, skipped.length], 'Gsm')
      : tr('{0} on sale', [done], 'Gsm'),
    skipped,
  }
}
