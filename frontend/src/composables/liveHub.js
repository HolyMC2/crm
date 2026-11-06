import { bootScope } from '@/vendor/muelle-shell/contracts'
import { createLiveSync } from '@/vendor/muelle-shell/live-sync'

// One live-sync hub per tab, on the app socket. Every live view watches
// through it (Hoy, the power lists, the live lists, open records), so the
// doctype rooms are counted in one place: a room two views share stays joined
// until the last of them leaves, also while a route's old page is still
// leaving under the new one.
//
// Invoices and payments (and repair orders under Taller) are announced by
// Mercado and Taller as `muelle_change`, to each user who may read that very
// record (their services/realtime.py). Where one of them is installed those
// doctypes join no room, so Frappe's room-wide `list_update` never hands this
// tab the names of another shop's records. Announcements carry identifiers
// only; every view reads what it shows through its own API.

export const SCOPED_DOCTYPES = Object.freeze({
  mercado: ['Sales Invoice', 'POS Invoice', 'Payment Entry'],
  taller: [
    'Repair Order',
    'Trade In',
    'Sales Invoice',
    'POS Invoice',
    'Payment Entry',
  ],
})

/** The doctypes this site's apps announce per reader. */
export function scopedDoctypes(apps = globalThis.window?.installed_apps) {
  const installed = Array.isArray(apps) ? apps : []
  return [
    ...new Set(
      Object.entries(SCOPED_DOCTYPES)
        .filter(([app]) => installed.includes(app))
        .flatMap(([, doctypes]) => doctypes),
    ),
  ]
}

/** mercado / taller `muelle_change` envelope → the record it announces. */
export function muelleChange(data) {
  if (!data?.doctype) return null
  return {
    doctype: String(data.doctype),
    name: data.name ? String(data.name) : undefined,
    op: data.op,
    modified: data.modified,
    id: data.id,
  }
}

let hub
/** The tab's hub; sibling tabs of another user never hear it. */
export function liveHub(socket) {
  if (!hub) {
    const user = decodeURIComponent(
      document.cookie
        .split('; ')
        .find((part) => part.startsWith('user_id='))
        ?.slice(8) || '',
    )
    hub = createLiveSync({
      socket: socket || null,
      namespace: bootScope(window.site_name || location.host, user),
      events: { muelle_change: muelleChange },
      scopedDoctypes: scopedDoctypes(),
    })
  }
  return hub
}
