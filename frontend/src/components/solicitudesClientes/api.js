// «Solicitudes de clientes»: the staff calls to the cell
// (doco.docoutils.storefront_support_staff). Reading is GET; a step is POST.
// Each queue has its roles on the cell: a person sees only the queues they read.
import { call, frappeRequest } from 'frappe-ui'

const API = 'doco.docoutils.storefront_support_staff.'

/** {profile, profiles, queues:[{key, count, overdue}], items, closed} */
export const readQueue = ({ storefront = '', closed = false } = {}) =>
  frappeRequest({
    url: API + 'queue',
    method: 'GET',
    params: {
      ...(storefront ? { storefront } : {}),
      ...(closed ? { closed: 1 } : {}),
    },
  })

/** One request: the item plus words, contact, customer, documents, history, actions, citas, scheduled, notifies */
export const readRequest = (id) =>
  frappeRequest({ url: API + 'request', method: 'GET', params: { id } })

/** {id, action, reason?, mode?, when?} -> the request after the step, plus `notified` */
export const takeStep = (payload) => call(API + 'act', payload)

/** {count, urgent} for the door, or null when the person reads no queue */
export const readCounts = () =>
  frappeRequest({ url: API + 'counts', method: 'GET' })
