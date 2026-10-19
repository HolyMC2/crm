// Tickets (POS Invoice), Shell D2: counter sales rung up in the till. Read and
// share here; they are made in the POS, so the list has no «Nuevo».
import { formatDate, formatDateTime, statusTone } from '@/utils/display'
import { docStatus, genericProfile } from './_generic'
import {
  CLIENTE,
  fechas,
  PANELS_NO_CHAIN,
  PRINT,
  TIENDA,
  ventaRow,
} from './_ventas'

// A ticket is «él».
export const WORDS = {
  Draft: 'Borrador',
  Paid: 'Pagado',
  Consolidated: 'En factura global',
  Return: 'Devolución',
  'Credit Note Issued': 'Con devolución',
  Cancelled: 'Cancelado',
}

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default {
  fields: ['_items', 'customer', 'pos_profile', 'is_return', 'posting_time'],
  creatable: false,
  get chips() {
    return [
      { value: '', label: 'Todos', filters: null },
      {
        value: 'hoy',
        label: 'Hoy',
        filters: [['posting_date', '=', today()]],
      },
      {
        value: 'sin-factura',
        label: 'Sin factura global',
        filters: [['status', '=', 'Paid']],
      },
      {
        value: 'devoluciones',
        label: 'Devoluciones',
        filters: [['is_return', '=', 1]],
      },
    ]
  },
  defaultChip: '',
  filterFields: [TIENDA, CLIENTE, fechas('posting_date')],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    const store = row.fields?.pos_profile || ''
    const when = row.fields?.posting_time
      ? formatDateTime(`${row.date} ${row.fields.posting_time}`)
      : formatDate(row.date)
    return {
      ...ventaRow(row, 'POS Invoice', {
        when: [row.fields?.is_return ? 'Devolución' : '', when, store]
          .filter(Boolean)
          .join(' · '),
        statusWords: WORDS[status],
      }),
      status,
      // Every ticket is paid: the chip speaks only when something else happened.
      tone: status === 'Paid' ? 'neutral' : statusTone(status),
    }
  },

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, statusLabel: WORDS[view.status] || '' }
  },

  nextStep() {
    return null
  },

  panels: PANELS_NO_CHAIN,
  printFormats: PRINT['POS Invoice'],
}
