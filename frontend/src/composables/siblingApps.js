import { SIBLING_APPS } from '@/vendor/muelle-shell/contracts'

// The site's other apps («Otras apps»): which are installed and their order.
// No shell state here, so the boot's layout (muelleShell.js) and the rail
// (shellRail.js) both read it.

/** Frappe app that serves each sibling SPA; it shows only where installed. */
export const SIBLING_APP_NAMES = Object.freeze({
  pos: 'posawesome',
  taller: 'taller',
  clinica: 'clinica',
  mercado: 'mercado',
  scan: 'scanner_kit',
})

export function installedSiblings(apps = globalThis.window?.installed_apps) {
  const installed = Array.isArray(apps) ? apps : []
  return SIBLING_APPS.filter((app) =>
    installed.includes(SIBLING_APP_NAMES[app.key]),
  )
}

// Escáner first: the phone stock tool every shop opens from the shell.
const SIBLING_ORDER = ['scan', 'pos', 'taller', 'clinica', 'mercado']

/** Installed sibling apps in the shell's order (Escáner first). */
export function sortSiblings(apps) {
  return [...apps].sort(
    (a, b) => SIBLING_ORDER.indexOf(a.key) - SIBLING_ORDER.indexOf(b.key),
  )
}
