import { describe, expect, it } from 'vitest'
import {
  addResult,
  batches,
  displayNumber,
  fileProblem,
  filterRows,
  tally,
  withChoices,
} from '@/utils/contactosImportar'

const rows = withChoices([
  {
    key: 'a',
    name: 'María López',
    org: '',
    numbers: ['+526691234567'],
    emails: [],
  },
  {
    key: 'b',
    name: 'Taller Norte',
    org: 'Refacciones',
    numbers: ['+526699876543'],
    emails: ['t@x.mx'],
  },
  { key: 'c', name: 'Mamá', org: '', numbers: ['+14155550100'], emails: [] },
])

describe('contactosImportar', () => {
  it('accepts only a .vcf under 5 MB', () => {
    expect(fileProblem({ name: 'contactos.vcf', size: 10 })).toBe('')
    expect(fileProblem({ name: 'x', type: 'text/x-vcard', size: 10 })).toBe('')
    expect(fileProblem({ name: 'clientes.xlsx', size: 10 })).toMatch('.vcf')
    expect(fileProblem({ name: 'a.vcf', size: 6 * 1024 * 1024 })).toMatch(
      '5 MB',
    )
  })

  it('starts every row as Cliente and counts the choices', () => {
    expect(tally(rows)).toEqual({ cliente: 3, otro: 0, total: 3 })
    const chosen = rows.map((row) =>
      row.key === 'b'
        ? { ...row, kind: 'otro' }
        : row.key === 'c'
          ? { ...row, kind: 'no' }
          : row,
    )
    expect(tally(chosen)).toEqual({ cliente: 1, otro: 1, total: 2 })
  })

  it('finds rows by name, company or at least three digits', () => {
    expect(filterRows(rows, 'lópez').map((r) => r.key)).toEqual(['a'])
    expect(filterRows(rows, 'refacc').map((r) => r.key)).toEqual(['b'])
    expect(filterRows(rows, '987 65').map((r) => r.key)).toEqual(['b'])
    expect(filterRows(rows, '66')).toEqual([])
    expect(filterRows(rows, '  ')).toHaveLength(3)
  })

  it('sends only the chosen rows, in batches, without screen-only fields', () => {
    const chosen = rows.map((row, i) => ({
      ...row,
      kind: i === 2 ? 'no' : row.kind,
      extra: 1,
    }))
    const parts = batches(chosen, 1)
    expect(parts).toHaveLength(2)
    expect(Object.keys(parts[0][0]).sort()).toEqual(
      ['emails', 'first', 'key', 'kind', 'last', 'name', 'numbers'].sort(),
    )
    expect(batches([])).toEqual([])
  })

  it('shows numbers grouped and adds batch results', () => {
    expect(displayNumber('+526691234567')).toBe('+52 669 123 4567')
    expect(displayNumber('+14155550100')).toBe('+1 415 555 0100')
    expect(displayNumber('+34600111222')).toBe('+34600111222')
    const total = addResult(
      addResult(null, { created: 2, skipped: 1, failed: [] }),
      {
        created: 1,
        skipped: 0,
        failed: [{ key: 'z', message: 'x' }],
      },
    )
    expect(total).toEqual({
      created: 3,
      skipped: 1,
      failed: [{ key: 'z', message: 'x' }],
    })
  })
})
