import { describe, expect, it } from 'vitest'
import {
  DEAL_GROUP_BYS,
  groupByLabel,
  groupRows,
  isGroupBy,
} from '@/utils/dealGroups'

const ROWS = [
  { name: 'D1', status: 'Aprobado', deal_owner: 'ana@example.invalid' },
  { name: 'D2', status: 'Por Contactar', deal_owner: 'beto@example.invalid' },
  { name: 'D3', status: 'Aprobado', deal_owner: 'ana@example.invalid' },
  { name: 'D4', status: '', deal_owner: '' },
]
const STAGE_ORDER = ['Por Contactar', 'En Cotización', 'Aprobado']
const names = (groups) => groups.map((g) => g.key)

describe('group-by options', () => {
  it('offers no grouping as the default and rejects it as a dimension', () => {
    expect(DEAL_GROUP_BYS[0].key).toBe('none')
    expect(isGroupBy('none')).toBe(false)
    expect(isGroupBy('status')).toBe(true)
    expect(isGroupBy('currency')).toBe(false)
    expect(groupByLabel('currency')).toBe('Sin agrupar')
  })
  it('returns nothing to render when the list is not grouped', () => {
    expect(groupRows(ROWS, 'none')).toEqual([])
  })
})

describe('grouping by stage', () => {
  it('follows the visible stage order and leaves the unset group last', () => {
    expect(names(groupRows(ROWS, 'status', { order: STAGE_ORDER }))).toEqual([
      'Por Contactar',
      'Aprobado',
      '',
    ])
  })
  it('keeps a deal parked on a stage the taxonomy no longer shows', () => {
    const rows = [...ROWS, { name: 'D5', status: 'Abandonado' }]
    expect(names(groupRows(rows, 'status', { order: STAGE_ORDER }))).toEqual([
      'Por Contactar',
      'Aprobado',
      'Abandonado',
      '',
    ])
  })
  it('prefers the server count over the loaded rows and marks it exact', () => {
    const groups = groupRows(ROWS, 'status', {
      order: STAGE_ORDER,
      counts: { Aprobado: { count: 137 }, 'Por Contactar': { count: 12 } },
      complete: false,
    })
    const approved = groups.find((g) => g.key === 'Aprobado')
    expect([approved.count, approved.exact]).toEqual([137, true])
    expect(approved.rows.map((r) => r.name)).toEqual(['D1', 'D3'])
  })
  it('says a derived count is only the loaded page', () => {
    const [first] = groupRows(ROWS, 'status', {
      order: STAGE_ORDER,
      complete: false,
    })
    expect([first.count, first.exact]).toEqual([1, false])
    const [whole] = groupRows(ROWS, 'status', {
      order: STAGE_ORDER,
      complete: true,
    })
    expect([whole.count, whole.exact]).toEqual([1, true])
  })
})

describe('grouping by owner and by repair status', () => {
  it('labels an owner by name while keeping the email as the key', () => {
    const groups = groupRows(ROWS, 'deal_owner', {
      complete: true,
      labelOf: (email) =>
        ({ 'ana@example.invalid': 'Ana Ruiz' })[email] || email,
      emptyLabel: 'Sin responsable',
    })
    expect(groups.map((g) => [g.key, g.label, g.count])).toEqual([
      ['ana@example.invalid', 'Ana Ruiz', 2],
      ['beto@example.invalid', 'beto@example.invalid', 1],
      ['', 'Sin responsable', 1],
    ])
  })
  it('reads a value that is not on the row, like the repair enrichment', () => {
    const repair = { D1: 'En Trabajo', D2: 'En Trabajo', D3: 'Entregado' }
    const groups = groupRows(ROWS, 'repair_status', {
      complete: true,
      groupValue: (row) => repair[row.name] || '',
    })
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ['En Trabajo', 2],
      ['Entregado', 1],
      ['', 1],
    ])
  })
  it('groups nothing into nothing', () => {
    expect(groupRows([], 'status', { order: STAGE_ORDER })).toEqual([])
  })
})
