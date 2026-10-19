// Cobros (Payment Entry, Receive), Shell D2: money a customer paid. The form asks
// what a worker knows (cliente, monto, forma de pago, referencia); the accounts
// ERPNext fills stay behind «Más datos»; party type and payment type are fixed.
import { formatDate, formatMoney } from '@/utils/display'
import { docStatus, draftStep, genericProfile, titleOf } from './_generic'
import { fechas, PANELS, PRINT } from './_ventas'

// A cobro is «él».
export const WORDS = {
  Draft: 'Borrador',
  Submitted: 'Registrado',
  Cancelled: 'Cancelado',
  Reconciled: 'Conciliado',
}

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default {
  fields: ['mode_of_payment', 'party', 'party_type', 'reference_no'],
  get chips() {
    return [
      { value: '', label: 'Todos', filters: null },
      {
        value: 'hoy',
        label: 'Hoy',
        filters: [['posting_date', '=', today()]],
      },
      {
        value: 'borradores',
        label: 'Borradores',
        filters: [['docstatus', '=', 0]],
      },
    ]
  },
  defaultChip: '',
  filterFields: [
    { fieldname: 'party', label: 'Cliente', kind: 'link', doctype: 'Customer' },
    {
      fieldname: 'mode_of_payment',
      label: 'Forma de pago',
      kind: 'link',
      doctype: 'Mode of Payment',
    },
    fechas('posting_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'paid_amount desc', label: 'Monto mayor' },
  ],
  sections: ['totals', 'datos', 'conexiones', 'actividad', 'archivos'],

  row(row) {
    const status = docStatus(row)
    const title = titleOf(row, 'Payment Entry')
    return {
      title,
      subtitle: [row.fields?.mode_of_payment, formatDate(row.date)]
        .filter(Boolean)
        .join(' · '),
      meta: formatMoney(row.amount, row.currency || 'MXN'),
      status,
      statusLabel: WORDS[status] || '',
      // Only a draft or a cancelled cobro needs a chip.
      tone: status === 'Draft' ? 'warning' : 'neutral',
      avatar: title,
    }
  },

  // «Cobro», not «Pago»: the kind in the app bar and in «Nuevo cobro».
  kind: 'Cobro',

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, kind: 'Cobro', statusLabel: WORDS[view.status] || '' }
  },

  nextStep(record) {
    return draftStep(record)
  },

  // What the worker knows first; ERPNext fills the accounts from the customer
  // and the way of paying.
  editFields: [
    'party',
    'paid_amount',
    'mode_of_payment',
    'posting_date',
    'reference_no',
    'reference_date',
  ],
  moreFields: ['paid_to', 'paid_from', 'remarks'],
  fieldLabels: {
    party: 'Cliente',
    paid_amount: 'Monto',
    mode_of_payment: 'Forma de pago',
    posting_date: 'Fecha',
    reference_no: 'Referencia o folio',
    reference_date: 'Fecha de la referencia',
    paid_to: 'Cuenta donde entra el dinero',
    paid_from: 'Cuenta del cliente',
    remarks: 'Nota',
  },
  defaults: { payment_type: 'Receive', party_type: 'Customer' },

  panels: PANELS,
  printFormats: PRINT['Payment Entry'],
}
