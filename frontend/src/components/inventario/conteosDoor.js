// The door to «Conteos del día» (crm /inventario/conteos): who may open the
// page and whether the counts are on, as scanner_kit's plan_dia.access answers
// it (a few lookups: no list is read). The palette entry and the Inventario
// shortcut ask here, so neither shows for someone the page would refuse. Kept
// apart from the page's own module: the palette is in the shell's first load.
import { call } from 'frappe-ui'

const ACCESS = 'scanner_kit.api.conteo.plan_dia.access'
// The server keeps nothing for this answer; five minutes saves a request per palette keystroke.
export const DOOR_TTL_MS = 5 * 60 * 1000
const SHUT = Object.freeze({ can_open: false, on: false })

let known = null
let readAt = 0
let reading = null

// The counts are Escáner's (scanner_kit): where the site does not have it
// (the boot's installed_apps), nobody is asked.
const hasEscaner = () =>
  Array.isArray(globalThis.window?.installed_apps) &&
  globalThis.window.installed_apps.includes('scanner_kit')

/** `{ can_open, on }`. A site without Escáner, or a refusal, is a shut door. */
export function conteosDoor({ fresh = false, now = Date.now() } = {}) {
  if (!hasEscaner()) return Promise.resolve(SHUT)
  if (!fresh && known && now - readAt < DOOR_TTL_MS)
    return Promise.resolve(known)
  reading ||= Promise.resolve()
    .then(() => call(ACCESS))
    .then((answer) => ({ can_open: !!answer?.can_open, on: !!answer?.on }))
    .catch(() => SHUT)
    .then((answer) => {
      known = answer
      readAt = Date.now()
      reading = null
      return answer
    })
  return reading
}

/**
 * The last answer, at once: for a list built without waiting (the palette's
 * places). With none yet it reads one for the next keystroke and says shut.
 */
export function conteosDoorNow() {
  if (!hasEscaner()) return SHUT
  if (!known || Date.now() - readAt >= DOOR_TTL_MS) conteosDoor()
  return known || SHUT
}

/** The page tells the door what its last answer said (the switch moved). */
export function noteConteosDoor(answer) {
  known = { can_open: !!answer?.can_open, on: !!answer?.on }
  readAt = Date.now()
}

/** Tests start with nothing known. */
export function forgetConteosDoor() {
  known = null
  readAt = 0
  reading = null
}
