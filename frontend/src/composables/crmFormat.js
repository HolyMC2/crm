// Shared presentational helpers for the FCRM redesign — avatar/grade/channel/time
// formatting used across Inbox, Leads, Campaigns, Calls, Reports. Extracted from
// composables/inbox.js so non-inbox surfaces don't couple to inbox state.

// [bg, text] as frappe-ui theme CSS vars so avatars stay legible in both light
// and dark. One neutral pair for every name (Marco 2026-10-28: the rainbow of
// initials read as noise): the same grey circle as ui/ListRow and the search
// panel's recent bubbles. Colour stays for meaning (status, overdue), not names.
// The ink half is `--ink-*`, NOT `--text-ink-*`: the latter has never been a
// real frappe-ui variable.
const AV_COLORS = [['var(--surface-gray-2)', 'var(--ink-gray-7)']]
// The same pair as theme token classes, for templates that can take a class
// instead of an inline style. Literal strings so Tailwind emits them; index i
// here is AV_COLORS[i].
export const AVATAR_CLASSES = ['bg-surface-gray-2 text-ink-gray-7']
function nameHash(s) {
  let h = 0
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
export function avatarColor(s) {
  return AV_COLORS[nameHash(s) % AV_COLORS.length]
}
/** Deterministic avatar token classes for a name (see AVATAR_CLASSES). */
export function avatarClass(s) {
  return AVATAR_CLASSES[nameHash(s) % AVATAR_CLASSES.length]
}
export function initials(name) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const p = n.split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

// score band → [text, bg] (handoff §8)
export const GRADE_COLORS = {
  A: ['var(--brand)', 'var(--brand-soft)'],
  B: ['#2f6fed', '#eaf1fe'],
  C: ['#d9930b', '#fdf6e9'],
  D: ['#e5484d', '#fdecec'],
}

// channel key → [label, dot]
export const CHANNEL_META = {
  whatsapp: ['WhatsApp', '#25d366'],
  messenger: ['Messenger', '#0084ff'],
  instagram: ['Instagram', '#e1306c'],
  tiktok: ['TikTok', '#1c2230'],
  email: ['Email', '#5b6472'],
}

function _date(ts) {
  if (!ts) return null
  const d = new Date(String(ts).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
export function timeAgo(ts) {
  const d = _date(ts)
  if (!d) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return __('ahora')
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
export function hhmm(ts) {
  const d = _date(ts)
  return d
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
}

// Pretty-print a raw WhatsApp/CRM number (5216691530561 / 526691530561 / 6691530561)
// as +52 669 153 0561 — strip the country code + the MX mobile "1", group the rest.
// Shared so the queue, the review cards and the Tratos list all render one shape.
export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let n = d
  if (n.startsWith('521')) n = n.slice(3)
  else if (n.startsWith('52')) n = n.slice(2)
  if (n.length === 10)
    return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return raw ? `+${d}` : '—'
}

// Shared money formatter (there were 3 divergent per-component copies before the
// 💰 Documentos work — new money UI should import this one). Whole numbers render
// without cents; anything fractional keeps 2 decimals.
export function formatMoney(v, currency) {
  const n = Number(v)
  if (!isFinite(n)) return ''
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || window.frappe?.boot?.sysdefaults?.currency || 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n)
}
