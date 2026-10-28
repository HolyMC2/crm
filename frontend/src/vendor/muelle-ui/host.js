// Vendored from muelle/workspace/packages/ui@0.1.0 (1ceb2df0a0ad). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { computed, ref, shallowReactive } from 'vue'

// What the kit needs from the app around it. An app calls configureUi once in
// main.js; whatever it leaves out falls back to a working default, so a screen
// built from the kit renders the same in the crm shell, Taller and Clínica.
//
//   configureUi({
//     t: window.__,                    translate (message, args, context)
//     statusLabel, statusTone,         a record status in the app's words
//     bell: AvisosBell,                the component the AppBar shows at its end
//     showBell: () => boolean,         whether that bell shows on this site
//     isMobile: ref(boolean),          the app's own phone breakpoint
//   })

const host = shallowReactive({
  t: null,
  statusLabel: null,
  statusTone: null,
  bell: null,
  showBell: () => false,
  isMobile: null,
})

export function configureUi(options = {}) {
  for (const key of Object.keys(host)) {
    if (options[key] !== undefined) host[key] = options[key]
  }
}

export function uiBell() {
  return host.bell && host.showBell() ? host.bell : null
}

// The kit's own words, for an app without a translation function. The keys
// are the crm's msgids, so the crm's catalogue translates them there.
const ES = {
  '{0} filters on': '{0} filtros activos',
  '{0} selected': '{0} seleccionados',
  '1 selected': '1 seleccionado',
  'Ask your manager for access, or go back.':
    'Pide acceso a tu encargado o regresa.',
  Back: 'Atrás',
  'Check your connection and try again.':
    'Revisa tu conexión e inténtalo de nuevo.',
  'Choose a list': 'Elegir lista',
  'Clear filters': 'Quitar filtros',
  'Clear search': 'Limpiar búsqueda',
  'Clear selection': 'Quitar la selección',
  Close: 'Cerrar',
  'Close search': 'Cerrar búsqueda',
  Collapse: 'Contraer',
  Expand: 'Expandir',
  Filters: 'Filtros',
  Loading: 'Cargando',
  'Loading…': 'Cargando…',
  'Nothing here yet': 'Todavía no hay nada aquí',
  Options: 'Opciones',
  Reload: 'Recargar',
  'Remove filter {0}': 'Quitar el filtro {0}',
  Search: 'Buscar',
  Select: 'Seleccionar',
  'Select the visible page': 'Seleccionar la página visible',
  'Show results': 'Ver resultados',
  'This could not be loaded': 'No se pudo cargar',
  'You do not have access to this': 'No tienes acceso a esto',
}

function format(message, args) {
  return message.replace(/{(\d+)}/g, (match, i) =>
    args?.[i] !== undefined ? args[i] : match,
  )
}

function pageLanguage() {
  return (
    (typeof document !== 'undefined' && document.documentElement.lang) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    ''
  )
}

export function t(message, args, context) {
  const translate =
    host.t || (typeof window !== 'undefined' ? window.__ : null)
  if (typeof translate === 'function') return translate(message, args, context)
  const own = pageLanguage().startsWith('es') ? ES[message] : null
  return format(own || message, args)
}

export function statusLabel(status, kind) {
  return host.statusLabel
    ? host.statusLabel(status, kind)
    : String(status ?? '').trim()
}

export function statusTone(status, kind) {
  return host.statusTone ? host.statusTone(status, kind) : 'neutral'
}

/** «KM» for «Karla Martínez», «A» for «Aarón». */
export function initials(name) {
  const words = String(name ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => /\p{L}|\d/u.test(word[0] || ''))
  if (!words.length) return ''
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// A page opened from another page of this origin (the Desk, another app) has
// no vue-router entry behind it, but the browser's previous entry is that
// page, so Back returns there. Not for the sign-in step, and not in a window
// with one entry (opened from a page: nothing behind it).
export function canReturnToReferrer({ referrer, origin, historyLength }) {
  if (!referrer || historyLength < 2) return false
  const from = new URL(referrer)
  return from.origin === origin && !from.pathname.startsWith('/login')
}

// The phone: bottom nav, the phone app bar, single-pane lists (< 640px),
// unless the app brings its own breakpoint.
const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => (width.value = window.innerWidth), {
    passive: true,
  })
}
export const isMobile = computed(() =>
  host.isMobile ? host.isMobile.value : width.value < 640,
)
