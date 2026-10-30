import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import {
  changePct,
  chartModel,
  costFor,
  costLine,
  historySummary,
  keepMarginPrice,
  marginPct,
  niceTicks,
  parseAmount,
  parseCsv,
  pendingLine,
  preciosHref,
  roundPrice,
  rulePrice,
  savePayload,
  signalChip,
  sparkPath,
  startFrom,
  toCsv,
  csvCell,
  draftKey,
} from '@/composables/usePrecios'

const LIST = 'Menudeo'
const cell = (over = {}) => ({
  price_list: LIST,
  rate: 350,
  revision: 'r'.repeat(64),
  can_write: true,
  requires_ack: false,
  warning_percent: 30,
  uom: 'Pieza',
  ...over,
})
const row = (over = {}) => ({
  item_code: 'PANT-G15',
  item_name: 'Pantalla Moto G15',
  stock_uom: 'Pieza',
  uoms: { Pieza: 1, Caja: 10 },
  prices: {
    [LIST]: cell(),
    Mayoreo: cell({ price_list: 'Mayoreo', rate: 300 }),
  },
  cost: { new: 200, at_price: 160, change_pct: 25, last: 200, spark: [] },
  signal: 'costo-subio',
  ...over,
})

describe('where Precios starts', () => {
  it('reads a document, a list of codes or a view from the query', () => {
    expect(startFrom({ desde: 'Purchase Receipt:MAT-PRE-1' })).toEqual({
      kind: 'source',
      doctype: 'Purchase Receipt',
      name: 'MAT-PRE-1',
    })
    expect(startFrom({ desde: 'Journal Entry:X' }).kind).toBe('view')
    expect(startFrom({ codigos: 'A, B,A' })).toEqual({
      kind: 'codes',
      codes: ['A', 'B'],
    })
    expect(startFrom({ vista: 'sin-precio' })).toEqual({
      kind: 'view',
      view: 'sin-precio',
    })
    expect(startFrom({ vista: 'otra' })).toEqual({ kind: 'view', view: '' })
  })

  it('builds the link a document opens, with the way back', () => {
    expect(
      preciosHref({
        desde: 'Purchase Invoice:ACC-PINV-9',
        returnTo: '/crm/documentos/facturas-proveedor/ACC-PINV-9',
        returnLabel: 'la factura',
      }),
    ).toBe(
      '/productos/precios?desde=Purchase+Invoice%3AACC-PINV-9&return_to=%2Fcrm%2Fdocumentos%2Ffacturas-proveedor%2FACC-PINV-9&return_label=la+factura',
    )
    expect(preciosHref({ codigos: ['A', 'A', 'B'] })).toBe(
      '/productos/precios?codigos=A%2CB',
    )
  })
})

describe('margin and cost', () => {
  it('compares the price with the cost in the price’s unit', () => {
    expect(costFor(row(), cell())).toBe(200)
    expect(costFor(row(), cell({ uom: 'Caja' }))).toBe(2000)
    expect(marginPct(350, 200)).toBe(42.9)
    expect(marginPct(0, 200)).toBeNull()
    expect(changePct(200, 160)).toBe(25)
  })

  it('says the cost now and when the price was set', () => {
    expect(costLine(row(), cell(), 'MXN')).toMatch(
      /^Costo .*200.* · al poner el precio .*160/,
    )
    expect(costLine(row({ line: { cost: 200 } }), cell(), 'MXN')).toMatch(
      /^Costo aquí/,
    )
    expect(costLine(row({ cost: null }), cell(), 'MXN')).toBe('')
  })

  it('suggests the price that keeps the margin it had', () => {
    // 350 at a cost of 160 → the same margin at 200 is 437.50
    expect(keepMarginPrice(row(), cell())).toBe(437.5)
    expect(keepMarginPrice(row(), cell(), 'nueve')).toBe(439)
    expect(
      keepMarginPrice(row({ cost: { new: 160, at_price: 160 } }), cell()),
    ).toBeNull()
  })

  it('names the fact that asks for a decision', () => {
    expect(signalChip(row())).toEqual({
      label: 'Costo subió 25 %',
      tone: 'warning',
    })
    expect(signalChip(row({ signal: 'sin-precio' })).label).toBe('Sin precio')
    expect(signalChip(row({ signal: null }))).toBeNull()
  })
})

describe('rounding', () => {
  it('rounds up to the shop’s habit, never below', () => {
    expect(roundPrice(382.3, 'peso')).toBe(383)
    expect(roundPrice(382.3, 'nueve')).toBe(389)
    expect(roundPrice(389, 'nueve')).toBe(389)
    expect(roundPrice(382.3, 'noventa')).toBe(382.9)
    expect(roundPrice(382.95, 'noventa')).toBe(383.9)
    expect(roundPrice(382.3, 'cinco')).toBe(385)
    expect(roundPrice(380, 'diez')).toBe(380)
    expect(roundPrice(1.005)).toBe(1.01)
    expect(roundPrice(0)).toBeNull()
  })
})

describe('bulk rules', () => {
  it('computes each rule and says why a row is skipped', () => {
    expect(rulePrice(row(), LIST, { kind: 'mantener' })).toEqual({
      price: 437.5,
    })
    expect(rulePrice(row(), LIST, { kind: 'margen', value: 50 })).toEqual({
      price: 400,
    })
    expect(
      rulePrice(row(), LIST, {
        kind: 'sobre-costo',
        value: 40,
        rounding: 'nueve',
      }),
    ).toEqual({ price: 289 })
    expect(
      rulePrice(row(), LIST, { kind: 'porcentaje', value: '−10' }),
    ).toEqual({ price: 315 })
    expect(
      rulePrice(row(), 'Mayoreo', {
        kind: 'otra-lista',
        from: LIST,
        value: -10,
      }),
    ).toEqual({ price: 315 })
    expect(
      rulePrice(row({ cost: null }), LIST, { kind: 'margen', value: 50 }).skip,
    ).toBe('Sin costo')
    expect(rulePrice(row(), LIST, { kind: 'margen', value: 120 }).skip).toMatch(
      /entre 1 y 99/,
    )
    const locked = row({ prices: { [LIST]: cell({ can_write: false }) } })
    expect(
      rulePrice(locked, LIST, { kind: 'porcentaje', value: 5 }).skip,
    ).toMatch(/No puedes/)
  })
})

describe('the save', () => {
  it('groups drafts per product with the revision reviewed and the OKs', () => {
    const a = row()
    const b = row({
      item_code: 'B',
      prices: { [LIST]: cell({ rate: null, revision: 'n'.repeat(64) }) },
    })
    const rows = new Map([
      [a.item_code, a],
      [b.item_code, b],
    ])
    const drafts = new Map([
      [
        draftKey(a.item_code, LIST),
        { code: a.item_code, list: LIST, value: '360' },
      ],
      [
        draftKey(a.item_code, 'Mayoreo'),
        { code: a.item_code, list: 'Mayoreo', value: '300' },
      ],
      [draftKey('B', LIST), { code: 'B', list: LIST, value: '99' }],
    ])
    const payload = savePayload(drafts, rows, new Set(), new Set(['C', 'B']))
    expect(payload.changes).toEqual([
      {
        item: a.item_code,
        prices: { [LIST]: 360 },
        expected: { [LIST]: 'r'.repeat(64) },
        acknowledged: [],
      },
      {
        item: 'B',
        prices: { [LIST]: 99 },
        expected: { [LIST]: null },
        acknowledged: [],
      },
    ])
    expect(payload.keep).toEqual(['C'])
    expect(payload.problems).toEqual([])
  })

  it('holds a large change until the worker OKs it', () => {
    const a = row()
    const rows = new Map([[a.item_code, a]])
    const key = draftKey(a.item_code, LIST)
    const drafts = new Map([
      [key, { code: a.item_code, list: LIST, value: '500' }],
    ])
    expect(savePayload(drafts, rows).problems).toEqual([{ key, reason: 'ack' }])
    expect(
      savePayload(drafts, rows, new Set([key])).changes[0].acknowledged,
    ).toEqual([LIST])
  })

  it('counts what is pending in words', () => {
    expect(pendingLine(3, 1)).toBe('3 precios nuevos · 1 sigue igual')
    expect(pendingLine(1, 0)).toBe('1 precio nuevo')
  })
})

describe('CSV', () => {
  it('exports codes, cost and one column per list, never a formula', () => {
    const text = toCsv(
      [row({ item_name: '=HYPERLINK("x")' })],
      [LIST, 'Mayoreo'],
    )
    expect(text.split('\r\n')[0]).toBe(
      'codigo,producto,unidad,costo,Menudeo,Mayoreo',
    )
    expect(text.split('\r\n')[1]).toBe(
      `PANT-G15,"'=HYPERLINK(""x"")",Pieza,200.00,350.00,300.00`,
    )
    expect(csvCell('-12.5')).toBe('-12.5')
  })

  it('imports list columns by name, in Mexican or spreadsheet formats', () => {
    const text =
      '﻿Código;Producto;menudeo;Mayoreo\nA;Uno;"$1,234.50";\nB;Dos;89,90;0\n;;;\n'
    const parsed = parseCsv(text, [LIST, 'Mayoreo'])
    expect(parsed.lists).toEqual([LIST, 'Mayoreo'])
    expect(parsed.rows).toEqual([
      { code: 'A', prices: { [LIST]: 1234.5 } },
      { code: 'B', prices: { [LIST]: 89.9 } },
    ])
    expect(parsed.problems).toEqual(['Fila 3: Mayoreo no es un precio válido.'])
    expect(parseCsv('producto\nx', [LIST]).problems[0]).toMatch(/codigo/)
    expect(parseCsv('codigo,otra\nA,1', [LIST]).problems[0]).toMatch(/Menudeo/)
    expect(parseAmount('')).toBeNull()
  })
})

describe('the history chart', () => {
  const history = {
    since: '2026-01-01',
    today: '2026-10-30',
    item: row(),
    purchases: [
      { date: '2026-02-01', rate: 150, qty: 10, supplier: 'Uno' },
      { date: '2026-06-01', rate: 160, qty: 30, supplier: 'Uno' },
      { date: '2026-10-20', rate: 200, qty: 10, supplier: 'Dos' },
    ],
    changes: [
      {
        price_list: LIST,
        old_rate: 300,
        new_rate: 350,
        at: '2026-06-02 10:00:00',
      },
      {
        price_list: 'Mayoreo',
        old_rate: 250,
        new_rate: 300,
        at: '2026-06-02 10:00:00',
      },
    ],
    opening: { [LIST]: 300 },
  }

  it('draws the cost points and the price as steps on one axis', () => {
    const model = chartModel(history, { list: LIST, width: 300, height: 200 })
    expect(model.empty).toBe(false)
    expect(model.points.map((p) => p.value)).toEqual([150, 160, 200])
    expect(model.steps.map((s) => s.value)).toEqual([300, 350])
    expect(model.pricePath.startsWith('M48,')).toBe(true)
    expect(model.pricePath).toMatch(/H288$/)
    expect(model.lo).toBeLessThanOrEqual(135)
    expect(model.hi).toBeGreaterThanOrEqual(367.5)
    expect(model.priceAt(Date.UTC(2026, 6, 1))).toBe(350)
    expect(model.priceAt(Date.UTC(2026, 2, 1))).toBe(300)
    expect(model.months.length).toBeGreaterThan(1)
  })

  it('is empty without purchases or prices', () => {
    expect(
      chartModel({ since: '2026-01-01', today: '2026-02-01' }, { list: LIST })
        .empty,
    ).toBe(true)
  })

  it('sums the window up by quantity', () => {
    expect(historySummary(history, LIST)).toEqual({
      min: 150,
      max: 200,
      avg: 166,
      change: 33.3,
      suppliers: 2,
      count: 3,
    })
  })

  it('has round ticks and a sparkline', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100])
    expect(sparkPath([['a', 1]])).toBe('')
    expect(
      sparkPath(
        [
          ['a', 1],
          ['b', 2],
        ],
        20,
        10,
      ),
    ).toBe('M2.0,8.0L18.0,2.0')
  })
})
