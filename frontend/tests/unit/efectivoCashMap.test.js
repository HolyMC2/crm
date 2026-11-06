// Efectivo's cash map: the figure, one tile per place the cash sits, and the
// tiles that open their bags.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

import CashMap from '@/components/efectivo/CashMap.vue'
import { cashMap } from '@/components/efectivo/efectivo'

let app
let root
function mount(map) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const picked = vi.fn()
  app = createApp({ render: () => h(CashMap, { map, onPick: picked }) })
  app.mount(root)
  return picked
}
/** What the worker reads, one piece of text after another. */
function text(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const pieces = []
  while (walker.nextNode()) pieces.push(walker.currentNode.textContent.trim())
  return pieces.filter(Boolean).join(' ')
}

afterEach(() => {
  app?.unmount()
  root?.remove()
})

const map = cashMap([
  {
    title: 'Caja fuerte centro',
    currency: 'MXN',
    balance: 8000,
    loose_balance: 2600,
    in_transit: 0,
    bags: [
      { state: 'Unverified', amount: 2211 },
      { state: 'Available', amount: 3189 },
    ],
  },
])

describe('CashMap', () => {
  it('shows the safe, its balance and where the money sits', () => {
    mount(map)
    expect(text(root.querySelector('[data-efectivo-hero] p'))).toBe(
      'En Caja fuerte centro',
    )
    expect(text(root.querySelector('[data-efectivo-hero]'))).toContain(
      '$8,000.00',
    )
    const tiles = [...root.querySelectorAll('[data-part]')].map(text)
    expect(tiles).toEqual([
      'Suelto $2,600.00',
      'Por verificar 1 $2,211.00',
      'Listas 1 $3,189.00',
    ])
    expect(
      root.querySelector('[data-efectivo-bar]').getAttribute('aria-label'),
    ).toBe(
      'Suelto $2,600.00; Por verificar 1 bolsa, $2,211.00; Listas 1 bolsa, $3,189.00',
    )
  })

  it('opens the bags of a part; loose cash has none to open', () => {
    const picked = mount(map)
    expect(root.querySelector('[data-part="loose"] button')).toBeNull()
    root.querySelector('[data-part="Available"] button').click()
    expect(picked).toHaveBeenCalledOnce()
    expect(picked.mock.calls[0][0]).toMatchObject({
      key: 'Available',
      view: 'sealed',
    })
  })
})
