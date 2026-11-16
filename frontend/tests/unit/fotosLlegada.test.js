// Fotos de lo que llega in Productos: the line under a product says when it
// came in and what brought it, and the camera walk takes the rows that still
// have no photo, each with that line.
import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_VIEW,
  VIEWS,
  arrivedLine,
  normalizeView,
  walkOf,
} from '@/composables/useProductos'

const now = new Date(2026, 10, 16, 12)

describe('Llegaron sin foto', () => {
  it('is a Productos list of its own', () => {
    expect(VIEWS.some((view) => view.value === ARRIVAL_VIEW)).toBe(true)
    expect(normalizeView('llegaron-sin-foto')).toBe(ARRIVAL_VIEW)
  })

  it('says when a product came in and what brought it', () => {
    expect(
      arrivedLine(
        {
          date: '2026-11-16',
          doctype: 'Purchase Receipt',
          name: 'MAT-PRE-1',
          party: 'XMovil',
        },
        { now },
      ),
    ).toBe('Arrived hoy · XMovil')
    expect(
      arrivedLine(
        { date: '2026-11-03', doctype: 'Stock Entry', name: 'MAT-STE-9' },
        { now },
      ),
    ).toBe('Arrived 3 nov · stock entry')
    expect(arrivedLine(null)).toBe('')
  })

  it('walks only the rows that still have no photo', () => {
    const rows = [
      {
        name: 'A',
        title: 'Pantalla A23',
        image: '',
        arrived: {
          date: '2026-11-15',
          doctype: 'Purchase Receipt',
          name: 'R1',
          party: 'XMovil',
        },
      },
      { name: 'B', title: 'Mica B', image: '/files/b.jpg' },
      { name: 'C', image: null },
    ]
    expect(walkOf(rows, { now })).toEqual([
      { key: 'A', title: 'Pantalla A23', detail: 'Arrived ayer · XMovil' },
      { key: 'C', title: 'C', detail: '' },
    ])
  })
})
