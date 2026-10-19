// Facturas (Sales Invoice): the worked example of a curated profile (README.md):
// rows, chips, «Filtros», sort, edit fields and the next step by state. Shell D2:
// items in the row, cliente/vendedor/tienda/fechas, the chain and attribution.
import { formatDate, formatDue, formatMoney, statusTone } from '@/utils/display'
import {
  docStatus,
  draftStep,
  genericProfile,
  stagesAt,
  titleOf,
} from './_generic'
import {
  CLIENTE,
  fechas,
  itemsLine,
  PANELS,
  PRINT,
  TIENDA,
  VENDEDOR,
} from './_ventas'

// The seller's words: the customer owes us («Por cobrar»), not «Por pagar».
const SALE_WORDS = {
  Unpaid: 'Por cobrar',
  'Unpaid and Discounted': 'Por cobrar',
  'Partly Paid': 'Cobro parcial',
  'Partly Paid and Discounted': 'Cobro parcial',
  Paid: 'Pagada',
  Overdue: 'Vencida',
  'Overdue and Discounted': 'Vencida',
  Return: 'Devolución',
  'Credit Note Issued': 'Con nota de crédito',
  Draft: 'Borrador',
  Cancelled: 'Cancelada',
}

const OWED = [
  'Unpaid',
  'Partly Paid',
  'Overdue',
  'Unpaid and Discounted',
  'Partly Paid and Discounted',
  'Overdue and Discounted',
]

export default {
  fields: ['_items', 'is_return', 'customer', 'pos_profile'],
  chips: [
    {
      value: 'por-cobrar',
      label: 'Por cobrar',
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
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    { value: 'pagadas', label: 'Pagadas', filters: [['status', '=', 'Paid']] },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-cobrar',
  owedLabel: 'Por cobrar',
  filterFields: [
    CLIENTE,
    VENDEDOR,
    TIENDA,
    fechas('posting_date'),
    {
      fieldname: 'is_return',
      label: 'Tipo',
      options: [
        { value: '0', label: 'Ventas' },
        { value: '1', label: 'Devoluciones' },
      ],
    },
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'due_date asc', label: 'Vencen primero' },
    { value: 'outstanding_amount desc', label: 'Deben más' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    const owed = OWED.includes(status) && Number(row.outstanding) > 0
    const due = owed && row.due ? formatDue(row.due) : null
    let subtitle
    if (row.fields?.is_return) subtitle = `Devolución · ${formatDate(row.date)}`
    else if (due) {
      const partial = Number(row.outstanding) < Number(row.amount)
      subtitle = partial
        ? `${due.label} · debe ${formatMoney(row.outstanding, row.currency || 'MXN')}`
        : due.label
    } else subtitle = formatDate(row.date)
    subtitle = [itemsLine(row), subtitle].filter(Boolean).join(' · ')
    return {
      title: titleOf(row, 'Sales Invoice'),
      subtitle,
      subtitleTone: due?.overdue ? 'danger' : '',
      meta: formatMoney(row.amount, row.currency || 'MXN'),
      status,
      statusLabel: SALE_WORDS[status] || '',
      tone: statusTone(status),
      avatar: titleOf(row, 'Sales Invoice'),
    }
  },

  // The customer, when it is due, a note; the items in their own editor.
  editFields: ['customer', 'due_date', 'remarks'],
  panels: PANELS,
  printFormats: PRINT['Sales Invoice'],

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, statusLabel: SALE_WORDS[view.status] || '' }
  },

  /** Borrador · Por cobrar · Pagada (none for returns and cancelled ones). */
  stages(record) {
    const h = record.header || {}
    if (h.is_return || h.docstatus === 2) return null
    const labels = ['Borrador', 'Por cobrar', 'Pagada']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    return Number(h.outstanding) > 0
      ? stagesAt(labels, 1)
      : stagesAt(labels, 2, true)
  },

  /** Draft → «Confirmar»; owed → «Registrar cobro» (ERPNext's get_payment_entry). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && !h.is_return && Number(h.outstanding) > 0)
      return {
        label: 'Registrar cobro',
        icon: 'lucide-hand-coins',
        make: 'payment',
      }
    return null
  },
}
