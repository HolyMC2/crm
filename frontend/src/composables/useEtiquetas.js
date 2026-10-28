import { comprasApi, outcomeUnknown, requestId } from '@/composables/useCompras'
import { formatMoney, relativeTime } from '@/utils/display'

// Etiquetas (Productos › Etiquetas): what to label, the layout, the copies,
// preview, print in the browser and the print jobs with their state. Doco's
// labels service (`doco.workspaces.labels`) owns every read and write; each
// print is a «Doco Label Print Job», the same record Desk lists. Pure helpers
// live here so the screens and their tests share them.

const SERVICE = 'doco.workspaces.labels'

export { requestId }

export function etiquetasApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

/** The screen's sentence for a failed call, with what to do next. */
export function problemText(error) {
  if (outcomeUnknown(error))
    return 'Sin conexión. Revisa la red y vuelve a intentar.'
  const text = (error?.messages || []).join(' ') || error?.message || ''
  return text || 'Algo falló. Vuelve a intentar.'
}

// ── states ────────────────────────────────────────────────────────────

// What the browser can know about a print, in the worker's words.
const STATES = {
  Draft: { label: 'Sin imprimir', tone: 'neutral' },
  Rendered: { label: 'Lista para imprimir', tone: 'info' },
  Dispatched: { label: 'Enviada a la impresora', tone: 'success' },
  Failed: { label: 'No se imprimió', tone: 'danger' },
}
export function jobState(status) {
  return STATES[status] || STATES.Draft
}

export const JOB_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'mine', label: 'Míos' },
  { value: 'Failed', label: 'No se imprimieron' },
]

/** The line under a job: labels, when, who (others' jobs), then the layout. */
export function jobLine(job, { now = new Date() } = {}) {
  const parts = [labelsText(job.label_count)]
  const when = relativeTime(job.printed || job.created, { now })
  if (when) parts.push(when)
  if (!job.mine && job.owner_name) parts.push(job.owner_name)
  if (job.layout_label) parts.push(job.layout_label)
  return parts.join(' · ')
}

export function labelsText(count) {
  const n = Number(count) || 0
  return n === 1 ? '1 etiqueta' : `${n.toLocaleString('es-MX')} etiquetas`
}

// ── layouts ───────────────────────────────────────────────────────────

const KINDS = [
  { kind: 'size', title: 'Tamaños', hint: 'Elige qué lleva cada etiqueta' },
  { kind: 'format', title: 'Formatos de la tienda', hint: '' },
  { kind: 'template', title: 'Plantillas de diseño', hint: '' },
]

/** Layouts grouped as the sheet shows them; empty groups left out. */
export function layoutGroups(layouts = []) {
  return KINDS.map((group) => ({
    ...group,
    layouts: layouts.filter((layout) => layout.kind === group.kind),
  })).filter((group) => group.layouts.length)
}

export function layoutName(layout) {
  if (!layout) return ''
  return layout.size ? `${layout.label} · ${layout.size}` : layout.label
}

/** The layout to start with: the remembered one if it still prints, else the server's. */
export function startLayout(layouts = [], remembered = '', fallback = '') {
  const ok = (key) =>
    key && layouts.some((layout) => layout.key === key && !layout.problem)
  if (ok(remembered)) return remembered
  if (ok(fallback)) return fallback
  return layouts.find((layout) => !layout.problem)?.key || ''
}

// ── rows ──────────────────────────────────────────────────────────────

/** A row's identity in the list: an item, or one serial / lote of it. */
export function rowKey(row) {
  return [row.item_code, row.serial_no || '', row.batch_no || ''].join('|')
}

/**
 * Adds rows to the list: the same product (or unit) adds its copies to the
 * one already there instead of a second line. A serial is always one label.
 */
export function mergeRows(current = [], incoming = []) {
  const out = current.map((row) => ({ ...row }))
  const index = new Map(out.map((row, i) => [rowKey(row), i]))
  for (const row of incoming) {
    const key = rowKey(row)
    if (index.has(key)) {
      const kept = out[index.get(key)]
      if (!kept.serial_no)
        kept.qty = clampQty(kept.qty + (Number(row.qty) || 1))
    } else {
      index.set(key, out.length)
      out.push({ ...row, qty: row.serial_no ? 1 : clampQty(row.qty) })
    }
  }
  return out
}

export const MAX_COPIES = 200
export const MAX_LABELS = 1000

export function clampQty(value) {
  const n = Math.round(Number(value) || 1)
  return Math.min(MAX_COPIES, Math.max(1, n))
}

export function totalLabels(rows = []) {
  return rows.reduce(
    (sum, row) => sum + (row.serial_no ? 1 : clampQty(row.qty)),
    0,
  )
}

/** The second line of a row: code, price (or «Sin precio») and its unit. */
export function rowLine(row) {
  const parts = [row.item_code]
  if (row.serial_no) parts.push(`Serie ${row.serial_no}`)
  else if (row.batch_no) parts.push(`Lote ${row.batch_no}`)
  return parts.join(' · ')
}

export function rowPrice(row) {
  if (row.price === '' || row.price === null || row.price === undefined)
    return ''
  return formatMoney(Number(row.price))
}

/** Why the «Imprimir» button cannot run yet, said beside it ('' = it can). */
export function printBlock({ rows = [], layout = '', busy = false } = {}) {
  if (busy) return 'Imprimiendo…'
  if (!rows.length) return 'Agrega al menos un producto para imprimir.'
  if (!layout) return 'Elige una plantilla.'
  const total = totalLabels(rows)
  if (total > MAX_LABELS)
    return `Son ${total.toLocaleString('es-MX')} etiquetas; imprime hasta ${MAX_LABELS.toLocaleString('es-MX')} a la vez.`
  return ''
}

export function printLabel(rows = []) {
  const total = totalLabels(rows)
  return total ? `Imprimir ${labelsText(total)}` : 'Imprimir'
}

// ── where the labels come from ────────────────────────────────────────

export const SOURCES = [
  {
    key: 'recibido',
    label: 'Llegó mercancía',
    hint: 'Una recepción o entrada reciente',
    icon: 'truck',
  },
  {
    key: 'precios',
    label: 'Cambió el precio',
    hint: 'Precios de los últimos 7 días',
    icon: 'tag',
  },
]

const SOURCE_NAMES = {
  'Purchase Receipt': 'Recepción',
  'Purchase Invoice': 'Factura de proveedor',
  'Stock Entry': 'Entrada',
  'Purchase Order': 'Orden de compra',
  'Stock Reconciliation': 'Ajuste de inventario',
}
export const SOURCE_DOCTYPES = Object.keys(SOURCE_NAMES)

export function sourceName(doctype) {
  return SOURCE_NAMES[doctype] || doctype
}

/**
 * The page's query → what to load first: `?codigos=A,B` (a selection, a
 * product), `?desde=Purchase Receipt:MAT-PRE-1` (a document) or nothing.
 */
export function startFrom(query = {}) {
  const desde = String(query.desde || '')
  const at = desde.indexOf(':')
  if (at > 0) {
    const doctype = desde.slice(0, at)
    const name = desde.slice(at + 1)
    if (SOURCE_DOCTYPES.includes(doctype) && name)
      return { doctype, name, items: [] }
  }
  const codes = String(query.codigos || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 300)
  return {
    doctype: '',
    name: '',
    items: codes.map((code) => ({ code, qty: 1 })),
  }
}

/** The shell link that opens Etiquetas with these products already on it. */
export function etiquetasHref(codes = [], { desde = '' } = {}) {
  const params = new URLSearchParams()
  if (desde) params.set('desde', desde)
  const list = [...new Set(codes.filter(Boolean))]
  if (list.length) params.set('codigos', list.join(','))
  const query = params.toString()
  return `/productos/etiquetas${query ? `?${query}` : ''}`
}

// ── printing ──────────────────────────────────────────────────────────

/**
 * Prints an HTML document from a hidden frame (no pop-up for a blocker to
 * stop). Resolves `{ ok: true }` once the print dialog closed, or
 * `{ ok: false, reason }` when this browser cannot print.
 */
export function printHtml(html, { doc = globalThis.document } = {}) {
  return new Promise((resolve) => {
    if (!doc?.body) {
      resolve({ ok: false, reason: 'Este navegador no puede imprimir.' })
      return
    }
    const frame = doc.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    let settled = false
    const finish = (answer) => {
      if (settled) return
      settled = true
      resolve(answer)
      setTimeout(() => frame.remove(), 1500)
    }
    frame.addEventListener('load', () => {
      const win = frame.contentWindow
      if (!win || typeof win.print !== 'function') {
        finish({
          ok: false,
          reason:
            'Este navegador no puede imprimir. Ábrelo en Chrome o descarga las etiquetas.',
        })
        return
      }
      win.addEventListener('afterprint', () => finish({ ok: true }))
      try {
        win.focus()
        win.print()
        // print() blocks until the dialog closes where afterprint is late.
        setTimeout(() => finish({ ok: true }), 0)
      } catch {
        finish({
          ok: false,
          reason:
            'El navegador no abrió la impresión. Descarga las etiquetas e imprímelas desde el archivo.',
        })
      }
    })
    frame.srcdoc = withBase(html)
    doc.body.appendChild(frame)
  })
}

/** Relative image and file links in a srcdoc frame resolve against the site. */
export function withBase(html, origin = globalThis.location?.origin || '') {
  const text = String(html || '')
  if (!origin || /<base\s/i.test(text)) return text
  const base = `<base href="${origin}/">`
  return /<head[^>]*>/i.test(text)
    ? text.replace(/<head[^>]*>/i, (head) => head + base)
    : base + text
}

/** Saves the labels as a file the worker can print from another app. */
export function downloadHtml(html, filename = 'etiquetas.html') {
  const blob = new Blob([withBase(html)], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── remembered choices ────────────────────────────────────────────────

const LAYOUT_KEY = 'muelle:etiquetas:plantilla'
const FIELDS_KEY = 'muelle:etiquetas:partes'

export function rememberedLayout() {
  try {
    return localStorage.getItem(LAYOUT_KEY) || ''
  } catch {
    return ''
  }
}
export function rememberLayout(key) {
  try {
    localStorage.setItem(LAYOUT_KEY, key)
  } catch {
    // Private mode: the choice is just not remembered.
  }
}
export function rememberedFields() {
  try {
    const value = JSON.parse(localStorage.getItem(FIELDS_KEY) || 'null')
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}
export function rememberFields(fields) {
  try {
    localStorage.setItem(FIELDS_KEY, JSON.stringify(fields))
  } catch {
    // Private mode.
  }
}
