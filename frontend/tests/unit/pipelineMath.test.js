import { describe, it, expect } from 'vitest'
import {
  displayValue,
  dealProbability,
  funnelLadder,
  stageValue,
  weightedTotal,
} from '@/utils/pipelineMath'

describe('commercial metric contract', () => {
  const rows = [
    { expected_deal_value: 100, deal_value: 10, probability: 80 },
    { expected_deal_value: 0, deal_value: 900, probability: 20 },
  ]
  it('reconciles heterogeneous deal cards with the server stage sum', () => {
    const cardTotal = rows.reduce((sum, row) => sum + displayValue(row), 0)
    expect(cardTotal).toBe(1000)
    expect(
      stageValue({
        commercial_value: 1000,
        expected_deal_value: 100,
        deal_value: 910,
      }),
    ).toBe(cardTotal)
    // MAX(SUM(expected), SUM(deal)) was 910, dropping 90 from these same cards.
  })
  it('uses each deal probability, including explicit zero, rather than weighting a whole stage', () => {
    const weighted = rows.reduce(
      (sum, row) => sum + (displayValue(row) * dealProbability(row)) / 100,
      0,
    )
    expect(weighted).toBe(260)
    expect(
      weightedTotal({ Proposal: { weighted_forecast: weighted } }, [
        { name: 'Proposal', type: 'Ongoing', probability: 50 },
      ]),
    ).toBe(260)
    expect(dealProbability({ probability: 0 }, { probability: 60 })).toBe(0)
    expect(dealProbability({ probability: null }, { probability: 60 })).toBe(60)
  })
  it('never forecasts outcomes or archived stages even when supplied a stale aggregate', () => {
    for (const stage of [
      { type: 'Lost' },
      { type: 'Won' },
      { type: 'Unknown' },
      { type: 'Open', archived: 1 },
    ]) {
      expect(
        weightedTotal({ X: { weighted_forecast: 500 } }, [
          { name: 'X', ...stage },
        ]),
      ).toBe(0)
    }
  })
  it('shows the recorded won amount without describing it as paid', () => {
    expect(
      displayValue(
        { expected_deal_value: 100, deal_value: 68250 },
        { type: 'Won' },
      ),
    ).toBe(68250)
    expect(
      displayValue(
        { expected_deal_value: 100, deal_value: 0 },
        { type: 'Won' },
      ),
    ).toBe(100)
  })
  it('does not reconstruct a total from incompatible legacy sums', () => {
    expect(stageValue({ expected_deal_value: 100, deal_value: 910 })).toBe(0)
    expect(weightedTotal()).toBe(0)
    expect(displayValue(null)).toBe(0)
    expect(displayValue({ expected_deal_value: '1200.50' })).toBe(1200.5)
    expect(dealProbability({ probability: 150 })).toBe(100)
    expect(dealProbability({ probability: -1 })).toBe(0)
  })
})

describe('normal sales funnel', () => {
  it('includes Open, Ongoing and On Hold in position order', () => {
    const qualification = { stage: 'Qualification', type: 'Open', position: 1 }
    const proposal = { stage: 'Propuesta', type: 'Ongoing', position: 2 }
    const hold = { stage: 'En pausa', type: 'On Hold', position: 3 }
    expect(
      funnelLadder([
        hold,
        qualification,
        proposal,
        { type: 'Won', position: 4 },
      ]),
    ).toEqual([qualification, proposal, hold])
  })
  it.each(['Won', 'Lost'])(
    'keeps repair warranty re-entry after %s outside the normal ladder',
    (type) => {
      const ready = { stage: 'Por Entregar', type: 'Open' }
      expect(
        funnelLadder([ready, { type }, { stage: 'Garantía', type: 'Open' }]),
      ).toEqual([ready])
    },
  )
  it('keeps archived and missing stages outside the live ladder', () => {
    expect(
      funnelLadder([
        { type: 'Open', hidden: 1 },
        { type: 'Ongoing', archived: 1 },
        { type: 'Unknown' },
      ]),
    ).toEqual([])
    expect(funnelLadder()).toEqual([])
  })
})
