// Shared words of the purchase profiles (Shell SPEC §6, D3): the supplier as the
// title, an items line, a date in words, late deliveries in red, and the
// «Filtros» every purchase list offers. Profiles stay small and read alike.
import {
  formatDate,
  formatDue,
  formatMoney,
  parseServerDate,
  dayDiff,
  statusLabel,
  statusTone,
} from '@/utils/display'
import { docStatus, titleOf } from './_generic'

/** Today as YYYY-MM-DD on the worker's clock (never toISOString: UTC breaks evenings). */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export { requestTitle } from '@/components/documentos/compras/words'

/**
 * The items in words from the engine's summary (`fields: ['_items']` →
 * `row.items = { count, first: [{ name, qty, uom }] }`): «Pantalla Moto G15»,
 * «Pantalla Moto G15 y 2 más».
 */
export function itemsLine(row) {
  const s = row?.items
  if (!s) return ''
  const count = Number(s.count || 0)
  const first = String(s.first?.[0]?.name || '').trim()
  if (!count) return ''
  if (count === 1) return first || '1 artículo'
  return first ? `${first} y ${count - 1} más` : `${count} artículos`
}

/** Days late for an expected date, 0 when not late. */
export function daysLate(date, now = new Date()) {
  const d = parseServerDate(date)
  if (!d) return 0
  const diff = dayDiff(d, now)
  return diff < 0 ? -diff : 0
}

/** «Llega hoy» / «Llega mañana» / «Llega 24 oct» / «Atrasada 3 días» for an expected delivery. */
export function arrivalLine(date, now = new Date()) {
  const d = parseServerDate(date)
  if (!d) return { label: '', late: false }
  const diff = dayDiff(d, now)
  if (diff < 0) {
    const days = -diff
    return {
      label: days === 1 ? 'Atrasada 1 día' : `Atrasada ${days} días`,
      late: true,
    }
  }
  if (diff === 0) return { label: 'Llega hoy', late: false }
  if (diff === 1) return { label: 'Llega mañana', late: false }
  return {
    label: `Llega ${formatDate(d, { now, relative: false })}`,
    late: false,
  }
}

/** A purchase list row: supplier, one useful line, amount right, state. */
export function purchaseRow(row, doctype, { line = '', tone = '' } = {}) {
  const status = docStatus(row)
  const title = titleOf(row, doctype)
  const parts = [line || statusLabel(status), itemsLine(row)]
  if (!line && row.date) parts.push(formatDate(row.date))
  return {
    title,
    subtitle: parts.filter(Boolean).join(' · '),
    subtitleTone: tone,
    meta:
      row.amount != null && row.amount !== ''
        ? formatMoney(row.amount, row.currency || 'MXN')
        : '',
    status,
    tone: statusTone(status),
    avatar: title,
  }
}

/** A due line for a bill: «Vence mañana» / «Venció hace 3 días» (red). */
export function dueOf(row) {
  return row?.due ? formatDue(row.due) : null
}

// «Filtros» shared by the purchase lists (SPEC §6 brief: proveedor, tienda,
// comprador, fechas). Kinds 'link' and 'period' are the engine's (D2's lane).
export const SUPPLIER_FILTER = {
  fieldname: 'supplier',
  label: 'Proveedor',
  kind: 'link',
  doctype: 'Supplier',
}
export const STORE_FILTER = {
  fieldname: 'set_warehouse',
  label: 'Tienda',
  kind: 'link',
  doctype: 'Warehouse',
}
export const BUYER_FILTER = {
  fieldname: 'owner',
  label: 'Comprador',
  kind: 'link',
  doctype: 'User',
}
export function periodFilter(field, label = 'Fechas') {
  return { fieldname: 'fecha', label, kind: 'period', field }
}

/** The chain panel («Creado desde», who asked/approved/received) on purchase records. */
export const CADENA_PANEL = {
  key: 'cadena',
  at: 'aside',
  load: () => import('@/components/documentos/compras/Cadena.vue'),
}
