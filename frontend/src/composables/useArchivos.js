import { ref } from 'vue'
import { callError, errorGuard, errorKind } from '@/utils/contactos'

// Archivos («Bandeja de comprobantes»): one intake queue over Doco evidence.
// Pure helpers live here so the page, the record panel and tests share them.

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.docoutils.documents.bandeja'

// Control characters or a backslash never belong in a local path or target.
function unsafeChars(value) {
  return [...String(value)].some(
    (ch) => ch === '\\' || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127,
  )
}

/** POST to the Archivos service; a refusal keeps the server's guard DTO. */
export async function archivosApi(method, args = {}) {
  const path = method.includes('.') ? method : `${SERVICE}.${method}`
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  let response
  try {
    response = await fetch(`/api/method/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    })
  } catch {
    const error = new Error(path)
    error.guard = {
      code: 'network',
      message: tr(
        'No connection. Your changes stay on screen; reconnect and try again.',
      ),
      actions: [{ label: tr('Try again'), kind: 'retry' }],
    }
    throw error
  }
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError(path, response.status, data)
}

export const archivosBoot = ref(null)
let bootPending
/**
 * The page's working context (companies, default company, kinds, limits).
 * Shell access comes from crm.api.shell.boot; this only feeds the page and is
 * cached per page load; refresh re-reads permissions.
 */
export function loadArchivosBoot({ refresh = false } = {}) {
  if (archivosBoot.value && !refresh) return Promise.resolve(archivosBoot.value)
  if (bootPending) return bootPending
  bootPending = archivosApi('boot')
    .then((data) => (archivosBoot.value = data || { enabled: false }))
    .catch(() => (archivosBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

// Each list says in one line what is in it and what the worker does there.
// «Bandeja» is the intake queue: files that still need a hand.
export const BANDEJA_VIEWS = Object.freeze([
  {
    value: 'por_clasificar',
    label: 'To classify',
    icon: 'inbox',
    hint: 'Files received and not yet linked to their operation, newest first.',
  },
  {
    value: 'ayuda',
    label: 'Need attention',
    icon: 'alert-triangle',
    hint: 'Files that are still being read or could not be processed. Open one to see what to do.',
  },
  {
    value: 'huecos_fiscales',
    label: 'Fiscal gaps',
    icon: 'alert-octagon',
    hint: 'Purchases without their CFDI, CFDI without a purchase, cancellations at the SAT and PDFs without their XML.',
  },
])
// «Explorar» is the file manager: every file the worker may see, one way in per question.
export const BROWSE_VIEWS = Object.freeze([
  {
    value: 'recientes',
    label: 'Recent',
    icon: 'clock',
    hint: 'Every file you can see, newest first.',
  },
  {
    value: 'carpeta',
    label: 'Folders',
    icon: 'folder',
    hint: 'Files you keep by hand: contracts, manuals and photos.',
  },
  {
    value: 'registro',
    label: 'By record',
    icon: 'file-text',
    hint: 'Files grouped by the record they belong to.',
  },
  {
    value: 'contacto',
    label: 'By contact',
    icon: 'users',
    hint: 'Files grouped by the customer or supplier they are about.',
  },
  {
    value: 'mes',
    label: 'By month',
    icon: 'calendar',
    hint: 'Files grouped by the month of the document.',
  },
  {
    value: 'tipo',
    label: 'By type',
    icon: 'tag',
    hint: 'Invoices, receipts, bank statements, contracts and photos.',
  },
  {
    value: 'canal',
    label: 'By channel',
    icon: 'message-square',
    hint: 'Where each file arrived from: WhatsApp, mail, the SAT or an upload.',
  },
  {
    value: 'papelera',
    label: 'Trash',
    icon: 'trash-2',
    hint: 'Files and folders sent to the trash. Nothing is deleted here.',
  },
])
export const VIEWS = Object.freeze([...BANDEJA_VIEWS, ...BROWSE_VIEWS])
function viewEntry(value) {
  return VIEWS.find((v) => v.value === value) || VIEWS[0]
}
export function isBrowseView(value) {
  return BROWSE_VIEWS.some((v) => v.value === value)
}
export function viewIcon(value) {
  return viewEntry(value).icon
}
export function viewLabel(value) {
  return tr(viewEntry(value).label)
}
export function viewHint(value) {
  return tr(viewEntry(value).hint)
}
/** Sidebar label with its count, the same «Label (n)» the other shell lists use. */
export function viewCountLabel(value, counts) {
  const n = counts?.[value]
  return typeof n === 'number' ? `${viewLabel(value)} (${n})` : viewLabel(value)
}
export function normalizeView(value) {
  // «Archivo» was the third queue before Archivos became a file manager; its
  // links keep working and land on «Recientes», which holds the same files.
  if (value === 'archivo') return 'recientes'
  return VIEWS.some((v) => v.value === value) ? value : 'por_clasificar'
}

const KIND_LABELS = {
  Unknown: 'No type yet',
  Invoice: 'Invoice',
  Receipt: 'Receipt',
  BankStatement: 'Bank statement',
  Contract: 'Contract',
  Delivery: 'Delivery paperwork',
  Repair: 'Repair paperwork',
}
export function kindLabel(kind) {
  return tr(KIND_LABELS[kind] || KIND_LABELS.Unknown)
}
const KIND_ICONS = {
  Invoice: 'file-text',
  Receipt: 'shopping-bag',
  BankStatement: 'credit-card',
  Contract: 'edit-3',
  Delivery: 'truck',
  Repair: 'tool',
}
/** A glanceable icon per document type; unknown types keep the plain file. */
export function kindIcon(kind) {
  return KIND_ICONS[kind] || 'file'
}

const DOCTYPE_LABELS = {
  'Purchase Invoice': 'Purchase invoice',
  'Sales Invoice': 'Sales invoice',
  'Delivery Note': 'Delivery note',
  'Expense Claim': 'Expense claim',
  'Payment Entry': 'Payment',
  'Journal Entry': 'Journal entry',
  'Repair Order': 'Repair order',
  Customer: 'Customer',
  Supplier: 'Supplier',
  'Importacion Bancaria': 'Bank import',
  Item: 'Product',
  'Captura Contable': 'Books capture',
  'SAT Received CFDI': 'CFDI from the SAT',
  'Repair Photo': 'Repair photo',
  'CRM Deal': 'Deal',
  'CRM Lead': 'Lead',
  Contact: 'Contact',
  'Purchase Order': 'Purchase order',
  'Purchase Receipt': 'Purchase receipt',
  'Supplier Quotation': 'Supplier quotation',
  'Sales Order': 'Sales order',
  Quotation: 'Quotation',
  'POS Invoice': 'POS sale',
  'WhatsApp Message': 'WhatsApp message',
  Communication: 'Email',
  'Material Request': 'Material request',
  'Stock Entry': 'Stock entry',
  Employee: 'Employee',
  Task: 'Task',
  Project: 'Project',
  Asset: 'Asset',
  'Warranty Claim': 'Warranty claim',
}
export function doctypeLabel(doctype) {
  return DOCTYPE_LABELS[doctype] ? tr(DOCTYPE_LABELS[doctype]) : doctype
}

const STATUS = {
  Review: ['To classify', 'orange'],
  Processing: ['Processing', 'blue'],
  Error: ['Needs attention', 'red'],
  Linked: ['Linked', 'green'],
  Archived: ['Filed without link', 'gray'],
}
export function statusLabel(status) {
  return tr((STATUS[status] || STATUS.Review)[0])
}
export function statusTheme(status) {
  return (STATUS[status] || STATUS.Review)[1]
}

/**
 * Where a document stands in the three steps the page explains:
 * received → linked to its operation → filed. `current` is the step being
 * worked on; a document that needs attention stays on «received».
 */
export function progressStep(status) {
  if (status === 'Linked' || status === 'Archived') return 3
  if (status === 'Review') return 2
  return 1
}

/** `Doctype/name` from a record-origin entry; names may contain slashes. */
export function parseTarget(value) {
  if (typeof value !== 'string') return null
  const cut = value.indexOf('/')
  if (cut < 1) return null
  const doctype = value.slice(0, cut).trim()
  const name = value.slice(cut + 1)
  if (!doctype || !name || doctype.length > 140 || name.length > 200)
    return null
  if (unsafeChars(value)) return null
  return { doctype, name }
}
export function targetParam(target) {
  return target ? `${target.doctype}/${target.name}` : undefined
}

const RETURN_PREFIXES = [
  '/crm/',
  '/desk/',
  '/app/',
  '/taller/',
  '/posapp/',
  '/clinica/',
  '/mercado/',
  '/scan/',
  '/contador/',
]
/** Same-origin local return path or '' (return-to protocol, Desk forms included). */
export function safeReturn(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return ''
  if (!value.startsWith('/') || value.startsWith('//')) return ''
  if (unsafeChars(value)) return ''
  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return ''
  }
  if (unsafeChars(decoded) || decoded.startsWith('//')) return ''
  const path = decoded.split(/[?#]/)[0]
  if (path.split('/').some((part) => part === '..' || part === '.')) return ''
  return RETURN_PREFIXES.some((prefix) => path.startsWith(prefix)) ? value : ''
}
/** Return URL that tells the caller which record was completed. */
export function withDone(returnTo, doctype, name) {
  const safe = safeReturn(returnTo)
  if (!safe) return ''
  const [base, hash = ''] = safe.split('#')
  const joiner = base.includes('?') ? '&' : '?'
  const done = encodeURIComponent(`${doctype}:${name}`)
  return `${base}${joiner}done=${done}${hash ? '#' + hash : ''}`
}

/** After an item leaves the list, the one that took its place (or the one before). */
export function nextAfter(rows, name) {
  const index = rows.findIndex((row) => row.name === name)
  if (index < 0) return rows[0]?.name || ''
  return rows[index + 1]?.name || rows[index - 1]?.name || ''
}

export function previewKind(mediaType) {
  const type = String(mediaType || '')
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (['text/plain', 'text/csv', 'application/xml'].includes(type))
    return 'text'
  return 'none'
}

export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.xml,.txt'
export function uploadProblem(file, limitMb = 10) {
  if (!file) return tr('Choose a file or take a photo.')
  if (file.size > limitMb * 1024 * 1024)
    return tr('This file is larger than {0} MB. Send a lighter photo or PDF.', [
      limitMb,
    ])
  const ok =
    /\.(pdf|png|jpe?g|csv|xml|txt)$/i.test(file.name || '') ||
    /^(image\/(png|jpeg)|application\/pdf|text\/(plain|csv)|application\/xml)$/.test(
      file.type || '',
    )
  return ok
    ? ''
    : tr('Send a PDF, a JPG or PNG photo, or a CSV, XML or TXT file.')
}
/** Camera photos often arrive as "image.jpg"; give them a dated, useful name. */
export function uploadName(file, now = new Date()) {
  const name = String(file?.name || '').trim()
  if (name && !/^image\.(jpe?g|png)$/i.test(name)) return name.slice(0, 140)
  const ext = /png/i.test(file?.type || name) ? 'png' : 'jpg'
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return `foto-${stamp}.${ext}`
}
export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function formatBytes(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
export function formatDay(value, locale) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale || undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** «today», «yesterday», «3 days ago» or the date: how long a file has waited. */
export function ageLabel(value, locale, now = new Date()) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((day(now) - day(date)) / 86400000)
  if (days <= 0) return tr('today')
  if (days === 1) return tr('yesterday')
  if (days < 7) return tr('{0} days ago', [days])
  return formatDay(value, locale)
}

/** Where a linked record opens: party records in Contactos, the rest in Desk. */
export function recordHref(doctype, name) {
  const party = { Customer: 'customer', Supplier: 'supplier' }[doctype]
  if (party) return `/crm/contactos/${party}/${encodeURIComponent(name)}`
  const slug = String(doctype).toLowerCase().replace(/\s+/g, '-')
  return `/desk/${slug}/${encodeURIComponent(name)}`
}

/** Contador › Bancos receives the statement by its private id and returns here. */
export function bankHandoffUrl(doc, back) {
  const params = new URLSearchParams({
    tab: 'fuentes',
    empresa: doc.company,
    doc: doc.name,
    volver: back,
  })
  return `/contador/bancos?${params.toString()}`
}

export function archivosHref({ document, target, returnTo, returnLabel } = {}) {
  const params = new URLSearchParams()
  if (document) params.set('document', document)
  if (target) params.set('target', targetParam(target))
  const back = safeReturn(returnTo)
  if (back) {
    params.set('return_to', back)
    if (returnLabel)
      params.set('return_label', String(returnLabel).slice(0, 40))
  }
  const query = params.toString()
  return `/crm/archivos${query ? '?' + query : ''}`
}

// ----------------------------------------------------------------- browsing
// The file manager over `doco.docoutils.documents.browse`. Pure helpers only:
// the server owns every permission decision, the client only shapes and names.

export const BROWSE = 'doco.docoutils.documents.browse'
export const MANAGE = 'doco.docoutils.documents.manage'

export const BROWSE_KINDS = Object.freeze([
  'factura',
  'ticket',
  'estado_cuenta',
  'contrato',
  'foto',
  'otro',
])
const BROWSE_KIND_TITLES = {
  factura: 'Invoices',
  ticket: 'Receipts',
  estado_cuenta: 'Bank statements',
  contrato: 'Contracts',
  foto: 'Photos',
  otro: 'Other files',
}
export function browseKindLabel(kind) {
  return BROWSE_KIND_TITLES[kind]
    ? tr(BROWSE_KIND_TITLES[kind])
    : String(kind || '') || tr('Other files')
}
const BROWSE_KIND_ICONS = {
  factura: 'file-text',
  ticket: 'shopping-bag',
  estado_cuenta: 'credit-card',
  contrato: 'edit-3',
  foto: 'image',
  otro: 'file',
}
export function browseKindIcon(kind) {
  return BROWSE_KIND_ICONS[kind] || 'file'
}

export const BROWSE_CHANNELS = Object.freeze([
  'whatsapp',
  'telegram',
  'correo',
  'paperless',
  'sat',
  'subida',
])
const CHANNEL_TITLES = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  correo: 'Mail',
  paperless: 'Paperless',
  sat: 'SAT',
  subida: 'Uploaded here',
}
export function channelLabel(channel) {
  return CHANNEL_TITLES[channel]
    ? tr(CHANNEL_TITLES[channel])
    : String(channel || '')
}

export const SORTS = Object.freeze([
  { value: 'recent', label: 'Newest first' },
  { value: 'date', label: 'Document date' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
])
export function sortLabel(value) {
  const entry = SORTS.find((s) => s.value === value) || SORTS[0]
  return tr(entry.label)
}

/** The big icon a row or card shows when there is no thumbnail. */
export function previewIcon(preview, kind) {
  if (preview === 'image') return 'image'
  if (preview === 'pdf') return 'file-text'
  if (preview === 'xml') return 'code'
  if (preview === 'text') return 'file-text'
  return browseKindIcon(kind)
}

/** «octubre 2026» from the `YYYY-MM` keys of the month view. */
export function monthLabel(key, locale) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''))
  if (!match) return String(key || '')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  const text = new Intl.DateTimeFormat(locale || undefined, {
    month: 'long',
    year: 'numeric',
  }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A group row's own name, in the worker's words for the facet views. */
export function groupLabel(view, group, locale) {
  if (view === 'mes') return monthLabel(group?.key, locale)
  if (view === 'tipo') return browseKindLabel(group?.key)
  if (view === 'canal') return channelLabel(group?.key)
  if (view === 'registro' && !group?.name) return doctypeLabel(group?.key)
  return group?.label || group?.key || ''
}

/** Folder rows (flat, from the server) become the tree the navigation shows. */
export function folderTree(folders = []) {
  const byName = new Map()
  for (const folder of folders)
    if (folder?.name) byName.set(folder.name, { ...folder, children: [] })
  const roots = []
  const rooted = (node) => {
    const seen = new Set()
    let current = node
    for (let guard = 0; current && guard < 64; guard++) {
      if (seen.has(current.name)) return false
      seen.add(current.name)
      const parent = current.parent_folder
        ? byName.get(current.parent_folder)
        : null
      if (!parent) return true
      current = parent
    }
    return false
  }
  for (const node of byName.values()) {
    const parent = node.parent_folder ? byName.get(node.parent_folder) : null
    // A folder whose parent is hidden, missing or looping is shown at the root
    // instead of disappearing from the tree.
    if (parent && parent !== node && rooted(node)) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (list) => {
    list.sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || '')),
    )
    for (const node of list) sort(node.children)
    return list
  }
  return sort(roots)
}

/** The tree as rows to render: `expanded` null opens everything. */
export function flattenFolders(
  tree = [],
  expanded = null,
  depth = 0,
  out = [],
) {
  for (const node of tree) {
    out.push({ ...node, depth, hasChildren: node.children.length > 0 })
    const open = expanded === null || expanded.has?.(node.name)
    if (open) flattenFolders(node.children, expanded, depth + 1, out)
  }
  return out
}

/** Every folder from `name` up to its root, so a move never nests a folder in itself. */
export function folderLine(folders = [], name) {
  const byName = new Map(folders.map((f) => [f.name, f]))
  const line = []
  let current = name ? byName.get(name) : null
  for (let guard = 0; current && guard < 64; guard++) {
    line.unshift(current)
    current = current.parent_folder ? byName.get(current.parent_folder) : null
    if (current && line.some((f) => f.name === current.name)) break
  }
  return line
}

export const SORT_VALUES = Object.freeze(SORTS.map((s) => s.value))
/** The browse state the URL carries, sanitized; unknown values fall back. */
export function parseBrowseState(query = {}) {
  const text = (value, max) => {
    const raw = String(value ?? '')
    return raw && !unsafeChars(raw) && raw.length <= max ? raw : ''
  }
  const kind = BROWSE_KINDS.includes(query.kind) ? String(query.kind) : ''
  const channel = BROWSE_CHANNELS.includes(query.channel)
    ? String(query.channel)
    : ''
  const month = /^\d{4}-\d{2}$/.test(String(query.month || ''))
    ? String(query.month)
    : ''
  return {
    view: normalizeView(query.view),
    key: text(query.key, 300),
    file: text(query.file, 220),
    q: String(query.q ?? '').slice(0, 120),
    kind,
    channel,
    month,
    sort: SORT_VALUES.includes(query.sort) ? String(query.sort) : 'recent',
  }
}

/** The link «Copiar enlace» puts on the clipboard: this file, in this view. */
export function fileLink(id, { view, key, origin } = {}) {
  const params = new URLSearchParams()
  if (view && view !== 'recientes') params.set('view', view)
  if (key) params.set('key', key)
  params.set('file', String(id || ''))
  const base =
    origin ?? (typeof location !== 'undefined' ? location.origin : '')
  return `${base}/crm/archivos?${params.toString()}`
}

export function isDocumentItem(item) {
  return item?.source === 'document'
}
/** Only managed documents the worker may edit move, rename or go to the trash. */
export function canManageItem(item) {
  return isDocumentItem(item) && !!item?.can_edit
}

/** Where a file lives, in one phrase: its folder, its record or its party. */
export function whereLabel(item) {
  if (!item) return ''
  if (item.folder_title) return item.folder_title
  if (item.attached_to?.title || item.attached_to?.name)
    return item.attached_to.title || item.attached_to.name
  const link = item.links?.[0]
  if (link) return link.title || link.name
  if (item.counterparty) return item.counterparty
  return ''
}

/** Shift-click: every id between the anchor and the row just clicked. */
export function selectionRange(ids = [], anchor, target) {
  const to = ids.indexOf(target)
  if (to < 0) return []
  const from = ids.indexOf(anchor)
  if (from < 0) return [target]
  return from <= to ? ids.slice(from, to + 1) : ids.slice(to, from + 1)
}

/** Which separator a CSV really uses; exports from the bank vary. */
function csvDelimiter(text) {
  const line = String(text || '').split(/\r?\n/, 1)[0] || ''
  const counts = [',', ';', '\t', '|'].map((sep) => [
    sep,
    line.split(sep).length - 1,
  ])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}
/** A CSV preview: quoted fields honoured, capped at `maxRows` rows. */
export function parseCsv(text, maxRows = 200) {
  const source = String(text || '')
  if (!source) return []
  const sep = csvDelimiter(source)
  const rows = []
  let row = [],
    field = '',
    quoted = false
  const endRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < source.length && rows.length < maxRows; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch !== '"') field += ch
      else if (source[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n') endRow()
    else if (ch !== '\r') field += ch
  }
  if (rows.length < maxRows && (field || row.length)) endRow()
  return rows
}

/** XML read by a person: one tag per line, nesting indented. */
export function prettyXml(text, maxLines = 2000) {
  const flat = String(text || '')
    .replace(/>\s*</g, '><')
    .replace(/></g, '>\n<')
    .split('\n')
  const out = []
  let depth = 0
  for (const line of flat) {
    if (out.length >= maxLines) break
    const piece = line.trim()
    if (!piece) continue
    if (piece.startsWith('</')) depth = Math.max(0, depth - 1)
    out.push('  '.repeat(depth) + piece)
    if (
      /^<[^!?/]/.test(piece) &&
      !piece.endsWith('/>') &&
      !/^<[^>]+>.*<\/[^>]+>$/.test(piece)
    )
      depth++
  }
  return out.join('\n')
}

/** Plain-language state for a failed call: the guard when present, else a kind. */
export function problem(error) {
  const guard = errorGuard(error)
  if (guard) return { ...guard, actions: guard.actions || [] }
  const kind = errorKind(error)
  if (kind === 'session')
    return {
      code: 'session',
      message: tr('Your session ended. Sign in again to continue here.'),
      actions: [{ label: tr('Sign in'), kind: 'login' }],
    }
  if (kind === 'permission')
    return {
      code: 'permission',
      message:
        error?.messages?.[0] ||
        tr('You do not have permission for this. Ask your manager for access.'),
      actions: [
        { label: tr('Copy access request'), kind: 'copy' },
        { label: tr('Try again'), kind: 'retry' },
      ],
    }
  return {
    code: 'error',
    message:
      error?.messages?.[0] || tr('We could not finish. Try again in a moment.'),
    actions: [{ label: tr('Try again'), kind: 'retry' }],
  }
}
