// Board money rules (utils/pipelineMath.js): which of the two deal values shows,
// and how a column header weights it by stage probability.
import { describe, it, expect } from 'vitest'
import {
  displayValue,
  funnelLadder,
  stageValue,
  weightedTotal,
} from '@/utils/pipelineMath'

describe('funnelLadder', () => {
  it.each(['Won', 'Lost'])(
    'stops at the first %s outcome before warranty re-entry',
    (type) => {
      const quoting = { stage: 'En Cotización', type: 'Open', count: 0 }
      const ready = { stage: 'Por Entregar', type: 'Open', count: 3 }
      expect(
        funnelLadder([
          quoting,
          { type: 'On Hold' },
          ready,
          { type },
          { stage: 'Garantía', type: 'Open', count: 2 },
        ]),
      ).toEqual([quoting, ready])
    },
  )

  it('keeps open stages when there is no outcome and accepts an empty ladder', () => {
    const stage = { type: 'Open', count: 0 }
    expect(funnelLadder([stage, { type: 'Ongoing' }])).toEqual([stage])
    expect(funnelLadder()).toEqual([])
  })
})

describe('displayValue', () => {
  it('prefers the expected value when it is set', () => {
    expect(displayValue({ expected_deal_value: 1200, deal_value: 300 })).toBe(
      1200,
    )
  })

  it('falls back to the invoiced value when expected is missing, zero or blank', () => {
    expect(displayValue({ deal_value: 300 })).toBe(300)
    expect(displayValue({ expected_deal_value: 0, deal_value: 300 })).toBe(300)
    expect(displayValue({ expected_deal_value: null, deal_value: 300 })).toBe(
      300,
    )
    expect(displayValue({ expected_deal_value: '', deal_value: 300 })).toBe(300)
  })

  it('reads the numeric strings the wire sends', () => {
    expect(displayValue({ expected_deal_value: '1200.50' })).toBe(1200.5)
  })

  it('is 0 for an empty or missing row', () => {
    expect(displayValue({})).toBe(0)
    expect(displayValue(null)).toBe(0)
    expect(displayValue({ expected_deal_value: 'x', deal_value: 'y' })).toBe(0)
  })
})

describe('weightedTotal', () => {
  const statuses = [
    { value: 'En Cotizacion', probability: 25 },
    { value: 'Aprobado', probability: 60 },
    { value: 'Completado', probability: 100 },
  ]

  it('weights each stage by its probability', () => {
    const counts = {
      'En Cotizacion': { count: 2, expected_deal_value: 1000, deal_value: 0 },
      Aprobado: { count: 1, expected_deal_value: 0, deal_value: 500 },
      Completado: { count: 3, expected_deal_value: 0, deal_value: 900 },
    }
    // 1000*.25 + 500*.60 + 900*1 = 250 + 300 + 900
    expect(weightedTotal(counts, statuses)).toBe(1450)
  })

  it('ignores stages with no probability rather than counting them in full', () => {
    const counts = { Abandonado: { count: 4, deal_value: 8000 } }
    expect(
      weightedTotal(counts, [{ value: 'Abandonado', probability: null }]),
    ).toBe(0)
    expect(weightedTotal(counts, [{ value: 'Abandonado' }])).toBe(0)
  })

  it('ignores stages with no loaded aggregate, and hidden stages absent from the list', () => {
    const counts = {
      Aprobado: { count: 1, deal_value: 500 },
      Approved: { count: 9, deal_value: 9000 },
    }
    expect(weightedTotal(counts, statuses)).toBe(300)
  })

  it('accepts status rows keyed by name as well as value', () => {
    const counts = { Aprobado: { expected_deal_value: 200 } }
    expect(weightedTotal(counts, [{ name: 'Aprobado', probability: 50 }])).toBe(
      100,
    )
  })

  it('is 0 with nothing to add up', () => {
    expect(weightedTotal()).toBe(0)
    expect(weightedTotal({}, statuses)).toBe(0)
    expect(weightedTotal({ Aprobado: { deal_value: 500 } }, [])).toBe(0)
  })
})

describe('stageValue', () => {
  it('takes the larger of the expected and invoiced sums', () => {
    expect(stageValue({ expected_deal_value: 100, deal_value: 68250 })).toBe(
      68250,
    )
    expect(stageValue({ expected_deal_value: 5000, deal_value: 2050 })).toBe(
      5000,
    )
    expect(stageValue({})).toBe(0)
  })
  it('feeds the weighted total', () => {
    const counts = { Won: { expected_deal_value: 100, deal_value: 1000 } }
    expect(weightedTotal(counts, [{ value: 'Won', probability: 100 }])).toBe(
      1000,
    )
  })
})
