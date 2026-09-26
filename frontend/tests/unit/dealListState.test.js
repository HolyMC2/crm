import { describe, expect, it } from 'vitest'
import { dealListState } from '@/utils/dealListState'
describe('deal list return context', () => {
  it('retains the worker’s filters, search, board, grouping, view and sort', () => {
    const state = {
      status: ['Aprobado'],
      source: [],
      owner: ['sales@example.invalid'],
      followUp: 'today',
      search: 'pantalla',
      view: 'board',
      groupBy: 'deal_owner',
      viewName: '7',
      sort: { field: 'deal_name', dir: 'asc' },
    }
    expect(dealListState(state)).toEqual(state)
  })
  it('recovers from obsolete or malformed saved state', () => {
    expect(
      dealListState({
        status: 'Aprobado',
        owner: [null, 'sales'],
        view: 'missing',
        groupBy: 'none',
        sort: { field: 'not-a-field' },
      }),
    ).toEqual({
      status: [],
      source: [],
      owner: ['sales'],
      followUp: 'all',
      search: '',
      view: 'list',
      groupBy: 'none',
      viewName: '',
      sort: { field: 'modified', dir: 'desc' },
    })
    expect(dealListState(null).view).toBe('list')
  })
  it('preserves a report creation cohort across record return', () => {
    expect(
      dealListState({
        pipeline: 'sales',
        status: ['Proposal'],
        createdFrom: '2040-02-01',
        createdTo: '2040-02-29',
      }),
    ).toMatchObject({
      pipeline: 'sales',
      status: ['Proposal'],
      createdFrom: '2040-02-01',
      createdTo: '2040-02-29',
    })
    expect(
      dealListState({ createdFrom: ['2040-02-01'], createdTo: 'invalid' }),
    ).not.toHaveProperty('createdTo')
  })
  it('drops a grouping the list no longer offers', () => {
    expect(dealListState({ groupBy: 'currency' }).groupBy).toBe('none')
    expect(dealListState({ groupBy: 'repair_status' }).groupBy).toBe(
      'repair_status',
    )
  })
})
