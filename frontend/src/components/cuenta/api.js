// Mi cuenta's only way to the plan: doco's Mi plan relays (doco.docoutils.miplan),
// gated to the owner or the «Mi Plan» role and relayed to Boat as this site. The
// browser never talks to the platform and no endpoint here is new.
import { call } from 'frappe-ui'

const RELAY = 'doco.docoutils.miplan.'

export const read = (fn, params = {}) => call(RELAY + fn, params)
export const mutate = (fn, params = {}) => call(RELAY + fn, params)

/** The stamped CFDI of an invoice or a top-up (miplan.download_*_cfdi, GET). */
export function downloadPath(type, name, kind) {
  const field = type === 'invoice' ? 'invoice' : 'txn'
  const fn =
    type === 'invoice' ? 'download_invoice_cfdi' : 'download_topup_cfdi'
  const query = new URLSearchParams({ [field]: String(name), kind })
  return `/api/method/${RELAY}${fn}?${query}`
}
