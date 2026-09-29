import { describe, it, expect } from 'vitest'
import {
  funnelDelta,
  funnelModel,
  funnelQuery,
  metricsByStatus,
  parseFunnelQuery,
  percent,
  periodRange,
  previousRange,
} from '@/utils/pipelineMath'

// Deliberately non-default names: outcomes must come from `type`, never names.
const payload = {
  stages: [
    { stage: 'Nuevo', status: 'Nuevo', type: 'Open', position: 1, count: 10 },
    {
      stage: 'Cotizado',
      status: 'Cotizado',
      type: 'Ongoing',
      position: 2,
      count: 6,
    },
    {
      stage: 'Negociando',
      status: 'Negociando',
      type: 'On Hold',
      position: 3,
      count: 4,
    },
    {
      stage: 'Cerrado ok',
      status: 'Cerrado ok',
      type: 'Won',
      position: 4,
      count: 5,
    },
    {
      stage: 'Descartado',
      status: 'Descartado',
      type: 'Lost',
      position: 5,
      count: 7,
    },
    // post-outcome re-entry is not a sales rung
    {
      stage: 'Reabierto',
      status: 'Reabierto',
      type: 'Open',
      position: 6,
      count: 2,
    },
  ],
  historical_stages: [
    { stage: 'Viejo', status: 'Viejo', type: 'Lost', count: 1, hidden: true },
  ],
  unclassified_stages: [
    { stage: 'Raro', status: 'Raro', type: 'Unknown', count: 3 },
  ],
  total: 38,
}

describe('funnelModel: conversion and drop-off', () => {
  const model = funnelModel(payload)
  it('keeps only open rungs before the first outcome, in pipeline order', () => {
    expect(model.steps.map((s) => s.status)).toEqual([
      'Nuevo',
      'Cotizado',
      'Negociando',
    ])
  })
  it('infers "reached" from later rungs plus won, never from lost', () => {
    expect(model.steps.map((s) => s.reached)).toEqual([25, 15, 9])
    expect(model.steps.map((s) => s.stalled)).toEqual([10, 6, 4])
  })
  it('computes stage-to-stage conversion, the last rung converting to won', () => {
    expect(model.steps[0].conversion).toBeCloseTo(60)
    expect(model.steps[1].conversion).toBeCloseTo(60)
    expect(model.steps[2].conversion).toBeCloseTo(55.56, 1)
  })
  it('marks exactly one biggest drop: the lowest conversion', () => {
    expect(model.biggestDrop).toBe('Negociando')
    expect(model.steps.filter((s) => s.biggestDrop)).toHaveLength(1)
  })
  it('reads outcomes by type, including historical stages', () => {
    expect(model.won.count).toBe(5)
    expect(model.lost.count).toBe(8)
    expect(model.lost.statuses.map((s) => s.status)).toEqual([
      'Descartado',
      'Viejo',
    ])
    expect(model.winRate).toBeCloseTo((100 * 5) / 13)
  })
  it('lists off-ladder deals separately', () => {
    expect(model.others.map((s) => s.status)).toEqual(['Reabierto', 'Raro'])
    expect(model.total).toBe(38)
  })
  it('never reports a fake 0 % when a rung has no deals', () => {
    const empty = funnelModel({
      stages: [
        { stage: 'A', status: 'A', type: 'Open', position: 1, count: 0 },
        { stage: 'W', status: 'W', type: 'Won', position: 2, count: 0 },
      ],
    })
    expect(empty.steps[0].conversion).toBeNull()
    expect(empty.biggestDrop).toBeNull()
    expect(empty.winRate).toBeNull()
    expect(percent(1, 0)).toBeNull()
  })
  it('attaches server stage values only when metrics are available', () => {
    expect(model.steps[0].value).toBeNull()
    const metrics = metricsByStatus({
      currency: 'EUR',
      stages: [
        { status: 'Nuevo', commercial_value: 1000 },
        { status: 'Cerrado ok', commercial_value: 250 },
      ],
    })
    const valued = funnelModel(payload, metrics)
    expect(valued.steps[0].value).toBe(1000)
    expect(valued.steps[1].value).toBe(0)
    expect(valued.won.value).toBe(250)
    expect(metricsByStatus(null)).toBeNull()
  })
})

describe('funnelDelta: period over period', () => {
  it('reports count and conversion deltas per stage and overall', () => {
    const now = funnelModel(payload)
    const before = funnelModel({
      stages: [
        {
          stage: 'Nuevo',
          status: 'Nuevo',
          type: 'Open',
          position: 1,
          count: 4,
        },
        {
          stage: 'Cerrado ok',
          status: 'Cerrado ok',
          type: 'Won',
          position: 4,
          count: 4,
        },
        {
          stage: 'Descartado',
          status: 'Descartado',
          type: 'Lost',
          position: 5,
          count: 4,
        },
      ],
    })
    const delta = funnelDelta(now, before)
    expect(delta.total).toBe(38 - 12)
    expect(delta.won).toBe(1)
    expect(delta.lost).toBe(4)
    expect(delta.winRate).toBeCloseTo((100 * 5) / 13 - 50)
    expect(delta.steps.Nuevo.count).toBe(6)
    expect(delta.steps.Nuevo.conversion).toBeCloseTo(60 - 50)
    // a rung with no previous deals has no comparable conversion
    expect(delta.steps.Cotizado.count).toBe(6)
    expect(delta.steps.Cotizado.conversion).toBeNull()
    expect(delta.wonValue).toBeNull()
    expect(funnelDelta(now, null)).toBeNull()
  })
})

describe('period ranges', () => {
  const today = '2026-03-15'
  it('resolves every preset inclusively', () => {
    expect(periodRange('30d', today)).toEqual({ from: '2026-02-14', to: today })
    expect(periodRange('90d', today)).toEqual({ from: '2025-12-16', to: today })
    expect(periodRange('month', today)).toEqual({
      from: '2026-03-01',
      to: today,
    })
    expect(periodRange('prev_month', today)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(periodRange('prev_month', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
    expect(periodRange('year', today)).toEqual({
      from: '2026-01-01',
      to: today,
    })
  })
  it('rejects unusable custom ranges', () => {
    expect(
      periodRange('custom', today, { from: '2026-02-31', to: today }),
    ).toBeNull()
    expect(
      periodRange('custom', today, { from: '2026-03-10', to: '2026-03-01' }),
    ).toBeNull()
    expect(
      periodRange('custom', today, { from: '2026-03-01', to: '2026-03-10' }),
    ).toEqual({ from: '2026-03-01', to: '2026-03-10' })
  })
  it('compares against the previous equal-length window', () => {
    expect(previousRange({ from: '2026-03-01', to: '2026-03-15' })).toEqual({
      from: '2026-02-14',
      to: '2026-02-28',
    })
    expect(previousRange({ from: '2026-02-01', to: '2026-02-28' })).toEqual({
      from: '2026-01-04',
      to: '2026-01-31',
    })
  })
})

describe('URL state', () => {
  it('round-trips a preset and a custom range', () => {
    const preset = { pipeline: 'Ventas', period: 'month', from: '', to: '' }
    expect(funnelQuery(preset)).toEqual({ pipeline: 'Ventas', period: 'month' })
    expect(parseFunnelQuery(funnelQuery(preset))).toEqual(preset)
    const custom = {
      pipeline: 'Ventas',
      period: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    }
    expect(parseFunnelQuery(funnelQuery(custom))).toEqual(custom)
  })
  it('falls back to defaults for unknown or broken input', () => {
    expect(parseFunnelQuery({})).toEqual({
      pipeline: '',
      period: '90d',
      from: '',
      to: '',
    })
    expect(parseFunnelQuery({ period: 'forever' }).period).toBe('90d')
    expect(
      parseFunnelQuery({ period: 'custom', from: '2026-02-10', to: 'x' })
        .period,
    ).toBe('90d')
    expect(parseFunnelQuery({ pipeline: ['A', 'B'] }).pipeline).toBe('A')
  })
})
