// Inmobiliaria in the shell (/crm/inmobiliaria, INMO-SH). The app decides what a
// screen shows (inmobiliaria.api.shell): names, the next action of each state and
// why a blocked one is blocked. This file only calls it and formats its values.
import { h } from 'vue'
import { call } from 'frappe-ui'
import { formatDate, formatMoney } from '@/utils/display'

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

/** The record screens the app has: /inmobiliaria/<tipo>/:name. */
export const TIPOS = Object.freeze([
  'unidad',
  'apartado',
  'venta',
  'expediente',
  'contrato',
  'mantenimiento',
])

/** A server URL as a shell target: { to } for /crm/… (the router base is /crm), { href } otherwise. */
export function linkOf(url) {
  if (!url || typeof url !== 'string') return {}
  if (url === '/crm' || url.startsWith('/crm/'))
    return { to: url.slice('/crm'.length) || '/' }
  if (url.startsWith('/') && !url.startsWith('//')) return { href: url }
  return {}
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
