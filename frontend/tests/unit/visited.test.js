// Record pages opened in the shell join the palette's Recientes (the
// awesomebar's recent pages): paths in this tab, references in the palette.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn(), toast: {} }))

import { noteVisit, takeVisits } from '@/utils/visited'
import { recentWithVisits, visitedRef } from '@/utils/shellPalette'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('noteVisit keeps record pages only', () => {
  it('a contact, a deal, a document and a product; never a list, a new form or another page', () => {
    for (const path of [
      '/hoy',
      '/contactos',
      '/contactos/customer/Juan%20P%C3%A9rez?tab=actividad',
      '/ventas/deal/CRM-DEAL-2026-00012',
      '/documentos/facturas',
      '/documentos/facturas/ACC-SINV-2026-00058',
      '/documentos/facturas/nuevo',
      '/documentos/tipo/Employee',
      '/documentos/tipo/Employee/HR-EMP-00007',
      '/inventario/movimientos',
      '/productos/SKU-1',
      '/productos/SKU-1/ajustes',
      '/pendientes/todo/abc',
    ])
      noteVisit(path)
    expect(takeVisits()).toEqual([
      '/contactos/customer/Juan%20P%C3%A9rez',
      '/ventas/deal/CRM-DEAL-2026-00012',
      '/documentos/facturas/ACC-SINV-2026-00058',
      '/documentos/tipo/Employee/HR-EMP-00007',
      '/productos/SKU-1',
    ])
    // Taken once.
    expect(takeVisits()).toEqual([])
  })

  it('a page opened again moves to the end; twelve are kept; the page on screen waits', () => {
    for (let i = 0; i < 15; i += 1) noteVisit(`/productos/SKU-${i}`)
    noteVisit('/productos/SKU-5')
    const here = '/productos/SKU-14'
    const taken = takeVisits(`${here}?tab=1`)
    expect(taken).toHaveLength(11)
    expect(taken.at(-1)).toBe('/productos/SKU-5')
    expect(taken).not.toContain(here)
    expect(taken).not.toContain('/productos/SKU-0')
    // Once the worker leaves it, it is somewhere to go back to.
    expect(takeVisits('/hoy')).toEqual([here])
  })

  it('unreadable storage is an empty log', () => {
    noteVisit('/productos/SKU-1')
    const [key] = Object.keys(sessionStorage)
    sessionStorage.setItem(key, '{not json')
    expect(takeVisits()).toEqual([])
  })
})

describe('a visited page as a recent reference', () => {
  it.each([
    [
      '/contactos/customer/Juan%20P%C3%A9rez',
      { source: 'customer', name: 'Juan Pérez' },
    ],
    [
      '/ventas/deal/CRM-DEAL-2026-00012',
      { source: 'deal', name: 'CRM-DEAL-2026-00012' },
    ],
    [
      '/documentos/facturas/ACC-SINV-2026-00058',
      { doctype: 'Sales Invoice', name: 'ACC-SINV-2026-00058' },
    ],
    [
      '/documentos/tipo/Employee/HR-EMP-00007',
      { doctype: 'Employee', name: 'HR-EMP-00007' },
    ],
    ['/productos/SKU-1', { doctype: 'Item', name: 'SKU-1' }],
  ])('%s', (path, record) => {
    expect(visitedRef(path)).toMatchObject({ href: path, record })
  })

  it('a list, a new form, an unknown slug or a broken address is none', () => {
    for (const path of [
      '/documentos/facturas',
      '/documentos/facturas/nuevo',
      '/documentos/no-such-list/X-1',
      '/documentos/tipo/Employee',
      '/contactos/customer/%E0%A4%A',
      '/hoy',
      '',
    ])
      expect(visitedRef(path), path).toBeNull()
  })

  it('joins Recientes newest first, once each, with what the palette opened', () => {
    const picked = [
      {
        id: 'documentos:Sales Invoice:ACC-SINV-2026-00058',
        href: '/documentos/facturas/ACC-SINV-2026-00058',
        record: { doctype: 'Sales Invoice', name: 'ACC-SINV-2026-00058' },
      },
    ]
    const next = recentWithVisits(picked, [
      '/productos/SKU-1',
      '/documentos/facturas/ACC-SINV-2026-00058',
      '/ventas/deal/D-1',
      '/hoy',
    ])
    expect(next.map((ref) => ref.href)).toEqual([
      '/ventas/deal/D-1',
      '/documentos/facturas/ACC-SINV-2026-00058',
      '/productos/SKU-1',
    ])
    // References only: no title is stored.
    for (const ref of next)
      expect(Object.keys(ref).sort()).toEqual(['href', 'id', 'record'])
  })
})
