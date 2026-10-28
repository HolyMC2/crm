// The person an event is with, and how to reach them: the first contact among its guests,
// else the deal or lead it is linked to. Read with the worker's own read permission
// (frappe.client.get_value); a record they may not read simply offers no number.
import { call } from 'frappe-ui'

const SOURCES = {
  Contact: { fields: ['mobile_no', 'phone', 'full_name'], name: 'full_name' },
  'CRM Deal': {
    fields: ['mobile_no', 'phone', 'lead_name', 'organization'],
    name: 'lead_name',
  },
  'CRM Lead': {
    fields: ['mobile_no', 'phone', 'lead_name'],
    name: 'lead_name',
  },
}

/** Where to look, in order: contact guests first, then the linked record. */
export function reachCandidates(detail) {
  const rows = []
  for (const person of detail?.attendees || [])
    if (person?.doctype === 'Contact' && person.name)
      rows.push({ doctype: 'Contact', name: person.name, label: person.label })
  const ref = detail?.reference
  if (ref?.doctype && SOURCES[ref.doctype] && ref.name)
    rows.push({ doctype: ref.doctype, name: ref.name, label: '' })
  return rows
}

export const phoneDigits = (value) => String(value || '').replace(/[^+\d]/g, '')

const cache = new Map()
async function read(row) {
  const id = `${row.doctype}:${row.name}`
  if (!cache.has(id))
    cache.set(
      id,
      call('frappe.client.get_value', {
        doctype: row.doctype,
        filters: row.name,
        fieldname: SOURCES[row.doctype].fields,
      }).catch(() => null),
    )
  return cache.get(id)
}

/** { phone, who, doctype, name } of the first candidate with a number, or null. */
export async function reachFor(detail) {
  for (const row of reachCandidates(detail)) {
    const value = await read(row)
    const phone = phoneDigits(value?.mobile_no || value?.phone)
    if (phone.replace(/\D/g, '').length >= 7)
      return {
        phone,
        who: row.label || value?.[SOURCES[row.doctype].name] || '',
        doctype: row.doctype,
        name: row.name,
      }
  }
  return null
}

/** wa.me link; an upcoming event carries a short confirmation the worker can edit. */
export function whatsappLink(phone, text = '') {
  const digits = phoneDigits(phone).replace(/^\+/, '')
  if (!digits) return ''
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function forgetReach() {
  cache.clear()
}
