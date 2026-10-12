// Pure geometry for the Agenda grids (day/week time grid, month grid, mini month).
// Every instant is placed in the business time zone; layout works in wall minutes.
import { shiftCalendarDate } from '@/vendor/muelle-calendar/core'
import { wallToInstant } from '@/composables/useAgenda'

const DAY_MS = 24 * 3600 * 1000
const formatters = new Map()

function formatter(timeZone) {
  let value = formatters.get(timeZone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    formatters.set(timeZone, value)
  }
  return value
}

/** { date: 'YYYY-MM-DD', minutes: 0..1439 } of an instant in `timeZone`. */
export function wallParts(instant, timeZone) {
  const parts = {}
  for (const part of formatter(timeZone).formatToParts(new Date(instant)))
    parts[part.type] = part.value
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  }
}

/** Instant of a wall date + minutes (1440 is the next day's midnight). */
export function wallInstant(date, minutes, timeZone) {
  const day = shiftCalendarDate(date, Math.floor(minutes / 1440))
  const rest = ((minutes % 1440) + 1440) % 1440
  const hh = String(Math.floor(rest / 60)).padStart(2, '0')
  const mm = String(rest % 60).padStart(2, '0')
  return wallToInstant(day, `${hh}:${mm}`, timeZone)
}

export function dayDiff(from, to) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS,
  )
}

export function datesBetween(first, count) {
  return Array.from({ length: count }, (_, index) =>
    shiftCalendarDate(first, index),
  )
}

/** All-day events and anything lasting a whole day or more go to the bar lane. */
export function isBar(event) {
  if (event.allDay || event.kind === 'task') return true
  return Date.parse(event.end) - Date.parse(event.start) >= DAY_MS
}

/** First and last civil date an event covers (an end at midnight is exclusive). */
export function eventDates(event, timeZone) {
  const start = wallParts(event.start, timeZone)
  const endInstant = Math.max(
    Date.parse(event.end),
    Date.parse(event.start) + 1,
  )
  const end = wallParts(endInstant, timeZone)
  let last = end.date
  if (end.minutes === 0 && last > start.date) last = shiftCalendarDate(last, -1)
  return {
    first: start.date,
    last,
    startMinutes: start.minutes,
    endMinutes: end.minutes,
  }
}

/**
 * Timed segments per visible day: an event crossing midnight gives one segment per day.
 * Returns { [date]: [{ event, start, end, before, after }] } with minutes in the day.
 */
export function daySegments(events, dates, timeZone) {
  const result = Object.fromEntries(dates.map((date) => [date, []]))
  for (const event of events) {
    if (isBar(event)) continue
    const span = eventDates(event, timeZone)
    for (const date of dates) {
      if (date < span.first || date > span.last) continue
      const start = date === span.first ? span.startMinutes : 0
      const end =
        date === span.last &&
        !(span.endMinutes === 0 && span.last !== span.first)
          ? span.endMinutes || 1440
          : 1440
      result[date].push({
        event,
        start,
        end: Math.max(end, start + 15),
        before: date !== span.first,
        after: date !== span.last,
      })
    }
  }
  return result
}

/**
 * Overlap layout for one day, like the familiar calendars: overlapping events share the
 * width in columns; an event stretches right over free columns. Adds col, cols, span.
 */
export function layoutDay(segments) {
  const sorted = [...segments].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      String(a.event.title).localeCompare(String(b.event.title)),
  )
  const out = []
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const columns = []
    for (const item of cluster) {
      let index = columns.findIndex((end) => end <= item.start)
      if (index < 0) {
        index = columns.length
        columns.push(0)
      }
      columns[index] = item.end
      item.col = index
    }
    for (const item of cluster) {
      item.cols = columns.length
      let span = 1
      for (let col = item.col + 1; col < columns.length; col++) {
        const blocked = cluster.some(
          (other) =>
            other.col === col &&
            other.start < item.end &&
            other.end > item.start,
        )
        if (blocked) break
        span++
      }
      item.span = span
      out.push(item)
    }
    cluster = []
    clusterEnd = -1
  }
  for (const segment of sorted) {
    const item = { ...segment }
    if (cluster.length && item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  if (cluster.length) flush()
  return out
}

/**
 * Bars for one row of consecutive dates (a week): each bar spans its visible days and
 * takes the first lane free on all of them. Longer bars first, then earlier.
 */
export function packBars(events, dates, timeZone, { onlyBars = true } = {}) {
  const first = dates[0]
  const last = dates[dates.length - 1]
  const rows = []
  for (const event of events) {
    if (onlyBars && !isBar(event)) continue
    const span =
      event.kind === 'task'
        ? { first: event.date, last: event.date }
        : eventDates(event, timeZone)
    if (span.last < first || span.first > last) continue
    const from = span.first < first ? 0 : dayDiff(first, span.first)
    const to = span.last > last ? dates.length - 1 : dayDiff(first, span.last)
    rows.push({
      event,
      from,
      to,
      before: span.first < first,
      after: span.last > last,
      length: dayDiff(span.first, span.last),
    })
  }
  rows.sort(
    (a, b) =>
      a.from - b.from ||
      b.length - a.length ||
      Number(Boolean(a.event.kind === 'task')) -
        Number(Boolean(b.event.kind === 'task')) ||
      String(a.event.start || '').localeCompare(String(b.event.start || '')),
  )
  const lanes = []
  for (const row of rows) {
    let lane = lanes.findIndex((busy) =>
      busy.every((day, index) => index < row.from || index > row.to || !day),
    )
    if (lane < 0) {
      lane = lanes.length
      lanes.push(Array(dates.length).fill(false))
    }
    for (let index = row.from; index <= row.to; index++)
      lanes[lane][index] = true
    row.lane = lane
  }
  return { bars: rows, lanes: lanes.length }
}

/** Snap wall minutes to `step`, clamped to the day. */
export function snap(minutes, step = 15) {
  return Math.max(0, Math.min(1440, Math.round(minutes / step) * step))
}

/** Weeks of a month grid: only the weeks that hold days of the month (4–6). */
export function monthWeeks(date, weekStartsOn = 1) {
  const firstOfMonth = `${date.slice(0, 7)}-01`
  const weekday = new Date(`${firstOfMonth}T12:00:00Z`).getUTCDay()
  const start = shiftCalendarDate(
    firstOfMonth,
    -((weekday - weekStartsOn + 7) % 7),
  )
  const weeks = []
  let cursor = start
  while (weeks.length < 6) {
    const days = datesBetween(cursor, 7)
    if (weeks.length && days[0].slice(0, 7) !== date.slice(0, 7)) break
    weeks.push(days)
    cursor = shiftCalendarDate(cursor, 7)
  }
  return weeks
}

/** Days strictly inside [a, b] (either order), for a dragged day selection. */
export function dayRange(a, b) {
  const [from, to] = a <= b ? [a, b] : [b, a]
  return datesBetween(from, dayDiff(from, to) + 1)
}

/** Human duration «1 h 30 min» from minutes. */
export function durationText(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Where a card opens beside its anchor: right, else left, else centered; in view. */
export function placeCard(anchor, size, viewport, gap = 12) {
  const width = Math.min(size.width, viewport.width - 16)
  const height = Math.min(size.height, viewport.height - 16)
  if (!anchor) {
    return {
      left: Math.max(8, (viewport.width - width) / 2),
      top: Math.max(8, (viewport.height - height) / 3),
    }
  }
  let left
  if (anchor.right + gap + width <= viewport.width - 8)
    left = anchor.right + gap
  else if (anchor.left - gap - width >= 8) left = anchor.left - gap - width
  else
    left = Math.max(
      8,
      Math.min(
        viewport.width - width - 8,
        anchor.left + (anchor.width - width) / 2,
      ),
    )
  let top = anchor.top
  if (top + height > viewport.height - 8) top = viewport.height - height - 8
  return { left, top: Math.max(8, top) }
}
