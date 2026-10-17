import { describe, expect, it } from 'vitest'
import { priceListLabel, priceListNote } from '@/utils/priceList'

describe('price list names as a shop reads them', () => {
  it('translates ERPNext default lists', () => {
    expect(priceListLabel('Standard Selling')).toBe('Precio de venta')
    expect(priceListLabel('Standard Buying')).toBe('Precio de compra')
  })

  it('passes the shop’s own lists through', () => {
    expect(priceListLabel('Payjoy')).toBe('Payjoy')
    expect(priceListLabel('Mayoreo')).toBe('Mayoreo')
  })

  it('shows no note for the default list, a name for any other', () => {
    expect(priceListNote('Standard Selling')).toBe('')
    expect(priceListNote('Payjoy')).toBe('Payjoy')
    expect(priceListNote('')).toBe('')
    expect(priceListNote(undefined)).toBe('')
  })
})
