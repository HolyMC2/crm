// The generic profile: how any document reads when no curated profile says more
// (Shell SPEC §6 DD1). Curated profiles spread it and override what they know.
import {
  formatDate,
  formatDue,
  formatMoney,
  kindLabel,
  looksLikeId,
  statusLabel,
  statusTone,
} from '@/utils/display'

/** The status a worker reads: a draft and a cancelled document say so even without a `status` field. */
export function docStatus(row) {
  if (row?.docstatus === 2) return 'Cancelled'
  if (row?.status) return row.status
  if (row?.docstatus === 0) return 'Draft'
  return ''
}

/** A title that is never an ID: the party or name, else the record's own name when it reads as words. */
export function titleOf(row, doctype) {
  const title = String(row?.title || '').trim()
  if (title && !looksLikeId(title)) return title
  const name = String(row?.name || '').trim()
  if (name && !looksLikeId(name)) return name
  return kindLabel(doctype) || 'Documento'
}

/** «Vence mañana» / «Venció hace 3 días» for a due date (formatDue's words). */
export function dueLine(due) {
  return due ? formatDue(due).label : ''
}

export const genericProfile = {
  // Extra list columns this profile reads (`row.fields`).
  fields: [],
  // Filter chips: `{ value, label, filters }`; '' is «Todos».
  chips: [
    { value: '', label: 'Todos', filters: null },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
  ],
  defaultChip: '',
  // «Filtros» sheet fields: `{ fieldname, label, options: [{ value, label }] }`.
  filterFields: [],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'modified desc', label: 'Modificados recientemente' },
  ],
  // Record sections in order; profiles may drop or reorder them.
  sections: ['items', 'totals', 'datos', 'conexiones', 'actividad', 'archivos'],

  /** One list row: title (never the ID), one useful line, trailing amount or date, status. */
  row(row, { doctype }) {
    const status = docStatus(row)
    const date = row.date ? formatDate(row.date) : ''
    const number =
      looksLikeId(row.name) && titleOf(row, doctype) !== row.name
        ? row.name
        : ''
    return {
      title: titleOf(row, doctype),
      subtitle: [status ? statusLabel(status) : '', date, number]
        .filter(Boolean)
        .join(' · '),
      meta:
        row.amount != null
          ? formatMoney(row.amount, row.currency || 'MXN')
          : '',
      metaTone: '',
      status,
      tone: statusTone(status),
      icon: 'lucide-file-text',
    }
  },

  /** The record header: title, the kind and number as small meta, the hero amount. */
  header(record) {
    const h = record.header || {}
    const status = docStatus({ ...h, docstatus: h.docstatus })
    return {
      title: titleOf({ title: h.title, name: record.name }, record.doctype),
      kind: kindLabel(record.doctype) || record.label,
      number: record.name,
      status,
      tone: statusTone(status),
      amount:
        h.amount != null ? formatMoney(h.amount, h.currency || 'MXN') : '',
      date: h.date ? formatDate(h.date, { relative: false }) : '',
      due: h.due && h.outstanding ? dueLine(h.due) : '',
    }
  },

  /** The one filled «siguiente paso» for this state (DD4); null when none. Curated profiles fill it. */
  nextStep() {
    return null
  },
}
