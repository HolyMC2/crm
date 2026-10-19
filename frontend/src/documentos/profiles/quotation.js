// Cotizaciones (Quotation), Shell D2: prices offered to a customer, until they
// become a pedido («Crear pedido»). Items in the row, cliente/vendedor/fechas,
// the chain and attribution on the record.
import { formatDate, formatDue, statusTone } from '@/utils/display'
import { docStatus, draftStep, genericProfile } from './_generic'
import { CLIENTE, fechas, PANELS, PRINT, VENDEDOR, ventaRow } from './_ventas'

const OPEN = ['Open', 'Replied', 'Partially Ordered']

export const WORDS = {
  Draft: 'Borrador',
  Open: 'Enviada',
  Replied: 'Respondida',
  'Partially Ordered': 'Pedida en parte',
  Ordered: 'Pedida',
  Lost: 'Perdida',
  Expired: 'Vencida',
  Cancelled: 'Cancelada',
}

export default {
  fields: ['_items', 'quotation_to', 'party_name'],
  chips: [
    {
      value: 'abiertas',
      label: 'Abiertas',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', OPEN],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'pedidas',
      label: 'Pedidas',
      filters: [['status', '=', 'Ordered']],
    },
    {
      value: 'vencidas',
      label: 'Vencidas',
      filters: [['status', '=', 'Expired']],
    },
    {
      value: 'perdidas',
      label: 'Perdidas',
      filters: [['status', '=', 'Lost']],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'abiertas',
  filterFields: [
    { ...CLIENTE, fieldname: 'party_name' },
    VENDEDOR,
    fechas('transaction_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'valid_till asc', label: 'Vencen primero' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    const open = OPEN.includes(status) && row.due
    const due = open ? formatDue(row.due) : null
    const when = due
      ? due.overdue
        ? due.label
        : `Válida hasta ${formatDate(row.due, { relative: false })}`
      : formatDate(row.date)
    return {
      ...ventaRow(row, 'Quotation', {
        when,
        tone: due?.overdue ? 'danger' : '',
        statusWords: WORDS[status],
      }),
      status,
      tone: statusTone(status),
    }
  },

  // The customer (or prospect), how long the prices hold, and the items.
  editFields: ['party_name', 'transaction_date', 'valid_till'],
  // A blank cotización is for a customer (Contacto passes ?party_name=).
  defaults: { quotation_to: 'Customer' },
  panels: PANELS,
  printFormats: PRINT.Quotation,

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, statusLabel: WORDS[view.status] || '' }
  },

  /** Draft → «Confirmar»; open → «Crear pedido» (ERPNext's make_sales_order). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && OPEN.includes(h.status))
      return {
        label: 'Crear pedido',
        icon: 'lucide-clipboard-check',
        make: 'sales_order',
      }
    return null
  },
}
