import { describe, expect, it } from 'vitest'
import {
  loadShownLists,
  saveShownLists,
  scannerBinUrl,
  tierLines,
} from '../../src/composables/useProductos.js'
import { readReturn } from '@/vendor/muelle-shell/contracts'

function memory() {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  }
}

describe('Productos in depth', () => {
  it('shows the chosen price lists under the default one, in order', () => {
    const row = {
      price: { rate: 100, currency: 'MXN', price_list: 'Standard Selling' },
      tiers: { 'Standard Selling': 100, Payjoy: 150 },
    }
    const lines = tierLines(row, ['Standard Selling', 'Payjoy', 'Mayoreo'])
    expect(lines.map((line) => line.list)).toEqual(['Payjoy', 'Mayoreo'])
    expect(lines[0].rate).toBe(150)
    expect(lines[0].text).toMatch(/150/)
    expect(lines[1].text).toBe('No price')
    expect(tierLines({ price: null }, ['Payjoy'])).toEqual([])
  })

  it('remembers the shown lists per user', () => {
    const storage = memory()
    expect(loadShownLists('ana@x.test', storage)).toEqual([])
    saveShownLists('ana@x.test', ['Payjoy'], storage)
    expect(loadShownLists('ana@x.test', storage)).toEqual(['Payjoy'])
    expect(loadShownLists('beto@x.test', storage)).toEqual([])
    storage.setItem('muelle:productos:lists:ana@x.test', '{broken')
    expect(loadShownLists('ana@x.test', storage)).toEqual([])
  })

  it('opens a cajón in Escáner and comes back to the product', () => {
    const url = new URL(
      scannerBinUrl('CAJ 1', {
        to: '/crm/productos/IPN1',
        label: 'Productos',
      }),
      'https://x.invalid',
    )
    expect(url.pathname).toBe('/scan/bins/CAJ%201')
    expect(readReturn(url.search).to).toBe('/crm/productos/IPN1')
  })
})
