import { dayBounds, dayRange, instantMs, localDate } from './dates'
import { clipInterval, eventInterval, overlaps } from './layout'
import type { Event, Instant, Interval } from './types'

export type CalendarView = 'day' | 'week' | 'month' | 'list'

export interface CalendarViewRange {
  start: Instant
  end: Instant
  startDate: string
  /** Exclusive Gregorian date boundary. */
  endDate: string
  dates: string[]
}

function civilDate(value: string): Date {
  return new Date(instantMs(`${value}T00:00:00Z`))
}

function dateString(value: Date): string {
  const result = value.toISOString().slice(0, 10)
  civilDate(result)
  return result
}

/** Civil-day arithmetic, independent of the browser zone and elapsed DST hours. */
export function shiftCalendarDate(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('A whole number of calendar days is required')
  const result = civilDate(date)
  result.setUTCDate(result.getUTCDate() + days)
  return dateString(result)
}

function weekStart(date: string, startsOn: number): string {
  return shiftCalendarDate(date, -((civilDate(date).getUTCDay() - startsOn + 7) % 7))
}

/** Defaults to Monday for existing consumers; the site can choose any civil weekday (Sunday=0). */
export function calendarRange(date: string, view: CalendarView, timeZone: string, weekStartsOn = 1): CalendarViewRange {
  civilDate(date)
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) throw new RangeError('Invalid week start')
  if (!['day', 'week', 'month', 'list'].includes(view)) throw new RangeError('Unknown calendar view')
  const startDate = view === 'month' ? weekStart(`${date.slice(0, 7)}-01`, weekStartsOn) : view === 'day' ? date : weekStart(date, weekStartsOn)
  const length = view === 'month' ? 42 : view === 'day' ? 1 : 7
  const dates = Array.from({ length }, (_, index) => shiftCalendarDate(startDate, index))
  return {
    start: dayBounds(startDate, timeZone).start,
    end: dayBounds(dates[dates.length - 1]!, timeZone).end,
    startDate, endDate: shiftCalendarDate(startDate, length), dates,
  }
}

/** Month navigation preserves the day when possible, otherwise clamps to month end. */
export function navigateCalendar(date: string, view: CalendarView, direction: -1 | 1): string {
  if (direction !== -1 && direction !== 1) throw new RangeError('Direction must be -1 or 1')
  if (view === 'day') return shiftCalendarDate(date, direction)
  if (view === 'week' || view === 'list') return shiftCalendarDate(date, direction * 7)
  if (view !== 'month') throw new RangeError('Unknown calendar view')
  const result = civilDate(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + direction)
  const last = new Date(result)
  last.setUTCMonth(last.getUTCMonth() + 1)
  last.setUTCDate(0)
  result.setUTCDate(Math.min(day, last.getUTCDate()))
  return dateString(result)
}

export interface DayEvent extends Interval {
  event: Event
  continuesBefore: boolean
  continuesAfter: boolean
}

/** Each identity appears once per intersecting local day; an exclusive midnight end is absent the next day. */
export function eventsForDay(events: readonly Event[], date: string, timeZone: string, resourceIds?: readonly string[]): DayEvent[] {
  const range = dayRange(date, timeZone)
  const seen = new Set<string>()
  const result: DayEvent[] = []
  for (const event of events) {
    const key = JSON.stringify([event.source, event.id])
    if (seen.has(key) || (resourceIds && !event.resourceIds.some((id) => resourceIds.includes(id)))) continue
    const interval = eventInterval(event)
    const clipped = interval && clipInterval(interval, range)
    if (!interval || !clipped) continue
    seen.add(key)
    result.push({ event, ...clipped, continuesBefore: interval.start < range.start, continuesAfter: interval.end > range.end })
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end || a.event.title.localeCompare(b.event.title))
}

/** List grouping shows an event once at its local start date, or the first visible day for a carry-in. */
export function groupAgendaEvents(events: readonly Event[], range: CalendarViewRange, timeZone: string, resourceIds?: readonly string[]): { date: string; events: Event[] }[] {
  const groups = range.dates.map((date) => ({ date, events: [] as Event[] }))
  const interval = { start: instantMs(range.start), end: instantMs(range.end) }
  const seen = new Set<string>()
  for (const event of events) {
    const key = JSON.stringify([event.source, event.id])
    if (seen.has(key) || (resourceIds && !event.resourceIds.some((id) => resourceIds.includes(id)))) continue
    const value = eventInterval(event)
    if (!value || !overlaps(value, interval)) continue
    const date = localDate(Math.max(value.start, interval.start), timeZone)
    const group = groups.find((item) => item.date === date)
    if (!group) continue
    seen.add(key)
    group.events.push(event)
  }
  for (const group of groups) group.events.sort((a, b) => instantMs(a.start) - instantMs(b.start) || a.title.localeCompare(b.title))
  return groups
}
