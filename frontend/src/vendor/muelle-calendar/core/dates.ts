import type { Instant, Interval } from './types'

const DAY_MS = 86_400_000

/** Reject zone-less and normalized invalid dates instead of assuming browser TZ. */
export function instantMs(value: Instant): number {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || !isDate(match[1]!) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) {
    throw new RangeError('An ISO timestamp with an explicit time-zone offset is required')
  }
  const result = Date.parse(value)
  if (!Number.isFinite(result)) throw new RangeError('Invalid timestamp')
  return result
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

function dateKey(formatter: Intl.DateTimeFormat, value: number): string {
  const parts = formatter.formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
}

/** Calendar date at an instant, independent of the device's local time zone. */
export function localDate(value: Instant | number, timeZone: string): string {
  return dateKey(dateFormatter(timeZone), typeof value === 'number' ? value : instantMs(value))
}

export function formatTime(value: Instant | number, timeZone: string, locale = 'en', includeOffset = false, hour12 = false): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, hour: '2-digit', minute: '2-digit', ...(hour12 ? { hour12: true } : { hourCycle: 'h23' as const }),
    ...(includeOffset ? { timeZoneName: 'shortOffset' as const } : {}),
  }).format(typeof value === 'number' ? value : instantMs(value))
}

export function formatDay(date: string, timeZone: string, locale = 'en'): string {
  const range = dayRange(date, timeZone)
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(range.start + (range.end - range.start) / 2)
}

/**
 * Find local date boundaries by comparing Intl date parts, not by adding 24h.
 * Handles 23/25-hour days and zones with midnight transitions. A skipped date
 * (for example Pacific/Apia 2011-12-30) is rejected explicitly.
 */
export function dayRange(date: string, timeZone: string): Interval {
  if (!isDate(date)) throw new RangeError('A valid YYYY-MM-DD date is required')
  const formatter = dateFormatter(timeZone)
  const center = Date.parse(`${date}T00:00:00Z`)
  const boundary = (past: boolean): number => {
    let low = center - 2 * DAY_MS
    let high = center + 3 * DAY_MS
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2)
      const key = dateKey(formatter, mid)
      if (key < date || (past && key === date)) low = mid
      else high = mid
    }
    return high
  }
  const start = boundary(false)
  const end = boundary(true)
  if (start >= end || dateKey(formatter, start) !== date) throw new RangeError('This local date does not exist in the time zone')
  return { start, end }
}

/** UTC ISO bounds for application queries. */
export function dayBounds(date: string, timeZone: string): { start: Instant; end: Instant } {
  const range = dayRange(date, timeZone)
  return { start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() }
}

export interface DaySlot extends Interval {
  /** Explicit offset distinguishes repeated wall times at fall-back. */
  label: string
}

/** Actual elapsed-time slots; missing DST hours are absent, repeated ones appear twice. */
export function daySlots(date: string, timeZone: string, options: {
  locale?: string
  slotMinutes?: number
  startHour?: number
  endHour?: number
  hour12?: boolean
} = {}): DaySlot[] {
  const { locale = 'en', slotMinutes = 30, startHour = 0, endHour = 24, hour12 = false } = options
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 120 ||
      !Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
    throw new RangeError('Invalid day slot options')
  }
  const range = dayRange(date, timeZone)
  const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
  const result: DaySlot[] = []
  const step = slotMinutes * 60_000
  // Locate the actual visible window before stepping, including half-hour DST
  // changes and a requested opening hour that is not divisible by slotMinutes.
  let visibleStart: number | undefined
  let visibleEnd = range.start
  for (let cursor = range.start; cursor < range.end; cursor += 60_000) {
    const hour = Number(hourFormatter.format(cursor))
    if (hour >= startHour && hour < endHour) {
      visibleStart ??= cursor
      visibleEnd = Math.min(cursor + 60_000, range.end)
    }
  }
  if (visibleStart === undefined) return result
  for (let start = visibleStart; start < visibleEnd; start += step) {
    result.push({ start, end: Math.min(start + step, visibleEnd), label: formatTime(start, timeZone, locale, true, hour12) })
  }
  return result
}
