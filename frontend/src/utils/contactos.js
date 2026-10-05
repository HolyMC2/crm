import { readListState, writeListState } from './listViewState.js'

export const SOURCE_TYPES = {
  contact: 'Contact',
  customer: 'Customer',
  supplier: 'Supplier',
  organization: 'CRM Organization',
  lead: 'Lead',
  'crm-lead': 'CRM Lead',
  address: 'Address',
}
export function sourceSlug(source) {
  if (source === 'crm_lead') return 'crm-lead'
  return (
    Object.keys(SOURCE_TYPES).find((key) => SOURCE_TYPES[key] === source) ||
    source ||
    'contact'
  )
}
export function sourceRef(value) {
  return {
    source: sourceSlug(value?.source || value?.doctype),
    name: value?.name || '',
  }
}
export function contactoRoute(value) {
  const ref = sourceRef(value)
  return { name: 'Contacto', params: { source: ref.source, name: ref.name } }
}
export function contactScope(
  boot = typeof window !== 'undefined' ? window : {},
) {
  let cookieUser = ''
  try {
    cookieUser = decodeURIComponent(
      (boot.document?.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('user_id='))
        ?.slice(8) || '',
    )
  } catch {
    /* invalid cookie */
  }
  // `window.user` can be a DOM element (any element with id="user", such as the
  // lucide sprite's symbol), which would give every login the same scope.
  const text = (value) => (typeof value === 'string' && value ? value : '')
  return [
    text(boot.site_name) || boot.location?.host || '',
    text(boot.user) ||
      text(boot.frappe?.session?.user) ||
      cookieUser ||
      'Guest',
  ].join(':')
}
export function contactStorage() {
  try {
    return globalThis.window?.sessionStorage || null
  } catch {
    return null
  }
}
export function scopedKey(scope, key) {
  return `contactos:${scope}:${key}`
}
export function purgeContactosState(storage, scope = null) {
  try {
    const prefix = scope ? `contactos:${scope}:` : 'contactos:'
    for (const key of Object.keys(storage || {}))
      if (key.startsWith(prefix)) storage.removeItem(key)
  } catch {
    /* unavailable private storage */
  }
}
export function enterContactScope(storage, scope) {
  try {
    const previous = storage.getItem('contactos:active-scope')
    if (previous && previous !== scope) purgeContactosState(storage)
    storage.setItem('contactos:active-scope', scope)
  } catch {
    /* session storage is optional */
  }
}
export function loadContactState(storage, scope, key) {
  return readListState(storage, scopedKey(scope, key))
}
export function saveContactState(storage, scope, key, value) {
  return writeListState(storage, scopedKey(scope, key), {
    ...value,
    savedAt: Date.now(),
  })
}
export function requestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `contactos-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
export function stableRequest(previous, payload) {
  const signature = JSON.stringify(payload)
  return previous?.signature === signature
    ? previous
    : { signature, id: requestId() }
}
// A segment owns its complete query scope. Keep every facet, including native
// clauses that have no dedicated control, and split only the visible search.
export function segmentScope(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(
      'Este segmento necesita revisión. Sus filtros no son válidos.',
    )
  const { q = '', ...filters } = value
  if (typeof q !== 'string')
    throw new Error(
      'Este segmento necesita revisión. Su búsqueda no es válida.',
    )
  return { q, filters: JSON.parse(JSON.stringify(filters)) }
}
export function saveSegmentScope(q, filters) {
  const scope = segmentScope({ ...filters, q })
  return { ...scope.filters, q: scope.q }
}
export function dueLabel(task, today = new Date().toLocaleDateString('en-CA')) {
  if (['Cancelled', 'Canceled'].includes(task.source_status || task.status))
    return 'Cancelado'
  if (task.status === 'Closed' || task.status === 'Completed') return 'Hecho'
  if (task.status !== 'Open') return 'Estado no disponible'
  const date = String(task.date || task.due_date || '').slice(0, 10)
  if (!date) return 'Sin fecha'
  if (date < today) return 'Vencido'
  if (date === today) return 'Hoy'
  return 'Próximo'
}
// Dates follow the user's Frappe language (boot `lang`) and time zones (boot
// `timezone`), never a fixed locale.
function userLocale(lang = globalThis.window?.lang) {
  try {
    return Intl.getCanonicalLocales(lang || globalThis.navigator?.language)[0]
  } catch {
    return undefined
  }
}
function zoneOffset(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
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
}
/** A date-only value («2026-10-05») as «lun, 5 oct»; the year shows only when it differs. */
export function formatDay(value, { lang, now = new Date() } = {}) {
  const day = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value ? String(value) : ''
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(userLocale(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(year !== now.getUTCFullYear() ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)))
}
/** A server timestamp (naive, in the system time zone) as «hace 2 horas» or «5 oct, 1:22 p.m.». */
export function formatMoment(value, { lang, timezone, now = Date.now() } = {}) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  )
  if (!match) return value ? String(value) : ''
  const zones = timezone || globalThis.window?.timezone || {}
  const [, y, mo, d, h, mi, s] = match.map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  let instant = naive
  try {
    if (zones.system) instant = naive - zoneOffset(naive, zones.system)
  } catch {
    instant = naive
  }
  const locale = userLocale(lang)
  const minutes = Math.round((instant - now) / 60000)
  if (minutes <= 0 && minutes > -60 * 24) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    return minutes > -60
      ? relative.format(minutes, 'minute')
      : relative.format(Math.round(minutes / 60), 'hour')
  }
  const options = {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: zones.user || zones.system || undefined,
    }).format(new Date(instant))
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(new Date(instant))
  }
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Native version of a record DTO for `doctype:name`. */
export function versionOf(record, doctype, name) {
  return (
    record?.modified ||
    record?.versions?.[
      `${doctype || record?.doctype}:${name || record?.name}`
    ] ||
    null
  )
}
/** Fields the worker changed relative to the version the draft started from. */
export function draftChanges(fields = {}, base = {}) {
  return Object.keys(fields).filter((key) => !same(fields[key], base[key]))
}
/**
 * Three-way view of a stale draft: what I changed, what someone else changed
 * since my base, which fields both touched differently, and my changes
 * reapplied onto the latest version. Nothing is resolved silently.
 */
export function mergeConflict(base = {}, mine = {}, latest = {}) {
  const changed = draftChanges(mine, base)
  const theirs = Object.keys(latest).filter(
    (key) => !same(latest[key], base[key]),
  )
  const rows = [...new Set([...changed, ...theirs])].map((field) => ({
    field,
    base: base[field],
    mine: changed.includes(field) ? mine[field] : base[field],
    theirs: latest[field],
    mineChanged: changed.includes(field),
    theirsChanged: theirs.includes(field),
    overlap:
      changed.includes(field) &&
      theirs.includes(field) &&
      !same(mine[field], latest[field]),
  }))
  const rebased = { ...latest }
  for (const field of changed) rebased[field] = mine[field]
  return { rows, rebased, overlap: rows.some((row) => row.overlap) }
}
/** A follow-up page replaces the list unless the worker asked for more. */
export function mergeTaskPage(previous = [], rows = [], more = false) {
  return more === true ? [...previous, ...rows] : [...rows]
}
export function nextFollowup(tasks = []) {
  return (
    tasks
      .filter(
        (task) =>
          task.status === 'Open' &&
          !['Cancelled', 'Canceled'].includes(task.source_status),
      )
      .sort((a, b) =>
        String(a.date || a.due_date || '9999').localeCompare(
          String(b.date || b.due_date || '9999'),
        ),
      )[0] || null
  )
}
export function identityTypeLabel(row) {
  return row.source === 'address'
    ? 'Dirección'
    : row.kind === 'company'
      ? 'Empresa'
      : row.kind === 'person'
        ? 'Persona'
        : 'Registro'
}
export function sourceLabel(value) {
  const slug = sourceSlug(value)
  return (
    {
      contact: 'Persona',
      customer: 'Cliente',
      supplier: 'Proveedor',
      organization: 'Empresa',
      lead: 'Prospecto',
      'crm-lead': 'Prospecto',
      address: 'Dirección',
      'CRM Deal': 'Oportunidad',
    }[slug] || 'Registro'
  )
}
// Native Select values stay the submitted value; only the label is localized.
// Frappe's boot catalog wins; the es fallback covers values core leaves
// untranslated for an es-MX worker.
const ES_OPTION_LABELS = {
  Company: 'Empresa',
  Individual: 'Persona',
  Partnership: 'Sociedad',
  Proprietorship: 'Persona física con actividad',
  Billing: 'Facturación',
  Shipping: 'Envío',
  Office: 'Oficina',
  Personal: 'Personal',
  Plant: 'Planta',
  Postal: 'Postal',
  Shop: 'Tienda',
  Subsidiary: 'Sucursal',
  Warehouse: 'Almacén',
  Current: 'Actual',
  Permanent: 'Permanente',
  Other: 'Otro',
  Male: 'Hombre',
  Female: 'Mujer',
  Passive: 'Pasivo',
  Open: 'Abierto',
  Closed: 'Hecho',
  Cancelled: 'Cancelado',
  Replied: 'Respondido',
  Mr: 'Sr.',
  Ms: 'Srta.',
  Mrs: 'Sra.',
  Dr: 'Dr.',
  Prof: 'Prof.',
}
export function optionLabel(value, lang = globalThis.window?.lang) {
  const text = String(value ?? '')
  if (!text) return text
  const translated = globalThis.window?.__?.(text)
  if (translated && translated !== text) return translated
  if (/^es\b/i.test(lang || '')) return ES_OPTION_LABELS[text] || text
  return text
}
export function fieldOptions(field, lang) {
  if (Array.isArray(field.options)) return field.options
  return String(field.options || '')
    .split('\n')
    .filter(Boolean)
    .map((value) => ({ label: optionLabel(value, lang), value }))
}
export function writableFields(fields, meta = [], original = null) {
  const result = {}
  for (const field of meta) {
    if (
      field.read_only ||
      field.fieldname === 'links' ||
      !(field.fieldname in fields)
    )
      continue
    const value = fields[field.fieldname]
    if (
      original &&
      JSON.stringify(value) === JSON.stringify(original[field.fieldname])
    )
      continue
    result[field.fieldname] = value
  }
  return result
}
export function legacyFilters(value, source) {
  let parsed = value
  try {
    if (typeof value === 'string') parsed = JSON.parse(value)
  } catch {
    return { unsupported: true, filters: {} }
  }
  if (!parsed || typeof parsed !== 'object')
    return { unsupported: true, filters: {} }
  const result = { source: sourceSlug(source) }
  const conditions = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed).map(([key, v]) => [key, '=', v])
  for (const condition of conditions) {
    if (!Array.isArray(condition)) return { unsupported: true, filters: {} }
    const [key, operator, argument] =
      condition.length === 4 ? condition.slice(1) : condition
    if (operator !== '=') return { unsupported: true, filters: {} }
    if (key === 'customer_type' || key === 'supplier_type')
      result.kind =
        argument === 'Company'
          ? 'company'
          : argument === 'Individual'
            ? 'person'
            : null
    else if (key === '_user_tags') result.tags = argument
    else if (key === 'disabled' && [1, true, '1'].includes(argument))
      result.disabled = true
    else return { unsupported: true, filters: {} }
    if (result.kind === null) return { unsupported: true, filters: {} }
  }
  return { unsupported: false, filters: result }
}
const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isGuard = (value) =>
  isRecord(value) &&
  typeof value.code === 'string' &&
  typeof value.message === 'string' &&
  Array.isArray(value.actions)
/**
 * The server's GuardDTO {code, message, actions, retry_context}
 * (@muelle/shell-contracts) inside a thrown call error, or null. Same places
 * as the contract's findGuard: the error itself, guard/exc_guard/data/message
 * keys, its response, or a JSON entry of its messages/_server_messages.
 */
export function errorGuard(error, depth = 0) {
  if (depth > 3) return null
  if (isGuard(error)) return error
  if (!isRecord(error) && !(error instanceof Error)) return null
  for (const key of ['guard', 'exc_guard', 'data', 'message', 'response']) {
    const found = isRecord(error[key])
      ? errorGuard(error[key], depth + 1)
      : null
    if (found) return found
  }
  const entries = Array.isArray(error.messages) ? [...error.messages] : []
  if (typeof error._server_messages === 'string') {
    try {
      entries.push(...JSON.parse(error._server_messages))
    } catch {
      /* not JSON */
    }
  }
  for (const entry of entries) {
    try {
      const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry
      const found = isRecord(parsed) ? errorGuard(parsed, depth + 1) : null
      if (found) return found
    } catch {
      /* plain message */
    }
  }
  return null
}
// baseline_required / channel_set_required: the save lacked the original
// values it was based on, so it is resolved exactly like a version conflict.
const CONFLICT_CODES = new Set([
  'conflict',
  'version_conflict',
  'timestamp_mismatch',
  'baseline_required',
  'channel_set_required',
])
/**
 * The error a failed Frappe call throws, shaped like frappe-ui's CallError
 * (exc_type, status, messages) plus the response's top-level `guard`, which
 * frappe-ui's call drops.
 */
export function callError(method, status, data = {}) {
  let messages
  try {
    messages = data._server_messages ? JSON.parse(data._server_messages) : []
  } catch {
    messages = []
  }
  if (typeof data.message === 'string') messages = messages.concat(data.message)
  messages = messages
    .map((entry) => {
      try {
        return JSON.parse(entry).message
      } catch {
        return entry
      }
    })
    .filter(Boolean)
  if (!messages.length)
    messages = [data._error_message || 'No pudimos completar la acción.']
  const error = new Error(
    [method, data.exc_type, data._error_message].filter(Boolean).join(' '),
  )
  error.exc_type = data.exc_type
  error.status = status
  error.messages = messages
  if (isGuard(data.guard)) error.guard = data.guard
  return error
}
/** Recovery kind from stable signals only: guard code, exception type, HTTP status. */
export function errorKind(error) {
  const code = String(errorGuard(error)?.code || '').toLowerCase()
  const exc = String(error?.exc_type || '')
  const status = Number(error?.status || error?.httpStatus || 0)
  if (
    CONFLICT_CODES.has(code) ||
    exc === 'TimestampMismatchError' ||
    status === 409
  )
    return 'conflict'
  if (code === 'permission' || exc === 'PermissionError' || status === 403)
    return 'permission'
  if (
    code === 'session' ||
    ['AuthenticationError', 'SessionExpired', 'CSRFTokenError'].includes(exc) ||
    status === 401
  )
    return 'session'
  if (code === 'network') return 'network'
  return null
}
export function recovery(error) {
  const guard = errorGuard(error)
  const detail = String(
    guard?.message ||
      error?.messages?.join?.(' ') ||
      error?.message ||
      error ||
      '',
  )
    .replace(/<[^>]*>/g, ' ')
    .trim()
  const kind = errorKind(error)
  if (kind === 'conflict')
    return {
      kind: 'conflict',
      title: 'Alguien cambió estos datos.',
      detail:
        'Tu borrador sigue aquí. Compara con la versión actual y elige si reaplicas tus cambios o recargas.',
    }
  if (
    kind === 'permission' ||
    (!kind && /Permission|permis|not permitted|403/i.test(detail))
  )
    return {
      kind: 'permission',
      title: 'No tienes permiso para esta acción.',
      detail: `${detail} Pide acceso al responsable de tu tienda y reintenta permisos. Tu borrador sigue aquí.`,
    }
  if (kind === 'session' || (!kind && /401|session|login|sesión/i.test(detail)))
    return {
      kind: 'session',
      title: 'Tu sesión terminó.',
      detail:
        'Inicia sesión y reintenta. Conservamos el borrador en esta sesión.',
    }
  if (
    kind === 'network' ||
    /fetch|network|offline|connection/i.test(detail) ||
    globalThis.navigator?.onLine === false
  )
    return {
      kind: 'network',
      title: 'Sin conexión. El borrador está pendiente de guardar.',
      detail:
        'Cuando vuelva la conexión, reintenta para revisar permisos y versiones.',
    }
  return {
    kind: 'validation',
    title: 'No pudimos guardar estos datos.',
    detail: detail || 'Revisa los campos obligatorios y vuelve a intentar.',
  }
}

/**
 * Delete Contact360 payloads an older build persisted in frappe-ui's
 * IndexedDB resource cache (keys like '["contact360-documents","…"]'): they
 * were keyed by Contact only and could render for another account or user.
 */
export async function purgeContact360Cache(store) {
  try {
    const idb = store || (await import('idb-keyval'))
    const all = await idb.keys()
    const stale = all.filter(
      (key) =>
        typeof key === 'string' && /^\["(?:muelle-)?contact360-/.test(key),
    )
    if (stale.length) await idb.delMany(stale)
    return stale.length
  } catch {
    return 0
  }
}

/**
 * Money for provider summaries: an unknown (null/protected) amount is «—»,
 * never $0.00; an amount without an authorized currency shows no code.
 */
export function formatMoney(value, currency, lang) {
  if (value === null || value === undefined || value === '') return '—'
  const locale = userLocale(lang)
  if (!currency)
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(
      Number(value),
    )
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number(value),
  )
}

/** A read failed because access is gone (unavailable section or permission). */
export function accessLost(error) {
  return error?.unavailable === true || errorKind(error) === 'permission'
}
