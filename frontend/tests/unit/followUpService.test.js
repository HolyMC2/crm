// The list writes a follow-up through the endpoints Deal 360 already uses, and
// re-reads what the crm/pipeline hooks derived instead of writing it.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    api.calls.push(args)
    return api.behavior(...args)
  },
}))

import {
  NEXT_ACTIVITY_FIELDS,
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
const ACTIVITY = {
  next_activity_task: '77',
  next_activity_at: '2026-09-16 09:15:00',
  next_activity_title: 'Confirmar entrega',
  next_activity_type: 'Call',
}

beforeEach(() => {
  api.calls = []
  api.behavior = async (method) =>
    method === 'frappe.client.get_value' ? { ...ACTIVITY } : { name: '77' }
})

describe('saving a follow-up from the list', () => {
  it('inserts a CRM Task when the deal has none, then reads back the derived fields', async () => {
    const activity = await saveFollowUp({ ...DRAFT, task: '' })
    expect(api.calls.map((c) => c[0])).toEqual([
      'frappe.client.insert',
      'frappe.client.get_value',
    ])
    expect(api.calls[0][1]).toEqual({
      doc: {
        doctype: 'CRM Task',
        reference_doctype: 'CRM Deal',
        reference_docname: 'CRM-DEAL-2026-00042',
        assigned_to: 'ana@example.invalid',
        status: 'Todo',
        activity_type: 'Call',
        title: 'Confirmar entrega',
        due_date: '2026-09-16 09:15:00',
      },
    })
    expect(api.calls[1][1]).toEqual({
      doctype: 'CRM Deal',
      filters: 'CRM-DEAL-2026-00042',
      fieldname: NEXT_ACTIVITY_FIELDS,
    })
    expect(activity).toEqual(ACTIVITY)
  })

  it('reschedules the task the deal already points at instead of adding a second', async () => {
    await saveFollowUp({ ...DRAFT, task: '77', date: '2026-09-20', time: '' })
    expect(api.calls.map((c) => c[0])).toEqual([
      'frappe.client.set_value',
      'frappe.client.get_value',
    ])
    expect(api.calls[0][1]).toEqual({
      doctype: 'CRM Task',
      name: '77',
      fieldname: {
        title: 'Confirmar entrega',
        activity_type: 'Call',
        due_date: '2026-09-20 00:00:00',
      },
    })
  })

  it('never writes a next_activity field on the deal', async () => {
    await saveFollowUp({ ...DRAFT, task: '77' })
    const written = JSON.stringify(
      api.calls.filter((c) => c[0] !== 'frappe.client.get_value'),
    )
    expect(written).not.toContain('next_activity')
  })

  it('lets a refused write reach the caller', async () => {
    api.behavior = async () => {
      throw { messages: ['No tienes permiso'] }
    }
    await expect(saveFollowUp({ ...DRAFT, task: '77' })).rejects.toMatchObject({
      messages: ['No tienes permiso'],
    })
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
