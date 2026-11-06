// The generic floor's profile (Shell SPEC §6 DD1): any readable doctype without a
// curated profile, read from its own meta (`crm.api.documentos.floor`). The row
// carries the fields Desk lists, the list is sliced by its status, choices and
// links («facets», counted on the summary pane and in «Filtros»), and a document
// that is never confirmed never reads «Borrador». Curated profiles never use it.
import {
  formatDate,
  formatDateTime,
  formatMoney,
  looksLikeId,
  statusEntry,
  statusLabel,
  statusTone,
} from '@/utils/display'
import { docStatus, titleOf } from './_generic'

// A row says at most this many cells after its state; the record says the rest.
const MAX_CELLS = 3
const MAX_STATUS_CHIPS = 6

const CONFIRM_CHIPS = Object.freeze([
  { value: '', label: 'Todos', filters: null },
  {
    value: 'borradores',
    label: 'Borradores',
    filters: [['docstatus', '=', 0]],
  },
  {
    value: 'confirmados',
    label: 'Confirmados',
    filters: [['docstatus', '=', 1]],
  },
  {
    value: 'cancelados',
    label: 'Cancelados',
    filters: [['docstatus', '=', 2]],
  },
])

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** A stored status in the worker's words: the shell's map first, then the server's translation. */
export function statusWord(value, label = '') {
  return statusEntry(value) ? statusLabel(value) : label || String(value || '')
}

/** A number as the worker reads it («1,250», «12.5»). */
function numberText(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

/** «hoy 09:02» for a moment, «hoy» for a day. */
export function dateText(field, value, { now = new Date() } = {}) {
  if (!value) return ''
  return field?.fieldtype === 'Datetime'
    ? formatDateTime(value, { now })
    : formatDate(value, { now })
}

/** One cell of a floor row: the value as the worker reads it, or '' when it says nothing. */
export function cellText(col, row, { now = new Date() } = {}) {
  const value = row?.fields?.[col.fieldname]
  if (value === null || value === undefined || value === '') return ''
  switch (col.fieldtype) {
    case 'Link':
    case 'Dynamic Link': {
      const title = row.titles?.[col.fieldname]
      if (title) return title
      return looksLikeId(value) ? '' : String(value)
    }
    case 'Select':
      return col.choices?.[value] || statusWord(value)
    case 'Check':
      return Number(value) ? col.label : ''
    case 'Date':
      return formatDate(value, { now })
    case 'Datetime':
      return formatDateTime(value, { now })
    case 'Time':
      return String(value).slice(0, 5)
    case 'Currency':
      return formatMoney(value, row.currency || row.fields?.currency || 'MXN')
    case 'Int':
    case 'Float':
      return numberText(value)
    case 'Percent':
      return `${numberText(value)} %`
    default: {
      const text = String(value).replace(/\s+/g, ' ').trim()
      if (!text || looksLikeId(text)) return ''
      return text.length > 60 ? `${text.slice(0, 59)}…` : text
    }
  }
}

/** The chips: by status when the doctype has one, by confirmation when it is confirmed, else none. */
export function floorChips(meta) {
  if (meta?.status?.length) {
    return [
      { value: '', label: 'Todos', filters: null },
      ...meta.status.slice(0, MAX_STATUS_CHIPS).map((option) => ({
        value: slug(option.value),
        label: statusWord(option.value, option.label),
        filters: [['status', '=', option.value]],
      })),
    ]
  }
  if (meta?.submittable) return [...CONFIRM_CHIPS]
  return []
}

/** The «Filtros» fields: one per facet (its options come from the counts) and the date as periods. */
export function floorFilterFields(meta, facets) {
  const out = facets.map((facet) => ({
    fieldname: facet.fieldname,
    label: facet.label,
    facet: true,
    options: [],
  }))
  if (meta?.date?.fieldname)
    out.push({
      fieldname: meta.date.fieldname,
      label: meta.date.label || 'Fecha',
      kind: 'period',
      field: meta.date.fieldname,
    })
  return out
}

/** The profile keys a floor doctype gets from its meta; merged over the generic one. */
export function floorProfile(meta) {
  const submittable = !!meta?.submittable
  const columns = meta?.columns || []
  const chips = floorChips(meta)
  // The status chips already count by status: no second slice of the same field.
  const facets = (meta?.facets || []).filter(
    (facet) => !(chips.length && facet.fieldname === 'status'),
  )
  const title = meta?.title?.[0] || ''
  return {
    submittable,
    columns,
    facets,
    chips,
    defaultChip: '',
    filterFields: floorFilterFields(meta, facets),
    sorts: [
      { value: '', label: 'Más recientes' },
      { value: 'modified desc', label: 'Modificados recientemente' },
      ...(title ? [{ value: `${title} asc`, label: 'Por nombre, A–Z' }] : []),
    ],

    /** The row: the name, its state and the cells Desk lists; the moment or amount at the end. */
    row(row, { doctype, now = new Date() } = {}) {
      const status = docStatus(row, { submittable })
      const cells = columns
        .map((col) => cellText(col, row, { now }))
        .filter(Boolean)
        .slice(0, MAX_CELLS)
      const when = dateText(meta?.date, row.date, { now })
      const amount =
        row.amount != null ? formatMoney(row.amount, row.currency || 'MXN') : ''
      const name = titleOf(row, doctype)
      // The ID only when the row has nothing else to say under the name.
      const number =
        !cells.length && looksLikeId(row.name) && name !== row.name
          ? row.name
          : ''
      const line = [
        status ? statusLabel(status) : '',
        amount ? when : '',
        ...cells,
        number,
      ].filter(Boolean)
      return {
        title: name,
        subtitle: line.join(' · '),
        subtitleLines: cells.length > 1 ? 2 : 1,
        meta: amount || when,
        metaTone: '',
        status,
        tone: statusTone(status),
        icon: 'lucide-file-text',
      }
    },
  }
}

/** The «Filtros» options of a facet from its counts; the picked value stays even when it fell out of the top. */
export function facetOptions(field, counts, picked = '') {
  const found = counts?.[field.fieldname]
  const options = (found?.values || []).map((v) => ({
    value: v.value,
    label: v.label,
    count: v.count,
  }))
  if (picked && !options.some((o) => o.value === picked))
    options.push({ value: picked, label: picked })
  return options
}

/**
 * The summary pane's groups: each facet's top values with their share of the
 * largest (the bar), the picked one marked. Facets with nothing counted are left out.
 */
export function facetGroups(facets, counts, selected = {}) {
  return facets
    .map((facet) => {
      const found = counts?.[facet.fieldname]
      const values = found?.values || []
      const max = Math.max(1, ...values.map((v) => Number(v.count) || 0))
      return {
        fieldname: facet.fieldname,
        label: facet.label,
        selected: selected[facet.fieldname] || '',
        more: !!found?.more,
        values: values.map((v) => ({
          value: v.value,
          label: v.label,
          count: Number(v.count) || 0,
          share: (Number(v.count) || 0) / max,
        })),
      }
    })
    .filter((group) => group.values.length)
}
