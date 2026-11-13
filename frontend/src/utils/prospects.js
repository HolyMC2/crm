// «Prospectos» (CRM-S3.4, decision D4): one capture list for leads and inquiries.
// Pure helpers for pages/Prospectos.vue; the server (crm.api.prospects) owns the data.
import { formatPhone } from '@/composables/crmFormat'

export const KIND_LABELS = { lead: 'Prospecto', inquiry: 'Consulta' }

export const KIND_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'lead', label: 'Prospectos' },
  { value: 'inquiry', label: 'Consultas' },
]

/** Where a row opens, at every width: a lead opens the prospect record (it
 * reads like a contact, Shell D4); an inquiry opens in Consultas, whose back
 * arrow returns to the list it came from (`list`). */
export function prospectRoute(row, { list = '/prospectos' } = {}) {
  if (row.kind === 'inquiry')
    return { name: 'Inquiries', query: { name: row.name, list } }
  return { name: 'Prospecto', params: { leadId: row.name } }
}

// A name the system made up («Prospecto 67a3f…», «CRM-LEAD-2026-…») is not a name.
const GENERATED = /^(prospecto|lead)\s+[0-9a-f]{3,}|^crm-lead-/i

/** The prospect's name, else its phone (written the way the list writes
 * phones) or e-mail; never a generated id. */
export function prospectName(row = {}) {
  // The server falls back to the record's id when it has no name: that is
  // no name either.
  const title = row.title && row.title !== row.name ? row.title : ''
  const name = String(
    title ||
      row.lead_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      '',
  ).trim()
  if (name && !GENERATED.test(name)) return name
  const phone = row.phone || row.mobile_no
  if (phone) return formatPhone(phone)
  if (row.email) return row.email
  return row.kind === 'inquiry' ? 'Consulta sin título' : 'Prospecto sin nombre'
}

/** A name that is really a way to reach them (a phone or an e-mail). */
export function nameIsContact(row = {}) {
  const name = prospectName(row)
  return /^[+\d\s()-]+$|@/.test(name)
}

/** Where the prospect came from, in the list's words. «Otro» says nothing on
 * its own: an unknown source shows its own name, and no source shows nothing. */
export function sourceWord(row = {}) {
  if (row.source && row.source !== 'otro') return row.source_label || ''
  return sourceText(row.source_raw)
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
