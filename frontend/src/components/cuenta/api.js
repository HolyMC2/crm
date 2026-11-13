// Mi cuenta's only way to the plan: doco's Mi plan relays (doco.docoutils.miplan),
// gated to the owner or the «Mi Plan» role and relayed to Boat as this site. The
// browser never talks to the platform and no endpoint here is new. «Exportar mis
// datos» is doco's own (doco.docoutils.data_export, the same roles): it reaches
// no platform seam and moves no money.
import { call, frappeRequest } from 'frappe-ui'

const RELAY = 'doco.docoutils.miplan.'
const EXPORT = 'doco.docoutils.data_export.'
// «Enciende tu tienda» is doco's own (doco.docoutils.storefront_readiness, Mi
// plan's roles): this site's checklist, and turning the shop on, which asks
// Boat to publish it. It moves no money.
const STORE = 'doco.docoutils.storefront_readiness.'

/** The store's checklist and whether it is on (POST: a live address is saved as its domain). */
export const storeReadiness = () => call(STORE + 'readiness')

/** Turns the store on when every step passes (POST, the shop's administrator only). */
export const turnOnStore = () => call(STORE + 'turn_on')

/** The latest export and whether a new one may start (GET only). */
export const exportStatus = () =>
  frappeRequest({ url: EXPORT + 'export_status', method: 'GET' })

/** Starts an export of every section (POST); one already running is answered. */
export const requestExport = () => call(EXPORT + 'request_export')

/** The zip of one ready export (GET, a file). */
export function exportDownloadPath(name) {
  const query = new URLSearchParams({ export: String(name) })
  return `/api/method/${EXPORT}download?${query}`
}

export const read = (fn, params = {}) => call(RELAY + fn, params)
export const mutate = (fn, params = {}) => call(RELAY + fn, params)

/**
 * One self-service seam (apps, seats, plan change, Datos fiscales, card setup,
 * cancel) through miplan.call, which relays only the seams in its own table and
 * answers what Boat answers. Boat lists the ones it has on in bootstrap's
 * `capabilities`; the panel calls no other. `password` goes only to a seam that
 * asks for it again (miplan's step-up), never inside the payload.
 */
export function seam(method, payload = {}, { password } = {}) {
  const params = { method, payload }
  if (password) params.password = password
  return call(RELAY + 'call', params)
}

/** The stamped CFDI of an invoice or a top-up (miplan.download_*_cfdi, GET). */
export function downloadPath(type, name, kind) {
  const field = type === 'invoice' ? 'invoice' : 'txn'
  const fn =
    type === 'invoice' ? 'download_invoice_cfdi' : 'download_topup_cfdi'
  const query = new URLSearchParams({ [field]: String(name), kind })
  return `/api/method/${RELAY}${fn}?${query}`
}

/** The payment receipt (a PDF, not a CFDI) of a paid invoice or a top-up (GET). */
export function receiptPath(type, name) {
  const field = type === 'invoice' ? 'invoice' : 'txn'
  const query = new URLSearchParams({ [field]: String(name) })
  return `/api/method/${RELAY}download_receipt?${query}`
}
