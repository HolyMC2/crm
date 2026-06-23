// Shared presentational helpers for the FCRM redesign — avatar/grade/channel/time
// formatting used across Inbox, Leads, Campaigns, Calls, Reports. Extracted from
// composables/inbox.js so non-inbox surfaces don't couple to inbox state.

// [bg, text] as frappe-ui theme CSS vars so avatars stay subtle + legible in BOTH
// light and dark (the old fixed pastels rendered as bright circles on the dark UI).
// Inline `background:var(--surface-x);color:var(--text-ink-x)` resolves per theme.
const AV_COLORS = [
  ['var(--surface-violet-1)', 'var(--text-ink-violet-1)'],
  ['var(--surface-blue-1)', 'var(--text-ink-blue-2)'],
  ['var(--surface-green-2)', 'var(--text-ink-green-3)'],
  ['var(--surface-amber-1)', 'var(--text-ink-amber-3)'],
  ['var(--surface-red-1)', 'var(--text-ink-red-4)'],
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
  A: ['#16a34a', '#e9f7ef'],
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
