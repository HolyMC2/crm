import { MOBILE_SLOTS, mobileSlots } from '@/vendor/muelle-shell/contracts'

// Where each place the worker may open sits (Más › Personalizar). Frappe
// decides what exists (DD18); a layout only arranges it:
//   bar     the phone's bottom bar (Hoy first) and the top of the desktop rail
//   more    Más on the phone, the rest of the rail on desktop, in the saved order
//   hidden  folded under «Ocultos» in Más and the rail's «Más» menu; the palette
//           and links still open them
// A place is a module ({key, label, icon, to}) or a sibling app ({…, app: true}).
// The layout is the boot's: the worker's own, else the one the owner set for
// their puesto, else empty, and then the contracts defaults fill the bar.

/** Places the bar holds after Hoy: three, or four when the worker has no Hoy. */
export function barRoom(places) {
  return MOBILE_SLOTS - (places.some((place) => place.key === 'hoy') ? 1 : 0)
}

/**
 * Split the worker's places into bar, more and hidden. `modules` are the
 * enabled modules (Avisos is the bell, never placed), `apps` the installed
 * sibling apps, `layout` the boot's {dock, order, hidden} or null.
 */
export function arrangeShell({ role, modules = [], apps = [], layout = null }) {
  const places = [
    ...modules.filter((module) => module.key !== 'avisos'),
    ...apps.map((app) => ({ ...app, app: true })),
  ]
  const byKey = new Map(places.map((place) => [place.key, place]))
  const hiddenKeys = new Set(
    (layout?.hidden || []).filter((key) => key !== 'hoy'),
  )
  const shown = places.filter((place) => !hiddenKeys.has(place.key))
  const barKeys = mobileSlots(
    role,
    shown.map((place) => place.key),
    layout?.dock,
  )
  // The saved order first, then whatever it does not name (a module the
  // worker just got) in registry order, apps after modules.
  const rank = new Map((layout?.order || []).map((key, index) => [key, index]))
  const more = shown
    .filter((place) => !barKeys.includes(place.key))
    .map((place, index) => ({ place, index }))
    .sort(
      (a, b) =>
        (rank.get(a.place.key) ?? places.length + a.index) -
        (rank.get(b.place.key) ?? places.length + b.index),
    )
    .map(({ place }) => place)
  return {
    bar: barKeys.map((key) => byKey.get(key)),
    more,
    hidden: places.filter((place) => hiddenKeys.has(place.key)),
  }
}

/** What a save sends: the arrangement's keys, Hoy left out (always first). */
export function layoutOf({ bar, more, hidden }) {
  const keys = (list) =>
    list.map((place) => place.key ?? place).filter((key) => key !== 'hoy')
  return { dock: keys(bar), order: keys(more), hidden: keys(hidden) }
}

// Bar classes as the owner reads them («Barra por puesto»): the puesto, or
// the roles when there is none (crm.api.shell.nav_role).
export const NAV_CLASS_LABELS = Object.freeze({
  vendedor: 'Vendedor',
  cajero: 'Cajero',
  almacen: 'Almacén',
  compras: 'Compras',
  contador: 'Contador',
  recepcion: 'Recepción y técnicos',
  dueno: 'Dueño y encargado',
  inmobiliaria: 'Inmobiliaria',
  fallback: 'Sin puesto',
})
