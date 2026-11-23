// A register turn (POS Opening Shift and POS Closing Shift), one profile for
// both halves: the bar names the cashier, the turn itself is TurnoPanel
// (tickets, payment methods, cash movements, bags, counts, the other half),
// then Conexiones, Actividad and Archivos. POS opens and closes turns, so the
// page offers no step. Lists stay on the generic floor (profiles/index.js).
import { statusTone } from '@/utils/display'
import { genericProfile } from './_generic'

const OPEN_WORDS = {
  Open: 'Abierto',
  Closed: 'Cerrado',
  Cancelled: 'Cancelado',
  Draft: 'Borrador',
}
const CLOSING_WORDS = {
  Submitted: 'Cerrado',
  Draft: 'Borrador',
  Cancelled: 'Cancelado',
}

/** The cashier as the record's Datos names them («Jennifer Corona»). */
export function cashierName(record) {
  const field = (record?.fields || []).find((f) => f.fieldname === 'user')
  const value = field?.title || field?.value || record?.doc?.user || ''
  return String(value).includes('@')
    ? String(value).split('@')[0]
    : String(value)
}

export default {
  creatable: false,
  sections: ['conexiones', 'actividad', 'archivos'],

  header(record) {
    const view = genericProfile.header(record)
    const closing = record.doctype === 'POS Closing Shift'
    const docstatus = Number(record.header?.docstatus) || 0
    const status = closing
      ? docstatus === 2
        ? 'Cancelled'
        : docstatus === 1
          ? 'Submitted'
          : 'Draft'
      : docstatus === 2
        ? 'Cancelled'
        : view.status || 'Open'
    const words = closing ? CLOSING_WORDS : OPEN_WORDS
    return {
      ...view,
      title: cashierName(record) || view.title,
      kind: closing ? 'Corte de caja' : 'Turno de caja',
      status,
      statusLabel: words[status] || '',
      tone: status === 'Open' ? 'info' : statusTone(status),
      // The panel says what the turn sold and when it ran.
      amount: '',
      date: '',
      due: '',
    }
  },

  nextStep() {
    return null
  },

  panels: [
    {
      key: 'turno',
      at: 'hero',
      load: () => import('@/components/documentos/turno/TurnoPanel.vue'),
    },
  ],
}
