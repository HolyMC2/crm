import { describe, expect, it } from 'vitest'
import {
  documentLink,
  ledgerReportUrl,
  productRoute,
  salesReportUrl,
  variantsLabel,
  visibleRows,
} from '../../src/composables/useProductos.js'

describe('Productos variants and the product page lists', () => {
  it('says how many variants a template has, and how many match a search', () => {
    expect(variantsLabel(null)).toBe('')
    expect(variantsLabel({ count: 1, matching: null })).toBe('1 variant')
    expect(variantsLabel({ count: 1011, matching: null })).toBe('1011 variants')
    expect(variantsLabel({ count: 12, matching: 3 })).toBe('3 of 12 variants')
    // Every variant matching is just «N variants».
    expect(variantsLabel({ count: 3, matching: 3 })).toBe('3 variants')
  })

  it('opens a template with the search that found it', () => {
    const template = { name: 'IPN000109', variants: { count: 4 } }
    expect(productRoute(template, '/productos?q=a04', 'a04')).toEqual({
      name: 'Producto',
      params: { item: 'IPN000109' },
      query: { list: '/productos?q=a04', vq: 'a04' },
    })
    // A plain product never carries it.
    expect(productRoute({ name: 'IPN000001' }, '', 'a04').query).toEqual({})
  })

  it('shows five rows until «See all»', () => {
    const rows = Array.from({ length: 12 }, (_, n) => n)
    expect(visibleRows(rows, false)).toEqual([0, 1, 2, 3, 4])
    expect(visibleRows(rows, true)).toHaveLength(12)
    expect(visibleRows(undefined, false)).toEqual([])
  })

  it('opens purchases in Compras and every other document in Desk', () => {
    expect(documentLink('Purchase Order', 'PO-1')).toEqual({
      to: { name: 'CompraOrden', params: { name: 'PO-1' } },
    })
    expect(documentLink('Material Request', 'MR-1')).toEqual({
      to: { name: 'CompraSolicitud', params: { name: 'MR-1' } },
    })
    expect(documentLink('Sales Invoice', 'ACC-SINV-2026/1')).toEqual({
      href: '/app/sales-invoice/ACC-SINV-2026%2F1',
    })
    expect(documentLink('Stock Reconciliation', 'MAT-RECO-1').href).toBe(
      '/app/stock-reconciliation/MAT-RECO-1',
    )
    expect(documentLink('', 'X')).toBeNull()
    expect(ledgerReportUrl('IPN 1')).toBe(
      '/app/query-report/Stock Ledger?item_code=IPN%201&from_date=2000-01-01',
    )
    expect(salesReportUrl('IPN1')).toContain('Item-wise Sales Register')
  })
})
