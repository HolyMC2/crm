// Agenda data layer over doco.agenda (sources Event and Turno). Pure helpers are exported
// for unit tests; the page owns presentation.
import { call } from 'frappe-ui'
import {
  calendarRange,
  dayBounds,
  daySlots,
  localDate,
  navigateCalendar,
  shiftCalendarDate,
} from '@/vendor/muelle-calendar/core'

export const API = 'doco.agenda.api'
export const VIEWS = ['list', 'day', 'week', 'month']
export const LIST_DAYS = 7
export const CALENDAR_RESOURCE = 'agenda'
export const DEFAULT_CALENDARS = ['Event']
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function agendaLocale() {
  return window.lang || document.documentElement.lang || undefined
}

export function usesHour12(locale) {
  try {
    return Boolean(
      new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
        .hour12,
    )
  } catch {
    return true
  }
}

// The site's first weekday (System Settings «First Day of the Week», in boot sysdefaults);
// Monday when the site has not chosen one.
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
export function weekStartsOn(sysdefaults = window.sysdefaults) {
  const index = WEEKDAYS.indexOf(sysdefaults?.first_day_of_the_week)
  return index < 0 ? 1 : index
}

export function today(timeZone) {
  return localDate(new Date().toISOString(), timeZone)
}

// URL is state: ?view=list|day|week|month&date=YYYY-MM-DD&event=Source:id&cal=Event,Turno
export function parseState(query, { phone, timeZone }) {
  const view = VIEWS.includes(query.view) ? query.view : phone ? 'list' : 'week'
  const date =
    typeof query.date === 'string' && DAY.test(query.date)
      ? query.date
      : today(timeZone)
  const cal = String(query.cal || '')
    .split(',')
    .filter(Boolean)
  return {
    view,
    date,
    event: typeof query.event === 'string' ? query.event : '',
    calendars: cal.length ? cal : DEFAULT_CALENDARS,
  }
}

export function stateQuery(state, query = {}) {
  const next = { ...query, view: state.view, date: state.date }
  if (state.event) next.event = state.event
  else delete next.event
  const cal = state.calendars.join(',')
  if (cal && cal !== DEFAULT_CALENDARS.join(',')) next.cal = cal
  else delete next.cal
  return next
}

export function rangeFor(state, timeZone, firstWeekday = 1) {
  // The list runs forward from its date (today by default), never from past empty days.
  if (state.view === 'list') {
    const dates = Array.from({ length: LIST_DAYS }, (_, index) =>
      shiftCalendarDate(state.date, index),
    )
    return {
      start: dayBounds(dates[0], timeZone).start,
      end: dayBounds(dates[dates.length - 1], timeZone).end,
      startDate: dates[0],
      endDate: shiftCalendarDate(state.date, LIST_DAYS),
      dates,
    }
  }
  return calendarRange(state.date, state.view, timeZone, firstWeekday)
}

export function step(state, direction) {
  if (state.view === 'list')
    return shiftCalendarDate(state.date, direction * LIST_DAYS)
  return navigateCalendar(state.date, state.view, direction)
}

export function eventKey(event) {
  return `${event.source}:${event.id}`
}

export function parseEventKey(value) {
  const index = String(value || '').indexOf(':')
  if (index <= 0) return null
  return { source: value.slice(0, index), id: value.slice(index + 1) }
}

// All calendars render in one column: keep the source resource for the panel.
export function toCalendarEvent(event) {
  return {
    ...event,
    sourceResourceIds: event.resourceIds,
    resourceIds: [CALENDAR_RESOURCE],
  }
}

export function splitAllDay(events) {
  const timed = []
  const allDay = []
  for (const event of events) (event.allDay ? allDay : timed).push(event)
  return { timed, allDay }
}

// Visible hours grow to include early/late events (and shifts) in the range.
export function visibleHours(events, timeZone, base = { start: 7, end: 21 }) {
  let start = base.start
  let end = base.end
  for (const event of events) {
    if (event.allDay) continue
    const from = hourIn(event.start, timeZone)
    const to = hourIn(event.end, timeZone, true)
    if (localDate(event.start, timeZone) === localDate(event.end, timeZone)) {
      start = Math.min(start, from)
      end = Math.max(end, to)
    } else {
      start = Math.min(start, from)
      end = 24
    }
  }
  return {
    start: Math.max(0, start),
    end: Math.min(24, Math.max(end, start + 1)),
  }
}

function hourIn(instant, timeZone, ceil = false) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value || 0,
  )
  return ceil && minute ? hour + 1 : hour
}

// Drag-to-reschedule: the dropped slot keeps the event's duration.
export function rescheduleTimes(event, date, slotIndex, options) {
  const slots = daySlots(date, options.timeZone, {
    slotMinutes: options.slotMinutes,
    startHour: options.startHour,
    endHour: options.endHour,
  })
  const slot = slots[slotIndex]
  if (!slot) return null
  const duration = Date.parse(event.end) - Date.parse(event.start)
  const start = new Date(slot.start)
  return {
    start: start.toISOString(),
    end: new Date(slot.start + duration).toISOString(),
  }
}

// Month drag-to-reschedule: same wall-clock time on the dropped day, same duration.
export function moveToDateTimes(event, date, timeZone) {
  const wall = instantToWall(event.start, timeZone)
  if (wall.date === date) return null
  const start = wallToInstant(date, wall.time, timeZone)
  if (!start) return null
  const duration = Date.parse(event.end) - Date.parse(event.start)
  return {
    start,
    end: new Date(Date.parse(start) + duration).toISOString(),
  }
}

// Which resolve actions each refusal offers; the page wires ids to behavior.
export function constraintActions(constraint) {
  const byCode = {
    stale_version: ['retry'],
    recurring_occurrence: ['move_series', 'open'],
    series_weekday: ['edit'],
    overlap: ['confirm', 'pick_time'],
    off_shift: ['confirm', 'pick_time'],
    past_time: ['confirm', 'pick_time'],
    organizer_only: ['request_change'],
    google_synced: ['open_native'],
    read_only: ['open_turnos'],
    all_day: ['edit'],
    permission: ['request_access'],
    not_found: ['refresh'],
    too_many_events: ['shorter_range'],
    invalid_range: ['pick_time'],
  }
  return byCode[constraint?.code] || ['retry']
}

export function isWarningOnly(constraints) {
  return (
    Array.isArray(constraints) &&
    constraints.length > 0 &&
    constraints.every((row) => row.severity === 'warn')
  )
}

export function requestId() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// --- server calls; each returns either data or { constraints } ------------------------

export function loadCapabilities() {
  return call('crm.api.agenda.get_capabilities')
}

export async function querySources(keys, range) {
  const results = await Promise.all(
    keys.map((source) =>
      call(`${API}.query`, { source, start: range.start, end: range.end })
        .then((data) => ({ source, data }))
        .catch((error) => ({ source, error })),
    ),
  )
  const events = []
  const problems = []
  let timeZone = null
  for (const { source, data, error } of results) {
    if (error || data?.constraints) {
      problems.push({
        source,
        constraint: data?.constraints?.[0] || {
          code: 'unavailable',
          message: errorText(error),
          severity: 'block',
        },
      })
      continue
    }
    timeZone = timeZone || data.timeZone
    events.push(...data.events)
  }
  return { events, problems, timeZone }
}

export const createEvent = (source, payload) =>
  call(`${API}.create`, { source, payload: JSON.stringify(payload) })

export const moveEvent = (
  event,
  times,
  { scope = 'single', confirm = 0 } = {},
) =>
  call(`${API}.move`, {
    source: event.source,
    name: event.id,
    start: times.start,
    end: times.end,
    resource_ids: JSON.stringify(
      (event.sourceResourceIds || event.resourceIds).slice(0, 1),
    ),
    version: String(event.version),
    scope,
    confirm,
  })

export const updateEvent = (event, payload, confirm = 0) =>
  call(`${API}.update`, {
    source: event.source,
    name: event.id,
    payload: JSON.stringify(payload),
    version: String(event.version),
    confirm,
  })

export const setStatus = (event, action) =>
  call(`${API}.set_status`, {
    source: event.source,
    name: event.id,
    action,
    version: String(event.version),
  })

export const eventDetail = (source, name) =>
  call(`${API}.detail`, { source, name })

export const requestChange = (event, times, note = '') =>
  call(`${API}.request_change`, {
    source: event.source,
    name: event.id,
    start: times.start,
    end: times.end,
    note,
  })

export function errorText(error) {
  return (
    error?.messages?.[0] ||
    error?.message ||
    __('We could not reach the server. Check your connection and try again.')
  )
}

// --- business-time-zone wall time <-> instant (the form edits wall time) -------------

function zoneOffset(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - Math.floor(ms / 1000) * 1000
}

// A wall time that does not exist (DST gap) resolves forward, like the server's fold=0.
export function wallToInstant(date, time, timeZone) {
  if (!DAY.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  let guess = wall - zoneOffset(wall, timeZone)
  guess = wall - zoneOffset(guess, timeZone)
  return new Date(guess).toISOString()
}

export function instantToWall(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}`,
  }
}

export function formatWhen(instant, timeZone, locale, hour12) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(new Date(instant))
}

// Return protocol (shell spec §8.3): same-origin local paths under known app prefixes.
const RETURN_PREFIXES = [
  '/crm/',
  '/taller/',
  '/posapp/',
  '/clinica/',
  '/mercado/',
  '/scan/',
]
export function safeReturn(value) {
  if (typeof value !== 'string' || value.length > 2048) return ''
  if (
    [...value].some((char) => char.charCodeAt(0) < 32 || char === '\\') ||
    value.startsWith('//')
  )
    return ''
  let path
  try {
    path = decodeURIComponent(value.split(/[?#]/)[0])
  } catch {
    return ''
  }
  if (path.split('/').some((part) => part === '.' || part === '..')) return ''
  return RETURN_PREFIXES.some((prefix) => value.startsWith(prefix)) ? value : ''
}

const RECORD_ROUTES = {
  Contact: (name) => `/contactos/contact/${encodeURIComponent(name)}`,
  Customer: (name) => `/contactos/customer/${encodeURIComponent(name)}`,
  Supplier: (name) => `/contactos/supplier/${encodeURIComponent(name)}`,
  'CRM Organization': (name) =>
    `/contactos/organization/${encodeURIComponent(name)}`,
  'CRM Deal': (name) => `/deals/${encodeURIComponent(name)}`,
  'CRM Lead': (name) => `/leads/${encodeURIComponent(name)}`,
}

// In-shell route when the owner lives in the shell, else the native form (new tab).
export function recordLink(doctype, name) {
  const route = RECORD_ROUTES[doctype]
  if (route) return { to: route(name) }
  const slug = String(doctype).toLowerCase().replace(/ /g, '-')
  return { href: `/app/${slug}/${encodeURIComponent(name)}` }
}

export const searchPeople = (q) => call('crm.api.agenda.search_people', { q })
