import { comprasApi } from '@/composables/useCompras'
import { money } from '@/utils/numberFormat'
import { createModuleBoot } from '@/utils/moduleBoot'

// Equipo: the owner's and managers' team — who works today, vacation requests
// to decide, people without a turno, everyone. Native Employee, Leave
// Application, Leave Policy Assignment and Shift Assignment stay the records;
// Doco's services (equipo_team, ausencias, turnos, vacaciones_lft, puesto)
// own every read and write. Pure helpers live here so pages and tests share them.

export { outcomeUnknown, problemOf, requestId } from '@/composables/useCompras'

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const TEAM = 'doco.erp_experience.equipo_team'
export const PERSON = 'doco.erp_experience.equipo.get_person'
export const AUSENCIAS = 'doco.docoutils.hr.ausencias'
export const LFT = 'doco.docoutils.hr.vacaciones_lft'
// Translation context: short generic words stay Equipo-only in the catalog.
export const CTX = 'Equipo'

/** POST to a Doco team service; a refusal keeps the server's message and type. */
export function equipoApi(method, args = {}) {
  return comprasApi(method.includes('.') ? method : `${TEAM}.${method}`, args)
}

const equipoBootCache = createModuleBoot('equipo', () =>
  equipoApi('crm.api.equipo.get_capabilities'),
)
export const equipoBoot = equipoBootCache.boot
/** Equipo capability, kept like the shell boot (utils/moduleBoot.js). */
export const loadEquipoBoot = equipoBootCache.load

export const SEGMENTS = Object.freeze([
  { value: 'hoy', label: 'Working today', icon: 'sun', hr: true },
  { value: 'por-revisar', label: 'To review', icon: 'inbox', hr: true },
  { value: 'sin-horario', label: 'No schedule', icon: 'clock', hr: true },
  { value: 'todos', label: 'Everyone', icon: 'users', hr: false },
])
/** The queues this site has: without HRMS only «Todo el equipo». */
export function segmentsFor(hr) {
  return SEGMENTS.filter((s) => hr || !s.hr)
}
export function segmentLabel(value) {
  return tr(
    SEGMENTS.find((s) => s.value === value)?.label || 'Everyone',
    null,
    CTX,
  )
}
export function normalizeSegment(value, hr = true) {
  const allowed = segmentsFor(hr)
  return allowed.some((s) => s.value === value) ? value : allowed[0].value
}

// Asistencia's team board states (asistencia._team_rows).
const TODAY = {
  dentro: ['In', 'green'],
  retardo: ['Late', 'orange'],
  sin_entrada: ['Not in yet', 'red'],
  por_llegar: ['Expected', 'gray'],
  salio: ['Left', 'gray'],
  ausente: ['Away with leave', 'blue'],
}
export function todayLabel(status) {
  return TODAY[status] ? tr(TODAY[status][0], null, CTX) : status || ''
}
export function todayTheme(status) {
  return TODAY[status]?.[1] || 'gray'
}

// Turnos cells (turnos.build).
const WEEK = {
  trabaja: ['Works', 'green'],
  descansa: ['Day off', 'gray'],
  ausente: ['Away with leave', 'blue'],
  sin_confirmar: ['No schedule', 'orange'],
}
export function weekLabel(status) {
  return WEEK[status] ? tr(WEEK[status][0], null, CTX) : status || ''
}
export function weekTheme(status) {
  return WEEK[status]?.[1] || 'gray'
}

// Vacaciones de ley rows (vacaciones_lft._row).
const LFT_STATES = {
  ready: ['Ready', 'blue'],
  assigned: ['Assigned', 'green'],
  granted: ['Assigned', 'green'],
  manual: ['Assigned by hand', 'gray'],
  other_policy: ['Other policy', 'gray'],
  first_year: ['First year', 'gray'],
  no_joining_date: ['No start date', 'orange'],
  failed: ['Not accepted', 'red'],
}
export function lftLabel(status) {
  return LFT_STATES[status] ? tr(LFT_STATES[status][0], null, CTX) : status
}
export function lftTheme(status) {
  return LFT_STATES[status]?.[1] || 'gray'
}
/**
 * The companies Vacaciones de ley offers, and the one it opens on. ERPNext test
 * companies («_Test Company») are dropped; the default is the current pick if
 * still offered, else the first Mexican company (the law only applies there).
 */
export function vacationCompanies(companies = [], current = '') {
  const list = (companies || []).filter(
    (c) => !String(c?.company || '').startsWith('_'),
  )
  const pick = list.some((c) => c.company === current)
    ? current
    : (list.find((c) => c.mexico) || list[0])?.company || ''
  return { list, pick }
}
/** The people «Asignar» would grant: only rows the server marked ready. */
export function readyEmployees(rows) {
  return (rows || []).filter((r) => r.status === 'ready').map((r) => r.employee)
}

export function personRoute(employee, query = {}) {
  return { name: 'EquipoPersona', params: { employee }, query }
}

/** Short es-MX date from an ISO day, without a time zone shift. */
export function dayLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** «12 days left · until 14 Mar 2027» from the person's native balance. */
export function balanceLine(vacation) {
  const balance = vacation?.balance
  if (!balance) return ''
  return tr('{0} days left · until {1}', [
    Number(balance.days || 0),
    dayLabel(balance.to_date),
  ])
}

/** After deciding `name`, the next request of the queue to focus (or null). */
export function nextRequest(rows, name) {
  const list = rows || []
  const index = list.findIndex((r) => r.name === name)
  const rest = list.filter((r) => r.name !== name)
  if (!rest.length) return null
  return rest[Math.min(Math.max(index, 0), rest.length - 1)]
}

/** A decision the person page can make on a request row, from the server's actions. */
export function decisions(request) {
  const actions = request?.actions || []
  return ['approve', 'reject'].filter((a) => actions.includes(a))
}

/** The lift a refusal offers to someone limited to their own employee record, or null. */
export function liftAction(answer) {
  const action = (answer?.actions || []).find((a) => a.id === 'lift_own_limit')
  return action ? { label: action.label, employee: answer.employee } : null
}

export const PRENOMINA = 'doco.erp_experience.prenomina.get_period'
// The pay periods doco's prenomina.PERIODS knows, by their Spanish address word.
const PERIOD_WORDS = Object.freeze({ week: 'semana', fortnight: 'quincena' })
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** The period and first day a pre-nómina address asks for; the week by default. */
export function periodFromQuery(query = {}) {
  const period =
    Object.keys(PERIOD_WORDS).find((k) => PERIOD_WORDS[k] === query.periodo) ||
    'week'
  const start = ISO_DAY.test(query.desde || '') ? query.desde : null
  return { period, start }
}

/** The address query for a period, without the default week. */
export function periodQuery(period, start) {
  const query = period === 'week' ? {} : { periodo: PERIOD_WORDS[period] }
  return start ? { ...query, desde: start } : query
}

/** «19 oct 2026 – 25 oct 2026» for a period from the server. */
export function periodRange(period) {
  if (!period?.start) return ''
  return `${dayLabel(period.start)} – ${dayLabel(period.end)}`
}

/** A day count, or a dash when the reader cannot see its source. */
export function daysText(days) {
  return days === null || days === undefined ? '—' : String(Number(days))
}

/** Open advances per currency with their count; a dash when unreadable. */
export function advancesText(advances, format = money) {
  if (!advances) return '—'
  if (!advances.length) return '0'
  return advances
    .map((a) => `${format(a.pending, a.currency)} (${a.count})`)
    .join(' · ')
}

// One load of Doco's shared Equipo sheet (alta, puesto, one-day turno) per page.
let sheetPending = null
export function loadSheet() {
  if (window.muelleEquipo) return Promise.resolve(window.muelleEquipo)
  sheetPending ??= (async () => {
    const { url } = await comprasApi('doco.erp_experience.equipo.sheet_asset')
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('equipo sheet'))
      document.head.appendChild(script)
    })
    if (!window.muelleEquipo) throw new Error('equipo sheet')
    return window.muelleEquipo
  })().finally(() => {
    sheetPending = null
  })
  return sheetPending
}
