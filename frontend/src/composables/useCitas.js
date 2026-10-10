// Citas en línea inside Agenda: the cita panel actions, staff bookings («Cita con cliente»)
// and the owner's settings, over doco.citas.api. Every call returns data or { constraints }.
import { call } from 'frappe-ui'
import { safeReturn } from '@/composables/useAgenda'

export const CITAS_API = 'doco.citas.api'
// Pseudo calendar: the Event rows that are citas (kind "cita").
export const CITAS_CALENDAR = 'citas'
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export const citaOptions = () => call(`${CITAS_API}.options`)
export const bookCita = (payload) =>
  call(`${CITAS_API}.book`, { payload: JSON.stringify(payload) })
export const getCita = (name) => call(`${CITAS_API}.get`, { name })
export const citaSettings = () => call(`${CITAS_API}.settings_get`)
export const saveCitaSettings = (payload) =>
  call(`${CITAS_API}.settings_save`, { payload: JSON.stringify(payload) })
export const createCitaFlow = () => call(`${CITAS_API}.create_flow`)
export const citaMessageLink = (name, purpose) =>
  call(`${CITAS_API}.message_link`, { name, purpose })

const ACTIONS = { arrived: 'arrived', no_show: 'no_show', cancel: 'cancel' }
export function citaAction(cita, id) {
  const method = ACTIONS[id]
  if (!method) throw new Error(`unknown cita action ${id}`)
  return call(`${CITAS_API}.${method}`, {
    name: cita.name,
    version: String(cita.version),
  })
}

// Which calendars the query needs: «Citas» are Event rows, so it asks the Event source once.
export function querySourceKeys(calendars) {
  const keys = calendars.map((key) => (key === CITAS_CALENDAR ? 'Event' : key))
  return [...new Set(keys)]
}

// «My agenda» shows every Event row; «Citas» alone shows only the citas among them.
export function visibleFor(events, calendars) {
  return events.filter(
    (event) =>
      calendars.includes(event.source) ||
      (event.kind === 'cita' && calendars.includes(CITAS_CALENDAR)),
  )
}

// «Recibir equipo»: Taller Intake prefilled from the cita, back to this Agenda view after.
export function receiveUrl(cita, returnTo) {
  const back = safeReturn(returnTo) || '/crm/agenda?view=list&cal=citas'
  const url = new URL('/taller/intake', window.location.origin)
  url.searchParams.set('cita', cita.name)
  url.searchParams.set('return', back)
  return `${url.pathname}${url.search}`
}

// Taller's return: ?done=Appointment:<name>
export function doneCita(query) {
  const value = typeof query?.done === 'string' ? query.done : ''
  return value.startsWith('Appointment:') ? value.slice(12) : ''
}

export function slotsOn(days, date) {
  return days.find((day) => day.date === date)?.slots || []
}

export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : ''
}

// Settings rows: one per day the owner opens, «HH:MM» strings.
export function validHours(rows) {
  return (
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (row) =>
        WEEKDAYS.includes(row.day) &&
        /^\d{2}:\d{2}$/.test(row.from) &&
        /^\d{2}:\d{2}$/.test(row.to) &&
        row.from < row.to,
    )
  )
}
