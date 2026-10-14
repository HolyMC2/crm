import { callError, errorKind, requestId } from '@/utils/contactos'
import { sourceSlugs } from '@/utils/shellRoutes'
export { legacyTasksRoute } from '@/composables/usePendientesRoutes'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

export const GROUPS = Object.freeze(['overdue', 'today', 'upcoming', 'undated'])
// «Por aprobar» and «Esperando respuesta»: decisions owned by other modules,
// listed here and decided on their owner's screen (useAprobaciones).
export const APPROVAL_SEGMENTS = Object.freeze(['approve', 'waiting'])
export const SEGMENTS = Object.freeze([
  'mine',
  ...APPROVAL_SEGMENTS,
  'overdue',
  'today',
  'upcoming',
  'undated',
  'team',
  'done',
])
export const SOURCE_SLUGS = Object.freeze({
  ToDo: 'todo',
  'CRM Task': 'crm-task',
})

export function segmentLabel(segment) {
  return {
    mine: t('My pendientes'),
    approve: t('To approve'),
    waiting: t('Waiting for an answer'),
    overdue: t('Overdue'),
    today: t('Today'),
    upcoming: t('Upcoming'),
    undated: t('No date'),
    team: t('Sales team'),
    done: t('Completed work'),
  }[segment]
}

/** The lists this worker has: «Por aprobar» only for possible deciders (server capability). */
export function segmentEntries({
  team = false,
  approve = false,
  waiting = false,
} = {}) {
  const icons = {
    mine: 'check-square',
    approve: 'check-circle',
    waiting: 'clock',
    overdue: 'alert-circle',
    today: 'sun',
    upcoming: 'calendar',
    undated: 'inbox',
    team: 'users',
    done: 'check',
  }
  const shown = { team, approve, waiting }
  return SEGMENTS.filter((segment) => shown[segment] ?? true).map(
    (segment) => ({
      value: segment,
      label: segmentLabel(segment),
      icon: icons[segment],
    }),
  )
}

export function isApprovalSegment(segment) {
  return APPROVAL_SEGMENTS.includes(segment)
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
// An approval kind chip («gastos», «ausencias»…), as the server names them.
const KIND = /^[a-z][a-z0-9_.-]{0,39}$/
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/** URL is state: unknown or malformed values fall back to the defaults. */
export function parseQuery(query = {}) {
  const segment = SEGMENTS.includes(query.segment) ? query.segment : 'mine'
  const kind =
    isApprovalSegment(segment) && KIND.test(text(query.kind))
      ? text(query.kind)
      : ''
  return {
    segment,
    q: text(query.q).slice(0, 140),
    source: ['ToDo', 'CRM Task'].includes(query.source) ? query.source : 'all',
    priority: ['Low', 'Medium', 'High'].includes(query.priority)
      ? query.priority
      : '',
    from: DAY.test(query.from || '') ? query.from : '',
    to: DAY.test(query.to || '') ? query.to : '',
    ...(kind ? { kind } : {}),
  }
}

export function toQuery(state) {
  const query = {}
  if (state.segment && state.segment !== 'mine') query.segment = state.segment
  if (state.kind && isApprovalSegment(state.segment)) query.kind = state.kind
  if (state.q) query.q = state.q
  if (state.source && state.source !== 'all') query.source = state.source
  if (state.priority) query.priority = state.priority
  if (state.from) query.from = state.from
  if (state.to) query.to = state.to
  return query
}

export function queueArgs(state, start = 0) {
  return {
    segment: state.segment,
    search: state.q,
    source: state.source,
    priority: state.priority,
    date_from: state.from,
    date_to: state.to,
    start,
    page_length: 30,
  }
}

export function pendienteRoute(row, query = {}) {
  return {
    name: 'Pendiente',
    params: { source: SOURCE_SLUGS[row.doctype], name: String(row.name) },
    query,
  }
}

export function sourceFromSlug(slug) {
  return Object.keys(SOURCE_SLUGS).find((key) => SOURCE_SLUGS[key] === slug)
}

export function sourceSlug(row) {
  return SOURCE_SLUGS[row?.doctype]
}

// On a lead/deal a personal pendiente is saved as a CRM Task (server rule).
const CRM_RECORDS = Object.freeze(['CRM Lead', 'CRM Deal'])

export function savesAsSalesTask(reference) {
  return CRM_RECORDS.includes(reference?.reference_type)
}

/** Whether «New pendiente» on this record can save, per source capability. */
export function canCreateOn(reference, boot) {
  const capabilities = boot?.capabilities || {}
  return Boolean(
    savesAsSalesTask(reference) ? capabilities.create_crm : capabilities.create,
  )
}

function deskSlug(doctype) {
  return doctype.toLowerCase().replace(/ /g, '-')
}

// Records whose worker screen is another shell module (as Avisos opens them).
const MODULE_RECORDS = Object.freeze({
  'Expense Claim': 'GastoEmpleado',
  'Purchase Invoice': 'GastoFactura',
  'Purchase Order': 'CompraOrden',
  'Material Request': 'CompraSolicitud',
})

/** Where the linked record opens: its owning module, else the Desk form. */
export function referenceTarget(row) {
  const doctype = row?.reference_type
  const name = row?.reference_name
  if (!doctype || !name) return null
  if (sourceSlugs[doctype])
    return {
      to: {
        name: 'Contacto',
        params: { source: sourceSlugs[doctype], name: String(name) },
      },
    }
  if (doctype === 'CRM Deal')
    return { to: { name: 'Deal 360', params: { dealId: String(name) } } }
  // An employee's expense (a correction or reimburse ask) comes back to Pendientes.
  if (doctype === 'Expense Claim')
    return {
      to: {
        name: MODULE_RECORDS[doctype],
        params: { name: String(name) },
        query: { return_to: '/crm/pendientes', return_label: 'Pendientes' },
      },
    }
  if (MODULE_RECORDS[doctype])
    return {
      to: { name: MODULE_RECORDS[doctype], params: { name: String(name) } },
    }
  if (doctype === 'Leave Application')
    return {
      href: `/app/asistencia?v=ausencias&request=${encodeURIComponent(String(name))}`,
    }
  return {
    href: `/app/${deskSlug(doctype)}/${encodeURIComponent(String(name))}`,
  }
}

function addDays(day, days) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10)
}

/** Odoo-style presets from the shop's civil date (server `today`). */
export function datePresets(today) {
  if (!DAY.test(today || '')) return []
  return [
    { label: t('Today'), value: today },
    { label: t('Tomorrow'), value: addDays(today, 1) },
    { label: t('In 3 days'), value: addDays(today, 3) },
    { label: t('Next week'), value: addDays(today, 7) },
  ]
}

export function dueText(row, today) {
  if (row.cancelled) return t('Cancelled')
  if (row.status === 'Closed') return t('Completed')
  const day = String(row.date || '').slice(0, 10)
  if (!day) return t('No date')
  if (!DAY.test(today || '')) return day
  if (day === today) return t('Today')
  if (day === addDays(today, 1)) return t('Tomorrow')
  const diff = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  )
  if (diff < 0)
    return diff === -1
      ? t('Overdue · yesterday')
      : t('Overdue · {0} days', [-diff])
  return t('In {0} days', [diff])
}

export function countText(count) {
  if (!count) return ''
  return count.capped ? `${count.value}+` : String(count.value)
}

export function priorityLabel(priority) {
  return { High: t('High'), Medium: t('Medium'), Low: t('Low') }[priority] || ''
}

export function sourceLabel(row) {
  return row.doctype === 'CRM Task' ? t('Sales') : t('Pendiente')
}

/** Same request as frappe-ui's call, keeping exc_type for recovery. */
export async function pendientesApi(method, args = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const path = `doco.pendientes.api.${method}`
  const response = await fetch(`/api/method/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError(path, response.status, data)
}

/** A specific reason plus the recovery the screen should offer. */
export function pendienteError(error) {
  const kind = errorKind(error) || (navigator.onLine === false ? 'network' : '')
  const detail = String(
    error?.messages?.join?.(' ') || error?.message || error || '',
  )
    .replace(/<[^>]*>/g, ' ')
    .trim()
  if (kind === 'conflict')
    return {
      kind,
      title: t('This pendiente changed'),
      detail:
        detail ||
        t('Someone else saved it first. Load the current version and retry.'),
    }
  if (kind === 'permission')
    return {
      kind,
      title: t('You cannot do this yet'),
      detail: detail || t('Ask your manager for access, then retry.'),
    }
  if (kind === 'session')
    return {
      kind,
      title: t('Your session ended'),
      detail: t('Sign in again; your text stays here.'),
    }
  if (kind === 'network')
    return {
      kind,
      title: t('No connection'),
      detail: t('Reconnect and tap Retry; your text stays here.'),
    }
  return {
    kind: 'error',
    title: t('Could not save'),
    detail: detail || t('Try again.'),
  }
}

export { requestId }
