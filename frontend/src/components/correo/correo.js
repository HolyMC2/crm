// Correo (Shell D12): the calls to crm.api.correo and the pure rules the
// sheet and the queue are made of (unit-tested in d12-correo.test.js).
import { call } from 'frappe-ui'
import { errorText } from '@/documentos/api'
import { documentRoute } from '@/documentos/registry'
import {
  dayDiff,
  formatDate,
  formatTime,
  initials,
  parseServerDate,
  relativeTime,
} from '@/utils/display'

export { errorText }

const SERVICE = 'crm.api.correo'

function params(args = {}) {
  const out = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return out
}

/** One crm.api.correo endpoint, Frappe permissions only. */
export function correoApi(method, args = {}) {
  return call(`${SERVICE}.${method}`, params(args))
}

export const borrador = (doctype, name, plantilla) =>
  correoApi('borrador', { doctype, name, plantilla })
export const enviar = (args) => correoApi('enviar', args)
export const hilo = (doctype, name) => correoApi('hilo', { doctype, name })
export const bandeja = (args = {}) => correoApi('bandeja', args)
export const mensaje = (name) => correoApi('mensaje', { name })
export const marcarLeido = (name, leido = 1) =>
  correoApi('marcar_leido', { name, leido })
export const vincular = (name, doctype, docname) =>
  correoApi('vincular', { name, doctype, docname })
/** Records for «Vincular a un documento»: the palette's # search (rows with doctype, name, title). */
export const buscarDocumentos = (q) =>
  call('crm.api.documentos.search', { q, limit: 12 })

// ── addresses ────────────────────────────────────────────────────────────

const EMAIL = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[^@\s<>,;"']{2,}$/

/** One plain address (`ana@tienda.mx`), the same rule the server applies. */
export function isEmail(value) {
  return EMAIL.test(String(value || '').trim())
}

/** Addresses typed in one go («ana@x.mx, beto@y.mx; Ana <ana@x.mx>»), lower-case, no repeats. */
export function splitEmails(text) {
  const out = []
  for (const part of String(text || '').split(/[,;\n]+/)) {
    const match = part.match(/<([^>]+)>/)
    const tokens = match ? [match[1]] : part.split(/\s+/)
    for (const token of tokens) {
      const email = token.trim().toLowerCase()
      if (email && !out.includes(email)) out.push(email)
    }
  }
  return out
}

/** Add typed addresses to the chosen ones → { para, invalid } (invalid stay in the field). */
export function addRecipients(para, text) {
  const next = [...para]
  const invalid = []
  for (const email of splitEmails(text)) {
    if (!isEmail(email)) invalid.push(email)
    else if (!next.includes(email)) next.push(email)
  }
  return { para: next, invalid }
}

/** The name to show for an address: the suggestion's name, else the address. */
export function recipientName(email, suggestions = []) {
  const found = suggestions.find((s) => s.email === email)
  return found?.nombre && found.nombre !== email ? found.nombre : email
}

/** «Enviado a Ana López y beto@x.mx», «Enviado a Ana López y 2 más». */
export function sentToast(para, suggestions = []) {
  const names = para.map((e) => recipientName(e, suggestions))
  if (!names.length) return 'Enviado'
  if (names.length === 1) return `Enviado a ${names[0]}`
  if (names.length === 2) return `Enviado a ${names[0]} y ${names[1]}`
  return `Enviado a ${names[0]} y ${names.length - 1} más`
}

// ── compose ──────────────────────────────────────────────────────────────

/** The PDF's file name as the customer will see it: «Factura ACC-SINV-2026-03523.pdf». */
export function attachmentName(etiqueta, name) {
  const base = [etiqueta, name]
    .filter(Boolean)
    .join(' ')
    .replace(/[\\/:*?"<>|]+/g, '-')
  return `${base || 'Documento'}.pdf`
}

/** What the send step must show and send, or the reason it cannot go yet. */
export function reviewOf(state) {
  const para = state.para || []
  if (!state.puede)
    return { ok: false, reason: state.motivo || 'No se puede enviar.' }
  if (!para.length)
    return { ok: false, reason: 'Agrega al menos un destinatario.' }
  if (para.some((e) => !isEmail(e)))
    return { ok: false, reason: 'Revisa los correos de los destinatarios.' }
  if (!String(state.asunto || '').trim())
    return { ok: false, reason: 'Escribe el asunto.' }
  if (!String(state.cuerpo || '').trim())
    return { ok: false, reason: 'Escribe el mensaje.' }
  return {
    ok: true,
    reason: '',
    para,
    asunto: String(state.asunto).trim(),
    cuerpo: String(state.cuerpo).trim(),
    adjunto: state.pdf && state.formato ? state.adjunto : '',
  }
}

/** A key for one confirmed send: the same tap twice (or a retry) sends once. */
export function newRequestId(now = Date.now(), random = Math.random) {
  return `correo-${now.toString(36)}-${random().toString(36).slice(2, 10)}`
}

/** The template list split as the picker shows it: made for this record first. */
export function splitTemplates(plantillas = []) {
  return {
    propias: plantillas.filter((p) => p.encaja),
    otras: plantillas.filter((p) => !p.encaja),
  }
}

// ── queue ────────────────────────────────────────────────────────────────

/** Gmail's time column: «12:11» today, «ayer», «17 oct», «17 oct 2025». */
export function shortWhen(value, { now = new Date() } = {}) {
  const date = parseServerDate(value)
  if (!date) return ''
  const diff = dayDiff(date, now)
  if (diff === 0) return formatTime(date)
  if (diff === -1) return 'ayer'
  return formatDate(date, { now, relative: false })
}

/** Initials for the avatar (system senders get none: the row shows an icon). */
export function senderInitials(de) {
  if (!de || isSystem(de)) return ''
  return de.iniciales || initials(de.nombre || de.correo || '')
}

export function isSystem(de) {
  return !de?.correo
}

/** Who to show on line 1: the sender, or «Para …» for what the worker sent. */
export function rowWho(row) {
  if (row?.direccion === 'enviado') {
    const names = (row.para || []).map((p) => p.nombre || p.correo)
    if (!names.length) return senderName(row.de)
    return `Para ${names.length > 2 ? `${names[0]} y ${names.length - 1} más` : names.join(', ')}`
  }
  return senderName(row?.de)
}

export function senderName(de) {
  if (!de) return ''
  if (isSystem(de) || de.nombre === 'System') return 'Sistema'
  return de.nombre || de.correo
}

/**
 * A category row's words: title, a summary line and «12 nuevos» or «424».
 * System alerts never show their (English, raw) subjects: «423 avisos
 * automáticos · último hace 3 h».
 */
export function categoryLabel(cat, { now = new Date() } = {}) {
  if (!cat) return { title: '', line: '', badge: '' }
  const title =
    cat.categoria === 'sistema'
      ? 'Avisos del sistema'
      : cleanSubject(cat.titulo) || 'Correos repetidos'
  const people = (cat.remitentes || []).map((n) =>
    n === 'System' ? 'Sistema' : n,
  )
  const line =
    cat.categoria === 'sistema' ? systemLine(cat, now) : people.join(', ')
  const badge = cat.nuevos
    ? `${cat.nuevos} ${cat.nuevos === 1 ? 'nuevo' : 'nuevos'}`
    : String(cat.total || 0)
  return { title, line, badge, fresh: cat.nuevos > 0 }
}

function systemLine(cat, now) {
  const total = Number(cat.total) || 0
  const count = `${total} ${total === 1 ? 'aviso automático' : 'avisos automáticos'}`
  const when = cat.fecha ? relativeTime(cat.fecha, { now }) : ''
  return when ? `${count} · último ${when}` : count
}

/** A subject without the leading emoji or symbols alerts carry («⚠️ Saldo…» → «Saldo…»). */
export function cleanSubject(subject) {
  return String(subject || '')
    .replace(/^[^\p{L}\p{N}¿¡]+/u, '')
    .trim()
}

/** «Factura · Cliente prueba D5» for the small chip on a row; '' when unknown. */
export function documentChip(documento) {
  if (!documento) return ''
  const title = documento.titulo || ''
  if (!title) return documento.etiqueta || ''
  return documento.etiqueta && documento.etiqueta !== title
    ? `${documento.etiqueta} · ${title}`
    : title
}

/** Where a linked record opens: its shell page when it has one, else the server's floor route. */
export function documentTo(documento, boot = null) {
  if (!documento?.doctype || !documento?.nombre) return null
  if (!documento.ruta) return null
  return (
    documentRoute(documento.doctype, documento.nombre, { boot }) || {
      path: documento.ruta,
    }
  )
}

/** Plain Spanish for the empty queue, per view and search. */
export function emptyCopy({ vista, buscar, categoria, cuentas = 1 }) {
  if (buscar)
    return {
      title: 'Sin resultados',
      message: `Ningún correo dice «${buscar}». Busca por asunto, nombre o correo.`,
    }
  if (categoria)
    return {
      title: 'Nada aquí',
      message: 'Esta categoría ya no tiene correos.',
    }
  if (vista === 'enviados')
    return {
      title: 'Aún no hay enviados',
      message:
        'Aquí aparecen los correos que manda tu equipo desde los documentos, como una factura con su PDF.',
    }
  return {
    title: 'No hay correos recibidos',
    message: cuentas
      ? 'Aquí llegan los correos de las cuentas que puedes leer. Los avisos automáticos se juntan en una sola fila.'
      : 'Aquí llegan los correos de las cuentas que puedes leer. Tu usuario aún no tiene una cuenta de correo; pídesela a tu encargado.',
  }
}

/**
 * A new step starts at the top of the sheet: the BottomSheet keeps one
 * scroller for every step, so «Revisa antes de enviar» opened scrolled as far
 * as Redactar was and hid «Para». `anchor` is any element inside the sheet
 * body; returns the scroller it reset (or null).
 */
export function scrollSheetToTop(anchor) {
  const scroller =
    anchor?.closest?.('[data-ui-sheet-body]') ||
    anchor?.closest?.('.overflow-y-auto') ||
    null
  if (scroller) scroller.scrollTop = 0
  return scroller
}
