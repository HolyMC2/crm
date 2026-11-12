// Mi cuenta's only way to the plan: doco's Mi plan relays (doco.docoutils.miplan),
// gated to the owner or the «Mi Plan» role and relayed to Boat as this site. The
// browser never talks to the platform and no endpoint here is new.
import { call } from 'frappe-ui'

const RELAY = 'doco.docoutils.miplan.'

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
