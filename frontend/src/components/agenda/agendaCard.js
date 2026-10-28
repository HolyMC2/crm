// How an event card reads at a glance, shared by the phone schedule, the time grid and
// the month grid: one paint per state and one compact time line («9:00–9:30 a.m.»).
import { textOn } from '@/components/agenda/agendaColors'

// An opaque tint of the color over the page (dark mode included): overlapping cards in
// the grid never show the one underneath through them.
const tint = (color, percent) =>
  `color-mix(in srgb, ${color} ${percent}%, var(--surface-base))`

const SHIFT_KINDS = new Set(['shift', 'my_shift'])

/**
 * The card's colors. Coming events are filled with their calendar's color; what already
 * ended keeps a tint of it with full-contrast ink (a washed-out filled card is unreadable,
 * worst in dark mode); a shift is a tint with its color on the left edge; a cancelled
 * event is an outline. `edge` adds the left accent as an inset shadow so the caller can
 * add its own ring. `--ag-color` carries the calendar color whatever the paint.
 */
export function cardPaint(event, color, { past = false, ring = '' } = {}) {
  return { '--ag-color': color, ...paintFor(event, color, past, ring) }
}
function paintFor(event, color, past, ring) {
  const shadows = (...rows) => rows.filter(Boolean).join(', ') || undefined
  if (SHIFT_KINDS.has(event?.kind) || event?.estimated)
    return {
      background: tint(color, 16),
      color: 'var(--ink-gray-9)',
      boxShadow: shadows(`inset 3px 0 0 ${color}`, ring),
    }
  if (event?.status === 'Cancelled')
    return {
      background: 'var(--surface-base)',
      color: 'var(--ink-gray-6)',
      boxShadow: shadows(`inset 0 0 0 1px ${color}`, ring),
    }
  if (past || event?.status === 'Done' || event?.status === 'Missed')
    return {
      background: tint(color, 22),
      color: 'var(--ink-gray-8)',
      boxShadow: shadows(`inset 3px 0 0 ${color}`, ring),
    }
  return {
    background: color,
    color: textOn(color),
    boxShadow: ring || undefined,
  }
}

const formats = new Map()
function timeFormat(locale, timeZone, hour12) {
  const id = `${locale}|${timeZone}|${hour12}`
  let value = formats.get(id)
  if (!value) {
    value = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12,
      timeZone,
    })
    formats.set(id, value)
  }
  return value
}

/** «9:00–9:30 a.m.», «11:00 a.m. – 1:30 p.m.»: the day period once when it is shared. */
export function timeSpan(start, end, { locale, timeZone, hour12 = true } = {}) {
  const format = timeFormat(locale, timeZone, hour12)
  const from = new Date(start)
  const to = new Date(end)
  if (typeof format.formatRange === 'function' && to > from)
    return format.formatRange(from, to)
  return `${format.format(from)} – ${format.format(to)}`
}

/** «9:00 a.m.» */
export function timeAt(instant, { locale, timeZone, hour12 = true } = {}) {
  return timeFormat(locale, timeZone, hour12).format(new Date(instant))
}

/** The small icon a card carries for what kind of thing it is, or ''. */
export function kindIcon(event) {
  if (event?.status === 'Done') return 'lucide-check'
  if (event?.kind === 'cita') return 'lucide-calendar-check'
  if (/call|llamad/i.test(String(event?.category || ''))) return 'lucide-phone'
  return ''
}
