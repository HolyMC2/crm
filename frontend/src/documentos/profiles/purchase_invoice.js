// Facturas de proveedor (Purchase Invoice): what you owe suppliers (Shell SPEC
// §6, D3). The record opens Gastos' own page (registry recordRoute); this
// profile drives the list, the engine's /nuevo form and the split pane.
import { formatMoney, formatDate } from '@/utils/display'
import { draftStep, genericProfile, stagesAt } from './_generic'
import {
  BUYER_FILTER,
  CADENA_PANEL,
  dueOf,
  periodFilter,
  purchaseRow,
  STORE_FILTER,
  SUPPLIER_FILTER,
} from './_compras'

export const OWED = [
  'Unpaid',
  'Partly Paid',
  'Overdue',
  'Unpaid and Discounted',
  'Partly Paid and Discounted',
  'Overdue and Discounted',
]

export default {
  fields: ['supplier', 'bill_no', 'is_return', 'on_hold', '_items'],
  panels: [CADENA_PANEL],
  owedLabel: 'Por pagar',
  chips: [
    {
      value: 'por-pagar',
      label: 'Por pagar',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', OWED],
      ],
    },
    {
      value: 'vencidas',
      label: 'Vencidas',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', ['Overdue', 'Overdue and Discounted']],
      ],
    },
    {
      value: 'borradores',
      label: 'Por registrar',
      filters: [['docstatus', '=', 0]],
    },
    { value: 'pagadas', label: 'Pagadas', filters: [['status', '=', 'Paid']] },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-pagar',
  filterFields: [
    SUPPLIER_FILTER,
    { ...STORE_FILTER, fieldname: 'set_warehouse' },
    { ...BUYER_FILTER, label: 'Capturó' },
    periodFilter('posting_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'due_date asc', label: 'Vencen primero' },
    { value: 'outstanding_amount desc', label: 'Debes más' },
  ],

  row(row) {
    const owed =
      row.docstatus === 1 &&
      OWED.includes(row.status) &&
      Number(row.outstanding) > 0
    const due = owed ? dueOf(row) : null
    let line = due?.label || ''
    if (owed && Number(row.outstanding) < Number(row.amount))
      line = [
        line,
        `debes ${formatMoney(row.outstanding, row.currency || 'MXN')}`,
      ]
        .filter(Boolean)
        .join(' · ')
    if (row.docstatus === 0) line = 'Por registrar'
    if (row.status === 'Paid' && row.date)
      line = `Pagada · ${formatDate(row.date)}`
    const view = purchaseRow(row, 'Purchase Invoice', {
      line,
      tone: due?.overdue ? 'danger' : '',
    })
    if (row.fields?.is_return)
      view.subtitle = `Nota de crédito · ${view.subtitle}`
    return view
  },

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, kind: 'Factura de proveedor' }
  },

  editFields: ['supplier', 'bill_no', 'bill_date', 'due_date'],

  /** Borrador · Por pagar · Pagada. */
  stages(record) {
    const h = record.header || {}
    if (h.is_return || h.docstatus === 2) return null
    const labels = ['Borrador', 'Por pagar', 'Pagada']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    return Number(h.outstanding) > 0
      ? stagesAt(labels, 1)
      : stagesAt(labels, 2, true)
  },

  /** Draft → «Confirmar»; owed → «Pagar» (ERPNext's get_payment_entry). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && !h.is_return && Number(h.outstanding) > 0)
      return { label: 'Pagar', icon: 'lucide-wallet', make: 'payment' }
    return null
  },
}
