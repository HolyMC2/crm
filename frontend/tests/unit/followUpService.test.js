// The list writes a follow-up through the one next-step API (crm.api.next_step)
// and takes back what the crm/pipeline hooks derived instead of writing it.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    api.calls.push(args)
    return api.behavior(...args)
  },
}))

import {
  completeFollowUp,
  readNextActivity,
  saveFollowUp,
} from '@/utils/followUpService'

const DRAFT = {
  deal: 'CRM-DEAL-2026-00042',
  owner: 'ana@example.invalid',
  title: 'Confirmar entrega',
  date: '2026-09-16',
  time: '09:15',
  type: 'Call',
}
const STATE = {
  deal: 'CRM-DEAL-2026-00042',
  task: '77',
  at: '2026-09-16 09:15:00',
  title: 'Confirmar entrega',
  type: 'Call',
}
const ACTIVITY = {
  next_activity_task: '77',
  next_activity_at: '2026-09-16 09:15:00',
  next_activity_title: 'Confirmar entrega',
  next_activity_type: 'Call',
}

beforeEach(() => {
  api.calls = []
  api.behavior = async () => ({ ...STATE })
})

describe('saving a follow-up from the list', () => {
  it('a new step goes to the deal owner, in one call, and the row takes what came back', async () => {
    const activity = await saveFollowUp({ ...DRAFT, task: '' })
    expect(api.calls).toEqual([
      [
        'crm.api.next_step.schedule',
        {
          deal: 'CRM-DEAL-2026-00042',
          title: 'Confirmar entrega',
          at: '2026-09-16 09:15:00',
          activity_type: 'Call',
          owner: 'ana@example.invalid',
        },
      ],
    ])
    expect(activity).toEqual(ACTIVITY)
  })

  it('reschedules the step the deal already points at and keeps its assignee', async () => {
    await saveFollowUp({ ...DRAFT, task: '77', date: '2026-09-20', time: '' })
    expect(api.calls[0][1]).toEqual({
      deal: 'CRM-DEAL-2026-00042',
      title: 'Confirmar entrega',
      at: '2026-09-20 00:00:00',
      activity_type: 'Call',
      task: '77',
    })
  })

  it('never writes a next_activity field on the deal', async () => {
    await saveFollowUp({ ...DRAFT, task: '77' })
    expect(JSON.stringify(api.calls)).not.toContain('next_activity')
  })

  it('lets a refused write reach the caller', async () => {
    api.behavior = async () => {
      throw { messages: ['No tienes permiso'] }
    }
    await expect(saveFollowUp({ ...DRAFT, task: '77' })).rejects.toMatchObject({
      messages: ['No tienes permiso'],
    })
  })

  it('completing with no next step clears the row', async () => {
    api.behavior = async () => ({ deal: DRAFT.deal, task: '' })
    expect(await completeFollowUp({ deal: DRAFT.deal, task: '77' })).toEqual({
      next_activity_task: '',
      next_activity_at: '',
      next_activity_title: '',
      next_activity_type: '',
    })
    expect(api.calls[0]).toEqual([
      'crm.api.next_step.complete',
      { deal: DRAFT.deal, task: '77' },
    ])
  })

  it('reads an empty next activity as empty strings, not undefined', async () => {
    api.behavior = async () => ({})
    expect(await readNextActivity('CRM-DEAL-2026-00042')).toEqual({
      next_activity_task: '',
      next_activity_at: '',
      next_activity_title: '',
      next_activity_type: '',
    })
  })
})
