import { describe, expect, it } from 'vitest'
import { money } from '../../src/composables/useCompras.js'
import {
  blankRule,
  normalizeState,
  ruleForm,
  ruleMissing,
  rulePayload,
  ruleRoute,
  ruleSummary,
  stateChip,
  stateTitle,
  suggestedTitle,
  whatText,
  whoText,
} from '../../src/composables/useDescuentos.js'

const supplier = { name: 'SUP-0007', label: 'Tecnomaxx' }

describe('a discount in one line', () => {
  it('reads how much, on what, from how much and until when', () => {
    const line = ruleSummary({
      discount: { kind: 'percent', value: 10 },
      what: {
        kind: 'items',
        targets: [{ name: 'PANT-G15', label: 'Pantalla G15' }],
      },
      min_qty: 5,
      valid_upto: '2026-12-31',
    })
    expect(
      line.startsWith('10 % off on Pantalla G15, from 5 pieces, until '),
    ).toBe(true)
  })
  it('counts several targets and names a whole purchase', () => {
    expect(
      whatText({ kind: 'groups', targets: [{ label: 'A' }, { label: 'B' }] }),
    ).toBe('on 2 groups')
    expect(whatText({ kind: 'brands', targets: [{ label: 'Samsung' }] })).toBe(
      'on the brand Samsung',
    )
    expect(
      ruleSummary({
        discount: { kind: 'amount', value: 50 },
        what: { kind: 'order' },
      }),
    ).toBe(`${money(50, 'MXN')} off on the whole purchase`)
  })
  it('says who gets it without showing a code', () => {
    expect(whoText({ kind: 'all' })).toBe('For every supplier')
    expect(whoText({ kind: 'supplier', ...supplier })).toBe('For Tecnomaxx')
    expect(whoText({ kind: 'group', name: 'May', label: 'Mayoristas' })).toBe(
      'For the supplier group Mayoristas',
    )
  })
  it('tells a scheduled one by when it starts', () => {
    const line = ruleSummary({
      state: 'programado',
      discount: { kind: 'price', value: 90 },
      what: { kind: 'items', targets: [{ label: 'X' }, { label: 'Y' }] },
      valid_from: '2026-12-01',
    })
    expect(
      line.startsWith(`priced at ${money(90, 'MXN')} on 2 items, starts `),
    ).toBe(true)
  })
})

describe('states', () => {
  it('opens on the active ones and titles each state', () => {
    expect(normalizeState('vencido')).toBe('vencido')
    expect(normalizeState('nope')).toBe('activo')
    expect(normalizeState(undefined)).toBe('activo')
    expect(stateTitle('activo')).toBe('Active discounts')
    expect(stateTitle('')).toBe('All discounts')
    expect(stateChip('desactivado')).toEqual({
      label: 'Turned off',
      tone: 'neutral',
    })
    expect(stateChip('activo').tone).toBe('success')
  })
})

describe('the editor', () => {
  it('starts from the purchase supplier and names itself', () => {
    const form = blankRule({ supplier, company: 'DC' })
    expect(form.who_kind).toBe('supplier')
    expect(form.who_label).toBe('Tecnomaxx')
    form.discount_value = 10
    expect(suggestedTitle(form)).toBe('Tecnomaxx 10 %')
    expect(suggestedTitle(blankRule())).toBe('Every supplier')
  })
  it('sends codes, not labels, and only what the kind needs', () => {
    const form = blankRule({ supplier, company: 'DC' })
    form.targets.push({ name: 'PANT-G15', label: 'Pantalla G15' })
    form.discount_value = '10'
    form.min_qty = '5'
    expect(rulePayload(form)).toEqual({
      title: 'Tecnomaxx 10 %',
      disabled: false,
      who: { kind: 'supplier', name: 'SUP-0007' },
      what: { kind: 'items', targets: ['PANT-G15'] },
      discount: { kind: 'percent', value: 10 },
      min_qty: 5,
      max_qty: 0,
      min_amt: 0,
      max_amt: 0,
      valid_from: null,
      valid_upto: null,
      company: 'DC',
      warehouse: null,
      priority: 0,
    })
    form.what_kind = 'order'
    form.warehouse = 'Tienda - DC'
    const whole = rulePayload(form)
    expect(whole.what).toEqual({ kind: 'order' })
    expect(whole.apply_discount_on).toBe('Grand Total')
    expect(whole.warehouse).toBeNull()
  })
  it('carries the version it read, so a stale save is refused', () => {
    const form = ruleForm({
      name: 'PRLE-0001',
      modified: '2026-11-06 10:00:00',
      title: 'Tecnomaxx 10 %',
      who: { kind: 'all' },
      what: { kind: 'order', targets: [] },
      discount: { kind: 'percent', value: 5 },
      priority: '2',
    })
    const payload = rulePayload(form)
    expect(payload.name).toBe('PRLE-0001')
    expect(payload.modified).toBe('2026-11-06 10:00:00')
    expect(payload.priority).toBe(2)
    expect(payload.who).toEqual({ kind: 'all' })
  })
  it('names what blocks a save', () => {
    const form = blankRule()
    form.who_kind = 'supplier'
    expect(ruleMissing(form)).toEqual([
      'the supplier',
      'at least one item',
      'a discount above 0 and up to 100 %',
    ])
    form.who_kind = 'all'
    form.what_kind = 'order'
    form.discount_kind = 'price'
    form.discount_value = 90
    expect(ruleMissing(form)).toEqual([
      'a % or an amount for the whole purchase',
    ])
    form.discount_kind = 'amount'
    form.valid_from = '2026-12-02'
    form.valid_upto = '2026-12-01'
    expect(ruleMissing(form)).toEqual(['an end date after the start'])
    form.discount_kind = 'percent'
    form.discount_value = 101
    form.valid_upto = ''
    expect(ruleMissing(form)).toEqual(['a discount above 0 and up to 100 %'])
  })
  it('opens a new one on «nuevo» with the way back', () => {
    expect(ruleRoute('', { supplier: 'SUP-0007' })).toEqual({
      name: 'CompraDescuento',
      params: { name: 'nuevo' },
      query: { supplier: 'SUP-0007' },
    })
  })
})
