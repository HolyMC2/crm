import { describe, expect, it } from 'vitest'
import {
  activePipelineStages,
  pipelineSelection,
  pipelineStageOptions,
} from '@/utils/pipelineConfiguration'
import { dealListState } from '@/utils/dealListState'
import { viewFilters, filtersToContext } from '@/utils/dealViewSettings'

const pipeline = {
  name: 'sales-a',
  sales_company: 'Company A',
  currency: 'USD',
  stages: [
    { name: 'Historic', archived: 1, type: 'Ongoing' },
    { name: 'Qualification', archived: 0, type: 'Open' },
    { name: 'Negotiation', archived: 0, type: 'Ongoing' },
    { name: 'Won', archived: 0, type: 'Won' },
  ],
}
describe('pipeline selection', () => {
  it('offers only active stages for new entry', () => {
    expect(activePipelineStages(pipeline).map((s) => s.name)).toEqual([
      'Qualification',
      'Negotiation',
      'Won',
    ])
  })
  it('preserves a compatible stage and company context on explicit selection', () => {
    expect(pipelineSelection(pipeline, 'Negotiation')).toEqual({
      pipeline: 'sales-a',
      sales_company: 'Company A',
      currency: 'USD',
      status: 'Negotiation',
    })
  })
  it('chooses an open starting stage instead of entering archived history', () => {
    expect(pipelineSelection(pipeline, 'Historic').status).toBe('Qualification')
  })
  it('shows archived current history without allowing new entry', () => {
    expect(pipelineStageOptions(pipeline, 'Historic')[0]).toEqual({
      label: 'Historic · Archived',
      value: 'Historic',
      disabled: true,
    })
    expect(
      pipelineStageOptions(pipeline).some(
        (option) => option.value === 'Historic',
      ),
    ).toBe(false)
  })
  it('keeps pipeline filters through saved views and record return', () => {
    expect(dealListState({ pipeline: 'sales-a' }).pipeline).toBe('sales-a')
    expect(
      filtersToContext(viewFilters({ pipeline: 'sales-a' })).pipeline,
    ).toBe('sales-a')
  })
})
