// Impresión (Shell D12, SPEC §6 DD20 «PDF con Jinja»): the pure rules of the
// print preview and the owner's format editor. No Vue, no calls: the sheet,
// the pages and the unit test read the same rules.
import { kindLabel } from '@/utils/display'

/** How a format is built (server `kind_of`), in the owner's words. */
export const KIND_LABELS = Object.freeze({
  jinja: 'Jinja',
  pd: 'Print Designer',
  builder: 'Constructor',
  standard: 'Estándar',
  js: 'Punto de venta',
  raw: 'Impresora directa',
})

export function kindText(kind) {
  return KIND_LABELS[kind] || KIND_LABELS.builder
}

/** The icon of a format row (lucide classes already in the shell's CSS). */
export function kindIcon(kind) {
  if (kind === 'jinja') return 'lucide-code'
  if (kind === 'pd') return 'lucide-palette'
  return 'lucide-file-text'
}

/** «Factura», «Cotización»… for a section; the server's Spanish label otherwise. */
export function groupTitle(group) {
  return kindLabel(group?.doctype) || group?.label || group?.doctype || ''
}

/** The second line of a format row: kind, «de fábrica», «apagado». */
export function formatSubtitle(format) {
  if (!format) return ''
  if (format.kind === 'standard') return 'Diseño básico con todos los campos'
  const parts = [kindText(format.kind)]
  if (format.standard) parts.push('de fábrica')
  if (format.disabled) parts.push('apagado')
  return parts.join(' · ')
}

/** Owner screen search: a type or format whose name has the words. */
export function filterGroups(groups, query) {
  const words = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return groups || []
  const plain = (text) =>
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const out = []
  for (const group of groups || []) {
    const title = plain(`${groupTitle(group)} ${group.label}`)
    if (words.every((w) => title.includes(w))) {
      out.push(group)
      continue
    }
    const formats = group.formats.filter((f) =>
      words.every((w) => plain(f.label).includes(w)),
    )
    if (formats.length) out.push({ ...group, formats })
  }
  return out
}

/** The section and the format a name belongs to in the owner's list (null when it is not there). */
export function findFormat(groups, name) {
  for (const group of groups || []) {
    const format = group.formats.find((f) => f.name === name)
    if (format) return { group, format }
  }
  return null
}

// ── preview scale and zoom ────────────────────────────────────────────────

/** The scale that fits a page `pageWidth` px wide in `width` px (with a margin), never above 1. */
export function fitScale(width, pageWidth, { margin = 16, max = 1 } = {}) {
  const room = Number(width) - 2 * margin
  const page = Number(pageWidth)
  if (!(room > 0) || !(page > 0)) return 1
  return Math.min(max, Math.max(0.1, room / page))
}

/** Zoom steps over the fitted size (1 = the page fits the width). */
export const ZOOMS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2, 3])

/** The next zoom step in `direction` (+1 / −1) from `zoom`, inside ZOOMS. */
export function stepZoom(zoom, direction) {
  const z = Number(zoom) || 1
  if (direction > 0) return ZOOMS.find((s) => s > z + 0.01) ?? ZOOMS.at(-1)
  return [...ZOOMS].reverse().find((s) => s < z - 0.01) ?? ZOOMS[0]
}

/** A pinch: the zoom at the start times the fingers' spread, kept in range. */
export function pinchZoom(startZoom, startDistance, distance) {
  if (!(startDistance > 0)) return startZoom
  const z = (startZoom * distance) / startDistance
  return Math.min(ZOOMS.at(-1), Math.max(ZOOMS[0], z))
}

export function zoomText(zoom) {
  return `${Math.round((Number(zoom) || 1) * 100)}%`
}

/**
 * The Vista previa format chips: one per format, Spanish «Estándar», and the
 * format the preview opens with always among them (first when the curated
 * list left it out), so a chip is on from the start.
 */
export function formatChips(formats = [], current = '') {
  const label = (f) => (f.label === 'Standard' ? 'Estándar' : f.label || f.name)
  const chips = formats.map((f) => ({ value: f.name, label: label(f) }))
  if (current && !chips.some((c) => c.value === current))
    chips.unshift({
      value: current,
      label: label({ name: current, label: current }),
    })
  return chips
}

/**
 * The iframe document for a rendered format: printview's stylesheet, the
 * format's style, the body. No scripts run (the iframe is sandboxed); the
 * body shrinks to the page so its width can be measured and scaled.
 */
export function previewDocument({ html, style, css } = {}) {
  const link = css ? `<link rel="stylesheet" href="${escapeAttr(css)}">` : ''
  return `<!DOCTYPE html><html lang="es-MX"><head><meta charset="utf-8">${link}<style>${
    style || ''
  }</style><style>html,body{margin:0;background:#fff}body{width:max-content;min-width:240px}.print-format-gutter{margin:0!important;padding:0!important;background:#fff!important}.print-format{margin:0!important;box-shadow:none!important;min-height:0!important}.action-banner,.print-hide{display:none!important}</style></head><body><div class="print-format-gutter"><div class="print-format">${
    html || ''
  }</div></div></body></html>`
}

function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// ── fields a template can print ───────────────────────────────────────────

const FORMATTED = new Set([
  'Currency',
  'Float',
  'Percent',
  'Int',
  'Date',
  'Datetime',
  'Time',
  'Duration',
  'Check',
  'Rating',
])

/** `{{ doc.x }}`, or `{{ doc.get_formatted("x") }}` for money, numbers and dates (as printed). */
export function valueSnippet(field, variable = 'doc') {
  if (!field?.fieldname) return ''
  return FORMATTED.has(field.fieldtype)
    ? `{{ ${variable}.get_formatted("${field.fieldname}") }}`
    : `{{ ${variable}.${field.fieldname} }}`
}

const ROW_PREFERRED = [
  'item_name',
  'description',
  'qty',
  'uom',
  'rate',
  'amount',
]

/** A loop over a child table (the items): one line per row with its usual columns. */
export function tableSnippet(field, { columns = 4 } = {}) {
  if (!field?.fieldname) return ''
  const children = field.children || []
  let picked = ROW_PREFERRED.map((name) =>
    children.find((c) => c.fieldname === name),
  ).filter(Boolean)
  if (picked.some((c) => c.fieldname === 'item_name'))
    picked = picked.filter((c) => c.fieldname !== 'description')
  if (!picked.length) picked = children
  const cells = picked
    .slice(0, columns)
    .map((c) => `    <td>${valueSnippet(c, 'row')}</td>`)
  return [
    `{% for row in doc.${field.fieldname} %}`,
    '  <tr>',
    ...cells,
    '  </tr>',
    '{% endfor %}',
  ].join('\n')
}

/** The snippet a field inserts (or copies, on the phone). */
export function fieldSnippet(field) {
  if (field?.table) return tableSnippet(field)
  // A column of a child table, inside its loop.
  return valueSnippet(field, field?.row ? 'row' : 'doc')
}

/** Fields matching a search, by label or field name. */
export function filterFields(fields, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return fields || []
  return (fields || []).filter(
    (f) =>
      String(f.label || '')
        .toLowerCase()
        .includes(q) || String(f.fieldname).toLowerCase().includes(q),
  )
}

// ── the code editor ───────────────────────────────────────────────────────

export const INDENT = '  '

export function lineCount(text) {
  return String(text ?? '').split('\n').length
}

/** Insert `snippet` over the selection; the caret lands after it. */
export function insertAt(text, start, end, snippet) {
  const value = String(text ?? '')
  const from = Math.max(0, Math.min(start ?? value.length, value.length))
  const to = Math.max(from, Math.min(end ?? from, value.length))
  return {
    text: value.slice(0, from) + snippet + value.slice(to),
    start: from + snippet.length,
    end: from + snippet.length,
  }
}

/**
 * Tab / Shift+Tab in the editor: a caret gets two spaces (Tab) or loses up to
 * two before it; a selection over lines indents or outdents every line.
 */
export function applyTab(text, start, end, shift = false) {
  const value = String(text ?? '')
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  if (start === end && !shift) return insertAt(value, start, end, INDENT)
  const blockEnd = end > start && value[end - 1] === '\n' ? end - 1 : end
  const lines = value.slice(lineStart, blockEnd).split('\n')
  let firstDelta = 0
  let total = 0
  const changed = lines.map((line, i) => {
    if (!shift) {
      if (i === 0) firstDelta = INDENT.length
      total += INDENT.length
      return INDENT + line
    }
    const remove = line.startsWith(INDENT)
      ? INDENT.length
      : line.startsWith(' ') || line.startsWith('\t')
        ? 1
        : 0
    if (i === 0) firstDelta = -remove
    total -= remove
    return line.slice(remove)
  })
  const next =
    value.slice(0, lineStart) + changed.join('\n') + value.slice(blockEnd)
  if (start === end) {
    const caret = Math.max(lineStart, start + firstDelta)
    return { text: next, start: caret, end: caret }
  }
  return {
    text: next,
    start: Math.max(lineStart, start + firstDelta),
    end: end + total,
  }
}

/** A default name for a copy: «Factura CFDI 4.0 (copia)», then «(copia 2)»… */
export function copyName(label, taken = []) {
  const base = `${label || 'Formato'} (copia)`
  if (!taken.includes(base)) return base
  for (let n = 2; n < 100; n++) {
    const name = `${label || 'Formato'} (copia ${n})`
    if (!taken.includes(name)) return name
  }
  return `${base} ${Date.now()}`
}

/** «Print Designer» editor in Desk: the one desk link, only at ≥1024px. */
export function designerUrl(name) {
  return `/desk/print-designer/${encodeURIComponent(name || '')}`
}
