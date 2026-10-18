// Facturas (Sales Invoice): the worked example of a curated profile (README.md):
// rows, chips, «Filtros», sort, edit fields and the next step by state.
// D2 owns it after D1.2.
import {
  formatDate,
  formatDue,
  formatMoney,
  statusLabel,
  statusTone,
} from '@/utils/display'
import { docStatus, draftStep, titleOf } from './_generic'

const OWED = [
  'Unpaid',
  'Partly Paid',
  'Overdue',
  'Unpaid and Discounted',
  'Partly Paid and Discounted',
  'Overdue and Discounted',
]

export default {
  fields: ['is_return', 'customer'],
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
    } else
      subtitle = [statusLabel(status), formatDate(row.date)]
        .filter(Boolean)
        .join(' · ')
    return {
      title: titleOf(row, 'Sales Invoice'),
      subtitle,
      subtitleTone: due?.overdue ? 'danger' : '',
      meta: formatMoney(row.amount, row.currency || 'MXN'),
      status,
      tone: statusTone(status),
      avatar: titleOf(row, 'Sales Invoice'),
    }
  },

  // The customer, when it is due, a note; the items in their own editor.
  editFields: ['customer', 'due_date', 'remarks'],

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
