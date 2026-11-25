import { describe, expect, it } from 'vitest'
import {
  VIEWS,
  normalizeView,
  priceWithMarkup,
  publishReceipt,
  rowPrice,
  rowSubtitle,
  selectable,
  stateChip,
  viewTitle,
} from '@/composables/useGsmCatalogo'

const row = (over = {}) => ({
  offering: 'Tyrone-2849',
  title: 'GSMA Blacklist Status Check',
  group: 'Generic Checks',
  delivery_time: '1-5 Min',
  state: 'sin_publicar',
  sellable: true,
  suggested: '3',
  price: null,
  excluded: null,
  blocked: null,
  ...over,
})

describe('Servidor GSM › Catálogo', () => {
  it('leads with «Todas» and opens on what is not on sale yet', () => {
    expect(VIEWS[0].value).toBe('todas')
    expect(normalizeView('')).toBe('sin_publicar')
    expect(normalizeView('en_venta')).toBe('en_venta')
    expect(normalizeView('x')).toBe('sin_publicar')
    expect(viewTitle('excluidos')).toBe('Never sold')
  })

  it('shows the price on sale, else what it would sell for, never a price it cannot have', () => {
    expect(rowPrice(row({ state: 'en_venta', price: '5' }), 'MXN')).toMatch(/5/)
    expect(rowPrice(row(), 'MXN')).toMatch(/3/)
    expect(rowPrice(row({ sellable: false, state: 'excluido' }), 'MXN')).toBe(
      '',
    )
  })

  it('says why a service can never be sold instead of its group', () => {
    expect(rowSubtitle(row())).toBe('Generic Checks, 1-5 Min')
    expect(rowSubtitle(row({ excluded: 'Quita iCloud sin el dueño' }))).toBe(
      'Quita iCloud sin el dueño',
    )
    expect(rowSubtitle(row({ blocked: 'Servicio gratuito' }))).toBe(
      'Servicio gratuito',
    )
  })

  it('picks only what can go on sale', () => {
    expect(selectable(row())).toBe(true)
    expect(selectable(row({ state: 'en_venta' }))).toBe(false)
    expect(selectable(row({ sellable: false, state: 'excluido' }))).toBe(false)
  })

  it('rounds the marked-up price up to whole pesos like the server', () => {
    expect(priceWithMarkup('1.68', 25)).toBe(3)
    expect(priceWithMarkup(40, 25)).toBe(50)
    expect(priceWithMarkup(0, 25)).toBeNull()
    expect(priceWithMarkup(10, -1)).toBeNull()
  })

  it('reads the publish answer as one line plus what stayed out', () => {
    expect(
      publishReceipt({
        published: [{ offering: 'a' }, { offering: 'b', already: true }],
      }).line,
    ).toBe('1 on sale')
    const r = publishReceipt({
      published: [{ offering: 'a' }],
      skipped: [{ offering: 'c', reason: 'x' }],
    })
    expect(r.line).toBe('1 on sale, 1 left out')
    expect(r.skipped).toHaveLength(1)
  })

  it('colours a state, never a selection', () => {
    expect(stateChip('en_venta').tone).toBe('success')
    expect(stateChip('excluido').tone).toBe('danger')
    expect(stateChip('sin_publicar').tone).toBe('neutral')
  })
})
