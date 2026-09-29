// Virtual list columns (`_v_*`): values a server provider computes per row
// (customer, device, repair status, next step…) instead of a stored field.
//
// `crm.api.list_columns.get_virtual_columns(doctype)` describes them; get_data
// strips them from the SQL and fills them after the query. They can be shown
// and reordered like any column, but never filtered, sorted or grouped on, so
// every picker that builds a query drops them.

export const VIRTUAL_PREFIX = '_v_'

export function isVirtualKey(key) {
  return typeof key === 'string' && key.startsWith(VIRTUAL_PREFIX)
}

function optionKey(option) {
  if (option == null) return ''
  if (typeof option === 'string') return option
  return option.fieldname ?? option.value ?? option.key ?? ''
}

/** Filter / sort / group-by options without any virtual key. */
export function withoutVirtual(options) {
  if (!Array.isArray(options)) return []
  return options.filter((option) => !isVirtualKey(optionKey(option)))
}

/** Only well-formed descriptors: a `_v_` key and a label. */
export function normalizeVirtualColumns(descriptors) {
  if (!Array.isArray(descriptors)) return []
  const seen = new Set()
  const out = []
  for (const d of descriptors) {
    if (!d || !isVirtualKey(d.key) || seen.has(d.key)) continue
    seen.add(d.key)
    out.push({
      key: d.key,
      label: d.label || d.key,
      fieldtype: d.fieldtype || 'Data',
      width: d.width || '10rem',
      groupable: d.groupable ? 1 : 0,
    })
  }
  return out
}

/**
 * The «Add column» choices: native fields first, then the virtual columns,
 * both without the columns already shown.
 */
export function mergeColumnOptions(nativeOptions, descriptors, existingKeys) {
  const existing = new Set(existingKeys || [])
  const native = (nativeOptions || []).filter(
    (option) => !existing.has(optionKey(option)),
  )
  const nativeKeys = new Set(native.map(optionKey))
  const virtual = normalizeVirtualColumns(descriptors)
    .filter((d) => !existing.has(d.key) && !nativeKeys.has(d.key))
    .map((d) => ({
      label: d.label,
      value: d.key,
      fieldname: d.key,
      fieldtype: d.fieldtype,
      width: d.width,
      virtual: 1,
    }))
  return [...native, ...virtual]
}

/** A picked option as a list column (the shape CRM View Settings stores). */
export function columnFromOption(option) {
  const align = ['Float', 'Int', 'Percent', 'Currency', 'Duration'].includes(
    option.fieldtype,
  )
    ? 'right'
    : 'left'
  const column = {
    label: option.label,
    type: option.fieldtype,
    key: option.fieldname,
    options: option.options,
    // native fields keep upstream's default; a provider may size its own
    width: (option.virtual && option.width) || '10rem',
    align,
  }
  if (option.virtual) column.virtual = 1
  return column
}

// Theme-token classes per colour name. A provider may answer a status with a
// colour; only the names below render in colour, anything else (a hex, an
// unknown word) falls back to the neutral chip so dark mode stays calm.
const CHIP_TONES = {
  gray: 'bg-surface-gray-2 text-ink-gray-7',
  red: 'bg-surface-red-1 text-ink-red-8',
  orange: 'bg-surface-amber-1 text-ink-amber-9',
  amber: 'bg-surface-amber-1 text-ink-amber-9',
  yellow: 'bg-surface-amber-1 text-ink-amber-9',
  green: 'bg-surface-green-2 text-ink-green-8',
  blue: 'bg-surface-blue-1 text-ink-blue-9',
  cyan: 'bg-surface-blue-1 text-ink-blue-9',
  violet: 'bg-surface-violet-2 text-ink-violet-8',
  purple: 'bg-surface-violet-2 text-ink-violet-8',
  pink: 'bg-surface-violet-2 text-ink-violet-8',
}

export function chipToneClass(color) {
  const name = String(color || '')
    .trim()
    .toLowerCase()
  return CHIP_TONES[name] || CHIP_TONES.gray
}

/**
 * A status-like virtual value as a chip. The provider answers either
 * `{label, color}` or a plain string; empty values render nothing.
 */
export function resolveChip(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    const label = value.label ?? value.value ?? value.status ?? ''
    if (label === '' || label == null) return null
    return { label: String(label), class: chipToneClass(value.color) }
  }
  return { label: String(value), class: chipToneClass('') }
}

/** Plain text for a generic virtual cell. */
export function virtualText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(virtualText).join(', ')
  if (typeof value === 'object') {
    const label = value.label ?? value.value ?? value.title ?? ''
    return label == null ? '' : String(label)
  }
  return String(value)
}
