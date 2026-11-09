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
// Hidden is a flag: the saved order names hidden places too, so one shown again
// goes back to where it was.

/** Places the bar holds after Hoy: three, or four when the worker has no Hoy. */
export function barRoom(places) {
  return MOBILE_SLOTS - (places.some((place) => place.key === 'hoy') ? 1 : 0)
}

// `places` in the saved order, then whatever it does not name (a module the
// worker just got) in their own order.
function inSavedOrder(places, order, total) {
  const rank = new Map((order || []).map((key, index) => [key, index]))
  return places
    .map((place, index) => ({ place, index }))
    .sort(
      (a, b) =>
        (rank.get(a.place.key) ?? total + a.index) -
        (rank.get(b.place.key) ?? total + b.index),
    )
    .map(({ place }) => place)
}

/**
 * Split the worker's places into bar, more and hidden. `modules` are the
 * enabled modules (Avisos is the bell, never placed), `apps` the installed
 * sibling apps, `layout` the boot's {dock, order, hidden} or null. `rest` is
 * every place off the bar in the saved order, hidden ones in their spot (what
 * Personalizar lists).
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
  const rest = inSavedOrder(
    places.filter((place) => !barKeys.includes(place.key)),
    layout?.order,
    places.length,
  )
  return {
    bar: barKeys.map((key) => byKey.get(key)),
    more: rest.filter((place) => !hiddenKeys.has(place.key)),
    hidden: rest.filter((place) => hiddenKeys.has(place.key)),
    rest,
  }
}

/**
 * What a save sends: the arrangement's keys, Hoy left out (always first).
 * `more` is Más in order with the hidden places in their spot; `hidden` flags
 * them.
 */
export function layoutOf({ bar, more, hidden }) {
  const keys = (list) =>
    list.map((place) => place.key ?? place).filter((key) => key !== 'hoy')
  const flagged = new Set(keys(hidden))
  const order = keys(more)
  return {
    dock: keys(bar),
    order,
    // Flagged in Más's order; a flag on a place Más does not list goes last.
    hidden: [
      ...order.filter((key) => flagged.has(key)),
      ...[...flagged].filter((key) => !order.includes(key)),
    ],
  }
}

/**
 * A module's own sections (Ventas' lists, Inmobiliaria's homes) arranged by
 * the worker's layout, same shape as the bar's: `top` holds the sections that
 * lead (Ventas' daily lists; empty for a module with one list), `rest` the
 * others in the saved order, hidden ones in their spot, and `hidden` the keys
 * folded away. `items` come in the module's suggested order, `top` names the
 * suggested lead. A saved layout places what it names; a section it does not
 * name (new since) keeps its suggested part, after the saved ones.
 */
export function arrangeSections({ items = [], top = [], layout = null }) {
  const byKey = new Map(items.map((item) => [item.key, item]))
  const suggested = new Set(top)
  const saved = !!layout && (layout.dock?.length || layout.order?.length)
  const dock = saved
    ? [
        ...(layout.dock || []).filter((key) => byKey.has(key)),
        ...items
          .filter(
            (item) =>
              suggested.has(item.key) &&
              !layout.dock?.includes(item.key) &&
              !layout.order?.includes(item.key),
          )
          .map((item) => item.key),
      ]
    : items.filter((item) => suggested.has(item.key)).map((item) => item.key)
  const hidden = new Set(
    (layout?.hidden || []).filter(
      (key) => byKey.has(key) && !dock.includes(key),
    ),
  )
  const rest = inSavedOrder(
    items.filter((item) => !dock.includes(item.key)),
    saved ? layout.order : [],
    items.length,
  )
  return {
    top: dock.map((key) => byKey.get(key)),
    rest,
    hidden,
  }
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
