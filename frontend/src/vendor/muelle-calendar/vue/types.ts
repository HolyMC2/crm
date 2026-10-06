import type { CalendarView, Event, Resource } from '../core'

/** Translate the English source; placeholders are interpolated after translation. */
export type CalendarTranslate = (source: string, values?: Record<string, string | number>) => string
export interface UnavailableTime { start: string; end: string; resourceIds: readonly string[] }

export interface ResourceCalendarProps {
  events: readonly Event[]
  resources: readonly Resource[]
  /** Local Gregorian YYYY-MM-DD date in the display time zone. */
  date: string
  timeZone: string
  locale?: string
  hour12?: boolean
  /** Hide when the consuming page already displays date, time zone, and count. */
  showSummary?: boolean
  disabled?: boolean
  translate?: CalendarTranslate
  startHour?: number
  endHour?: number
  slotMinutes?: number
  unavailable?: readonly UnavailableTime[]
}

export interface AgendaCalendarProps extends ResourceCalendarProps {
  view?: CalendarView
  weekStartsOn?: number
}
