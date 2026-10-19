// Automatizaciones nativas (Shell D12, SPEC §6 DD20): the shell's faces for
// Frappe Notification, Assignment Rule, Auto Repeat and Workflow. The calls go
// to `crm.api.automatizaciones` (Frappe permissions only); the rest is pure
// wording so the sheets stay thin and the unit test reads the rules.
import { call } from 'frappe-ui'
import { formatDate, parseServerDate } from '@/utils/display'

const SERVICE = 'crm.api.automatizaciones'

/** One automatizaciones endpoint; objects and arrays travel as JSON. */
export function autoApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** The worker's sentence for a failed call: the server's own reason, never a traceback. */
export function errorText(
  error,
  fallback = 'Revisa tu conexión e inténtalo de nuevo.',
) {
  const message = error?.messages?.[0] || error?.message || ''
  if (!message || /Traceback|Error \d{3}|^[A-Z][a-zA-Z]+Error/.test(message))
    return fallback
  return message
}

/** A choice chip, the FilterChips look (inside a 44px button). */
export function chipClass(on) {
  return [
    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
    on
      ? 'border-transparent bg-surface-gray-3 text-ink-gray-9'
      : 'border-outline-gray-2 text-ink-gray-7',
  ]
}

// ── Repetir (Auto Repeat) ────────────────────────────────────────────────

/** Frappe's Auto Repeat frequencies, as chips. `every` reads inside a sentence. */
export const FRECUENCIAS = Object.freeze([
  { value: 'Daily', label: 'Cada día', every: 'cada día' },
  { value: 'Weekly', label: 'Cada semana', every: 'cada semana' },
  { value: 'Fortnightly', label: 'Cada 15 días', every: 'cada 15 días' },
  { value: 'Monthly', label: 'Cada mes', every: 'cada mes' },
  { value: 'Quarterly', label: 'Cada 3 meses', every: 'cada 3 meses' },
  { value: 'Half-yearly', label: 'Cada 6 meses', every: 'cada 6 meses' },
  { value: 'Yearly', label: 'Cada año', every: 'cada año' },
])

export function frecuencia(value) {
  return FRECUENCIAS.find((f) => f.value === value) || null
}

export function frecuenciaLabel(value) {
  return frecuencia(value)?.label || ''
}

/** Today as the date input's value (local calendar day, never UTC). */
export function hoyISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** «el 1 nov» / «hoy» / «mañana», for a sentence. */
export function fechaEnFrase(value, { now = new Date() } = {}) {
  const text = formatDate(value, { now })
  if (!text) return ''
  return ['hoy', 'mañana', 'ayer'].includes(text) ? text : `el ${text}`
}

/**
 * The confirm sentence of «Repetir cada…»:
 * «Se creará una copia de esta factura cada mes desde el 1 nov, sin fin.»
 * `demostrativo` names the record («esta factura», «este pedido»).
 */
export function resumenRepeticion({
  demostrativo = 'este documento',
  frecuencia: value,
  inicio,
  fin = null,
  now = new Date(),
}) {
  const every = frecuencia(value)?.every
  if (!every) return ''
  const desde = inicio ? fechaEnFrase(inicio, { now }) : 'hoy'
  const hasta = fin ? `hasta ${fechaEnFrase(fin, { now })}` : 'sin fin'
  const start = desde === 'hoy' || desde === 'mañana' ? desde : `desde ${desde}`
  return `Se creará una copia de ${demostrativo} ${every} ${start}, ${hasta}.`
}

/** «esta factura» / «este pedido» from the server's «la factura» / «el pedido». */
export function demostrativo(articulo) {
  const text = String(articulo || '').trim()
  if (text.startsWith('la ')) return `esta ${text.slice(3)}`
  if (text.startsWith('el ')) return `este ${text.slice(3)}`
  return text ? `este ${text.replace(/^(un|una) /, '')}` : 'este documento'
}

/**
 * When the next copy comes: «la siguiente el 1 nov»; «atrasada desde el 1 sep»
 * when the date already passed (the scheduler did not run); the state when off.
 */
export function siguienteTexto(row, { now = new Date() } = {}) {
  if (!row) return ''
  if (!row.activo) return row.estado || 'Apagada'
  const next = parseServerDate(row.siguiente)
  if (!next) return ''
  const today = parseServerDate(hoyISO(now))
  return next < today
    ? `atrasada desde ${fechaEnFrase(row.siguiente, { now })}`
    : `la siguiente ${fechaEnFrase(row.siguiente, { now })}`
}

/** What the current repetition says on one line: «Cada mes · la siguiente el 1 nov · sin fin». */
export function lineaRepeticion(actual, { now = new Date() } = {}) {
  if (!actual) return ''
  const parts = [actual.frecuencia_texto || frecuenciaLabel(actual.frecuencia)]
  parts.push(siguienteTexto(actual, { now }))
  parts.push(
    actual.fin ? `hasta ${fechaEnFrase(actual.fin, { now })}` : 'sin fin',
  )
  return parts.filter(Boolean).join(' · ')
}

/** Why the dates can't be used yet ('' when they can). Mirrors the server's checks. */
export function fechasInvalidas({ inicio, fin = null, now = new Date() }) {
  const start = parseServerDate(inicio)
  if (!start) return 'Elige cuándo empieza.'
  const today = parseServerDate(hoyISO(now))
  if (start < today) return 'No puede empezar antes de hoy.'
  if (fin) {
    const end = parseServerDate(fin)
    if (!end) return 'Elige cuándo termina.'
    if (end <= start) return 'Debe terminar después de que empieza.'
    if (end.getTime() === today.getTime()) return 'No puede terminar hoy.'
  }
  return ''
}

// ── Avisos del sistema (Notification) ────────────────────────────────────

/** The steps of «Nuevo aviso», in order. */
export const PASOS_AVISO = Object.freeze([
  { key: 'documento', title: 'Documento' },
  { key: 'cuando', title: 'Cuándo' },
  { key: 'condicion', title: 'Condición' },
  { key: 'quien', title: 'A quién' },
  { key: 'canal', title: 'Por dónde' },
  { key: 'mensaje', title: 'Mensaje' },
  { key: 'confirmar', title: 'Confirmar' },
])

/** A field label inside a sentence: «Estado» → «estado»; acronyms stay («RFC»). */
export function minuscula(label) {
  const text = String(label || '')
  return text.length > 1 &&
    /[A-ZÁÉÍÓÚÑ]/.test(text[0]) &&
    /[a-záéíóúñ]/.test(text[1])
    ? text[0].toLowerCase() + text.slice(1)
    : text
}

/** The moment a notification fires, from the pickers (same words as the server). */
export function fraseEvento({
  evento,
  articulo = 'un documento',
  campo = '',
  dias = 0,
}) {
  const n = Number(dias) || 0
  const fecha = (label) => {
    const low = String(label || 'Fecha').toLowerCase()
    return low.startsWith('fecha') ? `la ${low}` : `la fecha «${label}»`
  }
  switch (evento) {
    case 'New':
      return `Al crear ${articulo}`
    case 'Submit':
      return `Al confirmar ${articulo}`
    case 'Cancel':
      return `Al cancelar ${articulo}`
    case 'Value Change':
      return `Cuando cambia ${campo ? minuscula(campo) : 'un campo'}`
    case 'Days Before':
    case 'Days After': {
      if (!n) return `El mismo día de ${fecha(campo)}`
      const lado = evento === 'Days Before' ? 'antes' : 'después'
      return `${n} ${n === 1 ? 'día' : 'días'} ${lado} de ${fecha(campo)}`
    }
    default:
      return ''
  }
}

/** «Estado es Vencida» for a simple field = value condition. */
export function fraseCondicion(campo, valor) {
  if (!campo?.label || valor === '' || valor == null) return ''
  let text = String(valor)
  if (campo.fieldtype === 'Check') text = Number(valor) ? 'sí' : 'no'
  else if (campo.options?.length)
    text = campo.options.find((o) => o.value === valor)?.label || text
  return `${campo.label} es ${text}`
}

/** «Y, o»-joined Spanish list: «Ana, Beto y Carla». */
export function listaY(items) {
  const list = (items || []).filter(Boolean).map(String)
  if (list.length < 2) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

/** Who receives, in words, from the «A quién» picks. */
export function fraseDestinatarios({
  roles = [],
  dueno = false,
  campo = null,
}) {
  const out = roles.map((r) => r.label || r.role || r)
  if (dueno) out.push('el dueño del documento')
  if (campo?.label) out.push(campo.label.toLowerCase())
  return listaY(out)
}

/** Why a step can't move on yet ('' when it can). */
export function pasoPendiente(step, datos = {}) {
  switch (step) {
    case 'documento':
      return datos.doctype ? '' : 'Elige un documento.'
    case 'cuando':
      if (!datos.evento) return 'Elige cuándo se manda.'
      if (
        ['Value Change', 'Days Before', 'Days After'].includes(datos.evento) &&
        !datos.campo
      )
        return datos.evento === 'Value Change'
          ? 'Elige qué campo cambia.'
          : 'Elige la fecha.'
      return ''
    case 'condicion':
      if (!datos.condicion) return ''
      if (!datos.condicion.campo) return 'Elige el campo de la condición.'
      return datos.condicion.valor === '' || datos.condicion.valor == null
        ? 'Escribe el valor de la condición.'
        : ''
    case 'quien': {
      const d = datos.destinatarios || {}
      return d.roles?.length || d.dueno || d.campo
        ? ''
        : 'Elige a quién le llega.'
    }
    case 'canal':
      return datos.canal ? '' : 'Elige por dónde llega.'
    case 'mensaje':
      if (!String(datos.asunto || '').trim()) return 'Escribe el título.'
      return String(datos.asunto).length > 140 ? 'El título es muy largo.' : ''
    default:
      return ''
  }
}

/** Insert «[Campo]» at the cursor; returns the new text and cursor. */
export function insertarCampo(text, cursor, label) {
  const value = String(text || '')
  const at = Math.min(Math.max(Number(cursor ?? value.length), 0), value.length)
  const before = value.slice(0, at)
  const after = value.slice(at)
  const pad = before && !/\s$/.test(before) ? ' ' : ''
  const token = `${pad}[${label}]`
  return { text: before + token + after, cursor: at + token.length }
}

/** The payload `crear_aviso` / `vista_previa` expect, from the sheet's state. */
export function datosAviso(state) {
  const d = state.destinatarios || {}
  return {
    doctype: state.doctype,
    evento: state.evento,
    campo: state.campo || undefined,
    dias: ['Days Before', 'Days After'].includes(state.evento)
      ? Number(state.dias) || 0
      : undefined,
    condicion: state.condicion?.campo
      ? { campo: state.condicion.campo.fieldname, valor: state.condicion.valor }
      : null,
    destinatarios: {
      roles: (d.roles || []).map((r) => r.role || r),
      dueno: d.dueno ? 1 : 0,
      campo: d.campo?.fieldname || undefined,
    },
    canal: state.canal,
    asunto: state.asunto,
    mensaje: state.mensaje,
  }
}

// ── Reglas de asignación (Assignment Rule) ──────────────────────────────

export const MODOS = Object.freeze([
  {
    value: 'Round Robin',
    label: 'Por turnos',
    hint: 'Uno a cada quien, en orden',
  },
  {
    value: 'Load Balancing',
    label: 'Al que tenga menos',
    hint: 'A quien tenga menos pendientes abiertos',
  },
  {
    value: 'Based on Field',
    label: 'Según un campo',
    hint: 'A la persona que diga el documento',
  },
])

/** «Las facturas cuando Estado es Vencida se reparten por turnos entre Ana y Beto». */
export function fraseRegla({
  plural = 'los documentos',
  modo,
  usuarios = [],
  condicion = '',
  campo = '',
}) {
  const sujeto = plural.charAt(0).toUpperCase() + plural.slice(1)
  const cuando = condicion ? ` cuando ${condicion}` : ''
  if (modo === 'Based on Field')
    return `${sujeto}${cuando} se asignan a la persona de «${campo || 'un campo'}»`
  const como =
    modo === 'Round Robin'
      ? 'por turnos'
      : modo === 'Load Balancing'
        ? 'al que tenga menos pendientes'
        : ''
  const quienes = listaY(usuarios)
  return `${sujeto}${cuando} se reparten ${como}${quienes ? ` entre ${quienes}` : ''}`
}

// ── Aprobaciones (Workflow) ───────────────────────────────────────────────

/** Button order on the record: the filled one first, then tonal, then danger. */
export function ordenAcciones(acciones = []) {
  const rank = { filled: 0, tonal: 1, danger: 2 }
  return [...acciones].sort((a, b) => (rank[a.tono] ?? 1) - (rank[b.tono] ?? 1))
}

/** The confirm sheet's copy for a workflow action. */
export function copiaTransicion(accion, titulo = '') {
  if (!accion) return null
  const sujeto = titulo ? `«${titulo}»` : 'El documento'
  return {
    title: `¿${accion.label}?`,
    message: accion.siguiente
      ? `${sujeto} quedará en «${accion.siguiente}».`
      : `${sujeto} cambia de estado.`,
    confirm: accion.label,
    tone: accion.tono === 'danger' ? 'danger' : 'primary',
  }
}
