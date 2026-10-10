// «Cobrar en caja»: the one link every CRM page (Ventas, Cobranza) uses to send
// a worker to the register's Cobranza with the invoice preselected. Business
// IDs are routing hints only; the POS re-authorizes the register, the customer
// and the invoice, and returns to `return_to` with `done=Payment Entry:<name>`.
import {
  safeReturn,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'

// Only CRM pages ask the register to bring the worker back.
const RETURN_PREFIXES = ['/crm/']

export function posCollectHref(row, { returnTo, returnLabel } = {}) {
  const params = new URLSearchParams()
  if (row.customer) params.set('customer', row.customer)
  params.set('invoice', row.name)
  const back = safeReturn(returnTo, RETURN_PREFIXES)
  if (back) {
    params.set('return_to', back)
    const label = sanitizeReturnLabel(returnLabel)
    if (label) params.set('return_label', label)
  }
  return `/posapp/payments?${params.toString()}`
}

// «Vender en caja» / «Abonar al monedero» from a Contactos record: the register
// opens on this customer (sale, or the Cliente view for a deposit) and comes
// back to the record with `done=<doctype>:<name>` after a sale.
export function posSaleHref(
  customer,
  { intent = 'sale', returnTo, returnLabel } = {},
) {
  const params = new URLSearchParams()
  params.set('customer', customer)
  if (intent === 'deposit') params.set('intent', 'deposit')
  const back = safeReturn(returnTo, ['/crm/contactos/'])
  if (back) {
    params.set('return_to', back)
    const label = sanitizeReturnLabel(returnLabel)
    if (label) params.set('return_label', label)
  }
  return `/posapp/pos?${params.toString()}`
}
