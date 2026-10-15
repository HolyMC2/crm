// «Prospectos» (CRM-S3.4, decision D4): one capture list for leads and inquiries.
// Pure helpers for pages/Prospectos.vue; the server (crm.api.prospects) owns the data.

export const KIND_LABELS = { lead: 'Lead', inquiry: 'Consulta' }

export const KIND_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'lead', label: 'Leads' },
  { value: 'inquiry', label: 'Consultas' },
]

// frappe-ui Badge themes: gray, blue, green, orange, red, violet (others render nothing).
const SOURCE_THEMES = {
  whatsapp: 'green',
  facebook: 'blue',
  instagram: 'violet',
  tienda: 'violet',
  web: 'blue',
  mostrador: 'orange',
  llamada: 'orange',
  correo: 'gray',
  referido: 'green',
  manual: 'gray',
  otro: 'gray',
}

export function sourceTheme(key) {
  return SOURCE_THEMES[key] || 'gray'
}

/** Where a row opens: the lead page, or the inquiry in Consultas. */
export function prospectRoute(row) {
  if (row.kind === 'inquiry')
    return { name: 'Inquiries', query: { name: row.name } }
  return { name: 'Lead', params: { leadId: row.name } }
}

/** «hace 3 h», «hace 2 días»: how long the prospect has waited since its last change. */
export function waitingLabel(value, now = Date.now()) {
  if (!value) return ''
  const then = new Date(String(value).replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.max(0, Math.round((now - then) / 60000))
  if (minutes < 60) return minutes <= 1 ? 'hace 1 min' : `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'hace 1 h' : `hace ${hours} h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

/** A next action in the past is overdue: the list shows it first in red. */
export function isOverdue(row, now = Date.now()) {
  if (!row?.next_action_at) return false
  const at = new Date(String(row.next_action_at).replace(' ', 'T')).getTime()
  return !Number.isNaN(at) && at < now
}

/** Query string state ↔ request args; empty values are dropped. */
export function prospectArgs({ kind, source, q, start = 0, pageLength = 30 }) {
  const args = { start, page_length: pageLength }
  if (kind) args.kind = kind
  if (source) args.source = source
  if (q && q.trim()) args.q = q.trim()
  return args
}
