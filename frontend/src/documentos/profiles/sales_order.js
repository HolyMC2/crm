// Pedidos (Sales Order), Shell D2: what a customer asked for, until it is
// delivered, invoiced and paid. Next step by state (DD4): «Entregar» (filled)
// and «Facturar» (tonal) while both are pending.
import {
  dayDiff,
  formatDate,
  parseServerDate,
  statusTone,
} from '@/utils/display'
import { docStatus, draftStep, genericProfile } from './_generic'
import { CLIENTE, fechas, PANELS, PRINT, VENDEDOR, ventaRow } from './_ventas'

const TO_DELIVER = ['To Deliver and Bill', 'To Deliver']
const TO_BILL = ['To Deliver and Bill', 'To Bill']

// A pedido is «él»: the words agree with it.
export const WORDS = {
  Draft: 'Borrador',
  'To Deliver and Bill': 'Por entregar y facturar',
  'To Deliver': 'Por entregar',
  'To Bill': 'Por facturar',
  Completed: 'Completado',
  Closed: 'Cerrado',
  'On Hold': 'En pausa',
  Cancelled: 'Cancelado',
}

// The list chip is short (it truncates at 305/412); the record and Filtros say it all.
export const SHORT = { 'To Deliver and Bill': 'Por entregar' }

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** «Entrega atrasada 3 días» / «Entrega hoy» / «Entrega 24 oct» for an order still to deliver. */
export function deliveryLine(row, now = new Date()) {
  const status = docStatus(row)
  if (!TO_DELIVER.includes(status) || !row.due) return null
  const date = parseServerDate(row.due)
  if (!date) return null
  const days = dayDiff(date, now)
  if (days < 0)
    return {
      label:
        days === -1
          ? 'Entrega atrasada 1 día'
          : `Entrega atrasada ${-days} días`,
      late: true,
    }
  if (days === 0) return { label: 'Entrega hoy', late: false }
  if (days === 1) return { label: 'Entrega mañana', late: false }
  return {
    label: `Entrega ${formatDate(date, { now, relative: false })}`,
    late: false,
  }
}

export default {
  fields: ['_items', 'customer', 'per_delivered', 'per_billed'],
  get chips() {
    return [
      {
        value: 'por-entregar',
        label: 'Por entregar',
        filters: [
          ['docstatus', '=', 1],
          ['status', 'in', TO_DELIVER],
        ],
      },
      {
        value: 'por-facturar',
        label: 'Por facturar',
        filters: [
          ['docstatus', '=', 1],
          ['status', 'in', TO_BILL],
        ],
      },
      {
        value: 'atrasados',
        label: 'Atrasados',
        filters: [
          ['docstatus', '=', 1],
          ['status', 'in', TO_DELIVER],
          ['delivery_date', '<', today()],
        ],
      },
      {
        value: 'borradores',
        label: 'Borradores',
        filters: [['docstatus', '=', 0]],
      },
      {
        value: 'completados',
        label: 'Completados',
        filters: [['status', '=', 'Completed']],
      },
      { value: '', label: 'Todos', filters: null },
    ]
  },
  defaultChip: 'por-entregar',
  filterFields: [CLIENTE, VENDEDOR, fechas('transaction_date')],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'delivery_date asc', label: 'Entregar primero' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    const delivery = deliveryLine(row)
    return {
      ...ventaRow(row, 'Sales Order', {
        when: delivery ? delivery.label : formatDate(row.date),
        tone: delivery?.late ? 'danger' : '',
        statusWords: SHORT[status] || WORDS[status],
      }),
      status,
      tone: statusTone(status),
    }
  },

  header(record) {
    const view = genericProfile.header(record)
    const h = record.header || {}
    const delivery = deliveryLine({ ...h, docstatus: h.docstatus })
    return {
      ...view,
      statusLabel: WORDS[view.status] || '',
      due: delivery?.label || '',
    }
  },

  // Who, when it goes out, then the items.
  editFields: ['customer', 'delivery_date'],
  // ERPNext asks for it on save (its controller, not the meta): say so before.
  fieldLabels: { delivery_date: { label: 'Fecha de entrega', reqd: true } },

  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus !== 1) return null
    if (TO_DELIVER.includes(h.status))
      return { label: 'Entregar', icon: 'lucide-truck', make: 'delivery_note' }
    if (h.status === 'To Bill')
      return {
        label: 'Facturar',
        icon: 'lucide-receipt',
        make: 'sales_invoice',
      }
    return null
  },

  altSteps(record) {
    const h = record.header || {}
    if (h.docstatus === 1 && h.status === 'To Deliver and Bill')
      return [
        { label: 'Facturar', icon: 'lucide-receipt', make: 'sales_invoice' },
      ]
    return []
  },

  panels: PANELS,
  printFormats: PRINT['Sales Order'],
}
