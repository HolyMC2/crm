// Pure helpers behind WorkloadView.vue (P2 S11): cap math (percent / bar width / color
// token) + the client-side column sort (null-sinks-to-bottom), all dependency-free.
import { describe, it, expect } from 'vitest'
import {
  capPercent,
  barWidth,
  barToken,
  sortWorkload,
  retainFailedSelection,
  safeWorkloadState,
  workItemHref,
  riskLevel,
  sortByRisk,
  rankCandidates,
  encodeWorkloadQuery,
  decodeWorkloadQuery,
  sameWorkloadQuery,
  dueState,
  ageDays,
  formatSiteDate,
} from '@/utils/workloadFormat'

describe('capPercent', () => {
  it('returns null when no cap is configured', () => {
    expect(capPercent(5, 0)).toBeNull()
    expect(capPercent(5, null)).toBeNull()
    expect(capPercent(5, undefined)).toBeNull()
  })
  it('rounds the percentage of cap consumed', () => {
    expect(capPercent(0, 10)).toBe(0)
    expect(capPercent(5, 10)).toBe(50)
    expect(capPercent(10, 10)).toBe(100)
    expect(capPercent(13, 10)).toBe(130) // over cap is not clamped here
    expect(capPercent(1, 3)).toBe(33)
  })
  it('coerces non-numeric load to 0', () => {
    expect(capPercent(undefined, 10)).toBe(0)
  })
})

describe('barWidth', () => {
  it('is 0 when no cap (bar hidden)', () => {
    expect(barWidth(5, 0)).toBe(0)
  })
  it('clamps to 0..100', () => {
    expect(barWidth(0, 10)).toBe(0)
    expect(barWidth(5, 10)).toBe(50)
    expect(barWidth(10, 10)).toBe(100)
    expect(barWidth(30, 10)).toBe(100) // over cap pins at full
  })
})

describe('barToken', () => {
  it('neutral gray when no cap', () => {
    expect(barToken(4, 0)).toBe('bg-surface-gray-4')
  })
  it('calm neutral fill under 75% of cap', () => {
    expect(barToken(7, 10)).toBe('bg-surface-gray-6') // 70%
    expect(barToken(0, 10)).toBe('bg-surface-gray-6')
  })
  it('amber from 75% up to (not incl.) 100%', () => {
    expect(barToken(8, 10)).toBe('bg-surface-amber-5') // 80%
    expect(barToken(75, 100)).toBe('bg-surface-amber-5')
  })
  it('red at or over cap', () => {
    expect(barToken(10, 10)).toBe('bg-surface-red-5') // 100%
    expect(barToken(14, 10)).toBe('bg-surface-red-5') // 140%
  })
})

describe('sortWorkload', () => {
  const rows = [
    {
      full_name: 'Beto',
      open_total: 6,
      open_deals: 4,
      open_leads: 2,
      sla_overdue_count: 1,
    },
    {
      full_name: 'Ana',
      open_total: 9,
      open_deals: 3,
      open_leads: 6,
      sla_overdue_count: null,
    },
    {
      full_name: 'Caro',
      open_total: 2,
      open_deals: 1,
      open_leads: 1,
      sla_overdue_count: 3,
    },
  ]

  it('never mutates the source array', () => {
    const snapshot = JSON.parse(JSON.stringify(rows))
    sortWorkload(rows, 'open_total', 'desc')
    expect(rows).toEqual(snapshot)
  })
  it('numeric desc (open_total)', () => {
    expect(
      sortWorkload(rows, 'open_total', 'desc').map((r) => r.full_name),
    ).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('numeric asc (open_deals)', () => {
    expect(
      sortWorkload(rows, 'open_deals', 'asc').map((r) => r.full_name),
    ).toEqual(['Caro', 'Ana', 'Beto'])
  })
  it('null overdue sinks to the bottom in BOTH directions', () => {
    expect(
      sortWorkload(rows, 'sla_overdue_count', 'asc').map((r) => r.full_name),
    ).toEqual(['Beto', 'Caro', 'Ana'])
    expect(
      sortWorkload(rows, 'sla_overdue_count', 'desc').map((r) => r.full_name),
    ).toEqual(['Caro', 'Beto', 'Ana'])
  })
  it('text sort uses es locale (asc)', () => {
    expect(
      sortWorkload(rows, 'full_name', 'asc').map((r) => r.full_name),
    ).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('tolerates null / empty input', () => {
    expect(sortWorkload(null, 'open_total')).toEqual([])
    expect(sortWorkload([], 'open_total')).toEqual([])
  })
})

describe('workload command and return continuity', () => {
  it('retains missing and failed outcomes instead of claiming that the whole batch moved', () => {
    const rows = [1, 2, 3].map((name) => ({
      doctype: 'CRM Task',
      name: String(name),
      modified: 'old-version',
    }))
    expect(
      retainFailedSelection(rows, [
        { ...rows[0], ok: true },
        { ...rows[1], ok: false },
      ]),
    ).toEqual([rows[1], rows[2]])
    expect(rows).toHaveLength(3)
  })
  it('preserves an explicit unassigned owner and rejects malformed stored paging state', () => {
    expect(
      safeWorkloadState({
        owner: '',
        kind: 'tasks',
        overdue: true,
        offset: 25,
        scroll: 172,
      }),
    ).toMatchObject({
      owner: '',
      bucket: 'overdue',
      offset: 25,
      scroll: 172,
    })
    expect(
      safeWorkloadState({
        owner: {},
        kind: 'arbitrary',
        offset: -1,
        scroll: Infinity,
      }),
    ).toMatchObject({ owner: null, kind: 'deals', offset: 0, scroll: 0 })
  })
  it('links actual native records with encoded identities', () => {
    expect(workItemHref({ doctype: 'CRM Task', name: 'task/1' })).toBe(
      '/app/crm-task/task%2F1',
    )
    expect(workItemHref({ doctype: 'CRM Deal', name: 'deal?1' })).toBe(
      '/crm/deals/deal%3F1',
    )
  })
})

describe('risk ordering', () => {
  const agents = [
    { user: 'calm', full_name: 'Calm', open_total: 2, overdue_tasks: 0 },
    { user: 'near', full_name: 'Near', open_total: 8, overdue_tasks: 0 },
    { user: 'late', full_name: 'Late', open_total: 3, overdue_tasks: 4 },
    { user: 'over', full_name: 'Over', open_total: 12, overdue_tasks: 0 },
    { user: 'late2', full_name: 'Late2', open_total: 1, overdue_tasks: 9 },
  ]
  it('labels one risk per person, most urgent first', () => {
    expect(riskLevel(agents[3], 10)).toBe('over')
    expect(riskLevel({ open_total: 12, overdue_tasks: 3 }, 10)).toBe('over')
    expect(riskLevel(agents[2], 10)).toBe('behind')
    expect(riskLevel(agents[1], 10)).toBe('near')
    expect(riskLevel(agents[0], 10)).toBe('ok')
    expect(riskLevel(agents[0], 0)).toBe('none')
    expect(riskLevel(agents[2], 0)).toBe('behind')
  })
  it('surfaces problems first without mutating the source', () => {
    const snapshot = agents.map((row) => row.user)
    expect(sortByRisk(agents, 10).map((row) => row.user)).toEqual([
      'over',
      'late2',
      'late',
      'near',
      'calm',
    ])
    expect(agents.map((row) => row.user)).toEqual(snapshot)
    expect(sortByRisk(null, 10)).toEqual([])
  })
  it('ranks reassignment targets by lowest visible load, unknown load last', () => {
    const ranked = rankCandidates(
      [
        { user: 'over', full_name: 'Over' },
        { user: 'hidden', full_name: 'Hidden' },
        { user: 'calm', full_name: 'Calm' },
        { user: 'late2', full_name: 'Late2' },
      ],
      agents,
    )
    expect(ranked.map((row) => [row.user, row.load])).toEqual([
      ['late2', 1],
      ['calm', 2],
      ['over', 12],
      ['hidden', null],
    ])
  })
})

describe('URL queue state', () => {
  it('writes only non-default keys and round-trips', () => {
    expect(encodeWorkloadQuery({})).toEqual({})
    const state = safeWorkloadState({
      pipeline: 'Ventas',
      company: 'Tienda A',
      owner: 'ana@example.test',
      kind: 'tasks',
      bucket: 'today',
      offset: 50,
      agentOffset: 25,
    })
    const query = encodeWorkloadQuery(state)
    expect(query).toEqual({
      pipeline: 'Ventas',
      company: 'Tienda A',
      owner: 'ana@example.test',
      kind: 'tasks',
      bucket: 'today',
      page: '3',
      people: '2',
    })
    expect(decodeWorkloadQuery(query)).toEqual(state)
  })
  it('distinguishes unassigned from every owner', () => {
    const unassigned = encodeWorkloadQuery({ owner: '' })
    expect(unassigned).toEqual({ unassigned: '1' })
    expect(decodeWorkloadQuery(unassigned).owner).toBe('')
    expect(decodeWorkloadQuery({ kind: 'leads' }).owner).toBeNull()
  })
  it('returns null without workload keys so the session copy can restore', () => {
    expect(decodeWorkloadQuery({})).toBeNull()
    expect(decodeWorkloadQuery({ utm: 'x' })).toBeNull()
    expect(decodeWorkloadQuery(null)).toBeNull()
  })
  it('rejects malformed values and keeps due buckets on tasks only', () => {
    expect(
      decodeWorkloadQuery({
        kind: 'deals',
        bucket: 'overdue',
        page: '0',
        people: '-3',
        owner: ['a@example.test', 'b@example.test'],
      }),
    ).toMatchObject({
      kind: 'deals',
      bucket: 'all',
      offset: 0,
      agentOffset: 0,
      owner: 'a@example.test',
    })
    expect(decodeWorkloadQuery({ bucket: 'weird', kind: 'tasks' }).bucket).toBe(
      'all',
    )
    expect(decodeWorkloadQuery({ page: '2.5' }).offset).toBe(0)
  })
  it('reads the legacy stored overdue flag as the overdue bucket', () => {
    expect(safeWorkloadState({ kind: 'tasks', overdue: true }).bucket).toBe(
      'overdue',
    )
    expect(safeWorkloadState({ kind: 'deals', overdue: true }).bucket).toBe(
      'all',
    )
  })
  it('compares states by their URL form (scroll is not navigation)', () => {
    expect(
      sameWorkloadQuery({ kind: 'tasks', scroll: 10 }, { kind: 'tasks' }),
    ).toBe(true)
    expect(sameWorkloadQuery({ owner: '' }, { owner: null })).toBe(false)
  })
})

describe('site-time buckets', () => {
  const asOf = '2026-09-28 10:15:00.123456'
  it('classifies due dates against the site timestamp like the server', () => {
    expect(dueState('2026-09-28 09:00:00', asOf)).toBe('overdue')
    expect(dueState('2026-09-27 23:00:00', asOf)).toBe('overdue')
    expect(dueState('2026-09-28 18:00:00', asOf)).toBe('today')
    expect(dueState('2026-09-29 08:00:00', asOf)).toBe('later')
    expect(dueState(null, asOf)).toBe('none')
    expect(dueState('2026-09-28 18:00:00', '')).toBe('none')
  })
  it('counts whole days without change', () => {
    expect(ageDays('2026-09-20 23:59:00', asOf)).toBe(8)
    expect(ageDays('2026-09-28 01:00:00', asOf)).toBe(0)
    expect(ageDays('', asOf)).toBeNull()
  })
  it('formats with the site date format, time only when present', () => {
    expect(formatSiteDate('2026-09-28 18:05:00', 'dd-mm-yyyy')).toBe(
      '28-09-2026 18:05',
    )
    expect(formatSiteDate('2026-09-28 00:00:00', 'mm/dd/yyyy')).toBe(
      '09/28/2026',
    )
    expect(formatSiteDate('2026-09-28', '')).toBe('2026-09-28')
    expect(formatSiteDate(null, 'dd-mm-yyyy')).toBe('')
  })
})
