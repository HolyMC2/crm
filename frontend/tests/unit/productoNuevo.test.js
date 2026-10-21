import { describe, expect, it } from 'vitest'
import {
  newItemDraft,
  newItemPayload,
  newItemProblems,
  parseRate,
} from '../../src/composables/useProductos'

const ready = {
  item_name: 'Funda silicón rosa',
  item_group: 'Fundas y cases',
  rate: '150',
  barcode: '',
  brand: '',
  description: '',
}

describe('Nuevo producto: first values from the URL', () => {
  it('a search that found nothing becomes the name', () => {
    expect(newItemDraft({ nombre: '  Funda rosa ' })).toMatchObject({
      item_name: 'Funda rosa',
      barcode: '',
    })
  })

  it('an all-digit search is a barcode, not a name', () => {
    expect(newItemDraft({ nombre: '7501234567890' })).toMatchObject({
      item_name: '',
      barcode: '7501234567890',
    })
  })

  it('keeps the group of the product just created, and a scanned code', () => {
    expect(newItemDraft({ grupo: 'Micas', codigo: 'ABC-123' })).toMatchObject({
      item_group: 'Micas',
      barcode: 'ABC-123',
    })
  })

  it('starts empty without a query, and ignores non-text values', () => {
    expect(newItemDraft()).toEqual({
      item_name: '',
      item_group: '',
      rate: '',
      barcode: '',
      brand: '',
      description: '',
    })
    expect(newItemDraft({ nombre: ['a', 'b'] }).item_name).toBe('')
  })
})

describe('Nuevo producto: typed prices', () => {
  it.each([
    ['1250', 1250],
    ['1250,50', 1250.5],
    ['150.5', 150.5],
    ['1,250.50', 1250.5],
    ['1.250,5', 1250.5],
    ['1.250', 1250],
    ['1,250', 1250],
    [' 12 500 ', 12500],
    ['0', 0],
  ])('reads %j as %d', (typed, expected) => {
    expect(parseRate(typed)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '12,', ',5', '-3', '1e3'])(
    'refuses %j: it is not a price',
    (typed) => {
      expect(parseRate(typed)).toBeNull()
    },
  )
})

describe('Nuevo producto: what stops saving', () => {
  it('a complete form has no problems', () => {
    expect(newItemProblems(ready)).toEqual({})
  })

  it('names the empty required fields, in form order', () => {
    expect(Object.keys(newItemProblems({ ...ready, item_name: ' ' }))).toEqual([
      'item_name',
    ])
    const empty = newItemProblems({
      ...ready,
      item_name: '',
      item_group: '',
      rate: '',
    })
    expect(Object.keys(empty)).toEqual(['item_name', 'item_group', 'rate'])
  })

  it('a price of zero or more than ten million is not a price', () => {
    expect(newItemProblems({ ...ready, rate: '0' })).toHaveProperty('rate')
    expect(newItemProblems({ ...ready, rate: '10000001' })).toHaveProperty(
      'rate',
    )
    expect(newItemProblems({ ...ready, rate: '10000000' })).toEqual({})
  })

  it('a barcode is letters and numbers, optional', () => {
    expect(newItemProblems({ ...ready, barcode: '75 01' })).toHaveProperty(
      'barcode',
    )
    expect(newItemProblems({ ...ready, barcode: '7501234567890' })).toEqual({})
    expect(newItemProblems({ ...ready, barcode: '' })).toEqual({})
  })
})

describe('Nuevo producto: the create call', () => {
  it('sends the trimmed form, the price as a number and the request id', () => {
    const payload = newItemPayload(
      {
        ...ready,
        item_name: '  Funda silicón rosa  ',
        rate: '1.250,5',
        brand: ' Genérica ',
        description: '',
      },
      'req-1',
    )
    expect(payload).toEqual({
      request_id: 'req-1',
      data: {
        item_name: 'Funda silicón rosa',
        item_group: 'Fundas y cases',
        rate: 1250.5,
        brand: 'Genérica',
      },
    })
  })

  it('leaves out the optional fields that are empty', () => {
    const { data } = newItemPayload(ready, 'req-2')
    expect(Object.keys(data).sort()).toEqual([
      'item_group',
      'item_name',
      'rate',
    ])
  })
})
