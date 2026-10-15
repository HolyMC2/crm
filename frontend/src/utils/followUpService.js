// Writing a deal's follow-up, from the list or anywhere else.
//
// One write path: crm.api.next_step, the API Deal 360, the keys and Hoy use. It
// writes CRM Task; `next_activity_*` on CRM Deal is a denormalisation the
// crm/pipeline hooks keep in step, so nothing here writes those fields. The
// server answers with the deal's step as the hooks left it, and the caller
// refreshes its row with that.
import { call } from 'frappe-ui'

import { followUpDue } from './dealFollowUp'
import { rowNextStep } from './nextStep'

export const NEXT_ACTIVITY_FIELDS = [
  'next_activity_task',
  'next_activity_at',
  'next_activity_title',
  'next_activity_type',
]

export async function readNextActivity(deal) {
  return rowNextStep(await call('crm.api.next_step.get', { deal }))
}

/**
 * Create or reschedule the deal's follow-up task.
 * @param {{deal: string, task?: string, owner?: string, title: string, date: string, time?: string, type?: string}} draft
 * @returns {Promise<object>} the deal's next-activity fields as the hooks left them
 */
export async function saveFollowUp(draft) {
  const state = await call('crm.api.next_step.schedule', {
    deal: draft.deal,
    title: String(draft.title || '').trim(),
    at: followUpDue(draft.date, draft.time),
    activity_type: draft.type || 'Task',
    // A new step goes to the deal's owner; an existing one keeps its assignee.
    ...(draft.task
      ? { task: draft.task }
      : { owner: draft.owner || undefined }),
  })
  return rowNextStep(state)
}

/**
 * Mark the deal's follow-up task done, with no next step.
 * @param {{deal: string, task: string}} target
 * @returns {Promise<object>} the deal's next-activity fields as the hooks left them
 */
export async function completeFollowUp({ deal, task }) {
  return rowNextStep(await call('crm.api.next_step.complete', { deal, task }))
}
