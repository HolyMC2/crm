import { describe, expect, it } from 'vitest'
import { dealListState } from '@/utils/dealListState'
describe('deal list return context', () => {
  it('retains the worker’s filters, search, board and sort', () => {
    const state = { status: ['Aprobado'], source: [], owner: ['sales@example.invalid'], followUp: 'today', search: 'pantalla', view: 'board', sort: { field: 'deal_name', dir: 'asc' } }
    expect(dealListState(state)).toEqual(state)
  })
  it('recovers from obsolete or malformed saved state', () => {
    expect(dealListState({ status: 'Aprobado', owner: [null, 'sales'], view: 'missing', sort: { field: 'not-a-field' } })).toEqual({ status: [], source: [], owner: ['sales'], followUp: 'all', search: '', view: 'list', sort: { field: 'modified', dir: 'desc' } })
    expect(dealListState(null).view).toBe('list')
  })
})
