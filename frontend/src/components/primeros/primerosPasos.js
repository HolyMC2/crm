// «Primeros pasos» on Hoy: the owner's first-hour steps finish in Muelle instead
// of the Desk wizard. Abordo owns the steps and their writes; these are its
// endpoints (the wizard's own setters behind them) and the pure helpers the
// sheets share. A step's row opens one of Hoy's sheets (`/crm/hoy?paso=<key>`)
// or a page of the shell; the server decides which.
import { call } from 'frappe-ui'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace, 'Primeros pasos')
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

const PASOS = 'abordo.primeros_pasos'
/** Hoy's own sheets, as `?paso=` names them (abordo pasos.HOJAS). */
export const HOJAS = Object.freeze(['negocio', 'producto', 'invitar', 'todos'])

/** The sheet a query asks for (`?paso=negocio`), or ''. */
export function hojaOf(value) {
  return typeof value === 'string' && HOJAS.includes(value) ? value : ''
}

// ── Datos de tu negocio ─────────────────────────────────────────────────────

export const NEGOCIO_FIELDS = Object.freeze([
  'telefono',
  'correo',
  'calle',
  'colonia',
  'ciudad',
  'estado',
  'cp',
  'rfc',
])

export function loadNegocio() {
  return call(`${PASOS}.negocio.datos`)
}

/** The form's first values: what the business already has. */
export function negocioDraft(datos = {}) {
  return Object.fromEntries(
    NEGOCIO_FIELDS.map((field) => [field, String(datos?.[field] ?? '')]),
  )
}

const trimmed = (source, field) => String(source?.[field] ?? '').trim()

/** What changed since the read. The server keeps every field left out and
 *  clears one sent empty; the address merges with the stored one. */
export function negocioChanges(form, datos = {}) {
  const changes = {}
  for (const field of NEGOCIO_FIELDS) {
    const value = trimmed(form, field)
    if (value !== trimmed(datos, field)) changes[field] = value
  }
  if (!datos?.rfc_editable) delete changes.rfc
  return changes
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADDRESS_FIELDS = ['calle', 'colonia', 'ciudad', 'estado', 'cp']

/** What stops the save, by field. Empty when it can go; the server decides the rest. */
export function negocioProblems(form, datos = {}) {
  const problems = {}
  const correo = trimmed(form, 'correo')
  if (correo && !EMAIL.test(correo))
    problems.correo = t('Write an email like nombre@negocio.com.')
  // An address that changes keeps its street and city (the server needs both).
  if (ADDRESS_FIELDS.some((f) => trimmed(form, f) !== trimmed(datos, f))) {
    if (!trimmed(form, 'calle'))
      problems.calle = t('Write the street and number: the address needs them.')
    if (!trimmed(form, 'ciudad'))
      problems.ciudad = t('Write the city: the address needs it.')
  }
  return problems
}

/** What is still missing for the step to be done, in the step's own words. */
export function negocioMissing(form, logo) {
  const missing = []
  if (!logo) missing.push(t('logo'))
  if (!String(form?.telefono ?? '').trim()) missing.push(t('phone'))
  if (!String(form?.correo ?? '').trim()) missing.push(t('email'))
  if (!['calle', 'ciudad', 'cp'].some((f) => String(form?.[f] ?? '').trim()))
    missing.push(t('address'))
  return missing
}

export function saveNegocio(values) {
  return call(`${PASOS}.negocio.guardar`, values)
}

// A logo prints small on a ticket and a letterhead: 1024 px keeps it sharp and light.
export const LOGO_SIDE = 1024

/** Upload the prepared logo as a public file of the company (it prints on tickets). */
export async function uploadLogo(file, company) {
  const body = new FormData()
  body.append('file', file, file.name || 'logo.jpg')
  body.append('is_private', '0')
  body.append('doctype', 'Company')
  body.append('docname', company)
  const headers = { Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers,
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.message?.file_url)
    throw new Error(t('The logo did not upload. Try another picture.'))
  return data.message.file_url
}

// ── Un producto (sin Mercado) ───────────────────────────────────────────────

// Before the first product the owner answers Abordo's catalog decisions (series,
// lots, unit, variants, cost, codes): they cannot change once there are sales,
// and Abordo refuses the product until they are answered.

/** The catalog questions still open, each with this giro's recommended answer. */
export function loadCatalogPending() {
  return call('abordo.guides.api.catalog_pending')
}

/** The choice each question starts on: the recommended option, by position. */
export function decisionDraft(pending = []) {
  return Object.fromEntries(
    pending.map((decision) => {
      const index = (decision.options || []).findIndex(
        (option) => option.value === decision.default,
      )
      return [decision.decision_key, index < 0 ? '' : String(index)]
    }),
  )
}

/** The answers to send, by question; null while one has no choice. */
export function decisionAnswers(pending = [], picked = {}) {
  const answers = {}
  for (const decision of pending) {
    const option = (decision.options || [])[
      Number(picked[decision.decision_key])
    ]
    if (picked[decision.decision_key] === '' || !option) return null
    answers[decision.decision_key] = option.value
  }
  return answers
}

export function answerDecisions(answers) {
  return call('abordo.guides.api.answer_decisions', { answers })
}

/** The wizard's quick product: the item and its first price in the selling list. */
export function crearProducto({ nombre, precio, codigoBarras }) {
  return call('abordo.api.crear_producto', {
    nombre: String(nombre || '').trim(),
    precio,
    codigo_barras: String(codigoBarras || '').trim(),
  })
}

// ── Invitar a alguien ───────────────────────────────────────────────────────

export const ENTREGAS = Object.freeze(['correo', 'whatsapp', 'enlace'])

export function loadInvitar() {
  return call('abordo.api.invitar_opciones')
}

export function invitar(values) {
  return call('abordo.api.invitar_usuario', values)
}

/** What the invitation sends: the register only for a puesto that sells. */
export function invitePayload(form, opciones = {}) {
  const perfil = (opciones.perfiles || []).find((p) => p.name === form.perfil)
  const values = {
    nombre: String(form.nombre || '').trim(),
    email: String(form.email || '')
      .trim()
      .toLowerCase(),
    telefono: String(form.telefono || '').trim(),
    perfil: form.perfil,
    entrega: ENTREGAS.includes(form.entrega) ? form.entrega : 'correo',
  }
  if (perfil?.pos) {
    const pos = form.pos_profile || opciones.pos_default || ''
    if (pos) values.pos_profile = pos
  }
  return values
}

/** What stops the invitation, by field. Empty when it can go. */
export function inviteProblems(form, opciones = {}) {
  const problems = {}
  if (!String(form.nombre || '').trim())
    problems.nombre = t('Write the name of the person.')
  if (!EMAIL.test(String(form.email || '').trim()))
    problems.email = t('Write their email: it is how they sign in.')
  if (form.entrega === 'whatsapp' && !String(form.telefono || '').trim())
    problems.telefono = t('Write their phone to send it by WhatsApp.')
  if (!(opciones.perfiles || []).some((p) => p.name === form.perfil))
    problems.perfil = t('Choose their puesto.')
  return problems
}

// ── La lista completa ───────────────────────────────────────────────────────

export function loadTodos() {
  return call(`${PASOS}.hoy.todos`)
}

export function ocultarPaso(paso) {
  return call(`${PASOS}.api.ocultar_paso`, { paso })
}

export function mostrarPaso(paso) {
  return call(`${PASOS}.api.mostrar_paso`, { paso })
}

export function mostrarEnHoy(mostrar) {
  return call(`${PASOS}.api.mostrar_en_hoy`, { mostrar: mostrar ? 1 : 0 })
}

/** The list as the sheet shows it: open steps first (the next one leading), then done, then hidden. */
export function todosGroups(answer) {
  const steps = answer?.pasos || []
  const open = steps.filter((s) => !s.oculto && !s.hecho)
  open.sort(
    (a, b) =>
      Number(b.key === answer.siguiente) - Number(a.key === answer.siguiente) ||
      Number(a.bloqueado) - Number(b.bloqueado),
  )
  return {
    open,
    done: steps.filter((s) => !s.oculto && s.hecho),
    hidden: steps.filter((s) => s.oculto),
  }
}
