// What a worker reads instead of what the database stores (Shell program SPEC
// §2.2 pattern 7). One module for: display names instead of IDs, es-MX dates
// (relative when close), units (never «Nos»), money, and es-MX status labels.
//
// The words here are es-MX literals on purpose: they are display vocabulary,
// not UI sentences, and bare English msgids collide across apps in the
// translation catalog («Lines» → «Pagos del depósito»). Pure functions; every
// one takes `now` / `locale` so tests pin the output.

const LOCALE = 'es-MX'

// ── names, never IDs ──────────────────────────────────────────────────────

// Naming-series IDs (PUR-ORD-2026-00025, ACC-PINV-2025-00016, CRM-DEAL-2025-00086,
// MAT-MR-2026-00005, RO-00157, MKCAMP-000003, SINV-1), UUIDs, long hex hashes
// and Frappe hash names (10 lower-case alphanumerics with a digit).
const SERIES_ID =
  /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-(?:\.?\d{2,4}-)?\d+(?:-\d+)?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^[0-9a-f]{16,}$/i
const FRAPPE_HASH = /^(?=.*\d)[a-z0-9]{10}$/

/** True when a value is a document ID a worker should not read as a title. */
export function looksLikeId(value) {
  const text = String(value ?? '').trim()
  if (!text) return false
  return (
    SERIES_ID.test(text) ||
    UUID.test(text) ||
    HEX.test(text) ||
    FRAPPE_HASH.test(text)
  )
}

// The fields that name a record, best first. Doctype-specific ones come first.
const NAME_FIELDS = {
  'CRM Deal': ['deal_name', 'organization', 'lead_name', 'contact_name'],
  'CRM Lead': ['lead_name', 'first_name', 'organization'],
  Contact: ['full_name', 'first_name'],
  Customer: ['customer_name'],
  Supplier: ['supplier_name'],
  Item: ['item_name'],
  'Purchase Order': ['supplier_name', 'supplier', 'title'],
  'Purchase Invoice': ['supplier_name', 'supplier', 'title'],
  'Sales Invoice': ['customer_name', 'customer', 'title'],
  'Sales Order': ['customer_name', 'customer', 'title'],
  'Material Request': ['title'],
  Employee: ['employee_name'],
  'Warranty Claim': ['customer_name', 'item_name', 'subject'],
  'Repair Order': ['customer_name', 'device', 'title'],
  ToDo: ['description'],
  'CRM Task': ['title'],
  User: ['full_name'],
}
const GENERIC_FIELDS = [
  'title',
  'full_name',
  'customer_name',
  'supplier_name',
  'employee_name',
  'item_name',
  'lead_name',
  'deal_name',
  'organization',
  'subject',
  'label',
]

function clean(value) {
  // Server text may carry HTML (ToDo descriptions) or stray whitespace.
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The name a worker reads for a record: its own name field, never its ID.
 * `doc` is the record (or a list row); `fallback` is used when nothing names it
 * (default: the kind word, «Trato», «Orden de compra», or «Sin nombre»).
 */
export function displayName(doc, doctype = doc?.doctype, { fallback } = {}) {
  if (doc == null) return fallback ?? ''
  if (typeof doc !== 'object') {
    const text = clean(doc)
    return text && !looksLikeId(text) ? text : fallback ?? kindLabel(doctype)
  }
  const fields = [...(NAME_FIELDS[doctype] || []), ...GENERIC_FIELDS]
  for (const field of fields) {
    const text = clean(doc[field])
    if (text && !looksLikeId(text) && !isEmail(text)) return text
  }
  const name = clean(doc.name)
  if (name && !looksLikeId(name) && !isEmail(name)) return name
  return fallback ?? (kindLabel(doctype) || 'Sin nombre')
}

function isEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

/**
 * A person, never an email: «Karla M.» from a user record or a name/email map.
 * `people` maps an email or user id to a full name (e.g. from the boot or a
 * users store). Unknown emails read as their local part, capitalised words.
 */
export function personName(value, people = {}) {
  const key = clean(value)
  if (!key) return ''
  const known = people[key] || people[key.toLowerCase()]
  if (known) return clean(typeof known === 'object' ? known.full_name : known)
  if (key === 'Administrator') return 'Administrador'
  if (!isEmail(key)) return key
  return key
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.replace(/\d+$/, ''))
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

// The kind word of each doctype a worker meets (MOBILE_REFERENCES pattern 6:
// every linked record says what it is).
const KINDS = {
  'CRM Deal': 'Trato',
  'CRM Lead': 'Prospecto',
  'CRM Task': 'Tarea',
  'CRM Note': 'Nota',
  'CRM Call Log': 'Llamada',
  Contact: 'Contacto',
  Customer: 'Cliente',
  Supplier: 'Proveedor',
  Item: 'Producto',
  'Purchase Order': 'Orden de compra',
  'Purchase Invoice': 'Factura de proveedor',
  'Purchase Receipt': 'Recepción de compra',
  'Sales Invoice': 'Factura',
  'Sales Order': 'Pedido',
  Quotation: 'Cotización',
  'Material Request': 'Solicitud de material',
  'Payment Entry': 'Pago',
  'Stock Entry': 'Movimiento de inventario',
  'Warranty Claim': 'Garantía',
  'Repair Order': 'Reparación',
  Employee: 'Persona del equipo',
  'Leave Application': 'Vacaciones',
  ToDo: 'Pendiente',
  Event: 'Cita',
  User: 'Usuario',
  File: 'Archivo',
}

/** «Trato», «Orden de compra»… for a doctype; '' when it has no worker name. */
export function kindLabel(doctype) {
  return KINDS[doctype] || ''
}

// ── dates (es-MX, relative when close) ───────────────────────────────────

const DAY = 86400000

/**
 * A server value as a Date. «2026-10-17» is a local calendar day (never UTC
 * midnight, which shows the day before in México). «2026-10-17 12:11:24.941958»
 * is a naive server time; it is read as local time unless `timeZone` (IANA,
 * the site's system zone) is given.
 */
export function parseServerDate(value, { timeZone } = {}) {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return new Date(value)
  const text = String(value).trim()
  const day = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  const stamp = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  )
  if (!stamp) {
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const [, y, mo, d, h, mi, s, zone] = stamp
  if (zone) return new Date(text.replace(' ', 'T'))
  const parts = [y, mo - 1, d, h, mi, s || 0].map(Number)
  if (!timeZone) return new Date(...parts)
  const naive = Date.UTC(...parts)
  return new Date(naive - zoneOffset(naive, timeZone))
}

function zoneOffset(instant, timeZone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, Number(part.value)]),
    )
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    return asUtc - (instant - (instant % 1000))
  } catch {
    return 0
  }
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Whole calendar days from `now` to `date` (negative: in the past). */
export function dayDiff(date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY)
}

/**
 * A calendar day: «hoy», «ayer», «mañana», «17 oct», «17 oct 2025».
 * `weekday: true` adds the day name: «vie 17 oct».
 */
export function formatDate(
  value,
  { now = new Date(), weekday = false, relative = true, timeZone } = {},
) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  if (relative) {
    const diff = dayDiff(date, now)
    if (diff === 0) return 'hoy'
    if (diff === -1) return 'ayer'
    if (diff === 1) return 'mañana'
  }
  const text = new Intl.DateTimeFormat(LOCALE, {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date)
  // es-MX writes «17 oct 2025» as «17 oct 2025» in some engines and
  // «17 de oct de 2025» in others; the short form drops the «de» and dots.
  return text
    .replace(/\s+de\s+/g, ' ')
    .replace(/\./g, '')
    .replace(',', '')
}

/** A time of day: «12:11» (24 h, as the shell's Agenda does). */
export function formatTime(value, { timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/** A moment: «hoy 12:11», «ayer 18:02», «17 oct 09:30». Never ISO, never seconds. */
export function formatDateTime(value, { now = new Date(), timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  return `${formatDate(date, { now })} ${formatTime(date)}`
}

/**
 * How long ago (or until): «ahora», «hace 5 min», «hace 3 h», «ayer»,
 * «hace 4 días», then the date. Future: «en 10 min», «mañana», «en 3 días».
 */
export function relativeTime(value, { now = new Date(), timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  const minutes = Math.round((date - now) / 60000)
  const ahead = minutes > 0
  const abs = Math.abs(minutes)
  if (abs < 1) return 'ahora'
  if (abs < 60) return ahead ? `en ${abs} min` : `hace ${abs} min`
  const days = dayDiff(date, now)
  if (days === 0) {
    const hours = Math.round(abs / 60)
    return ahead ? `en ${hours} h` : `hace ${hours} h`
  }
  if (days === -1) return 'ayer'
  if (days === 1) return 'mañana'
  if (Math.abs(days) < 7)
    return days > 0 ? `en ${days} días` : `hace ${-days} días`
  return formatDate(date, { now, relative: false })
}

/**
 * A due date as the worker reads it, plus whether it is overdue (a mark on the
 * item, never a red row: MOBILE_REFERENCES pattern 11).
 * → { label: 'Vence hoy' | 'Venció ayer' | 'Venció hace 3 días' | 'Vence mañana' | 'Vence 24 oct', overdue, today }
 */
export function formatDue(value, { now = new Date(), timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return { label: '', overdue: false, today: false }
  const days = dayDiff(date, now)
  if (days === 0) return { label: 'Vence hoy', overdue: false, today: true }
  if (days === -1) return { label: 'Venció ayer', overdue: true, today: false }
  if (days < 0)
    return {
      label: `Venció hace ${-days} días`,
      overdue: true,
      today: false,
    }
  if (days === 1) return { label: 'Vence mañana', overdue: false, today: false }
  return {
    label: `Vence ${formatDate(date, { now, relative: false })}`,
    overdue: false,
    today: false,
  }
}

// ── units ────────────────────────────────────────────────────────────────

// ERPNext's default UOMs as a shop says them. «Nos» (numbers) is never shown.
const UNITS = {
  nos: ['pza', 'pzas'],
  unit: ['pza', 'pzas'],
  unidad: ['pza', 'pzas'],
  each: ['pza', 'pzas'],
  ea: ['pza', 'pzas'],
  pcs: ['pza', 'pzas'],
  pc: ['pza', 'pzas'],
  piece: ['pza', 'pzas'],
  pieza: ['pza', 'pzas'],
  pza: ['pza', 'pzas'],
  box: ['caja', 'cajas'],
  caja: ['caja', 'cajas'],
  pair: ['par', 'pares'],
  set: ['juego', 'juegos'],
  kg: ['kg', 'kg'],
  kilogram: ['kg', 'kg'],
  gram: ['g', 'g'],
  g: ['g', 'g'],
  litre: ['l', 'l'],
  liter: ['l', 'l'],
  l: ['l', 'l'],
  meter: ['m', 'm'],
  metre: ['m', 'm'],
  m: ['m', 'm'],
  hour: ['h', 'h'],
  hora: ['h', 'h'],
  day: ['día', 'días'],
  service: ['servicio', 'servicios'],
}

/** «pza» for Nos/Unit; plural when `qty` ≠ 1. Unknown units pass through. */
export function unitLabel(uom, qty = 1) {
  const key = clean(uom).toLowerCase()
  if (!key) return ''
  const unit = UNITS[key]
  if (!unit) return clean(uom)
  return Number(qty) === 1 ? unit[0] : unit[1]
}

/** «3 pzas», «1.5 kg». */
export function formatQty(qty, uom) {
  const n = Number(qty)
  if (!Number.isFinite(n)) return ''
  const amount = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 3,
  }).format(n)
  const unit = unitLabel(uom, n)
  return unit ? `${amount} ${unit}` : amount
}

// ── money ────────────────────────────────────────────────────────────────

/**
 * «$1,400.00» for pesos; another currency keeps its code: «USD 12.00».
 * `decimals: 0` for whole-peso prices. Unknown amount → «—», never «$0.00».
 */
export function formatMoney(value, currency = 'MXN', { decimals = 2 } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const code = currency || 'MXN'
  const number = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n))
  const sign = n < 0 ? '-' : ''
  return code === 'MXN' ? `${sign}$${number}` : `${sign}${code} ${number}`
}

/** «$1.5 mil», «$2.3 M»: for KPI tiles where space is short. */
export function formatMoneyCompact(value, currency = 'MXN') {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs < 10000) return formatMoney(n, currency, { decimals: 0 })
  const [div, word] = abs >= 1e6 ? [1e6, 'M'] : [1e3, 'mil']
  const number = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
  }).format(abs / div)
  const prefix =
    (n < 0 ? '-' : '') +
    (currency === 'MXN' || !currency ? '$' : `${currency} `)
  return `${prefix}${number} ${word}`
}

// ── status labels ────────────────────────────────────────────────────────

// tone: what the chip colour says. 'neutral' is the default; colour only when
// the worker must act (red: overdue/owed/failed, amber: waiting, green: done).
const STATUS = {
  draft: ['Borrador', 'neutral'],
  submitted: ['Registrada', 'neutral'],
  cancelled: ['Cancelada', 'neutral'],
  canceled: ['Cancelada', 'neutral'],
  open: ['Abierta', 'neutral'],
  closed: ['Cerrada', 'neutral'],
  completed: ['Completada', 'success'],
  complete: ['Completada', 'success'],
  done: ['Hecha', 'success'],
  pending: ['Pendiente', 'warning'],
  'in progress': ['En curso', 'info'],
  working: ['En curso', 'info'],
  'on hold': ['En pausa', 'warning'],
  hold: ['En pausa', 'warning'],
  paused: ['En pausa', 'warning'],
  stopped: ['Detenida', 'neutral'],
  overdue: ['Vencida', 'danger'],
  unpaid: ['Por pagar', 'warning'],
  'partly paid': ['Pago parcial', 'warning'],
  'partially paid': ['Pago parcial', 'warning'],
  paid: ['Pagada', 'success'],
  return: ['Devolución', 'neutral'],
  'credit note issued': ['Con nota de crédito', 'neutral'],
  'debit note issued': ['Con nota de débito', 'neutral'],
  'to bill': ['Por facturar', 'warning'],
  'to receive': ['Por recibir', 'warning'],
  'to receive and bill': ['Por recibir y facturar', 'warning'],
  'to deliver': ['Por entregar', 'warning'],
  'to deliver and bill': ['Por entregar y facturar', 'warning'],
  'partially received': ['Recibida en parte', 'warning'],
  received: ['Recibida', 'success'],
  delivered: ['Entregada', 'success'],
  ordered: ['Pedida', 'info'],
  'partially ordered': ['Pedida en parte', 'info'],
  issued: ['Emitida', 'neutral'],
  transferred: ['Transferida', 'success'],
  approved: ['Aprobada', 'success'],
  rejected: ['Rechazada', 'danger'],
  replied: ['Respondida', 'neutral'],
  active: ['Activa', 'success'],
  inactive: ['Inactiva', 'neutral'],
  disabled: ['Desactivada', 'neutral'],
  enabled: ['Activada', 'success'],
  expired: ['Vencida', 'danger'],
  failed: ['Falló', 'danger'],
  error: ['Error', 'danger'],
  success: ['Lista', 'success'],
  'partial success': ['Lista en parte', 'warning'],
  queued: ['En espera', 'neutral'],
  scheduled: ['Programada', 'info'],
  sent: ['Enviada', 'success'],
  'not sent': ['Sin enviar', 'warning'],
  won: ['Ganado', 'success'],
  lost: ['Perdido', 'neutral'],
  new: ['Nuevo', 'info'],
  qualified: ['Calificado', 'info'],
  unqualified: ['No calificado', 'neutral'],
  junk: ['Descartado', 'neutral'],
  contacted: ['Contactado', 'info'],
  nurture: ['En seguimiento', 'info'],
  negotiation: ['Negociación', 'info'],
  'proposal/quotation': ['Cotización', 'info'],
  backlog: ['Por hacer', 'neutral'],
  todo: ['Por hacer', 'neutral'],
  urgent: ['Urgente', 'danger'],
  high: ['Alta', 'warning'],
  medium: ['Media', 'neutral'],
  low: ['Baja', 'neutral'],
}

// The same English word reads differently by what it describes.
const STATUS_IN = {
  call: {
    completed: ['Contestada', 'success'],
    'no answer': ['Sin respuesta', 'warning'],
    busy: ['Ocupado', 'warning'],
    canceled: ['Cancelada', 'neutral'],
    failed: ['Falló', 'danger'],
    ringing: ['Sonando', 'info'],
    'in progress': ['En curso', 'info'],
    initiated: ['Marcando', 'info'],
    queued: ['En espera', 'neutral'],
  },
  campaign: {
    completed: ['Terminada', 'neutral'],
    running: ['En curso', 'info'],
  },
  task: {
    completed: ['Hecha', 'success'],
    open: ['Pendiente', 'neutral'],
  },
}

function statusEntry(status, kind) {
  const key = clean(status).toLowerCase()
  if (!key) return null
  return STATUS_IN[kind]?.[key] || STATUS[key] || null
}

/**
 * The es-MX word for a stored status: «Completed» → «Completada»,
 * statusLabel('No Answer', 'call') → «Sin respuesta». Unknown values pass
 * through unchanged (already Spanish, or a custom status).
 */
export function statusLabel(status, kind) {
  const entry = statusEntry(status, kind)
  return entry ? entry[0] : clean(status)
}

/** 'neutral' | 'info' | 'success' | 'warning' | 'danger' for a status. */
export function statusTone(status, kind) {
  return statusEntry(status, kind)?.[1] || 'neutral'
}

// ── initials (avatars) ───────────────────────────────────────────────────

/** «KM» for «Karla Martínez», «A» for «Aarón». */
export function initials(name) {
  const words = clean(name)
    .split(' ')
    .filter((word) => /\p{L}|\d/u.test(word[0] || ''))
  if (!words.length) return ''
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
