// Next-activity presentation: turn a denormalised `next_activity_at` timestamp
// into a colour state and a short Spanish label for rows, cards and chips.
//
// Frappe hands us naive local strings ("2026-09-13 15:00:00"): no zone, already
// in the site's timezone. Parsing them with `new Date(s.replace(' ', 'T'))` keeps
// them local (an ISO string with a "Z" would shift the day), the same trick
// DealHeader.vue uses for the next-action bar.
//
// Both functions are pure — `now` is injectable so the unit tests don't depend on
// the wall clock.

function parseNaive(at) {
  if (!at) return null
  const d = new Date(String(at).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Whole calendar days between two dates (a - b), so "tomorrow 08:00" is 1 day
// away from "today 23:00" instead of 0.
function dayDiff(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// Translatable so a language flip reaches the chips; the fallback strings are the
// Spanish UI copy.
const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/**
 * @returns {'overdue'|'today'|'planned'|'none'}
 *   overdue — the due moment has passed (red)
 *   today   — still ahead, but due before midnight (amber)
 *   planned — a later day (gray)
 *   none    — no activity scheduled / unparseable
 */
export function activityState(at, now = new Date()) {
  const d = parseNaive(at)
  if (!d) return 'none'
  if (d.getTime() < now.getTime()) return 'overdue'
  if (dayDiff(d, now) === 0) return 'today'
  return 'planned'
}

/**
 * Short label for the chip: "Vencida · 2 d", "Hoy 15:00", "Mañana", "En 3 d",
 * "12 oct". Empty string when there is nothing scheduled.
 */
export function activityLabel(at, now = new Date()) {
  const d = parseNaive(at)
  if (!d) return ''

  if (d.getTime() < now.getTime()) {
    const days = dayDiff(now, d)
    if (days >= 1) return __('Vencida · {0} d', [days])
    const hours = Math.floor((now.getTime() - d.getTime()) / 3600000)
    if (hours >= 1) return __('Vencida · {0} h', [hours])
    return __('Vencida')
  }

  const days = dayDiff(d, now)
  if (days === 0)
    return __('Hoy {0}:{1}', [pad(d.getHours()), pad(d.getMinutes())])
  if (days === 1) return __('Mañana')
  if (days <= 7) return __('En {0} d', [days])
  return `${d.getDate()} ${__(MONTHS_SHORT[d.getMonth()])}`
}
