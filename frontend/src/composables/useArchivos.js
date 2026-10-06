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

export const VIEWS = Object.freeze([
  { value: 'por_clasificar', label: 'To classify', icon: 'inbox' },
  { value: 'ayuda', label: 'Need help', icon: 'alert-triangle' },
  { value: 'archivo', label: 'Filed', icon: 'archive' },
])
export function viewLabel(value) {
  return tr((VIEWS.find((v) => v.value === value) || VIEWS[0]).label)
}
export function normalizeView(value) {
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
}
export function doctypeLabel(doctype) {
  return DOCTYPE_LABELS[doctype] ? tr(DOCTYPE_LABELS[doctype]) : doctype
}

const STATUS = {
  Review: ['To classify', 'orange'],
  Processing: ['Processing', 'blue'],
  Error: ['Needs help', 'red'],
  Linked: ['Linked', 'green'],
  Archived: ['Archived', 'gray'],
}
export function statusLabel(status) {
  return tr((STATUS[status] || STATUS.Review)[0])
}
export function statusTheme(status) {
  return (STATUS[status] || STATUS.Review)[1]
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
