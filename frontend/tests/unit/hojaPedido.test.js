// The supplier's order sheet on the list page (utils/hojaPedido.js): the
// supplier's lists as tabs with what the open order holds of each, the other
// lists the order spans, the product types with their months, the budget bar
// and the month bars.
import { describe, expect, it } from 'vitest'
import {
  budgetBar,
  listLabel,
  monthBars,
  monthlyAverage,
  otherLists,
  supplierLists,
  typeRows,
} from '@/utils/hojaPedido'

const LISTS = [
  { name: 'micas-nov', title: 'CAT MICAS', item_group: 'Micas' },
  { name: 'fundas-nov', title: 'CAT FUNDAS', item_group: 'Fundas' },
  { name: 'acc-nov', title: 'ACCESORIOS NOV', item_group: '' },
]

describe('the supplier lists', () => {
  it('names a list by its type, else its title', () => {
    expect(listLabel(LISTS[0])).toBe('Micas')
    expect(listLabel(LISTS[2])).toBe('ACCESORIOS NOV')
    expect(listLabel(null)).toBe('')
  })

  it('shows what the open order holds of each list and marks this one', () => {
    const tabs = supplierLists(
      LISTS,
      { 'micas-nov': { pieces: 15, amount: 220, lines: 2 } },
      'fundas-nov',
    )
    expect(
      tabs.map((t) => [t.name, t.pieces, t.amount, t.lines, t.current]),
    ).toEqual([
      ['micas-nov', 15, 220, 2, false],
      ['fundas-nov', 0, 0, 0, true],
      ['acc-nov', 0, 0, 0, false],
    ])
    expect(supplierLists(null, null, 'x')).toEqual([])
  })

  it('the other lists are the ones the order holds lines of', () => {
    const tabs = supplierLists(
      LISTS,
      {
        'micas-nov': { pieces: 15, amount: 220, lines: 2 },
        'fundas-nov': { pieces: 4, amount: 320, lines: 1 },
      },
      'fundas-nov',
    )
    expect(otherLists(tabs, 'fundas-nov').map((l) => l.name)).toEqual([
      'micas-nov',
    ])
  })
})

describe('the product types', () => {
  it('takes each type its months from the sheet', () => {
    const months = [{ month: '2026-10', amount: 900 }]
    const rows = typeRows(
      [
        { item_group: 'Micas', amount: 220 },
        { item_group: 'Fundas', amount: 320, history: [{ month: 'x' }] },
        { item_group: '', amount: 30 },
      ],
      { Micas: months },
    )
    expect(rows[0].history).toBe(months)
    expect(rows[1].history).toEqual([{ month: 'x' }])
    expect(rows[2].history).toBeNull()
  })

  it('the budget bar shows the committed share and this order, never past full', () => {
    expect(budgetBar({ amount: 10000, committed: 6000, order: 1500 })).toEqual({
      committedPct: 60,
      orderPct: 15,
      over: false,
    })
    expect(budgetBar({ amount: 10000, committed: 6000, order: 4500 })).toEqual({
      committedPct: 60,
      orderPct: 40,
      over: true,
    })
    expect(budgetBar({ amount: 0, committed: 10 })).toBeNull()
    expect(budgetBar(null)).toBeNull()
  })

  it('month bars measure against the highest month and mark the running one', () => {
    const bars = monthBars([
      { month: '2026-09', amount: 500 },
      { month: '2026-10', amount: 1000, supplier: 600 },
      { month: '2026-11', amount: 250 },
    ])
    expect(bars.map((b) => [b.pct, b.supplier, b.running])).toEqual([
      [50, 0, false],
      [100, 600, false],
      [25, 0, true],
    ])
    expect(monthBars(null)).toEqual([])
    expect(monthBars([{ month: 'a', amount: 0 }])[0].pct).toBe(0)
  })

  it('the monthly average reads the full months only', () => {
    expect(
      monthlyAverage([{ amount: 500 }, { amount: 1000 }, { amount: 9999 }]),
    ).toBe(750)
    expect(monthlyAverage([{ amount: 9999 }])).toBe(0)
    expect(monthlyAverage(null)).toBe(0)
  })
})
