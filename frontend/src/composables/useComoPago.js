// «¿Cómo pagas a tu equipo?» (/crm/equipo/como-pago): the one-time pay setup
// over doco.nomina (ajustes_get / ajustes_preview / ajustes_apply). Doco owns
// the stored answers, their checks and what saving wires; this module holds the
// pure rules the page paints: which question shows for which answer, what a
// level card switches, what is still missing before «Guardar». The level is
// never stored: each card only sets switches, and the level shown is read back
// from them.

const API = 'doco.nomina.api'
export const AJUSTES_GET = `${API}.ajustes_get`
export const AJUSTES_PREVIEW = `${API}.ajustes_preview`
export const AJUSTES_APPLY = `${API}.ajustes_apply`
export const COMO_PAGO_ROUTE = { name: 'EquipoComoPago' }

// Stored option values (doco.nomina.constants); labels come from the server.
export const SEMANAL = 'Semanal'
export const QUINCENAL = 'Quincenal'
export const MENSUAL = 'Mensual'
export const YO = 'Yo desde Muelle'

export const SOLO = 'solo'
export const CALCULA = 'calcula'
export const TODO = 'todo'

export const LEVELS = Object.freeze([
  {
    value: SOLO,
    title: 'Solo anoto lo que pago',
    detail:
      'Anotas cuánto le diste a cada quien y de dónde salió. Sin sueldos ni cálculos.',
  },
  {
    value: CALCULA,
    title: 'Muelle me dice cuánto le toca',
    detail:
      'Con lo que gana cada quien y sus días, Prenómina te dice cuánto le toca y cuánto le falta.',
  },
  {
    value: TODO,
    title: 'Muelle lleva todo',
    detail:
      'Además, lo que pide la ley. Cada pieza queda marcada para que la revises antes de guardar.',
  },
])

// The money sources, in chip order (doco.nomina.constants.ORIGENES).
export const ORIGEN_FIELDS = Object.freeze([
  'origen_caja',
  'origen_caja_fuerte',
  'origen_dueno',
  'origen_transferencia',
])

// Switches that only mean something while Muelle calculates.
export const CALC_SWITCHES = Object.freeze([
  'paga_descanso',
  'horas_extra',
  'descontar_faltas',
  'prestamos',
])

// «Muelle lleva todo» ticks each of these for review, only where its
// prerequisite holds on this site (the `show` flags ajustes_get returns).
export const TODO_SWITCHES = Object.freeze([
  { field: 'aguinaldo', when: (show) => show.mx },
  { field: 'prima_vacacional', when: (show) => show.mx },
  { field: 'ptu', when: (show) => show.mx },
  { field: 'finiquito', when: (show) => show.mx },
  { field: 'retenciones', when: (show) => show.mx && show.retenciones },
  { field: 'recibos', when: (show) => show.recibos },
  { field: 'cfdi_nomina', when: (show) => show.cfdi_nomina },
])

const on = (value) => Boolean(Number(value) || value === true)

/** The level the stored switches read as; null before the first save. */
export function levelOf(values = {}, configured = true) {
  if (!configured) return null
  if (TODO_SWITCHES.some(({ field }) => on(values[field]))) return TODO
  return on(values.calcular) ? CALCULA : SOLO
}

/** The answers after tapping a level card: only switches change. */
export function pickLevel(values, level, show = {}) {
  const next = { ...values }
  const todo = level === TODO
  next.calcular = level === SOLO ? 0 : 1
  if (level === SOLO) for (const field of CALC_SWITCHES) next[field] = 0
  for (const { field, when } of TODO_SWITCHES)
    next[field] = todo && when(show) ? 1 : 0
  return next
}

/** Which questions show for these answers on this site. */
export function visibleQuestions(values = {}, show = {}) {
  const calcular = on(values.calcular)
  const entrega = Boolean(show.quien_entrega)
  const mx = Boolean(show.mx)
  return {
    dia_pago: values.frecuencia === SEMANAL,
    origen_caja: Boolean(show.caja) || on(values.origen_caja),
    // doco also accepts a back-office cash account the chart names, so
    // that account alone is enough to offer the chip.
    origen_caja_fuerte:
      Boolean(show.caja_fuerte) ||
      on(values.origen_caja_fuerte) ||
      Boolean(values.cuenta_caja_fuerte),
    quien_entrega: entrega,
    cajero_ve_montos: entrega && values.quien_entrega !== YO,
    calcula: calcular,
    dias_mes:
      calcular &&
      (values.frecuencia === QUINCENAL || values.frecuencia === MENSUAL),
    prestamos: calcular && Boolean(show.prestamos),
    cuota_default: calcular && Boolean(show.prestamos) && on(values.prestamos),
    ley: mx || Boolean(show.recibos),
    aguinaldo: mx,
    aguinaldo_dias: mx && on(values.aguinaldo),
    prima_vacacional: mx && calcular,
    prima_pct: mx && calcular && on(values.prima_vacacional),
    ptu: mx,
    finiquito: mx,
    retenciones: mx && Boolean(show.retenciones),
    recibos: Boolean(show.recibos),
    cfdi_nomina: Boolean(show.cfdi_nomina) && on(values.recibos),
    crear_aportacion:
      on(values.origen_dueno) && !values.cuenta_aportacion_dueno,
  }
}

/** The answers after one question changes. Turning receipts off also turns
 *  off stamping them: doco refuses `cfdi_nomina` without `recibos`, and its
 *  switch hides with the receipts. */
export function withAnswer(values, field, value) {
  const next = { ...values, [field]: value }
  if (field === 'recibos' && !on(value)) next.cfdi_nomina = 0
  return next
}

/** What the owner still has to answer before «Guardar», in order. `weekdays`
 *  are the server's weekly pay days: a fortnight's or a month's stored day
 *  («15 y fin de mes», «Último día») does not answer «qué día» for a week. */
export function missingAnswers(values = {}, level = null, weekdays = []) {
  const out = []
  if (!level)
    out.push({
      key: 'nivel',
      message: 'Elige cuánto quieres que lleve Muelle.',
    })
  if (!values.frecuencia)
    out.push({ key: 'frecuencia', message: 'Elige cada cuándo pagas.' })
  else if (
    values.frecuencia === SEMANAL &&
    (!values.dia_pago ||
      (weekdays.length > 0 && !weekdays.includes(values.dia_pago)))
  )
    out.push({ key: 'dia_pago', message: 'Elige qué día pagas.' })
  if (!ORIGEN_FIELDS.some((field) => on(values[field])))
    out.push({ key: 'origen', message: 'Elige de dónde sale el dinero.' })
  return out
}

/** The origin chips this site offers, from the server's options. */
export function origenOptions(options = {}, values = {}, show = {}) {
  const visible = visibleQuestions(values, show)
  return (options.origenes || []).filter((o) => visible[o.field] !== false)
}

/** The origin fields that are on, as the chip group's array of fields. */
export function origenesOn(values = {}) {
  return ORIGEN_FIELDS.filter((field) => on(values[field]))
}

/** The answers with exactly these origin fields on. */
export function setOrigenes(values, fields = []) {
  const next = { ...values }
  for (const field of ORIGEN_FIELDS)
    next[field] = fields.includes(field) ? 1 : 0
  return next
}

/** What ajustes_preview / ajustes_apply receive: the answers and the explicit
 *  «Crear Aportaciones del dueño» tick (never implied). */
export function payloadOf(values = {}, crearAportacion = false) {
  const visible = visibleQuestions(values, {})
  return {
    ...values,
    crear_aportacion_dueno: crearAportacion && visible.crear_aportacion ? 1 : 0,
  }
}

/**
 * Prenómina's door to the setup, or null. It shows only where doco answers
 * ajustes_get with `available` (the dark default: a site without the setup,
 * or a refusal, keeps Prenómina as it was) and to whom may save it: the
 * first-run card before the first save, a quiet link after it.
 */
export function prenominaDoor(answer) {
  if (!answer?.available || !answer.can_edit) return null
  return answer.configured ? 'link' : 'card'
}

/** A stable key for «did the answers change since the last preview». */
export function answersKey(values = {}, crearAportacion = false) {
  const payload = payloadOf(values, crearAportacion)
  return JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((key) => [key, payload[key] ?? null]),
  )
}
