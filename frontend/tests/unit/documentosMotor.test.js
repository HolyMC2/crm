// Documentos engine additions for the sales and purchase profiles (Shell D2):
// «Filtros» by period, link and child table; the print-format curation.
import { describe, expect, it } from 'vitest'
import {
  fieldFilters,
  filterOptions,
  listFilters,
  PERIODS,
  periodRange,
} from '@/documentos/listState'
import { curateFormats } from '@/documentos/tools'

const NOW = new Date(2026, 9, 18, 15, 30) // sáb 18 oct 2026

describe('«Filtros» by period', () => {
  it('words presets as calendar days, never a date input', () => {
    expect(periodRange('hoy', NOW)).toEqual(['2026-10-18', '2026-10-18'])
    expect(periodRange('7-dias', NOW)).toEqual(['2026-10-12', '2026-10-18'])
    expect(periodRange('mes', NOW)).toEqual(['2026-10-01', '2026-10-31'])
    expect(periodRange('mes-pasado', NOW)).toEqual(['2026-09-01', '2026-09-30'])
    expect(periodRange('anio', NOW)).toEqual(['2026-01-01', '2026-12-31'])
    expect(periodRange('nope', NOW)).toBeNull()
    expect(periodRange('mes-pasado', new Date(2026, 0, 5))).toEqual([
      '2025-12-01',
      '2025-12-31',
    ])
  })

  it('offers the presets in Spanish and filters the field with between', () => {
    const field = { fieldname: 'fecha', kind: 'period', field: 'posting_date' }
    expect(filterOptions(field)).toBe(PERIODS)
    expect(PERIODS.map((p) => p.label)).toContain('Este mes')
    expect(fieldFilters(field, 'fecha', 'mes', NOW)).toEqual([
      ['posting_date', 'between', ['2026-10-01', '2026-10-31']],
    ])
    expect(fieldFilters(field, 'fecha', 'nope', NOW)).toEqual([])
  })
})

describe('«Filtros» by link and child table', () => {
  it('keeps a link as equality and lets a field say its own filters', () => {
    const cliente = { fieldname: 'customer', kind: 'link', doctype: 'Customer' }
    expect(fieldFilters(cliente, 'customer', 'Ana López')).toEqual([
      ['customer', '=', 'Ana López'],
    ])
    const vendedor = {
      fieldname: 'vendedor',
      kind: 'link',
      doctype: 'Sales Person',
      filters: (v) => [['Sales Team', 'sales_person', '=', v]],
    }
    expect(fieldFilters(vendedor, 'vendedor', 'Karla')).toEqual([
      ['Sales Team', 'sales_person', '=', 'Karla'],
    ])
    expect(fieldFilters(vendedor, 'vendedor', '')).toEqual([])
    expect(fieldFilters(undefined, 'is_return', '1')).toEqual([
      ['is_return', '=', '1'],
    ])
  })

  it('builds the list filters from every kind at once', () => {
    const profile = {
      chips: [],
      filterFields: [
        { fieldname: 'fecha', kind: 'period', field: 'transaction_date' },
        {
          fieldname: 'vendedor',
          kind: 'link',
          doctype: 'Sales Person',
          filters: (v) => [['Sales Team', 'sales_person', '=', v]],
        },
      ],
    }
    const out = listFilters(
      profile,
      { filters: { fecha: 'hoy', vendedor: 'Karla', customer: 'Ana' } },
      NOW,
    )
    expect(out).toEqual([
      ['transaction_date', 'between', ['2026-10-18', '2026-10-18']],
      ['Sales Team', 'sales_person', '=', 'Karla'],
      ['customer', '=', 'Ana'],
    ])
  })
})

describe('print formats, curated per profile', () => {
  const server = [
    {
      name: 'Detailed Tax Invoice',
      label: 'Detailed Tax Invoice',
      default: false,
    },
    { name: 'Factura CFDI 4.0', label: 'Factura CFDI 4.0', default: false },
    { name: 'Punto de venta', label: 'Punto de venta', default: true },
    {
      name: 'Sales Auditing Voucher',
      label: 'Sales Auditing Voucher',
      default: false,
    },
    { name: 'Standard', label: 'Standard', default: false },
  ]

  it('passes the server list through without a curation', () => {
    expect(curateFormats(server, null)).toBe(server)
  })

  it('keeps the named ones, names them in Spanish and puts the default first', () => {
    const out = curateFormats(server, {
      only: ['Factura CFDI 4.0', 'Punto de venta'],
      labels: { 'Punto de venta': 'Ticket de caja' },
      hints: { 'Factura CFDI 4.0': 'Con sello del SAT' },
      first: 'Factura CFDI 4.0',
    })
    expect(out.map((f) => f.label)).toEqual([
      'Factura CFDI 4.0',
      'Ticket de caja',
    ])
    expect(out[0]).toMatchObject({ default: true, hint: 'Con sello del SAT' })
    expect(out.filter((f) => f.default)).toHaveLength(1)
  })

  it('hides internal formats and never ends without a default', () => {
    const out = curateFormats(server, {
      hide: [
        'Detailed Tax Invoice',
        'Sales Auditing Voucher',
        'Punto de venta',
      ],
    })
    expect(out.map((f) => f.name)).toEqual(['Factura CFDI 4.0', 'Standard'])
    expect(out[0].default).toBe(true)
    // `only` naming nothing that exists keeps the rest instead of an empty picker.
    expect(curateFormats(server, { only: ['Gone'] })).toHaveLength(5)
  })
})
