import { comprasApi, outcomeUnknown, requestId } from '@/composables/useCompras'
import { formatMoney, relativeTime } from '@/utils/display'
import { SOURCE_DOCTYPES } from './etiquetasLink'

// Etiquetas (Productos › Etiquetas): what to label, the size and what each
// label carries (its design), the copies, the preview, print in the browser or
// a PDF, and the print jobs with their state. Doco's labels service
// (`doco.workspaces.labels`) owns every read and write and lays each label out
// (`doco.docoutils.labels.design`); each print is a «Doco Label Print Job», the
// same record Desk lists. Pure helpers live here so the screens and their
// tests share them.

const SERVICE = 'doco.workspaces.labels'

export { requestId }
export {
  SOURCE_DOCTYPES,
  etiquetasFor,
  etiquetasHref,
  sourceName,
} from './etiquetasLink'

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
  { kind: 'size', title: 'Medidas', hint: 'Elige qué lleva cada etiqueta' },
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
export function startLayout(
  layouts = [],
  remembered = '',
  fallback = '',
  limits,
) {
  const ok = (key) =>
    key &&
    (layouts.some((layout) => layout.key === key && !layout.problem) ||
      customLayout(key, limits))
  if (ok(remembered)) return remembered
  if (ok(fallback)) return fallback
  return layouts.find((layout) => !layout.problem)?.key || ''
}

/** The layout behind a key: one the server listed, or a measured label. */
export function findLayout(key, layouts = [], limits) {
  return (
    layouts.find((layout) => layout.key === key) || customLayout(key, limits)
  )
}

// ── measured labels (`custom:<w>x<h>`) ────────────────────────────────

const CUSTOM = /^custom:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/
const LIMITS = { min: 10, max: 300 }

function mmText(value) {
  return Number(value).toLocaleString('es-MX', { maximumFractionDigits: 1 })
}

export function sizeText(w, h) {
  return `${mmText(w)} × ${mmText(h)} mm`
}

/** Whether a side is one the labels print at (10 to 300 mm by default). */
export function sideOk(value, limits = LIMITS) {
  const n = Number(value)
  return Number.isFinite(n) && n >= limits.min && n <= limits.max
}

export function customKey(w, h) {
  return `custom:${+Number(w).toFixed(1)}x${+Number(h).toFixed(1)}`
}

/** `custom:62x29` as a layout, or null when it is not a size that prints. */
export function customLayout(key, limits = LIMITS) {
  const match = CUSTOM.exec(key || '')
  if (!match) return null
  const w = Number(match[1])
  const h = Number(match[2])
  if (!sideOk(w, limits) || !sideOk(h, limits)) return null
  return {
    key: customKey(w, h),
    kind: 'size',
    label: 'Medida',
    size: sizeText(w, h),
    w_mm: w,
    h_mm: h,
    name: 'custom',
  }
}

// ── what a size's label carries ───────────────────────────────────────

export const NAME_SIZES = [
  { value: 's', label: 'Chico' },
  { value: 'm', label: 'Normal' },
  { value: 'l', label: 'Grande' },
]
export const PRICE_SIZES = [
  { value: 'm', label: 'Chico' },
  { value: 'l', label: 'Normal' },
  { value: 'xl', label: 'Grande' },
]
export const CODE_KINDS = [
  { value: 'unit', label: 'La pieza' },
  { value: 'item', label: 'El producto' },
]

/** What each part is for, said where the worker switches it on. */
export const PART_HINTS = {
  shop: 'El nombre de la tienda, arriba',
  name: 'Tan grande como quepa; nunca se corta',
  brand: 'La marca, sobre el nombre',
  price: 'El precio de venta de la lista de la tienda',
  sku: 'El código del producto, para buscarlo',
  qr: 'Se escanea en caja: la pieza, o el producto',
  bar: 'Barras para lectores que no leen QR',
  sn: 'La serie o el IMEI de cada pieza',
  batch: 'El lote y su fecha de caducidad',
  date: 'El día en que se imprimió',
  text: 'Una línea tuya: «Garantía 30 días», «Oferta»',
}

const PARTS = Object.keys(PART_HINTS)
const DEFAULT_PARTS = ['shop', 'name', 'price', 'sku', 'qr', 'sn', 'batch']

function oneOf(value, options, fallback) {
  return options.some((option) => option.value === value) ? value : fallback
}

/**
 * A design as the server reads it: known parts in reading order (none falls
 * back to the default set), options it knows, the texts cut to their length.
 * `meta` is bootstrap's `design` ({ parts, default, text_max, shop_max }).
 */
export function cleanDesign(value, meta = {}) {
  const source = Array.isArray(value) ? { parts: value } : value || {}
  const order = (meta.parts || []).map((part) => part.key)
  const known = order.length ? order : PARTS
  const wanted = new Set(source.parts || [])
  let parts = known.filter((key) => wanted.has(key))
  if (!parts.length)
    parts = (meta.default || DEFAULT_PARTS).filter((key) => known.includes(key))
  return {
    parts,
    name_size: oneOf(source.name_size, NAME_SIZES, 'm'),
    price_size: oneOf(source.price_size, PRICE_SIZES, 'l'),
    code: oneOf(source.code, CODE_KINDS, 'unit'),
    text: String(source.text || '').slice(0, meta.text_max || 60),
    shop_text: String(source.shop_text || '').slice(0, meta.shop_max || 40),
  }
}

/** «Nombre, Precio, QR»: the parts of a design in the worker's words. */
export function partsText(design, fields = []) {
  const names = new Map(fields.map((field) => [field.key, field.label]))
  return (design?.parts || []).map((key) => names.get(key) || key).join(', ')
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
// The most products one preview draws (doco's PREVIEW_ROWS): a longer list
// is previewed a window at a time.
export const PREVIEW_ROWS = 30

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
  if (!layout) return 'Elige la medida de la etiqueta.'
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
  {
    key: 'existencias',
    label: 'Lo que hay en tienda',
    hint: 'Los productos con existencia de un almacén',
    icon: 'warehouse',
  },
  {
    key: 'pegar',
    label: 'Pegar códigos',
    hint: 'Una lista de códigos copiada de Excel o de un mensaje',
    icon: 'clipboard-list',
  },
]

/**
 * Codes pasted from a sheet or a message, one per line, a count after the
 * code when it has one («750123 3», «A-1<tab>x2»): `[{ code, qty }]`, the
 * same code once with its copies added up.
 */
export function parsePasted(text = '') {
  const counts = new Map()
  const add = (code, qty = 1) =>
    code && counts.set(code, clampQty((counts.get(code) || 0) + qty))
  const copies = /^[x×]?\s*(\d{1,3})$/i
  for (const raw of String(text).split(/\r?\n/).slice(0, 300)) {
    const line = raw.trim()
    if (!line) continue
    let cells = line
      .split(/[\t;,]/)
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (cells.length === 1) {
      const words = line.split(/\s+/)
      if (words.length === 2 && copies.test(words[1])) cells = words
    }
    if (cells.length === 2 && copies.test(cells[1])) {
      add(cells[0], Number(copies.exec(cells[1])[1]) || 1)
      continue
    }
    for (const cell of cells) add(cell)
  }
  return [...counts].map(([code, qty]) => ({ code, qty }))
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
  saveFile(new Blob([withBase(html)], { type: 'text/html' }), filename)
}

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** The server's PDF (base64) as a file. */
export function pdfFile(base64, filename = 'etiquetas.pdf') {
  const bytes = Uint8Array.from(atob(base64 || ''), (c) => c.charCodeAt(0))
  return new File([bytes], filename, { type: 'application/pdf' })
}

/**
 * Hands the PDF on: a phone shares it (to the label printer's app, WhatsApp,
 * Drive), a computer saves it. `'shared' | 'saved' | 'cancelled'`.
 */
export async function sendPdf(
  file,
  { share = false, nav = globalThis.navigator } = {},
) {
  if (share && nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }
  saveFile(file, file.name)
  return 'saved'
}

// ── remembered choices ────────────────────────────────────────────────

const LAYOUT_KEY = 'muelle:etiquetas:plantilla'
const DESIGN_KEY = 'muelle:etiquetas:diseno'
const SIZES_KEY = 'muelle:etiquetas:medidas'
// Older screens kept the parts alone.
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
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode.
  }
}

/** The design last used on this device (raw: clean it with the boot's meta). */
export function rememberedDesign() {
  const design = readJson(DESIGN_KEY)
  if (design && typeof design === 'object' && !Array.isArray(design))
    return design
  const parts = readJson(FIELDS_KEY)
  return Array.isArray(parts) ? { parts } : null
}
export function rememberDesign(design) {
  writeJson(DESIGN_KEY, design)
}

/** Measures typed lately, newest first, four at most. */
export function rememberedSizes() {
  const keys = readJson(SIZES_KEY)
  return Array.isArray(keys) ? keys.filter((key) => CUSTOM.test(key)) : []
}
export function rememberSize(key) {
  if (!CUSTOM.test(key || '')) return
  writeJson(
    SIZES_KEY,
    [key, ...rememberedSizes().filter((kept) => kept !== key)].slice(0, 4),
  )
}
