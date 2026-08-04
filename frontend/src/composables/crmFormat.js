// Shared presentational helpers for the FCRM redesign — avatar/grade/channel/time
// formatting used across Inbox, Leads, Campaigns, Calls, Reports. Extracted from
// composables/inbox.js so non-inbox surfaces don't couple to inbox state.

// [bg, text] as frappe-ui theme CSS vars so avatars stay subtle + legible in BOTH
// light and dark (the old fixed pastels rendered as bright circles on the dark UI).
// Inline `background:var(--surface-x);color:var(--ink-x)` resolves per theme.
// The ink half is `--ink-*`, NOT `--text-ink-*`: the latter has never been a real
// frappe-ui variable, so these initials rendered with inherited colour until now.
const AV_COLORS = [
  ['var(--surface-violet-2)', 'var(--ink-violet-6)'],
  ['var(--surface-blue-1)', 'var(--ink-blue-6)'],
  ['var(--surface-green-2)', 'var(--ink-green-7)'],
  ['var(--surface-amber-1)', 'var(--ink-amber-7)'],
  ['var(--surface-red-1)', 'var(--ink-red-7)'],
]
export function avatarColor(s) {
  let h = 0
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
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
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
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
