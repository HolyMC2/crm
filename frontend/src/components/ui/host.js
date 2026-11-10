// Vendored from muelle/workspace/packages/ui@0.1.0 (8c16b232a287). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
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
  'Exit full screen': 'Salir de pantalla completa',
  Expand: 'Expandir',
  Filters: 'Filtros',
  'Full screen': 'Pantalla completa',
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
  const translate = host.t || (typeof window !== 'undefined' ? window.__ : null)
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

// ── the on-screen keyboard ──────────────────────────────────────────────
// The keyboard going away is the phone's «done» gesture for a search field:
// the panel under it minimizes (AppBar #search-panel, SearchPanel). Two
// signals say the keyboard went: the visual viewport growing back after it
// shrank (Android's back button hides the keyboard and keeps the focus), and
// the field losing focus to something outside its bar (iOS «Done», a tap on
// the list). A tap inside the bar (a filter chip, the clear button) is never
// a hide. It lives here, not in a module of its own: both components already
// import this one, and a new shared module regroups the app's chunks.

// A keyboard is at least this tall; the browser's own bars move the viewport less.
const KEYBOARD_MIN_PX = 100
// A tap inside the bar blurs the field first: a blur this soon after it is the tap, not a hide.
const TAP_WINDOW_MS = 600

/**
 * Watch `input` for the keyboard going away; `within` is the bar whose taps
 * never count. `onHide(reason)` gets 'viewport' or 'blur'. Returns the
 * function that stops watching.
 */
export function watchSoftKeyboard({ input, within, onHide }) {
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null
  let armed = false
  let low = Infinity
  let shrunk = false
  let tappedAt = 0

  function onFocus() {
    armed = true
    low = viewport?.height ?? Infinity
    shrunk = false
  }
  function onResize() {
    if (!armed || !viewport) return
    const height = viewport.height
    if (height < low) {
      if (low - height >= KEYBOARD_MIN_PX) shrunk = true
      low = height
    } else if (shrunk && height - low >= KEYBOARD_MIN_PX) {
      armed = false
      onHide('viewport')
    }
  }
  function onPointerDown() {
    tappedAt = Date.now()
  }
  function onBlur(event) {
    if (!armed) return
    armed = false
    if (Date.now() - tappedAt < TAP_WINDOW_MS) return
    const to = event.relatedTarget
    if (to && within?.contains(to)) return
    // The window losing focus (a tab switch, a system dialog) is not the worker's doing.
    if (!to && typeof document !== 'undefined' && !document.hasFocus()) return
    onHide('blur')
  }

  input.addEventListener('focus', onFocus)
  input.addEventListener('blur', onBlur)
  within?.addEventListener('pointerdown', onPointerDown, true)
  viewport?.addEventListener('resize', onResize)
  if (typeof document !== 'undefined' && document.activeElement === input)
    onFocus()
  return () => {
    input.removeEventListener('focus', onFocus)
    input.removeEventListener('blur', onBlur)
    within?.removeEventListener('pointerdown', onPointerDown, true)
    viewport?.removeEventListener('resize', onResize)
  }
}

// ── the list scrolling ──────────────────────────────────────────────────
// The worker scrolling the list under an open search panel has moved on to
// the results: the panel folds. The first moments after the panel shows are
// ignored (focusing the field scrolls it into view, the panel's own height
// change clamps the list), as is any scroll inside the bar (the panel scrolls
// its own chips) and any movement too small to be a scroll.

// Scroll events this soon after the panel shows are the panel's own doing.
const SCROLL_SETTLE_MS = 600
// A scroll moves the list at least this far; a layout nudge moves it less.
const SCROLL_MIN_PX = 24

function scrollPosition(el) {
  if (el === document)
    return window.scrollY || document.documentElement.scrollTop || 0
  return el.scrollTop || 0
}

/**
 * Watch every scroller on the page but those inside `within`; `onScroll()`
 * fires once per arming when the list moves. `arm()` when the panel shows,
 * `disarm()` when it hides, `stop()` on unmount.
 */
export function watchListScroll({ within, onScroll }) {
  let armedAt = 0
  let scroller = null
  let origin = 0
  function onScrollEvent(event) {
    if (!armedAt) return
    const el = event.target
    if (el !== document && within?.contains(el)) return
    if (Date.now() - armedAt < SCROLL_SETTLE_MS) {
      scroller = null
      return
    }
    const position = scrollPosition(el)
    if (scroller !== el) {
      scroller = el
      origin = position
      return
    }
    if (Math.abs(position - origin) < SCROLL_MIN_PX) return
    armedAt = 0
    onScroll()
  }
  if (typeof document !== 'undefined')
    document.addEventListener('scroll', onScrollEvent, true)
  return {
    arm() {
      armedAt = Date.now()
      scroller = null
    },
    disarm() {
      armedAt = 0
      scroller = null
    },
    stop() {
      if (typeof document !== 'undefined')
        document.removeEventListener('scroll', onScrollEvent, true)
    },
  }
}
