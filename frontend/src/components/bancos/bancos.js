import { call } from 'frappe-ui'
import { formatDate, formatMoney, parseServerDate } from '@/utils/display'

// Bancos y catálogo de cuentas (Shell SPEC §6 DD19). Server: crm/api/bancos.py.
const SERVICE = 'crm.api.bancos'

/** One Bancos endpoint; empty arguments stay out of the request. */
export function bancosApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** The worker's sentence for a failed call: the server's own message, never a traceback. */
export function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  if (!message || /Traceback|Error \d{3}|^[A-Z][a-zA-Z]+Error/.test(message))
    return 'Revisa tu conexión e inténtalo de nuevo.'
  return message
}

/** «+$1,500.00» / «−$775.00»: the sign is part of the amount, the minus a real one. */
export function signedMoney(amount, currency = 'MXN') {
  const n = Number(amount) || 0
  const text = formatMoney(Math.abs(n), currency)
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : text
}

/** Money that may be negative (a balance), with a real minus. */
export function money(amount, currency = 'MXN') {
  if (amount === null || amount === undefined) return '—'
  const n = Number(amount) || 0
  const text = formatMoney(Math.abs(n), currency)
  return n < 0 ? `−${text}` : text
}

export function amountTone(amount) {
  const n = Number(amount) || 0
  return n > 0 ? 'text-ink-green-7' : 'text-ink-gray-9'
}

/** «Hoy», «Ayer», «Lun 13 abr»: the day a group of movements happened. */
export function dayLabel(day, now = new Date()) {
  const text = formatDate(day, { now, weekday: true })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Rows (newest first, `date` ISO) → [{ day, label, rows }]. */
export function groupByDay(rows, now = new Date()) {
  const groups = []
  for (const row of rows) {
    const day = String(row.date || '').slice(0, 10)
    let group = groups[groups.length - 1]
    if (!group || group.day !== day) {
      group = { day, label: dayLabel(day, now), rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

const STATE = {
  conciliado: { label: 'Conciliado', tone: 'success' },
  parcial: { label: 'Conciliado en parte', tone: 'warning' },
  pendiente: { label: 'Sin conciliar', tone: 'warning' },
}
export function stateOf(row) {
  return STATE[row.state] || STATE.pendiente
}

/** The supporting line of a bank movement: its match, or what still has to happen. */
export function movementLine(row) {
  const match = row.matches?.[0]
  if (row.state === 'conciliado' && match)
    return [match.word, match.party].filter(Boolean).join(' · ')
  if (row.state === 'parcial')
    return `Falta ${formatMoney(row.remaining, row.currency || 'MXN')}`
  return row.detail ? `${row.detail} · Sin conciliar` : 'Sin conciliar'
}

/** «Banco · ••3697», «Tarjeta de crédito», «Efectivo». */
export function cardContext(card) {
  const kind =
    card.kind === 'tarjeta'
      ? 'Tarjeta de crédito'
      : card.kind === 'efectivo'
        ? 'Efectivo'
        : card.bank || 'Banco'
  return card.last4 ? `${kind} · ••${card.last4}` : kind
}

/** «al 18 oct» / «hace 3 h» for the bank's own balance. */
export function balanceWhen(value) {
  const date = parseServerDate(value)
  if (!date) return ''
  return formatDate(date)
}

export const PERIODOS = [
  { value: 'mes', label: 'Este mes' },
  { value: 'mes-pasado', label: 'Mes pasado' },
  { value: 'anio', label: 'Este año' },
  { value: 'todo', label: 'Todo' },
]

/** Where a voucher opens in the shell (documentos engine), or null. */
export async function voucherRoute(voucher, boot) {
  if (!voucher?.doctype || !voucher?.name) return null
  const { documentRoute } = await import('@/documentos/registry')
  return documentRoute(voucher.doctype, voucher.name, {
    boot,
    hint: voucher.payment_type ? { payment_type: voucher.payment_type } : null,
  })
}

const ACCOUNT_TYPES = {
  Bank: 'Banco',
  Cash: 'Efectivo',
  Receivable: 'Clientes (por cobrar)',
  Payable: 'Proveedores (por pagar)',
  Tax: 'Impuestos',
  Stock: 'Inventario',
  'Fixed Asset': 'Activo fijo',
  'Accumulated Depreciation': 'Depreciación acumulada',
  Depreciation: 'Depreciación',
  'Cost of Goods Sold': 'Costo de ventas',
  'Income Account': 'Ingresos',
  'Expense Account': 'Gastos',
  Equity: 'Capital',
  'Stock Received But Not Billed': 'Recibido sin factura',
  'Stock Adjustment': 'Ajuste de inventario',
  'Round Off': 'Redondeo',
  Chargeable: 'Cargos',
  Temporary: 'Temporal',
  'Capital Work in Progress': 'Obra en proceso',
}
export function accountTypeWord(type) {
  return ACCOUNT_TYPES[type] || ''
}

/** «SAT 102.01 · Bancos nacionales», else what kind of account it is. */
export function accountLine(node) {
  const sat = node.agrupador?.code
    ? ['SAT', node.agrupador.code].join(' ') +
      (node.agrupador.words ? ` · ${node.agrupador.words}` : '')
    : ''
  if (node.path) return [node.path, sat].filter(Boolean).join(' · ')
  if (sat) return sat
  if (node.group)
    return node.children === 1 ? '1 cuenta' : `${node.children || 0} cuentas`
  return accountTypeWord(node.account_type) || node.root_word || ''
}

/** «1020 · Bancos» when the account has a number. */
export function accountTitle(node) {
  return node.number ? `${node.number} · ${node.label}` : node.label
}
