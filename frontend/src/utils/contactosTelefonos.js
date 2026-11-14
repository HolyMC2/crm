// «Contactos en los teléfonos»: what the owner reads on the setup screen.
// Pure, so the words are tested without a page (tests/unit/contactosTelefonos.test.js).
import { relativeTime } from '@/utils/display'

export const KINDS = Object.freeze({
  clientes: { label: 'Clientes', tag: 'Cliente' },
  proveedores: { label: 'Proveedores', tag: 'Proveedor' },
  otros: { label: 'Otros contactos', tag: 'Contacto' },
  equipo: { label: 'Tu equipo', tag: 'Equipo' },
  pacientes: { label: 'Pacientes', tag: 'Paciente' },
})

export const PLATFORMS = Object.freeze([
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'other', label: 'Otro' },
])

export const SUFFIXES = Object.freeze([
  { value: '', label: 'Nada' },
  { value: 'kind', label: 'El tipo' },
  { value: 'shop', label: 'La tienda' },
])

export const DAVX5_PLAY =
  'https://play.google.com/store/apps/details?id=at.bitfire.davdroid'
export const DAVX5_FDROID = 'https://f-droid.org/packages/at.bitfire.davdroid/'

/** The kinds this shop can send, in the server's order. */
export function availableKinds(state) {
  return (state?.kinds || [])
    .filter((kind) => kind.available && KINDS[kind.key])
    .map((kind) => ({ ...kind, ...KINDS[kind.key] }))
}

/** How many records reach the phones with the current choice (a contact in two
 *  kinds is counted in each; the line says «hasta»). */
export function chosenCount(state) {
  return availableKinds(state)
    .filter((kind) => kind.included)
    .reduce((sum, kind) => sum + (kind.count || 0), 0)
}

/** «Ana López», «Ana López · Cliente» or «Ana López · <tienda>». */
export function namePreview(suffix, shop, name = 'Ana López') {
  if (suffix === 'kind') return `${name} · ${KINDS.clientes.tag}`
  if (suffix === 'shop' && shop) return `${name} · ${shop}`
  return name
}

export function platformLabel(value) {
  return PLATFORMS.find((p) => p.value === value)?.label || 'Otro'
}

/** One line under a phone's name: whether it is set up and when it last synced. */
export function phoneStatus(phone, now = new Date()) {
  if (!phone?.ready) return 'Falta instalar el perfil en el iPhone'
  if (!phone.last_seen) return 'Todavía no se conecta'
  return `Se actualizó ${relativeTime(phone.last_seen, { now })}`
}

/** Which device the owner holds now, to offer «Instalar en este …» there. */
export function currentDevice(userAgent = '') {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iphone'
  if (/Android/.test(userAgent)) return 'android'
  return ''
}
