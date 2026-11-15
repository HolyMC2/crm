// Citas en línea inside Agenda: the cita panel actions, staff bookings («Cita con cliente»)
// and the owner's settings, over doco.citas.api. Every call returns data or { constraints }.
import { call } from 'frappe-ui'
import { LOCALE } from '@/utils/display'
import { safeReturn } from '@/composables/useAgenda'
import { withReturn } from '@/vendor/muelle-shell/contracts'

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

// Setup problems (doco.citas.service.PROBLEMS) → the gate's button and the settings
// fieldset it opens. A code outside this map (not_installed) has nothing to open.
export const SETUP_SECTIONS = Object.freeze({
  hours: { label: 'Set your hours', section: 'hours' },
  rest_days: { label: 'Choose your rest days', section: 'rest_days' },
  scheduling: { label: 'Turn on online appointments', section: 'scheduling' },
  services: { label: 'Publish services', section: 'services' },
})
// «Pedir configuración»: the claims setup request, so the administrators get one ToDo.
export const SETUP_REQUEST = Object.freeze({
  key: 'request_setup',
  what: 'citas',
  label: 'Ask for it to be set up',
})
/** «Ana», «Ana y Beto», «Ana, Beto y Carla» in the person's language. */
export function namesList(names, locale) {
  const lang =
    locale || globalThis.document?.documentElement?.lang || LOCALE || 'es-MX'
  try {
    return new Intl.ListFormat(lang, {
      style: 'long',
      type: 'conjunction',
    }).format(names)
  } catch {
    return names.join(', ')
  }
}
export function setupGuard(fixers, locale) {
  const names = (fixers || []).filter(Boolean)
  return {
    code: 'setup',
    // One person «puede»; several «pueden» (a context of its own in es.po).
    message:
      names.length > 1
        ? __('{0} can set this up.', [namesList(names, locale)], 'several')
        : names.length
          ? __('{0} can set this up.', [names[0]])
          : __('An administrator can set this up.'),
    actions: [{ ...SETUP_REQUEST, label: __(SETUP_REQUEST.label) }],
  }
}

export const citaOptions = () => call(`${CITAS_API}.options`)
export const citaServices = (group = '') =>
  call(`${CITAS_API}.services_get`, group ? { group } : {})
export const saveCitaServices = (payload) =>
  call(`${CITAS_API}.services_save`, { payload: JSON.stringify(payload) })
export const bookCita = (payload) =>
  call(`${CITAS_API}.book`, { payload: JSON.stringify(payload) })
export const getCita = (name) => call(`${CITAS_API}.get`, { name })
export const citaSettings = () => call(`${CITAS_API}.settings_get`)
export const saveCitaSettings = (payload) =>
  call(`${CITAS_API}.settings_save`, { payload: JSON.stringify(payload) })
export const createCitaFlow = () => call(`${CITAS_API}.create_flow`)
// F15b: the weekly days the shop is closed → one list of rest days (doco citas.api).
export const saveRestDays = (days) =>
  call(`${CITAS_API}.rest_days_save`, { payload: JSON.stringify({ days }) })
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
  return withReturn(`/taller/intake?cita=${encodeURIComponent(cita.name)}`, {
    to: back,
  })
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
