import { describe, expect, it } from 'vitest'
import { followUpFilters } from '@/utils/dealFollowUp'

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
