// Vendored from muelle/workspace/packages/ui@0.1.0 (ce74d3b9f43a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// es-MX dates for DateField: dd/mm/aaaa typed or picked, 24-hour times, and the
// stored Frappe forms («2026-10-18», «2026-10-18 14:30:00», «14:30:00»).

export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
// Monday first, as a Mexican wall calendar.
export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const pad = (n) => String(n).padStart(2, '0')

/** A Date (local) → «2026-10-18». */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** «2026-10-18…» → { y, m, d } or null. */
export function splitIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return valid(y, mo, d) ? { y, m: mo, d } : null
}

function valid(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return false
  return d <= new Date(y, m, 0).getDate()
}

/** «2026-10-18» → «18/10/2026» (what the field shows). */
export function toTyped(value) {
  const p = splitIso(value)
  return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : ''
}

/**
 * What a worker typed → «2026-10-18», or null when it is not a date.
 * Accepts 18/10/2026, 18-10-26, 18.10.2026 and 181026 / 18102026.
 */
export function parseTyped(text, today = new Date()) {
  const t = String(text || '').trim()
  if (!t) return ''
  let d, m, y
  const parts = t.split(/[/.\-\s]+/).filter(Boolean)
  if (parts.length === 3) [d, m, y] = parts
  else if (parts.length === 2)
    [d, m, y] = [...parts, String(today.getFullYear())]
  else if (/^\d{6}$|^\d{8}$/.test(t))
    [d, m, y] = [t.slice(0, 2), t.slice(2, 4), t.slice(4)]
  else return null
  if (![d, m, y].every((x) => /^\d+$/.test(x))) return null
  let year = Number(y)
  if (y.length <= 2) year += 2000
  const [dn, mn] = [Number(d), Number(m)]
  return valid(year, mn, dn) ? `${year}-${pad(mn)}-${pad(dn)}` : null
}

/** «7:5», «0730», «14.30» → «07:05» / «07:30» / «14:30», or null. */
export function parseTime(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  let h, mi
  const m = /^(\d{1,2})(?:[:.h\s]?(\d{2}))?$/.exec(t)
  if (!m) return null
  h = Number(m[1])
  mi = Number(m[2] || 0)
  if (h > 23 || mi > 59) return null
  return `${pad(h)}:${pad(mi)}`
}

/** «2026-10-18 14:30:00» → «14:30»; «14:30:00» → «14:30». */
export function timeOf(value) {
  const m = /(\d{2}):(\d{2})/.exec(String(value || ''))
  return m ? `${m[1]}:${m[2]}` : ''
}

/** The date in words next to the field: «hoy», «mañana», «sábado 24 de octubre». */
export function inWords(value, today = new Date()) {
  const p = splitIso(value)
  if (!p) return ''
  const day = new Date(p.y, p.m - 1, p.d)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((day - base) / 86400000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === -1) return 'ayer'
  const weekday = day.toLocaleDateString('es-MX', { weekday: 'long' })
  const year = p.y === today.getFullYear() ? '' : ` de ${p.y}`
  return `${weekday} ${p.d} de ${MONTHS[p.m - 1]}${year}`
}

/** «2026-10-18» shifted by `days` (Hoy +0, Mañana +1, En una semana +7). */
export function addDays(days, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/** The weeks of a month for the picker: Monday-first rows of «YYYY-MM-DD» or null. */
export function monthGrid(year, month) {
  const first = new Date(year, month - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month, 0).getDate()
  const cells = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** The stored value for a mode from a date and a time. */
export function joinValue(mode, date, time) {
  if (mode === 'time') return time ? `${time}:00` : ''
  if (mode === 'datetime') return date ? `${date} ${time || '00:00'}:00` : ''
  return date || ''
}
