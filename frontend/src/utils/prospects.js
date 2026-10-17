// «Prospectos» (CRM-S3.4, decision D4): one capture list for leads and inquiries.
// Pure helpers for pages/Prospectos.vue; the server (crm.api.prospects) owns the data.

export const KIND_LABELS = { lead: 'Prospecto', inquiry: 'Consulta' }

export const KIND_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'lead', label: 'Prospectos' },
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

/** Where a row opens: the lead page, or the inquiry in Consultas. On a phone a
 * lead opens the prospect record (Shell D4), which reads like a contact. */
export function prospectRoute(row, { phone = false } = {}) {
  if (row.kind === 'inquiry')
    return { name: 'Inquiries', query: { name: row.name } }
  if (phone) return { name: 'Prospecto', params: { leadId: row.name } }
  return { name: 'Lead', params: { leadId: row.name } }
}

// A name the system made up («Prospecto 67a3f…», «CRM-LEAD-2026-…») is not a name.
const GENERATED = /^(prospecto|lead)\s+[0-9a-f]{3,}|^crm-lead-/i

/** The prospect's name, else its phone or e-mail; never a generated id. */
export function prospectName(row = {}) {
  const name = String(
    row.title ||
      row.lead_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      '',
  ).trim()
  if (name && !GENERATED.test(name)) return name
  return row.phone || row.mobile_no || row.email || 'Prospecto sin nombre'
}

/** «Sitio web», «WhatsApp»: a lead source in the worker's words. */
export function sourceText(source) {
  const text = String(source || '').trim()
  if (!text) return ''
  return globalThis.__?.(text) || text
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
