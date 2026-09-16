// Writing a deal's follow-up, from the list or anywhere else.
//
// The endpoints are the ones Deal 360's «Próximo seguimiento» section already
// uses: frappe.client.insert for a task that does not exist yet (what the shared
// CRM Task modal submits) and frappe.client.set_value for one that does. There is
// deliberately no second write path.
//
// `next_activity_*` on CRM Deal is a denormalisation the crm/pipeline hooks keep
// in step with CRM Task, so nothing here writes those fields: after the task is
// saved the deal is re-read and the caller refreshes its row with what the hooks
// derived.
import { call } from 'frappe-ui'

import { followUpTaskDoc, followUpTaskValues } from './dealFollowUp'

export const NEXT_ACTIVITY_FIELDS = [
  'next_activity_task',
  'next_activity_at',
  'next_activity_title',
  'next_activity_type',
]

export async function readNextActivity(deal) {
  const data = await call('frappe.client.get_value', {
    doctype: 'CRM Deal',
    filters: deal,
    fieldname: NEXT_ACTIVITY_FIELDS,
  })
  const out = {}
  for (const field of NEXT_ACTIVITY_FIELDS) out[field] = data?.[field] || ''
  return out
}

/**
 * Create or reschedule the deal's follow-up task.
 * @param {{deal: string, task?: string, owner?: string, title: string, date: string, time?: string, type?: string}} draft
 * @returns {Promise<object>} the deal's next-activity fields as the hooks left them
 */
export async function saveFollowUp(draft) {
  if (draft?.task) {
    await call('frappe.client.set_value', {
      doctype: 'CRM Task',
      name: draft.task,
      fieldname: followUpTaskValues(draft),
    })
  } else {
    await call('frappe.client.insert', { doc: followUpTaskDoc(draft) })
  }
  return readNextActivity(draft.deal)
}
