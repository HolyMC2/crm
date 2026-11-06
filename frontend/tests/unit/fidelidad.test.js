import { describe, expect, it, vi } from 'vitest'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import {
  boardFigures,
  couponLine,
  discountFigure,
  discountLabel,
  extendChips,
  groupLine,
  offerChip,
  offerMissing,
  offerPayload,
  offerPreview,
  offerWhen,
  suggestCode,
  targetLabel,
  untilChips,
} from '@/composables/fidelidad'

// Friday 30 Oct 2026, local time.
const NOW = new Date(2026, 9, 30, 10, 0)

describe('Fidelidad words', () => {
  it('names the discount and what it applies to', () => {
    expect(discountLabel({ kind: 'percent', value: 10 })).toBe('10 %')
    expect(discountLabel({ kind: 'amount', value: 50 })).toContain('50')
    expect(discountLabel({ kind: 'gift', value: 1 })).toBe('Free product')
    expect(
      targetLabel({ target: { kind: 'item_group', label: 'Fundas' } }),
    ).toBe('Fundas')
    expect(targetLabel({ target: { kind: 'ticket' } })).toBe('The whole ticket')
    expect(
      targetLabel({ target: { kind: 'ticket' }, min_amount: 500 }),
    ).toContain('500')
  })

  it('says when a promotion runs in the words that matter today', () => {
    expect(offerWhen({ state: 'paused' })).toBe('Paused')
    expect(offerWhen({ state: 'live', valid_upto: null })).toBe('No end date')
    expect(
      offerWhen({ state: 'live', valid_upto: '2026-10-30', ends_in: 0 }),
    ).toBe('Ends today')
    expect(
      offerWhen({ state: 'live', valid_upto: '2026-10-31', ends_in: 1 }),
    ).toBe('Ends tomorrow')
    expect(
      offerWhen({
        state: 'live',
        valid_upto: '2026-11-02',
        ends_in: 3,
        ending_soon: true,
      }),
    ).toBe('Ends in 3 days')
    expect(offerChip({ state: 'live', ending_soon: true })).toEqual({
      label: 'Ends soon',
      tone: 'warning',
    })
    expect(offerChip({ state: 'scheduled' }).tone).toBe('info')
  })
})

describe('the desktop board', () => {
  it('shows the discount as a figure with what it is under it', () => {
    expect(discountFigure({ kind: 'percent', value: 15 })).toEqual({
      value: '15 %',
      note: 'Discount',
    })
    expect(discountFigure({ kind: 'price', value: 99 }).note).toBe(
      'Special price',
    )
    expect(discountFigure({ kind: 'price', value: 99 }).value).toContain('99')
    expect(discountFigure({ kind: 'gift', value: 2 })).toEqual({
      value: '2×',
      note: 'Free product',
    })
  })

  it("counts a promotion's coupons, or says it needs none", () => {
    expect(couponLine({ coupon_based: false })).toBe('No coupon needed')
    expect(
      couponLine({ coupon_based: true, coupons: { issued: 0, used: 0 } }),
    ).toBe('None given yet')
    expect(
      couponLine({ coupon_based: true, coupons: { issued: 5, used: 2 } }),
    ).toBe('2 of 5 used')
  })

  it('sums the figures the board leads with', () => {
    const board = {
      counts: { live: 3, scheduled: 1, paused: 0, ended: 2, ending_soon: 1 },
      offers: [
        { coupons: { issued: 10, used: 4 } },
        { coupons: { issued: 2, used: 1 } },
      ],
      program: { state: 'active', members: 154, collection_factor: 100 },
    }
    const groups = [
      { name: 'Mayoreo', price_list: 'Mayoreo', customers: 7 },
      { name: 'Payjoy', price_list: 'Enganches', customers: 154 },
      { name: 'Mostrador', price_list: null, customers: 852 },
    ]
    const byKey = Object.fromEntries(
      boardFigures(board, groups).map((f) => [f.key, f]),
    )
    expect(byKey.promociones).toMatchObject({
      value: 3,
      hint: '1 ending soon',
    })
    expect(byKey.cupones).toMatchObject({ value: 5, hint: 'of 12 given' })
    expect(byKey.puntos.value).toBe(154)
    expect(byKey.puntos.hint).toContain('100')
    expect(byKey.grupos).toMatchObject({
      value: 2,
      hint: '161 customers buy at them',
    })
  })

  it('waits for the groups and says when there is no points program', () => {
    const byKey = Object.fromEntries(
      boardFigures({ program: { state: 'no_program' } }, null).map((f) => [
        f.key,
        f,
      ]),
    )
    expect(byKey.grupos.value).toBe('—')
    expect(byKey.puntos).toMatchObject({
      value: '—',
      hint: 'No points program yet',
    })
    expect(byKey.cupones.hint).toBe('None given yet')
  })

  it('names a group by its customers and price list', () => {
    expect(groupLine({ customers: 4, price_list: 'Mayoreo' })).toBe(
      '4 customers · Mayoreo',
    )
    expect(groupLine({ customers: 90, price_list: null })).toBe(
      '90 customers · Default price list',
    )
  })
})

describe('Fidelidad dates', () => {
  it('offers today, the weekend, a week, the month end and no end', () => {
    expect(untilChips(NOW).map((c) => c.value)).toEqual([
      '2026-10-30',
      '2026-11-01',
      '2026-11-06',
      '2026-10-31',
      'none',
    ])
  })

  it('extends from the later of today and the current end', () => {
    const fromEnd = extendChips({ valid_upto: '2026-11-10' }, NOW)
    expect(fromEnd.slice(0, 3).map((c) => c.value)).toEqual([
      '2026-11-11',
      '2026-11-17',
      '2026-11-30',
    ])
    const ended = extendChips({ valid_upto: '2026-10-01' }, NOW)
    expect(ended[0].value).toBe('2026-10-31')
    expect(ended.at(-1).value).toBe('none')
  })
})

describe('the new promotion sheet', () => {
  const draft = (extra = {}) => ({
    target: 'item_group',
    pick: { name: 'Fundas', title: 'Fundas' },
    kind: 'percent',
    value: 15,
    minimum: 0,
    until: '2026-10-31',
    how: 'auto',
    title: '',
    ...extra,
  })

  it('builds the payload the server takes', () => {
    expect(offerPayload(draft())).toMatchObject({
      apply_on: 'Item Group',
      target: 'Fundas',
      discount_type: 'Discount Percentage',
      value: 15,
      valid_upto: '2026-10-31',
      coupon_based: false,
    })
    expect(
      offerPayload(
        draft({
          target: 'ticket',
          kind: 'amount',
          value: 100,
          minimum: 500,
          until: 'none',
          how: 'coupon',
        }),
      ),
    ).toMatchObject({
      apply_on: 'Transaction',
      target: '',
      discount_type: 'Discount Amount',
      min_amount: 500,
      valid_upto: '',
      coupon_based: true,
    })
  })

  it('says what is missing before starting', () => {
    expect(offerMissing(draft())).toBe('')
    expect(offerMissing(draft({ pick: null }))).toBe('Choose the category.')
    expect(offerMissing(draft({ target: 'item', pick: null }))).toBe(
      'Choose the product.',
    )
    expect(offerMissing(draft({ value: 0 }))).toBe('Choose how much off.')
    expect(offerMissing(draft({ value: 120 }))).toContain('100')
    expect(offerMissing(draft({ until: '' }))).toBe('Choose until when.')
    expect(offerMissing(draft({ target: 'ticket', pick: null }))).toBe('')
  })

  it('reads the promotion back in one sentence', () => {
    const text = offerPreview(draft({ how: 'coupon', until: 'none' }))
    expect(text).toContain('15 %')
    expect(text).toContain('Fundas')
    expect(text).toContain('with no end date')
    expect(text).toContain('with a coupon')
  })
})

describe('codes', () => {
  it('suggests a public code from the title', () => {
    expect(suggestCode('Mes Patrio 2026 · 10% Fundas')).toBe('PATRIO10')
    expect(suggestCode('Liquidación de verano')).toBe('LIQUIDACION')
    expect(suggestCode('')).toBe('PROMO')
  })
})
