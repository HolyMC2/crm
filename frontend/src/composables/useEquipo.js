import { shallowRef } from 'vue'
import { comprasApi } from '@/composables/useCompras'
import { money } from '@/utils/numberFormat'
import { createModuleBoot } from '@/utils/moduleBoot'

// Equipo: the owner's and managers' team — who works today, vacation requests
// to decide, people without a turno, everyone. Native Employee, Leave
// Application, Leave Policy Assignment and Shift Assignment stay the records;
// Doco's services (equipo_team, ausencias, turnos, vacaciones_lft, puesto)
// own every read and write. Pure helpers live here so pages and tests share them.

export { outcomeUnknown, problemOf, requestId } from '@/composables/useCompras'

// «¿Cómo pagas a tu equipo?» door on Prenómina. The setup page's own rules stay in
// useComoPago; these live here because Prenómina and that page both already load
// this module, so no new module is shared between the two lazy chunks.
export const AJUSTES_GET = 'doco.nomina.api.ajustes_get'
export const COMO_PAGO_ROUTE = { name: 'EquipoComoPago' }

/**
 * What Prenómina shows for the pay setup: null when the site has no setup or the
 * user may not save it, a first-run card before the first save, a quiet link after it.
 */
export function prenominaDoor(answer) {
  if (!answer?.available || !answer.can_edit) return null
  return answer.configured ? 'link' : 'card'
}

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

/** Worked hours from the registro de jornada; a dash when unreadable. */
export function hoursText(hours) {
  if (!hours) return '—'
  return `${Number(Number(hours.worked || 0).toFixed(2))} h`
}

/** Overtime by the company's work-hour rules: «Dobles ×2: 9 h» per tier with hours. */
export function overtimeLines(hours) {
  return (hours?.tiers || [])
    .filter((tier) => Number(tier.hours) > 0)
    .map(
      (tier) =>
        `${tier.label} ×${Number(tier.multiplier)}: ${Number(Number(tier.hours).toFixed(2))} h`,
    )
}

/** Open advances per currency with their count; a dash when unreadable. */
export function advancesText(advances, format = money) {
  if (!advances) return '—'
  if (!advances.length) return '0'
  return advances
    .map((a) => `${format(a.pending, a.currency)} (${a.count})`)
    .join(' · ')
}

// «Ya se le dio» and «Le toca / Le falta» on Prenómina. doco adds `pagado` and
// `pagos` (Pago a Persona) only for a company with a pay setup, and `le_toca` /
// `le_falta` only when that setup calculates; without them the page is the
// read-only summary it always was.

/** True when the period read carries what each person was already given. */
export function paidShown(answer) {
  if (!answer) return false
  if (answer.totals && answer.totals.pagado !== undefined) return true
  return (answer.rows || []).some((row) => row.pagado !== undefined)
}

function isAmount(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** True when any row carries what it is owed («Le toca»). */
export function owedShown(answer) {
  return (answer?.rows || []).some((row) => isAmount(row.le_toca))
}

/** The row's «Le toca» or «Le falta» amount, or null when the payload has none. */
export function rowAmount(row, key) {
  return isAmount(row?.[key]) ? row[key] : null
}

/**
 * «Le falta» in words: the amount, «Nada» at zero, or what was given beyond
 * «Le toca». `tone` is the state it reads in: due, done or over.
 */
export function faltaText(value, format = money) {
  if (!isAmount(value)) return { text: '—', tone: null }
  if (value > 0) return { text: format(value), tone: 'due' }
  if (value === 0) return { text: tr('Nada', null, CTX), tone: 'done' }
  return {
    text: tr('Se le dio {0} de más', [format(-value)], CTX),
    tone: 'over',
  }
}

// «Pago a Persona» origins in the owner's words; an origin doco adds later
// shows as stored.
const ORIGEN_WORDS = Object.freeze({
  Caja: 'Caja',
  'Caja fuerte': 'Caja fuerte',
  'Lo pongo yo': 'Lo pusiste tú',
  Transferencia: 'Transferencia',
  'Sin efectivo': 'Sin efectivo',
})
export function origenLabel(origen) {
  return ORIGEN_WORDS[origen]
    ? tr(ORIGEN_WORDS[origen], null, CTX)
    : origen || ''
}
export function conceptoLabel(concepto) {
  return concepto ? tr(concepto, null, CTX) : ''
}

/** «mar 11 nov» from an ISO day, without a time zone shift. */
export function payDay(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .replace(/[.,]/g, '')
}

/** One payment under a person: «mar 11 nov · $500 · Caja». */
export function pagoLine(pago, format = money) {
  return [payDay(pago.fecha), format(pago.monto), origenLabel(pago.origen)]
    .filter(Boolean)
    .join(' · ')
}

// The concepts doco adds into `pagado` (doco nomina constants CONCEPTOS_PAGO).
// A loan or its discount is listed in `pagos` but is not pay; it stays out of
// «Ya se le dio» and shows under the period's payments with its concept.
const PAY_CONCEPTS = Object.freeze([
  'Sueldo',
  'A cuenta',
  'Bono o comisión',
  'Aguinaldo',
  'Prima vacacional',
  'PTU',
  'Finiquito',
])

/** The row's payments that make up its «Ya se le dio». */
export function paidPagos(row) {
  return (row?.pagos || []).filter((pago) =>
    PAY_CONCEPTS.includes(pago.concepto),
  )
}

/**
 * «Pagos de la semana»: every person's payments in one list, oldest first, each
 * with the person's name.
 */
export function periodPayments(rows) {
  const list = []
  for (const row of rows || []) {
    for (const pago of row.pagos || []) {
      list.push({
        ...pago,
        employee: row.employee,
        employee_name: row.employee_name,
      })
    }
  }
  return list.sort((a, b) =>
    String(a.fecha || '').localeCompare(String(b.fecha || '')),
  )
}

const PAYMENTS_TITLE = Object.freeze({
  week: 'Pagos de la semana',
  fortnight: 'Pagos de la quincena',
  month: 'Pagos del mes',
})
/** The list's heading for the period kind the server answered. */
export function paymentsTitle(kind) {
  return tr(PAYMENTS_TITLE[kind] || 'Pagos del periodo', null, CTX)
}

/** The period's totals for the money line: given, and owed and missing when present. */
export function payTotals(answer) {
  const totals = answer?.totals || {}
  const rows = answer?.rows || []
  const owed = owedShown(answer)
  const sum = (key) =>
    rows.reduce((acc, row) => acc + (rowAmount(row, key) || 0), 0)
  return {
    pagado: Number(totals.pagado || 0),
    pagos: rows.reduce((acc, row) => acc + paidPagos(row).length, 0),
    le_toca: owed
      ? isAmount(totals.le_toca)
        ? totals.le_toca
        : sum('le_toca')
      : null,
    le_falta: owed
      ? isAmount(totals.le_falta)
        ? totals.le_falta
        : rows.reduce(
            (acc, row) => acc + Math.max(rowAmount(row, 'le_falta') || 0, 0),
            0,
          )
      : null,
  }
}

// Aguinaldo (doco.nomina aguinaldo preview / apply). The card lives on Prenómina
// only in its season and only when doco answers the preview; a site without
// doco.nomina, a non-Mexican company or a refused read leaves it null, and
// outside the season nothing is even asked.
export const AGUINALDO_PREVIEW = 'doco.nomina.api.aguinaldo_preview'
export const AGUINALDO_APPLY = 'doco.nomina.api.aguinaldo_apply'
// LFT 87: the card opens on 15 Nov and closes after the 20 Dec deadline.
const AGUINALDO_FROM = [11, 15]
const AGUINALDO_UNTIL = [12, 20]

/** True from 15 Nov to 20 Dec (both included) on the device's calendar day. */
export function aguinaldoSeason(today = new Date()) {
  const md = [today.getMonth() + 1, today.getDate()]
  const after = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])
  return after(md, AGUINALDO_FROM) && after(AGUINALDO_UNTIL, md)
}

/**
 * What the card shows for a preview answer: null (nothing), `offer` for a
 * Mexican company with the switch off and someone who may turn it on, or
 * `summary` with the year's people, amount and what is missing.
 */
export function aguinaldoCard(preview, { canEdit = false } = {}) {
  if (!preview || typeof preview !== 'object') return null
  if (preview.on === false)
    return preview.mexico === true && canEdit ? { kind: 'offer' } : null
  if (preview.on !== true || !Array.isArray(preview.filas)) return null
  const totales = preview.totales || {}
  // Paid / for the register / still due arrive with doco's «Dejar en la caja»;
  // without them the card shows the gross amount only.
  const owed = totales.falta !== undefined && totales.falta !== null
  return {
    kind: 'summary',
    year: preview.year,
    personas: Number(totales.personas ?? preview.filas.length),
    conMonto: Number(totales.con_monto || 0),
    faltanDatos: Number(totales.faltan_datos || 0),
    importe: Number(totales.importe || 0),
    fechaLimite: preview.fecha_limite || null,
    falta: owed ? Number(totales.falta || 0) : null,
    faltaPersonas: owed
      ? preview.filas.filter((fila) => Number(fila?.falta || 0) > 0).length
      : null,
    pagado: owed ? Number(totales.pagado || 0) : null,
    porEntregar: owed ? Number(totales.por_entregar || 0) : null,
  }
}

// doco aguinaldo faltante keys; the server sends its own label, these cover a
// row that arrives without one.
const AGUINALDO_FALTANTES = Object.freeze({
  sin_ingreso: 'Falta su fecha de ingreso',
  sin_sueldo: 'Escribe cuánto gana',
  sin_promedio: 'Escribe su salario diario',
  sin_baja: 'Falta la fecha de baja',
  sin_isr: 'No se pudo calcular el ISR',
})
/** A faltante in the owner's words: the server's label, else the known key's. */
export function aguinaldoFaltante(item) {
  if (item?.label) return item.label
  const words = AGUINALDO_FALTANTES[item?.key]
  return words ? tr(words, null, CTX) : tr('Falta un dato', null, CTX)
}

/** Why «Dejar listo para pagar» cannot run: doco's blocker messages. */
export function aguinaldoBlockers(preview) {
  if (!Array.isArray(preview?.blockers)) return []
  return preview.blockers
    .map((blocker) => blocker?.message)
    .filter((message) => typeof message === 'string' && message)
}

/**
 * «Dejar listo para pagar»: the owner, a payment index in doco, no blocker, and
 * someone still to leave at the register (`por_dejar`; `con_monto` from a doco
 * that does not count it).
 */
export function aguinaldoCanApply(preview, { canEdit = false } = {}) {
  const totales = preview?.totales || {}
  return Boolean(
    canEdit &&
      preview?.on === true &&
      preview.pago?.available === true &&
      aguinaldoBlockers(preview).length === 0 &&
      Number(totales.por_dejar ?? totales.con_monto ?? 0) > 0,
  )
}

/** True when apply wrote nothing because the preview changed since the review. */
export function aguinaldoStale(result) {
  return Boolean(result && (result.applied === false || result.stale === true))
}

/**
 * The receipt after «Dejar listo para pagar»: doco's words, else the rows it
 * wrote. Null for an answer that wrote nothing (a stale review).
 */
export function aguinaldoReceipt(result, preview, format = money) {
  if (aguinaldoStale(result)) return null
  if (typeof result?.message === 'string' && result.message)
    return result.message
  const totales = preview?.totales || {}
  const personas = Number(
    (Array.isArray(result?.filas) ? result.filas.length : null) ??
      result?.personas ??
      totales.por_dejar ??
      totales.con_monto ??
      totales.personas ??
      0,
  )
  const importe = Number(
    result?.total ??
      result?.importe ??
      totales.por_dejar_importe ??
      totales.importe ??
      0,
  )
  return personas === 1
    ? tr(
        'Quedó listo para pagar el aguinaldo de 1 persona por {0}.',
        [format(importe)],
        CTX,
      )
    : tr(
        'Quedó listo para pagar el aguinaldo de {0} personas por {1}.',
        [personas, format(importe)],
        CTX,
      )
}

/**
 * The way past a full plan in the alta (doco's sheet option `seatStep`): Mi
 * cuenta's seat step (components/cuenta/seatStep.js), loaded with the first
 * refusal that asks for it. `step` holds it for the page's SeatStepSheet.
 */
export function lazySeatStep(options) {
  const step = shallowRef(null)
  let pending = null
  async function offer(key) {
    pending ??= import('@/components/cuenta/seatStep')
      .then(({ createSeatStep }) => (step.value = createSeatStep(options)))
      .catch((error) => {
        pending = null
        throw error
      })
    return (await pending).offer(key)
  }
  return { step, offer, dispose: () => step.value?.dispose() }
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

// «Pagar lo que falta» (doco.nomina pagar preview / apply). Prenómina asks for the
// preview only for a company with a pay setup; doco answers `on: false` without
// one, and refuses someone who may not pay the team, so either way no button shows.
export const PAGAR_PREVIEW = 'doco.nomina.api.pagar_preview'
export const PAGAR_APPLY = 'doco.nomina.api.pagar_apply'
// The concepts that make up «Le toca» (doco nomina constants CONCEPTOS_LE_TOCA):
// only these count when the sheet warns about paying more than what is missing.
const LE_TOCA_CONCEPTS = Object.freeze([
  'Sueldo',
  'A cuenta',
  'Bono o comisión',
])
// The pay origins in the owner's words while paying; «Caja» from Muelle always
// leaves the money waiting at the register, never takes it out of a drawer.
const PAGAR_ORIGEN_WORDS = Object.freeze({
  Caja: 'Dejar para la caja',
  'Caja fuerte': 'Caja fuerte',
  'Lo pongo yo': 'Lo pongo yo',
  Transferencia: 'Transferencia',
})

/** The chip's words for an origin while paying; an origin doco adds later shows its label. */
export function pagarOrigenLabel(origen) {
  const value = origen?.value ?? origen
  if (PAGAR_ORIGEN_WORDS[value]) return tr(PAGAR_ORIGEN_WORDS[value], null, CTX)
  return origen?.label || value || ''
}

/**
 * True when the preview pays the period on screen. doco answers for the
 * company's pay calendar, so a week view of a fortnight payer (or a month view
 * of a weekly payer) gets another period back. No period given: no check.
 */
export function pagarSamePeriod(preview, period) {
  if (period == null) return true
  const periodo = preview?.periodo
  return Boolean(
    periodo?.inicio &&
      periodo.inicio === period.start &&
      periodo.fin === period.end,
  )
}

/**
 * True when Prenómina offers «Pagar lo que falta»: doco answered the preview
 * for the period on screen, the shop has Muelle calculate, and there is a
 * suggested line to pay.
 */
export function pagarShown(preview, period) {
  return Boolean(
    pagarSamePeriod(preview, period) &&
      preview?.on === true &&
      preview.calcular === true &&
      Array.isArray(preview.filas) &&
      Array.isArray(preview.lineas) &&
      preview.lineas.length > 0,
  )
}

/** True when a person's row offers its own «Pagar». */
export function pagarPersonaShown(preview, employee, period) {
  return (
    pagarShown(preview, period) &&
    preview.lineas.some((linea) => linea?.employee === employee)
  )
}

/** The bottom button's words: «Pagar lo que falta · $5,200 · 4 personas». */
export function pagarButtonLabel(preview, format = money) {
  const lineas = preview?.lineas || []
  const people = new Set(lineas.map((l) => l.employee)).size
  const total = lineas.reduce((acc, l) => acc + Number(l.monto || 0), 0)
  return people === 1
    ? tr('Pagar lo que falta · {0} · 1 persona', [format(total)], CTX)
    : tr(
        'Pagar lo que falta · {0} · {1} personas',
        [format(total), people],
        CTX,
      )
}

/** An amount the owner typed, in pesos with at most two decimals; null when it is not one. */
export function pagarMonto(text) {
  const clean = String(text ?? '')
    .replace(/[\s$,]/g, '')
    .trim()
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const value = Number(clean)
  return value > 0 ? value : null
}

let draftSeq = 0
function draftLine(fila, extra) {
  return {
    key: `l${++draftSeq}`,
    employee: fila.employee,
    nombre: fila.employee_name || fila.employee,
    incluir: true,
    monto: '',
    origen: null,
    concepto: null,
    cuenta: null,
    ...extra,
  }
}

/**
 * The editable lines of the sheet from doco's suggested ones: the whole team,
 * or one person when `employee` is given. Amounts are text, as typed.
 */
export function pagarDraft(preview, employee = null) {
  const filas = new Map((preview?.filas || []).map((f) => [f.employee, f]))
  return (preview?.lineas || [])
    .filter((linea) => filas.has(linea.employee))
    .filter((linea) => !employee || linea.employee === employee)
    .map((linea) =>
      draftLine(filas.get(linea.employee), {
        monto: String(linea.monto),
        origen: linea.origen,
        concepto: linea.concepto || preview.concepto || 'Sueldo',
      }),
    )
}

/**
 * «Repartir»: a second line for the same person right after `key`, empty, on
 * the next origin that can pay (the same one when it is the only one).
 */
export function pagarSplit(lines, key, preview) {
  const index = lines.findIndex((line) => line.key === key)
  if (index < 0) return lines
  const line = lines[index]
  const fila = (preview?.filas || []).find((f) => f.employee === line.employee)
  const usable = (preview?.origenes || []).filter((o) => o.available)
  const other = usable.find((o) => o.value !== line.origen) || usable[0]
  const next = draftLine(
    fila || { employee: line.employee, employee_name: line.nombre },
    {
      origen: other?.value || line.origen,
      concepto: line.concepto,
    },
  )
  return [...lines.slice(0, index + 1), next, ...lines.slice(index + 1)]
}

/** The lines without `key`; the last line of a person is never removed, only left out. */
export function pagarRemove(lines, key) {
  const line = lines.find((l) => l.key === key)
  if (!line) return lines
  const siblings = lines.filter((l) => l.employee === line.employee)
  return siblings.length > 1 ? lines.filter((l) => l.key !== key) : lines
}

/**
 * What apply would send, and why it cannot yet: each included line needs an
 * amount and an origin that can pay. `lineas` is doco's apply shape.
 */
export function pagarPlan(lines, preview) {
  const origenes = new Map((preview?.origenes || []).map((o) => [o.value, o]))
  const lineas = []
  const problemas = []
  for (const line of lines || []) {
    if (!line.incluir) continue
    const monto = pagarMonto(line.monto)
    if (monto === null) {
      problemas.push(tr('Escribe cuánto le das a {0}.', [line.nombre], CTX))
      continue
    }
    const origen = origenes.get(line.origen)
    if (!origen?.available) {
      problemas.push(
        tr('Elige de dónde sale el pago de {0}.', [line.nombre], CTX),
      )
      continue
    }
    const out = {
      employee: line.employee,
      monto,
      origen: line.origen,
      concepto: line.concepto || preview?.concepto || 'Sueldo',
    }
    if (line.origen === 'Transferencia' && line.cuenta) out.cuenta = line.cuenta
    lineas.push(out)
  }
  if (!lineas.length && !problemas.length)
    problemas.push(tr('Elige a quién le pagas.', null, CTX))
  return { lineas, problemas }
}

function cents(value) {
  return Math.round(Number(value || 0) * 100)
}

/**
 * The review of a plan: total, people, the amount per origin in chip order, and
 * each person paid past what is missing (pay concepts only, like doco's `de_mas`).
 */
export function pagarResumen(lineas, preview) {
  const filas = new Map((preview?.filas || []).map((f) => [f.employee, f]))
  const porOrigen = new Map()
  const porPersona = new Map()
  let total = 0
  for (const linea of lineas || []) {
    total += cents(linea.monto)
    porOrigen.set(
      linea.origen,
      (porOrigen.get(linea.origen) || 0) + cents(linea.monto),
    )
    if (LE_TOCA_CONCEPTS.includes(linea.concepto))
      porPersona.set(
        linea.employee,
        (porPersona.get(linea.employee) || 0) + cents(linea.monto),
      )
  }
  const order = (preview?.origenes || []).map((o) => o.value)
  const deMas = []
  for (const [employee, paid] of porPersona) {
    const fila = filas.get(employee)
    if (!fila || fila.sugerido === null || fila.sugerido === undefined) continue
    const excess = paid - cents(fila.sugerido)
    if (excess > 0)
      deMas.push({
        employee,
        nombre: fila.employee_name || employee,
        monto: excess / 100,
      })
  }
  return {
    total: total / 100,
    personas: new Set((lineas || []).map((l) => l.employee)).size,
    porOrigen: [...porOrigen.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([origen, value]) => ({
        origen,
        label: pagarOrigenLabel(origen),
        monto: value / 100,
      })),
    deMas,
  }
}

/** True when apply wrote nothing because the preview changed since the review. */
export function pagarStale(result) {
  return Boolean(result && (result.applied === false || result.stale === true))
}

/**
 * The receipt after paying: doco's words, the rows booked as paid and the ones
 * left for the register. Null for a stale answer, which wrote nothing.
 */
export function pagarReceipt(result, format = money) {
  if (!result || pagarStale(result)) return null
  const filas = Array.isArray(result.filas) ? result.filas : []
  const pagados = filas.filter((f) => f.estado === 'Pagado')
  const porEntregar = filas.filter((f) => f.estado === 'Por entregar')
  let message = typeof result.message === 'string' ? result.message : ''
  if (!message) {
    const parts = []
    if (pagados.length)
      parts.push(tr('Pagaste {0}.', [format(Number(result.pagado || 0))], CTX))
    if (porEntregar.length)
      parts.push(
        tr(
          'Quedan {0} por entregar en la caja.',
          [format(Number(result.por_entregar || 0))],
          CTX,
        ),
      )
    message = parts.join(' ')
  }
  return {
    message,
    replay: Boolean(result.replay),
    pagados,
    porEntregar,
    deMas: Array.isArray(result.de_mas) ? result.de_mas : [],
  }
}

/**
 * The company's bank accounts for «Transferencia», by their name in the chart;
 * an empty list when the reader cannot see them, so the setup's bank stays.
 */
export async function pagarBancos(company) {
  if (!company) return []
  try {
    const rows = await equipoApi('frappe.client.get_list', {
      doctype: 'Account',
      filters: { company, account_type: 'Bank', is_group: 0, disabled: 0 },
      fields: ['name', 'account_name'],
      order_by: 'account_name asc',
      limit_page_length: 50,
    })
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      value: row.name,
      label: row.account_name || row.name,
    }))
  } catch {
    return []
  }
}

// «Tienda» on a person (doco get_person `tiendas`: the owner's view, only on a
// tenant with shops): the shops they work in and at what level. A shop grant is
// what lets them read its stock and prices; the level decides how much of the
// shop they run, within what their puesto allows.
export const SHOP_ACCESS = 'doco.erp_experience.equipo.set_shop_access'
// The levels handed out from here. A grant made at another level elsewhere
// still reads in words and keeps it until the owner picks one of these.
export const SHOP_LEVELS = Object.freeze(['User', 'Shop Manager'])

/** A shop level in the owner's words; a level doco adds later shows as sent. */
export function shopLevelLabel(level) {
  if (level === 'User') return tr('Sells and charges', null, CTX)
  if (level === 'Shop Manager') return tr('Runs the shop', null, CTX)
  if (level === 'Region Manager') return tr('Runs the region', null, CTX)
  return level || ''
}

/** What a level opens, under its name in the sheet. */
export function shopLevelHint(level) {
  if (level === 'User')
    return tr('Sees the shop’s stock and prices.', null, CTX)
  if (level === 'Shop Manager')
    return tr('Also runs the shop, as far as their puesto allows.', null, CTX)
  if (level === 'Region Manager')
    return tr('Runs the shops of their region.', null, CTX)
  return ''
}

/** The grants that are on, the default shop first. */
export function shopGrants(tiendas) {
  return (tiendas?.grants || [])
    .filter((grant) => grant.enabled)
    .sort(
      (a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)),
    )
}

/** One shop's grant (the one that is on, else any), or null. */
export function shopGrant(tiendas, shop) {
  if (!shop) return null
  const grants = (tiendas?.grants || []).filter((grant) => grant.shop === shop)
  return grants.find((grant) => grant.enabled) || grants[0] || null
}

/** The shop the sheet opens on: their default or first shop that can be chosen, else the only one. */
export function shopPreselect(tiendas) {
  const shops = tiendas?.shops || []
  const open = new Set(shops.map((shop) => shop.name))
  const first = shopGrants(tiendas).find((grant) => open.has(grant.shop))
  if (first) return first.shop
  return shops.length === 1 ? shops[0].name : ''
}

/** The level offered first for a shop: a grant's that is on (or one handed out here), else «Vende y cobra». */
export function shopLevelFor(tiendas, shop) {
  const grant = shopGrant(tiendas, shop)
  if (grant && (grant.enabled || SHOP_LEVELS.includes(grant.level)))
    return grant.level || 'User'
  return 'User'
}

/** Territory-wide grants that are on (a region manager sees every shop of the region). */
export function shopRegions(tiendas) {
  return (tiendas?.regions || []).filter((region) => region.enabled)
}

/** The levels to pick from: the two handed out here, plus a grant's other one. */
export function shopLevelChoices(current) {
  return !current || SHOP_LEVELS.includes(current)
    ? [...SHOP_LEVELS]
    : [...SHOP_LEVELS, current]
}

/** Whether saving changes anything: a shop that is off, or another level. */
export function shopChanged(tiendas, shop, level) {
  const grant = shopGrant(tiendas, shop)
  return !grant?.enabled || grant.level !== level
}
