import { describe, expect, it } from 'vitest'
import {
  addDays,
  followUpDraftError,
  followUpDue,
  followUpFilters,
  followUpParts,
  followUpTaskDoc,
  followUpTaskValues,
} from '@/utils/dealFollowUp'

describe('follow-up work queues', () => {
  it('distinguishes a missing task from a task awaiting a date', () => {
    expect(followUpFilters('missing', '2026-09-13', ['Ganado', 'Lost'])).toEqual([
      ['next_activity_task', 'is', 'not set'], ['status', 'not in', ['Ganado', 'Lost']],
    ])
    expect(followUpFilters('undated')).toEqual([
      ['next_activity_task', 'is', 'set'], ['next_activity_at', 'is', 'not set'],
    ])
  })
  it('uses the supplied site day for disjoint overdue and today boundaries', () => {
    expect(followUpFilters('overdue', '2026-12-31')).toContainEqual(['next_activity_at', '<', '2026-12-31 00:00:00'])
    expect(followUpFilters('today', '2026-12-31')).toContainEqual(['next_activity_at', 'between', ['2026-12-31 00:00:00', '2026-12-31 23:59:59.999999']])
  })
  it('leaves all deals unconstrained and accepts a tenant with no closed statuses', () => {
    expect(followUpFilters('all')).toEqual([])
    expect(followUpFilters('missing')).toEqual([['next_activity_task', 'is', 'not set']])
  })
})

describe('follow-up due date', () => {
  it('pins an hourless follow-up to the midnight the queues cut on', () => {
    expect(followUpDue('2026-09-16', '')).toBe('2026-09-16 00:00:00')
    expect(followUpDue('2026-09-16', '10:30')).toBe('2026-09-16 10:30:00')
    expect(followUpDue('2026-09-16', '10:30:45')).toBe('2026-09-16 10:30:45')
  })
  it('refuses anything that is not a date', () => {
    expect(followUpDue('', '10:30')).toBe('')
    expect(followUpDue('16/09/2026', '')).toBe('')
    expect(followUpDue('2026-09-16', 'a las diez')).toBe('2026-09-16 00:00:00')
  })
  it('splits a stored due date back into the fields the popover edits', () => {
    expect(followUpParts('2026-09-16 10:30:00')).toEqual({ date: '2026-09-16', time: '10:30' })
    // midnight is the "no hour" marker, not a choice to show back
    expect(followUpParts('2026-09-16 00:00:00')).toEqual({ date: '2026-09-16', time: '' })
    expect(followUpParts('')).toEqual({ date: '', time: '' })
    expect(followUpParts(null)).toEqual({ date: '', time: '' })
  })
  it('walks days on the site date, not the browser clock', () => {
    expect(addDays('2026-09-15', 1)).toBe('2026-09-16')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('', 3)).toBe('')
  })
})

describe('the canonical follow-up task', () => {
  const draft = { deal: 'CRM-DEAL-2026-00042', owner: 'ana@example.invalid', title: '  Confirmar entrega  ', date: '2026-09-16', time: '09:15', type: 'Call' }

  it('inserts the same document Deal 360 does', () => {
    expect(followUpTaskDoc(draft)).toEqual({
      doctype: 'CRM Task',
      reference_doctype: 'CRM Deal',
      reference_docname: 'CRM-DEAL-2026-00042',
      assigned_to: 'ana@example.invalid',
      status: 'Todo',
      activity_type: 'Call',
      title: 'Confirmar entrega',
      due_date: '2026-09-16 09:15:00',
    })
  })
  it('never writes next_activity_* — those are derived from the task', () => {
    const doc = followUpTaskDoc(draft)
    expect(Object.keys(doc).some((k) => k.startsWith('next_activity'))).toBe(false)
  })
  it('leaves an unowned deal unassigned instead of assigning an empty user', () => {
    expect('assigned_to' in followUpTaskDoc({ ...draft, owner: '' })).toBe(false)
  })
  it('defaults the activity type and drops an undated due date', () => {
    const doc = followUpTaskDoc({ deal: 'D', title: 'Llamar', date: '', type: '' })
    expect(doc.activity_type).toBe('Task')
    expect('due_date' in doc).toBe(false)
  })
  it('reschedules only what the popover edits', () => {
    expect(followUpTaskValues(draft)).toEqual({
      title: 'Confirmar entrega',
      activity_type: 'Call',
      due_date: '2026-09-16 09:15:00',
    })
    // clearing the date must null the column, not write an empty string
    expect(followUpTaskValues({ title: 'X', date: '' }).due_date).toBeNull()
  })
})

describe('follow-up draft validation', () => {
  it('names the rule that is broken so the caller owns the wording', () => {
    expect(followUpDraftError({ title: '', date: '2026-09-16' })).toBe('title')
    expect(followUpDraftError({ title: '   ', date: '2026-09-16' })).toBe('title')
    expect(followUpDraftError({ title: 'Llamar', date: '' })).toBe('date')
    expect(followUpDraftError({ title: 'Llamar', date: '2026-09-16', time: '25:00' })).toBe('time')
    expect(followUpDraftError({ title: 'Llamar', date: '2026-09-16', time: '' })).toBe('')
  })
})
