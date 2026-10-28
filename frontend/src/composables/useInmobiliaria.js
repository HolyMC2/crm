// Inmobiliaria in the shell (/crm/inmobiliaria, INMO-SH). The app decides what a
// screen shows (inmobiliaria.api.shell): names, the next action of each state and
// why a blocked one is blocked. This file only calls it and formats its values.
import { h } from 'vue'
import { call } from 'frappe-ui'
import { formatDate, formatMoney } from '@/utils/display'
import { fichaFromDesk } from '@/utils/inmobiliariaTipos'

/** The record screens the app has: /inmobiliaria/<tipo>/:name, tipo → { doctype, etiqueta }. */
export { TIPOS } from '@/utils/inmobiliariaTipos'

const API = 'inmobiliaria.api.shell'

/**
 * A plain <button> for `<component :is>`: the string 'button' resolves to
 * frappe-ui's globally registered `Button` (Vue matches button → Button).
 */
export function NativeButton(_, { slots, attrs }) {
  return h('button', { type: 'button', ...attrs }, slots.default?.())
}
NativeButton.inheritAttrs = false

export const inmobiliariaApi = (method, args = {}) =>
  call(method.includes('.') ? method : `${API}.${method}`, args)

/**
 * A server URL as a shell target: { to } for /crm/… (the router base is /crm),
 * { href } otherwise. A Desk form of a record the shell opens becomes its
 * record screen: routine work never leaves for Desk (the «Abrir en
 * escritorio» escape is a plain link, not this).
 */
export function linkOf(url) {
  if (!url || typeof url !== 'string') return {}
  if (url === '/crm' || url.startsWith('/crm/'))
    return { to: url.slice('/crm'.length) || '/' }
  const ficha = fichaFromDesk(url)
  if (ficha) return { to: ficha }
  if (url.startsWith('/') && !url.startsWith('//')) return { href: url }
  return {}
}

/**
 * An action the app marks `external` (the SAT portal) as a link out of the
 * shell: a new tab with no opener and no referrer. Only an https address
 * qualifies; anything else answers {} and the action keeps linkOf.
 */
export function externalLinkOf(accion) {
  const url = accion?.external === true ? accion.url : ''
  if (typeof url !== 'string' || !url.startsWith('https://')) return {}
  return { href: url, target: '_blank', rel: 'noopener noreferrer' }
}

/** «$1,250,000.00», «15 de octubre», «80 %» or the text, from a typed value of the app. */
export function valueText(value) {
  if (!value || value.value === undefined || value.value === null) return ''
  if (value.tipo === 'money')
    return formatMoney(value.value, value.currency || 'MXN', { decimals: 0 })
  if (value.tipo === 'date') return formatDate(value.value)
  if (value.tipo === 'percent')
    return `${Math.round(Number(value.value) || 0)} %`
  return String(value.value)
}

/**
 * Go to a named place («Volver al inicio», «Volver a Hoy»): a page of this app
 * (`/crm/…`) through the router, stepping back when it is the screen just
 * before (no pile of entries); another app's page through the browser.
 */
export function volverA(router, url) {
  if (!url || typeof url !== 'string') return
  if (url === '/crm' || url.startsWith('/crm/')) {
    const to = url.slice('/crm'.length) || '/'
    if (window.history.state?.back === to) return router.back()
    return router.push(to)
  }
  window.location.assign(url)
}

/** The words under a blocked action: why, then the way forward. */
export function blockedText(accion) {
  const s = accion?.solucion
  const salida =
    s && typeof s === 'object' ? String(s.etiqueta || '') : String(s || '')
  return [accion?.motivo, salida].filter(Boolean).join(' ')
}

// The bolt's icon for an action the app sends without one: what it does,
// from its id and kind. Only icons the shell already draws (each new lucide
// class adds to the stylesheet).
function accionIcon(a) {
  const id = String(a.id || '')
  if (id === 'whatsapp') return 'lucide-message-circle'
  if (/expediente/.test(id)) return 'lucide-folder-open'
  if (/^volver/.test(id)) return 'lucide-arrow-left'
  if (a.tipo === 'danger') return 'lucide-x'
  if (a.tipo === 'primary') return 'lucide-check'
  return a.url ? 'lucide-chevron-right' : 'lucide-list-checks'
}

/**
 * The record's bolt (components/documentos/AccionesMenu): every action the
 * app offers now, the next step first; the ones that undo or cancel in their
 * own group last. A blocked action keeps its place and says why. Each picks
 * as `accion:<id>`.
 */
export function boltGroupsOf(ficha) {
  const acciones = ficha?.acciones || []
  const item = (a) => ({
    key: `accion:${a.id}`,
    label: a.etiqueta,
    icon: accionIcon(a),
    hint: '',
    allowed: !!a.habilitada,
    reason: a.habilitada ? '' : blockedText(a) || 'No disponible ahora.',
  })
  const ordered = [...acciones].sort(
    (a, b) => (b.tipo === 'primary') - (a.tipo === 'primary'),
  )
  const pasos = ordered.filter((a) => a.tipo !== 'danger').map(item)
  const otras = ordered.filter((a) => a.tipo === 'danger').map(item)
  return [
    pasos.length && { key: 'pasos', title: 'Siguiente paso', items: pasos },
    otras.length && {
      key: 'otras',
      title: 'Cancelar o deshacer',
      items: otras,
    },
  ].filter(Boolean)
}

/** The action a bolt pick names (`accion:<id>`), or null. */
export function accionOf(ficha, key) {
  if (typeof key !== 'string' || !key.startsWith('accion:')) return null
  const id = key.slice('accion:'.length)
  return (ficha?.acciones || []).find((a) => a.id === id) || null
}

/** An action that arrived without its method (an outdated screen): what to do. */
export const SIN_METODO =
  'Esta acción no está disponible ahora. Actualiza la ficha para ver qué sigue.'

/** The worker's words for a failed call: the app's own message when it sent one. */
export function problemText(error) {
  // Frappe's messages may carry markup (<strong>…); the shell shows words only.
  const messages = (error?.messages || [])
    .map((m) => String(m || '').replace(/<[^>]*>/g, ''))
    .filter(Boolean)
  if (messages.length) return messages.join(' ')
  if (/permission/i.test(String(error?.exc_type || error?.message || '')))
    return 'Tu usuario no tiene permiso para esto. Pide acceso a un administrador.'
  if (error?.message && !/^\w+Error$/.test(error.message)) return error.message
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.'
}

/** Upload a photo or file to a record (private) and answer its file_url. */
export async function uploadFile(file, doctype, docname) {
  const fd = new FormData()
  fd.append('file', file, file.name || `foto-${Date.now()}.jpg`)
  fd.append('is_private', '1')
  if (doctype) fd.append('doctype', doctype)
  if (docname) fd.append('docname', docname)
  const r = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
    body: fd,
    credentials: 'include',
  })
  const j = await r.json().catch(() => ({}))
  const url = j.message?.file_url
  if (!r.ok || !url) throw new Error('No se pudo subir el archivo.')
  return url
}
