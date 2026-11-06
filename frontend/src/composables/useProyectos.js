// Proyectos (Shell SPEC §7 DE7, Q6 option B): a project is a named group of
// pendientes with dates. The record is ERPNext's Project; the rows are the
// Pendientes rows that carry a project and a start day. The lista, the tablero
// and the cronograma read the same rows.
import { call } from 'frappe-ui'
import { groupOf, pendienteError } from '@/composables/usePendientes'
import { formatDay } from '@/utils/contactos'
import { LOCALE } from '@/utils/display'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace, context) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace, context)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

const DAY = /^\d{4}-\d{2}-\d{2}$/

export const SCOPES = Object.freeze(['open', 'hold', 'done', 'all'])
export function normalizeScope(value) {
  return SCOPES.includes(value) ? value : 'open'
}
export function scopeLabel(scope) {
  return (
    {
      open: t('In progress', null, 'Proyectos'),
      hold: t('On hold', null, 'Proyectos'),
      done: t('Finished', null, 'Proyectos'),
      all: t('All', null, 'Proyectos'),
    }[scope] || t('In progress', null, 'Proyectos')
  )
}
export function scopeDescription(scope) {
  return (
    {
      open: t('Projects under way, the nearest end date first.'),
      hold: t('Projects paused for now; their pendientes wait with them.'),
      done: t('Finished and cancelled projects.'),
      all: t('Every project, whatever its state.'),
    }[scope] || ''
  )
}

export const STATUSES = Object.freeze([
  'Open',
  'On hold',
  'Completed',
  'Cancelled',
])
export function statusLabel(status) {
  return (
    {
      Open: t('In progress', null, 'Proyecto'),
      'On hold': t('On hold', null, 'Proyecto'),
      Completed: t('Finished', null, 'Proyecto'),
      Cancelled: t('Cancelled', null, 'Proyecto'),
    }[status] || status
  )
}
export function statusTone(status) {
  return (
    { 'On hold': 'warning', Completed: 'success', Cancelled: 'neutral' }[
      status
    ] || 'info'
  )
}

export const VIEWS = Object.freeze(['list', 'board', 'gantt'])
export function normalizeView(value) {
  return VIEWS.includes(value) ? value : 'list'
}
export function viewLabel(view) {
  return (
    {
      list: t('List', null, 'Proyecto'),
      board: t('Board', null, 'Proyecto'),
      gantt: t('Timeline', null, 'Proyecto'),
    }[view] || ''
  )
}

/** «3 de 8 hechos», or that nothing is in it yet. */
/** Finished or cancelled: the record stays, but it takes no new work. */
export function isClosed(row) {
  return row?.status === 'Completed' || row?.status === 'Cancelled'
}
export function progressText(row) {
  if (!row?.total)
    return isClosed(row) ? t('No pendientes') : t('No pendientes yet')
  return t('{0} of {1} done', [row.done || 0, row.total])
}
/** Done over total; a project without pendientes keeps ERPNext's manual figure. */
export function percentOf(row) {
  if (!row) return 0
  if (row.total) return Math.round(((row.done || 0) / row.total) * 100)
  return Math.max(0, Math.min(100, Math.round(row.percent_complete || 0)))
}
/** «20 oct – 20 nov», «hasta 20 nov», «desde 20 oct» or nothing. */
export function spanText(row) {
  const start = row?.expected_start_date
    ? formatDay(row.expected_start_date)
    : ''
  const end = row?.expected_end_date ? formatDay(row.expected_end_date) : ''
  if (start && end) return `${start} – ${end}`
  if (end) return t('Until {0}', [end])
  if (start) return t('From {0}', [start])
  return ''
}
/** The list row's second line: progress, then what needs the eye. */
export function dueLine(row) {
  if (!row) return ''
  if (row.status === 'Completed') return statusLabel(row.status)
  if (row.status === 'Cancelled') return statusLabel(row.status)
  const parts = [progressText(row)]
  if (row.status === 'On hold') parts.push(statusLabel(row.status))
  else if (row.overdue) parts.push(t('{0} overdue', [row.overdue]))
  else if (row.late) parts.push(t('Past its end date'))
  else if (row.next_due) parts.push(t('Next: {0}', [formatDay(row.next_due)]))
  return parts.join(' · ')
}
export function rowTone(row) {
  return row?.status === 'Open' && (row.overdue || row.late) ? 'danger' : ''
}
/** The trailing figure: the end day, or the percentage when there is none. */
export function metaOf(row) {
  if (row?.expected_end_date) return formatDay(row.expected_end_date)
  return row?.total ? `${percentOf(row)} %` : ''
}

export function proyectoRoute(name, query = {}) {
  return { name: 'Proyecto', params: { name: String(name) }, query }
}

/** The list's sections: overdue, today, upcoming, no date, done; empty ones are left out. */
export const SECTIONS = Object.freeze([
  'overdue',
  'today',
  'upcoming',
  'undated',
  'done',
])
export function sectionLabel(key) {
  return (
    {
      overdue: t('Overdue'),
      today: t('Today'),
      upcoming: t('Upcoming'),
      undated: t('No date'),
      done: t('Completed', null, 'Proyecto'),
    }[key] || ''
  )
}
export function sectionsOf(rows = [], today = '') {
  const found = Object.fromEntries(SECTIONS.map((key) => [key, []]))
  for (const row of rows) {
    const key = row.cancelled ? 'done' : groupOf(row, today)
    ;(found[key] || found.undated).push(row)
  }
  return SECTIONS.filter((key) => found[key].length).map((key) => ({
    key,
    label: sectionLabel(key),
    rows: found[key],
  }))
}

// ── cronograma ──────────────────────────────────────────────────────────────

function utc(day) {
  return Date.parse(`${day}T00:00:00Z`)
}
export function diffDays(later, earlier) {
  return Math.round((utc(later) - utc(earlier)) / 86400000)
}
export function addDays(day, count) {
  return new Date(utc(day) + count * 86400000).toISOString().slice(0, 10)
}
function monthLabel(day) {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(utc(day)))
    .replace(/\s+de\s+/g, ' ')
    .replace(/\./g, '')
}

export const DAY_WIDTH = 28
export const MIN_DAYS = 14

/**
 * The timeline (Gantt) of a project, as plain numbers for a CSS grid: the days
 * from the earliest start to the latest end (at least two weeks), one bar per
 * dated pendiente from its start day (or its due day) to its due day, the
 * project's own span, today's offset and the rows that have no day yet.
 */
export function ganttModel(
  rows = [],
  project = null,
  today = '',
  { dayWidth = DAY_WIDTH } = {},
) {
  const day = (value) => {
    const text = String(value || '').slice(0, 10)
    return DAY.test(text) ? text : ''
  }
  const dated = [],
    undated = []
  for (const row of rows) {
    const start = day(row.start),
      due = day(row.date)
    if (!start && !due) undated.push(row)
    else {
      const [from, to] =
        start && due
          ? start <= due
            ? [start, due]
            : [due, start]
          : [start || due, due || start]
      dated.push({ row, from, to })
    }
  }
  const anchors = [
    day(project?.expected_start_date),
    day(project?.expected_end_date),
    day(today),
    ...dated.flatMap((bar) => [bar.from, bar.to]),
  ].filter(Boolean)
  if (!anchors.length)
    return {
      from: '',
      to: '',
      width: 0,
      days: [],
      months: [],
      bars: [],
      project: null,
      todayOffset: null,
      undated,
    }
  let from = anchors.reduce((a, b) => (a < b ? a : b))
  let to = anchors.reduce((a, b) => (a > b ? a : b))
  if (diffDays(to, from) < MIN_DAYS - 1) to = addDays(from, MIN_DAYS - 1)
  const days = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = new Date(utc(d)).getUTCDay()
    days.push({
      day: d,
      label: String(Number(d.slice(8, 10))),
      weekend: weekday === 0 || weekday === 6,
      today: d === today,
    })
  }
  const months = []
  for (const entry of days) {
    const key = entry.day.slice(0, 7)
    const last = months.at(-1)
    if (last && last.key === key) last.days += 1
    else months.push({ key, label: monthLabel(entry.day), days: 1 })
  }
  const bars = dated.map(({ row, from: start, to: end }) => ({
    key: `${row.doctype}:${row.name}`,
    row,
    left: diffDays(start, from) * dayWidth,
    width: (diffDays(end, start) + 1) * dayWidth,
    tone:
      row.status === 'Closed' || row.cancelled
        ? 'done'
        : today && end < today
          ? 'late'
          : 'open',
    label:
      start === end
        ? formatDay(end)
        : `${formatDay(start)} – ${formatDay(end)}`,
  }))
  const projectStart = day(project?.expected_start_date),
    projectEnd = day(project?.expected_end_date)
  return {
    from,
    to,
    width: days.length * dayWidth,
    days,
    months,
    bars,
    project:
      projectStart && projectEnd && projectStart <= projectEnd
        ? {
            left: diffDays(projectStart, from) * dayWidth,
            width: (diffDays(projectEnd, projectStart) + 1) * dayWidth,
          }
        : null,
    todayOffset:
      day(today) && today >= from && today <= to
        ? diffDays(today, from) * dayWidth
        : null,
    undated,
  }
}

// Where the strip opens: today two days in from the left edge, or the first
// open bar when today falls outside the window. The name column is sticky, so
// the offset counts day pixels only.
export function ganttScroll(model, dayWidth = DAY_WIDTH) {
  const anchor =
    model.todayOffset ??
    model.bars.find((bar) => bar.tone !== 'done')?.left ??
    model.bars[0]?.left ??
    0
  return Math.max(0, anchor - 2 * dayWidth)
}

// ── api ─────────────────────────────────────────────────────────────────────

export async function proyectosApi(method, args = {}) {
  return call(`doco.proyectos.api.${method}`, args)
}

export function proyectoError(error) {
  const shaped = pendienteError(error)
  if (shaped.kind === 'conflict')
    return {
      ...shaped,
      title: t('This project changed'),
      detail: t(
        'Someone else saved it first. Load the current version and retry.',
      ),
    }
  return shaped
}
