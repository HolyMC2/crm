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
export const VIEWS = ['list', 'day', '3day', '4day', 'week', 'month']
// Views a phone offers (Google Calendar's set); 4 days stays on wider screens.
export const PHONE_VIEWS = ['list', 'day', '3day', 'week', 'month']
export const LIST_MAX_DAYS = 42
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

// URL is state: ?view=list|day|3day|4day|week|month&date=YYYY-MM-DD&event=Source:id&cal=Event,Turno
// `cal` is an optional deep-link filter; without it the worker's own calendar choice applies.
export function parseState(query, { phone, timeZone, defaultView = '' }) {
  const fallback =
    defaultView && VIEWS.includes(defaultView)
      ? phone && defaultView === '4day'
        ? '3day'
        : defaultView
      : phone
        ? 'list'
        : 'week'
  const view = VIEWS.includes(query.view) ? query.view : fallback
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
    calendars: cal.length ? cal : null,
  }
}

export function stateQuery(state, query = {}) {
  const next = { ...query, view: state.view, date: state.date }
  if (state.event) next.event = state.event
  else delete next.event
  const cal = (state.calendars || []).join(',')
  if (cal) next.cal = cal
  else delete next.cal
  return next
}

export function rangeFor(
  state,
  timeZone,
  firstWeekday = 1,
  listDays = LIST_DAYS,
) {
  // The list runs forward from its date (today by default), never from past empty days.
  const days =
    state.view === 'list'
      ? Math.max(1, Math.min(LIST_MAX_DAYS, listDays))
      : DAY_SPANS[state.view]
  if (days) {
    const dates = Array.from({ length: days }, (_, index) =>
      shiftCalendarDate(state.date, index),
    )
    return {
      start: dayBounds(dates[0], timeZone).start,
      end: dayBounds(dates[dates.length - 1], timeZone).end,
      startDate: dates[0],
      endDate: shiftCalendarDate(state.date, days),
      dates,
    }
  }
  return calendarRange(state.date, state.view, timeZone, firstWeekday)
}
const DAY_SPANS = { '3day': 3, '4day': 4 }

export function step(state, direction) {
  if (state.view === 'list')
    return shiftCalendarDate(state.date, direction * LIST_DAYS)
  if (DAY_SPANS[state.view])
    return shiftCalendarDate(state.date, direction * DAY_SPANS[state.view])
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
  const resources = {}
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
    if (Array.isArray(data.resources)) resources[source] = data.resources
  }
  return { events, problems, timeZone, resources }
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
// Records owned by a sibling app open in that app.
const APP_ROUTES = {
  'Repair Order': (name) => `/taller/orders/${encodeURIComponent(name)}`,
}

export function recordLink(doctype, name) {
  const route = RECORD_ROUTES[doctype]
  if (route) return { to: route(name) }
  if (APP_ROUTES[doctype]) return { href: APP_ROUTES[doctype](name) }
  const slug = String(doctype).toLowerCase().replace(/ /g, '-')
  return { href: `/app/${slug}/${encodeURIComponent(name)}` }
}

export const searchPeople = (q) => call('crm.api.agenda.search_people', { q })

// --- calendars ---------------------------------------------------------------------------
// A calendar is what the worker shows, hides and colors. Sources map to calendars one to
// one, except citas (Event rows of kind «cita») and pendientes (tasks from Pendientes).
export const TASKS = 'tasks'
export const CITAS = 'Event:cita'

// Sources whose people each get their own calendar: every doctor (Clínica) and every
// technician (Taller) shows, hides and colors on their own. Key: «Source/resource id».
export const PER_RESOURCE = Object.freeze({
  'Patient Appointment': { group: () => __('Doctors') },
  Taller: { group: () => __('Technicians') },
})
const SEP = '/'

export function resourceCalendarKey(source, resourceId) {
  return `${source}${SEP}${resourceId ?? ''}`
}

/** «Patient Appointment/HLC-PRAC-1» → { source, resource }; other keys → { source: key }. */
export function splitCalendarKey(key) {
  const text = String(key || '')
  const index = text.indexOf(SEP)
  if (index > 0 && PER_RESOURCE[text.slice(0, index)])
    return { source: text.slice(0, index), resource: text.slice(index + 1) }
  return { source: text, resource: null }
}

export function calendarKey(event) {
  if (event?.kind === 'task') return TASKS
  if (event?.source === 'Event' && event.kind === 'cita') return CITAS
  if (PER_RESOURCE[event?.source]) {
    const ids = event.sourceResourceIds || event.resourceIds || []
    return resourceCalendarKey(event.source, ids[0])
  }
  return event?.source || 'Event'
}

const CALENDAR_LABELS = {
  Event: () => __('My agenda'),
  [CITAS]: () => __('Appointments'),
  [TASKS]: () => __('Tasks'),
  Turno: () => __('Shifts'),
  Ausencias: () => __('Absences'),
  'Patient Appointment': () => __('Patient appointments'),
  Taller: () => __('Workshop'),
}
export function calendarLabel(key, fallback = '') {
  return CALENDAR_LABELS[key]?.() || (fallback ? __(fallback) : key)
}
// «My calendars» are the worker's own; the rest are team or business calendars.
export const MY_CALENDARS = ['Event', CITAS, TASKS]

/** Which loaded sources a set of visible calendars needs. */
export function sourcesFor(calendars, available) {
  const wanted = new Set()
  for (const key of calendars) {
    if (key === TASKS) continue
    const source = key === CITAS ? 'Event' : splitCalendarKey(key).source
    if (available.includes(source)) wanted.add(source)
  }
  return [...wanted]
}

// The people of each per-resource source, remembered on this device so the drawer lists
// every doctor and technician at once, before their calendars load.
function resourcesStorageKey() {
  const user = decodeURIComponent(
    globalThis.document?.cookie
      ?.split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
  return `muelle.agenda.resources:${user || 'me'}`
}
export function readResourceCache() {
  try {
    const value = JSON.parse(
      localStorage.getItem(resourcesStorageKey()) || '{}',
    )
    const clean = {}
    for (const source of Object.keys(PER_RESOURCE))
      if (Array.isArray(value?.[source]))
        clean[source] = value[source]
          .filter((row) => row && typeof row.id === 'string')
          .slice(0, 100)
          .map((row) => ({
            id: row.id,
            title: String(row.title || row.id).slice(0, 140),
            active: row.active !== false,
          }))
    return clean
  } catch {
    return {}
  }
}
export function writeResourceCache(value) {
  try {
    localStorage.setItem(resourcesStorageKey(), JSON.stringify(value))
  } catch {
    // Private mode or full storage: the calendars still list after the first load.
  }
}

// --- tasks (Pendientes) on the calendar ----------------------------------------------------
const TASK_SLUGS = { ToDo: 'todo', 'CRM Task': 'crm-task' }

export function taskToEvent(row, timeZone) {
  const start = wallToInstant(row.date, '00:00', timeZone)
  const next = shiftCalendarDate(row.date, 1)
  const done = row.status === 'Closed'
  return {
    id: `${row.doctype}:${row.name}`,
    source: TASKS,
    kind: 'task',
    title: row.description || __('Task'),
    date: row.date,
    start,
    end: wallToInstant(next, '00:00', timeZone),
    allDay: true,
    status: row.cancelled ? 'Cancelled' : done ? 'Done' : 'Scheduled',
    draggable: !done,
    canEdit: true,
    version: row.modified,
    task: row,
    referenceDoctype: row.reference_type || undefined,
    referenceName: row.reference_name ? String(row.reference_name) : undefined,
    referenceLabel: row.reference_label || undefined,
    timeZone,
    resourceIds: [],
    actions: [],
  }
}

export function taskRoute(event) {
  const row = event.task || {}
  return `/pendientes/${TASK_SLUGS[row.doctype] || 'todo'}/${encodeURIComponent(String(row.name))}`
}

const PENDIENTES = 'doco.pendientes.api'
export async function queryTasks(range, timeZone, { done = true } = {}) {
  const args = {
    date_from: range.startDate,
    date_to: shiftCalendarDate(range.endDate, -1),
    page_length: 100,
  }
  const [open, closed] = await Promise.all([
    call(`${PENDIENTES}.queue`, { ...args, segment: 'mine' }),
    done
      ? call(`${PENDIENTES}.queue`, { ...args, segment: 'done' }).catch(() => ({
          rows: [],
        }))
      : Promise.resolve({ rows: [] }),
  ])
  const rows = []
  for (const section of Object.values(open?.sections || {}))
    rows.push(...(section.rows || []))
  rows.push(...(closed?.rows || []).filter((row) => row.mine !== false))
  const seen = new Set()
  return rows
    .filter(
      (row) =>
        row.date && row.date >= args.date_from && row.date <= args.date_to,
    )
    .filter((row) => {
      const id = `${row.doctype}:${row.name}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((row) => taskToEvent(row, timeZone))
}

export const tasksAvailable = () =>
  call(`${PENDIENTES}.bootstrap`)
    .then((data) => Boolean(data?.enabled))
    .catch(() => false)

export const completeTask = (event) =>
  call(`${PENDIENTES}.complete`, {
    doctype: event.task.doctype,
    name: event.task.name,
    modified: event.task.modified,
    request_id: requestId(),
  })
export const reopenTask = (event) =>
  call(`${PENDIENTES}.reopen`, {
    doctype: event.task.doctype,
    name: event.task.name,
    modified: event.task.modified,
    request_id: requestId(),
  })
export const rescheduleTask = (event, date) =>
  call(`${PENDIENTES}.reschedule`, {
    doctype: event.task.doctype,
    name: event.task.name,
    modified: event.task.modified,
    date,
    request_id: requestId(),
  })
export const createTask = ({ title, date, reference }) =>
  call(`${PENDIENTES}.create`, {
    description: title,
    date,
    request_id: requestId(),
    priority: 'Medium',
    reference_type: reference?.doctype || null,
    reference_name: reference?.name || null,
  })

// --- sync: Google Calendar and the subscription link ---------------------------------------
const SYNC = 'doco.agenda.sync'
export const syncStatus = () => call(`${SYNC}.status`)
export const connectGoogle = () => call(`${SYNC}.connect_google`)
export const disconnectGoogle = () => call(`${SYNC}.disconnect_google`)
export const syncGoogle = () => call(`${SYNC}.sync_google`)
export const icsSubscription = (rotate = 0) =>
  call('doco.agenda.ics.subscription', { rotate })
export const GOOGLE_RETURN_KEY = 'muelle_agenda_google_return'

// --- range cache: a range seen once draws at once, then refreshes quietly ---------------
export function createRangeCache(limit = 24) {
  const entries = new Map()
  return {
    key: (source, range) => `${source}|${range.start}|${range.end}`,
    get(key) {
      return entries.get(key)
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, { value, at: Date.now() })
      while (entries.size > limit) entries.delete(entries.keys().next().value)
    },
    clear() {
      entries.clear()
    },
  }
}

/** A link anyone signed in can open to land on this event (or view and date). */
export function shareLink(state, event) {
  const url = new URL('/crm/agenda', window.location.origin)
  url.searchParams.set('view', state.view)
  url.searchParams.set('date', state.date)
  if (event) url.searchParams.set('event', eventKey(event))
  return url.toString()
}

/**
 * «Agendar» from any record: opens the Agenda's new-event form with the record linked,
 * the person invited (a Contact or coworker) and a way back to the record.
 */
export function agendaCreateRoute({
  reference,
  attendee,
  title,
  returnTo,
  returnLabel,
} = {}) {
  const query = new URLSearchParams({ view: 'week', create: '1' })
  if (reference?.doctype && reference?.name) {
    query.set('ref_doctype', reference.doctype)
    query.set('ref_name', String(reference.name))
    if (reference.label)
      query.set('ref_label', String(reference.label).slice(0, 140))
  }
  if (
    attendee &&
    ['Contact', 'User'].includes(attendee.doctype) &&
    attendee.name
  ) {
    query.set('attendee_doctype', attendee.doctype)
    query.set('attendee_name', String(attendee.name))
    if (attendee.label)
      query.set('attendee_label', String(attendee.label).slice(0, 140))
  }
  if (title) query.set('title', String(title).slice(0, 140))
  if (returnTo) query.set('return_to', returnTo)
  if (returnLabel) query.set('return_label', String(returnLabel).slice(0, 40))
  return `/agenda?${query.toString()}`
}
