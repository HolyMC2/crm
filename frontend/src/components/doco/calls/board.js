// The calls page's board (crm.api.calls.board): what each figure says, the bars of
// when calls come in, and which calls a tile narrows the list to. Pure.
import { formatDate } from '@/utils/display'

export const PERIODS = [7, 30, 90]

/** «2 min», «1 h 5 min», «3 d». */
export function waited(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m < 60) return __('{0} min', [m])
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? __('{0} h {1} min', [h, rest]) : __('{0} h', [h])
  }
  return __('{0} d', [Math.round(m / 1440)])
}

/** The pickup tile: inside office hours when the shop has hours, else overall. */
export function pickupTile(board) {
  const t = board?.totals || {}
  const goal = Number(board?.goals?.pickup_goal) || 0
  const inHours = board?.hours_configured
  const pct = inHours ? t.pickup_open_pct : t.pickup_pct
  const taken = inHours ? t.answered_open || 0 : t.answered || 0
  const all = inHours ? t.incoming_open || 0 : t.incoming || 0
  const hint = [
    inHours
      ? __('{0} de {1} en horario', [taken, all])
      : __('{0} de {1}', [taken, all]),
    goal ? __('meta {0} %', [goal]) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (pct === null || pct === undefined)
    return { value: '—', hint, tone: 'neutral' }
  return {
    value: `${pct} %`,
    hint,
    tone: !goal ? 'neutral' : pct >= goal ? 'success' : 'danger',
  }
}

const VERDICT = {
  returned: (i) => __('Devuelta en {0}', [waited(i.minutes)]),
  reached: (i) =>
    __('Volvió a llamar y se le contestó, en {0}', [waited(i.minutes)]),
  late: (i) => __('Atendida tarde, en {0}', [waited(i.minutes)]),
  pending: () => __('Por devolver'),
  not_returned: () => __('Sin devolver'),
}

/** What happened after a missed call, for its row. */
export function verdictLine(item) {
  if (!item || !VERDICT[item.verdict]) return ''
  return [
    item.closed && __('Fuera de horario'),
    VERDICT[item.verdict](item),
    item.message && __('Dejó recado'),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function verdictTone(item) {
  if (!item) return ''
  if (item.verdict === 'not_returned') return 'danger'
  if (item.verdict === 'late' || item.verdict === 'pending') return 'warning'
  return ''
}

/** «8», «13»: the hour as the counter says it, in 24 h. */
const hourLabel = (h) => String(h)

/**
 * Bars per hour of the day, from the first hour that is open or had calls to the
 * last; each with its share of the busiest hour (0-100).
 */
export function hourBars(byHour = []) {
  const busy = (row) => row.answered + row.missed > 0 || row.open
  const first = byHour.findIndex(busy)
  if (first < 0) return []
  let last = byHour.length - 1
  while (last > first && !busy(byHour[last])) last--
  const rows = byHour.slice(first, last + 1)
  const top = Math.max(1, ...rows.map((r) => r.answered + r.missed))
  return rows.map((r) => ({
    ...r,
    label: hourLabel(r.hour),
    answeredPct: Math.round((100 * r.answered) / top),
    missedPct: Math.round((100 * r.missed) / top),
  }))
}

/** Each week's pickup: «23 nov», 69 %. A week with no incoming calls has none. */
export function weekBars(weeks = [], { now = new Date() } = {}) {
  return weeks.map((w) => ({
    ...w,
    label: formatDate(`${w.start} 12:00:00`, { now, relative: false }),
    pct: w.incoming ? Math.round((100 * w.answered) / w.incoming) : null,
  }))
}

/** The calls a tile narrows the list to. */
export function namesFor(board, key) {
  const items = Object.entries(board?.items || {})
  if (key === 'waiting') return board?.waiting || []
  if (key === 'closed') return items.filter(([, i]) => i.closed).map(([n]) => n)
  if (key === 'missed_open')
    return items.filter(([, i]) => !i.closed).map(([n]) => n)
  return null
}
