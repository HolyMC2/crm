// The power worklist's shared pure parts (utils/powerList.js) and the Gastos
// rules built on them: URL patches, the page size of a load, the bulk run with
// one result per row, and which bills «Pagar» pays in one go.
import { describe, expect, it } from 'vitest'
import {
  addDays,
  bulkCounts,
  daysBetween,
  keyAction,
  listKeys,
  loadLength,
  moveFocus,
  patchQuery,
  pathWithQuery,
  rangeKeys,
  runBulk,
  verbShortcuts,
} from '@/utils/powerList'
import {
  QUEUE_KEYS as GASTOS_KEYS,
  RECORD_KEYS as GASTOS_RECORD_KEYS,
  bulkAccounts,
  bulkPayMissing,
  bulkPayPlan,
  listHref,
  listMemoryKey,
  payStep,
  queueShortcuts,
  queueState,
  recordShortcuts,
} from '@/composables/useGastos'
import { KEYMAP, RESERVED_COMBOS } from '@/vendor/muelle-shell/contracts'

describe('power list, pure parts', () => {
  it('patches the URL and leaves empty values out', () => {
    expect(patchQuery({ segment: 'a', q: 'x', foco: 'B' }, { q: '' })).toEqual({
      segment: 'a',
      foco: 'B',
    })
    expect(pathWithQuery('/gastos', { chip: 'vencidas', foco: 'PI 1' })).toBe(
      '/gastos?chip=vencidas&foco=PI%201',
    )
    expect(pathWithQuery('/gastos', { q: '' })).toBe('/gastos')
  })

  it('loads the next page, the rows shown, or what was loaded before a visit', () => {
    const base = { page: 30, max: 100, shown: 0, remembered: 0 }
    expect(loadLength({ ...base, more: true, shown: 60 })).toBe(30)
    expect(loadLength({ ...base, quiet: true, shown: 60 })).toBe(60)
    expect(loadLength({ ...base, remembered: 75 })).toBe(75)
    expect(loadLength({ ...base, remembered: 500 })).toBe(100)
    expect(loadLength(base)).toBe(30)
  })

  it('moves the focus and extends a range like a mail list', () => {
    expect(moveFocus(['a', 'b'], '', 1)).toBe('a')
    expect(moveFocus(['a', 'b'], 'b', 1)).toBe('b')
    expect(rangeKeys(['a', 'b', 'c'], 'c', 'a')).toEqual(['a', 'b', 'c'])
    expect(keyAction({ key: 'j', isComposing: true }, listKeys())).toBeNull()
    expect(keyAction({ key: 'j' }, listKeys())).toBe('next')
    expect(keyAction({ key: '$', shiftKey: true }, GASTOS_KEYS)).toBe('pay')
  })

  it('runs a bulk action one row at a time with one result each', async () => {
    const seen = []
    const results = await runBulk(
      ['a', 'b', 'c', 'd'],
      async (item) => {
        if (item === 'b') throw Object.assign(new Error('Ya está pagada'), {})
        if (item === 'c') throw Object.assign(new Error('x'), { offline: true })
        if (item === 'd') return { status: 'already' }
        return { detail: 'ok' }
      },
      {
        unknown: (error) => Boolean(error.offline),
        onProgress: (partial) => seen.push(partial.length),
      },
    )
    expect(results.map((r) => [r.item, r.status])).toEqual([
      ['a', 'done'],
      ['b', 'blocked'],
      ['c', 'unknown'],
      ['d', 'already'],
    ])
    expect(results[1].detail).toBe('Ya está pagada')
    expect(seen).toEqual([1, 2, 3, 4])
    expect(bulkCounts(results)).toEqual({
      done: 1,
      already: 1,
      blocked: 1,
      unknown: 1,
    })
  })

  it('counts days between site dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-14')).toBe(13)
    expect(daysBetween('2026-10-14 18:00:00', '2026-10-14')).toBe(0)
    expect(daysBetween('', '2026-10-14')).toBeNull()
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(
      verbShortcuts('x', [
        { action: 'a', keys: ['a'], description: 'A' },
        { action: 'b', keys: ['b'], description: 'B', allowed: false },
      ]),
    ).toEqual([{ id: 'x.a', keys: ['a'], description: 'A' }])
  })
})

const bill = (name, extra = {}) => ({
  name,
  company: 'Tienda',
  currency: 'MXN',
  owed_currency: 'MXN',
  docstatus: 1,
  outstanding_amount: 100.1,
  on_hold: false,
  ...extra,
})

describe('Gastos power list rules', () => {
  it('reads its state from the URL and remembers scroll per list, not per bill', () => {
    expect(
      queueState({ segment: 'por-pagar', chip: 'semana', foco: 'PI-1' }),
    ).toMatchObject({ segment: 'por-pagar', chip: 'semana', foco: 'PI-1' })
    expect(queueState({ segment: 'por-registrar', chip: 'semana' }).chip).toBe(
      '',
    )
    expect(listMemoryKey({ foco: 'A' })).toBe(listMemoryKey({ foco: 'B' }))
    expect(listHref({ chip: 'vencidas', foco: 'PI-1' })).toBe(
      '/gastos?chip=vencidas&foco=PI-1',
    )
  })

  it('says what «$» does on each bill, with the step that resolves it', () => {
    expect(payStep(bill('A'), { pay: true }).kind).toBe('pay')
    expect(payStep(bill('A'), {}).kind).toBe('ask')
    expect(payStep(bill('A', { docstatus: 0 }), { pay: true }).kind).toBe(
      'register',
    )
    expect(payStep(bill('A', { on_hold: true }), { pay: true }).kind).toBe(
      'held',
    )
    expect(
      payStep(bill('A', { outstanding_amount: 0 }), { pay: true }).kind,
    ).toBe('paid')
  })

  it('pays in one go only bills of one company and currency, and says why the rest stay out', () => {
    const plan = bulkPayPlan([
      bill('A'),
      bill('B', { outstanding_amount: 200.2 }),
      bill('C', { docstatus: 0 }),
      bill('D', { on_hold: true }),
    ])
    expect(plan.payable.map((r) => r.name)).toEqual(['A', 'B'])
    expect(plan.total).toBe(300.3)
    expect(plan.mixed).toBe(false)
    expect(plan.skipped.map((s) => s.row.name)).toEqual(['C', 'D'])
    const mixed = bulkPayPlan([bill('A'), bill('E', { company: 'Otra' })])
    expect(mixed.mixed).toBe(true)
    expect(mixed.groups.map((g) => [g.company, g.rows.length])).toEqual([
      ['Tienda', 1],
      ['Otra', 1],
    ])
    const accounts = bulkAccounts(
      {
        accounts: [
          { account: 'Banco', currency: 'MXN', type: 'Bank' },
          { account: 'USD', currency: 'USD', type: 'Bank' },
        ],
      },
      'MXN',
    )
    expect(accounts.map((a) => a.account)).toEqual(['Banco'])
    expect(
      bulkPayMissing(
        { account: 'Banco', reference_no: '', reference_date: '2026-10-14' },
        accounts,
      ),
    ).toEqual(['reference_no'])
  })

  it('never claims a reserved combo or a global key', () => {
    const globalKeys = new Set(
      KEYMAP.filter((s) => s.context === 'global').flatMap((s) => s.keys),
    )
    const listOnly = new Set(
      KEYMAP.filter((s) => s.context === 'list').flatMap((s) => s.keys),
    )
    const all = { pay: true, submit: true }
    for (const s of recordShortcuts(all).filter((s) => s.id !== 'gastos.back'))
      for (const combo of s.keys) {
        expect(RESERVED_COMBOS).not.toContain(combo)
        expect(globalKeys.has(combo)).toBe(false)
        expect(listOnly.has(combo)).toBe(false)
        expect(GASTOS_KEYS[combo]).toBeTruthy()
        expect(GASTOS_RECORD_KEYS[combo]).toBeTruthy()
      }
    expect(queueShortcuts({}).map((s) => s.id)).toEqual([
      'gastos.pay',
      'gastos.ask',
    ])
  })
})
