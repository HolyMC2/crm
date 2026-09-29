import { describe, expect, it } from 'vitest'
import {
  dealRowRoute,
  filterValues,
  withMultiFilter,
  nextStepRow,
  nextStepValue,
  pipelineStageOptions,
  selectedEquals,
  summarizeDealMetrics,
  withEqualsFilter,
  withPipelineFilter,
} from '@/utils/dealsListSummary'

describe('summary strip', () => {
  const statuses = [
    { value: 'Nuevo', type: 'Open' },
    { value: 'Negociación', type: 'Ongoing' },
    { value: 'Ganado', type: 'Won' },
  ]
  it('adds counts and values and weighs only open stages', () => {
    const s = summarizeDealMetrics(
      [
        {
          status: 'Nuevo',
          count: 3,
          commercial_value: 300,
          weighted_forecast: 30,
        },
        {
          status: 'Negociación',
          count: 2,
          commercial_value: 500,
          weighted_forecast: 250,
          missing_exchange_rate_count: 1,
        },
        {
          status: 'Ganado',
          count: 1,
          commercial_value: 900,
          weighted_forecast: 900,
        },
      ],
      statuses,
    )
    expect(s.count).toBe(6)
    expect(s.value).toBe(1700)
    expect(s.weighted).toBe(280)
    expect(s.missingFx).toBe(1)
    expect(s.byStatus.Nuevo.count).toBe(3)
  })

  it('is zero with no data', () => {
    expect(summarizeDealMetrics(undefined, statuses)).toMatchObject({
      count: 0,
      value: 0,
      weighted: 0,
    })
  })
})

describe('pipeline quick filter', () => {
  const pipelines = [
    {
      name: 'P-Ventas',
      stages: [
        { name: 'Nuevo', type: 'Open' },
        { name: 'Viejo', type: 'Open', archived: 1 },
        { name: 'Ganado', type: 'Won' },
      ],
    },
  ]
  const statuses = [
    { name: 'Nuevo', type: 'Open' },
    { name: 'Oculto', type: 'Open', hidden: 1 },
    { name: 'Perdido', type: 'Lost' },
  ]

  it('offers the chosen pipeline stages, minus archived ones', () => {
    expect(
      pipelineStageOptions(pipelines, 'P-Ventas', statuses).map((o) => o.value),
    ).toEqual(['Nuevo', 'Ganado'])
  })

  it('offers every visible status without a pipeline', () => {
    expect(
      pipelineStageOptions(pipelines, '', statuses).map((o) => o.value),
    ).toEqual(['Nuevo', 'Perdido'])
  })

  it('offers nothing for an unknown pipeline', () => {
    expect(pipelineStageOptions(pipelines, 'P-X', statuses)).toEqual([])
  })

  it('drops a stage the new pipeline does not have', () => {
    expect(
      withPipelineFilter({ status: 'Perdido', x: 1 }, 'P-Ventas', ['Nuevo']),
    ).toEqual({ pipeline: 'P-Ventas', x: 1 })
    expect(
      withPipelineFilter({ status: 'Nuevo' }, 'P-Ventas', ['Nuevo']),
    ).toEqual({ pipeline: 'P-Ventas', status: 'Nuevo' })
    expect(withPipelineFilter({ pipeline: 'P', status: 'A' }, '', [])).toEqual({
      status: 'A',
    })
  })

  it('reads only plain equality filters', () => {
    expect(selectedEquals({ pipeline: 'P' }, 'pipeline')).toBe('P')
    expect(selectedEquals({ pipeline: ['in', ['P']] }, 'pipeline')).toBe('')
    expect(withEqualsFilter({ status: 'A' }, 'status', '')).toEqual({})
    expect(withEqualsFilter({}, 'status', 'B')).toEqual({ status: 'B' })
  })
})

describe('next-step cell adapter', () => {
  it('maps the provider value onto the next_activity fields', () => {
    const row = nextStepRow(
      {
        name: 'D-1',
        deal_name: 'Ana',
        deal_owner: { name: 'ana@x', full_name: 'Ana', label: 'Ana' },
      },
      {
        at: '2026-09-28 10:00:00',
        task: 'TASK-9',
        type: 'Call',
        overdue: true,
      },
    )
    expect(row).toMatchObject({
      name: 'D-1',
      deal_name: 'Ana',
      deal_owner: 'ana@x',
      next_activity_task: 'TASK-9',
      next_activity_at: '2026-09-28 10:00:00',
      next_activity_type: 'Call',
      next_activity_title: '',
    })
  })

  it('reads an empty value as no follow-up', () => {
    expect(nextStepRow({ name: 'D-1' }, null).next_activity_task).toBe('')
  })

  it('turns a saved activity back into the provider shape', () => {
    expect(
      nextStepValue({
        next_activity_task: 'TASK-2',
        next_activity_at: '',
        next_activity_title: 'Llamar',
        next_activity_type: 'Task',
      }),
    ).toEqual({ at: '', task: 'TASK-2', title: 'Llamar', type: 'Task' })
    expect(nextStepValue({ next_activity_task: '' })).toBeNull()
  })
})

describe('row route', () => {
  it('opens Deal 360 when the route exists', () => {
    expect(dealRowRoute((n) => n === 'Deal 360', 'D-1')).toEqual({
      name: 'Deal 360',
      params: { dealId: 'D-1' },
      query: {},
    })
    expect(dealRowRoute(() => false, 'D-1', { view: 'V' }).name).toBe('Deal')
  })
})

describe('phone filter sheet', () => {
  it('reads single and in-list filters', () => {
    expect(filterValues({ status: 'Nuevo' }, 'status')).toEqual(['Nuevo'])
    expect(filterValues({ status: ['in', ['A', 'B']] }, 'status')).toEqual([
      'A',
      'B',
    ])
    expect(filterValues({ status: ['like', '%a%'] }, 'status')).toEqual([])
    expect(filterValues({}, 'status')).toEqual([])
  })

  it('writes the smallest filter for the picked values', () => {
    expect(withMultiFilter({ x: 1 }, 'status', ['A'])).toEqual({
      x: 1,
      status: 'A',
    })
    expect(withMultiFilter({}, 'status', ['A', 'B', 'A'])).toEqual({
      status: ['in', ['A', 'B']],
    })
    expect(withMultiFilter({ status: 'A' }, 'status', [])).toEqual({})
  })
})
