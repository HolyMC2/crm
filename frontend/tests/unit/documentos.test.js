import { describe, expect, it } from 'vitest'
import {
  PROFILES,
  documentRoute,
  floorRoute,
  listRoute,
  moduleOf,
  profileBySlug,
  profileFor,
  readableDoctypes,
} from '@/documentos/registry'
import {
  chipCountFilters,
  listFilters,
  readListQuery,
  writeListQuery,
} from '@/documentos/listState'
import {
  docStatus,
  genericProfile,
  titleOf,
} from '@/documentos/profiles/_generic'
import salesInvoice from '@/documentos/profiles/sales_invoice'
import quotation from '@/documentos/profiles/quotation'
import { loadProfile } from '@/documentos/profiles'
import { documentItem, documentosPlaces } from '@/documentos/palette'

const boot = (doctypes, extra = {}) => ({
  modules: {
    documentos: { enabled: true, capabilities: { doctypes } },
    inventario: {
      enabled: true,
      capabilities: { doctypes: ['Stock Entry', 'Warehouse'] },
    },
    ...extra,
  },
})

describe('documentos registry', () => {
  it('has unique slugs per module and Spanish labels', () => {
    const keys = PROFILES.map((p) => `${p.base || '/documentos'}/${p.slug}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const p of PROFILES) expect(p.label).not.toMatch(/Invoice|Order|Entry/)
  })

  it('opens a document in its profile, a handoff page or the floor', () => {
    expect(documentRoute('Sales Invoice', 'ACC-SINV-2026-00001')).toEqual({
      path: '/documentos/facturas/ACC-SINV-2026-00001',
    })
    expect(documentRoute('Purchase Order', 'PUR-ORD-1')).toEqual({
      path: '/compras/orden/PUR-ORD-1',
    })
    expect(documentRoute('Purchase Invoice', 'X/1')).toEqual({
      path: '/gastos/factura/X%2F1',
    })
    expect(documentRoute('Item', 'IPHONE 13')).toEqual({
      path: '/productos/IPHONE%2013',
    })
    expect(documentRoute('Stock Entry', 'MAT-STE-1')).toEqual({
      path: '/inventario/entradas/MAT-STE-1',
    })
    expect(documentRoute('Journal Entry', 'ACC-JV-1')).toEqual({
      path: '/documentos/tipo/Journal%20Entry/ACC-JV-1',
    })
    expect(documentRoute('', 'x')).toBeNull()
    expect(documentRoute('Sales Invoice', '')).toBeNull()
  })

  it('picks cobros or pagos for a Payment Entry by its type', () => {
    expect(
      documentRoute('Payment Entry', 'PE-1', { hint: { payment_type: 'Pay' } })
        .path,
    ).toBe('/documentos/pagos/PE-1')
    expect(
      documentRoute('Payment Entry', 'PE-1', {
        hint: { payment_type: 'Receive' },
      }).path,
    ).toBe('/documentos/cobros/PE-1')
    expect(profileFor('Payment Entry').slug).toBe('cobros')
  })

  it('returns null for a curated doctype the boot says this worker cannot read', () => {
    const b = boot(['Quotation'])
    expect(documentRoute('Sales Invoice', 'A', { boot: b })).toBeNull()
    expect(documentRoute('Quotation', 'Q', { boot: b }).path).toBe(
      '/documentos/cotizaciones/Q',
    )
    expect(
      documentRoute('ToDo', 'abc', {
        boot: { modules: { documentos: { enabled: false } } },
      }),
    ).toBeNull()
    expect(readableDoctypes(b).has('Stock Entry')).toBe(true)
    expect(readableDoctypes(null)).toBeNull()
  })

  it('names the module that owns a list', () => {
    expect(moduleOf(profileBySlug('ajustes', '/inventario'))).toBe('inventario')
    expect(moduleOf(profileBySlug('facturas'))).toBe('documentos')
    expect(profileBySlug('ajustes')).toBeNull()
    expect(listRoute(profileBySlug('facturas'), { q: 'ana' })).toEqual({
      path: '/documentos/facturas',
      query: { q: 'ana' },
    })
    expect(floorRoute('Item Price')).toEqual({
      path: '/documentos/tipo/Item%20Price',
    })
  })
})

describe('documentos list state', () => {
  it('round-trips chip, search, sort, «Filtros» and a connection scope through the URL', () => {
    const state = {
      chip: 'vencidas',
      search: ' ana ',
      sort: 'due_date asc',
      filters: { is_return: '1' },
      scope: [['Sales Invoice Item', 'sales_order', '=', 'SO-1']],
      scopeLabel: 'el pedido de Ana',
    }
    const query = writeListQuery(state, { defaultChip: 'por-cobrar' })
    expect(query).toMatchObject({
      estado: 'vencidas',
      q: 'ana',
      orden: 'due_date asc',
      f_is_return: '1',
    })
    const back = readListQuery(JSON.parse(JSON.stringify(query)))
    expect(back).toEqual({ ...state, search: 'ana' })
  })

  it('keeps the default chip out of the URL and survives a broken scope', () => {
    expect(
      writeListQuery(
        { chip: 'por-cobrar', filters: {} },
        { defaultChip: 'por-cobrar' },
      ),
    ).toEqual({})
    expect(readListQuery({ de: '{nope' }).scope).toBeNull()
    expect(readListQuery({}).chip).toBeNull()
  })

  it('builds server filters from the base list, chip, «Filtros» and scope', () => {
    const profile = {
      filters: [['payment_type', '=', 'Receive']],
      chips: salesInvoice.chips,
      defaultChip: 'por-cobrar',
    }
    const filters = listFilters(profile, {
      chip: null,
      filters: { is_return: '0' },
      scope: [['x', '=', 1]],
    })
    expect(filters[0]).toEqual(['payment_type', '=', 'Receive'])
    expect(filters).toContainEqual(['docstatus', '=', 1])
    expect(filters).toContainEqual(['is_return', '=', '0'])
    expect(filters).toContainEqual(['x', '=', 1])
    const counts = chipCountFilters(profile, { chip: 'vencidas', filters: {} })
    expect(Object.keys(counts)).toEqual([
      'por-cobrar',
      'vencidas',
      'borradores',
      'pagadas',
      'todos',
    ])
    expect(counts.todos).toEqual([['payment_type', '=', 'Receive']])
  })
})

describe('documentos profiles', () => {
  it('never titles a row with its ID', () => {
    expect(
      titleOf(
        { title: 'ACC-SINV-2026-00001', name: 'ACC-SINV-2026-00001' },
        'Sales Invoice',
      ),
    ).toBe('Factura')
    expect(
      titleOf({ title: '', name: 'Tienda Centro - DM' }, 'Warehouse'),
    ).toBe('Tienda Centro - DM')
    expect(titleOf({ title: 'Ana López', name: 'X' }, 'Quotation')).toBe(
      'Ana López',
    )
    const row = genericProfile.row(
      {
        name: 'MAT-STE-2026-00004',
        title: '',
        docstatus: 0,
        date: '2026-10-01',
      },
      { doctype: 'Stock Entry' },
    )
    expect(row.title).toBe('Movimiento de inventario')
    expect(row.subtitle).toContain('Borrador')
    expect(row.subtitle).toContain('MAT-STE-2026-00004')
  })

  it('reads draft and cancelled without a status field', () => {
    expect(docStatus({ docstatus: 0 })).toBe('Draft')
    expect(docStatus({ docstatus: 2, status: 'Paid' })).toBe('Cancelled')
    expect(docStatus({ docstatus: 1, status: 'Overdue' })).toBe('Overdue')
  })

  it('a factura row says what is owed and marks overdue', () => {
    const row = salesInvoice.row({
      name: 'ACC-SINV-1',
      title: 'Ana López',
      status: 'Overdue',
      docstatus: 1,
      amount: 1500,
      outstanding: 500,
      currency: 'MXN',
      due: '2020-01-01',
      date: '2019-12-01',
      fields: {},
    })
    expect(row.title).toBe('Ana López')
    expect(row.subtitle).toMatch(/^Venció hace \d+ días · debe \$500\.00$/)
    expect(row.subtitleTone).toBe('danger')
    expect(row.meta).toBe('$1,500.00')
  })

  it('a cotización row says until when it is valid', () => {
    const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10)
    const row = quotation.row({
      name: 'Q',
      title: 'Ana',
      status: 'Open',
      docstatus: 1,
      amount: 10,
      due: future,
    })
    expect(row.subtitle).toMatch(/^Válida hasta /)
  })

  it('merges a curated profile over the generic one', async () => {
    const p = await loadProfile({ doctype: 'Sales Invoice' })
    expect(p.slug).toBe('facturas')
    expect(p.defaultChip).toBe('por-cobrar')
    expect(p.sections).toEqual(genericProfile.sections)
    const floor = await loadProfile({ doctype: 'ToDo' })
    expect(floor.slug).toBeNull()
    expect(floor.chips).toEqual(genericProfile.chips)
  })
})

describe('documentos palette', () => {
  it('a found document reads party first, opens its record', () => {
    const item = documentItem(
      {
        doctype: 'Sales Invoice',
        name: 'ACC-SINV-1',
        title: 'Ana',
        status: 'Paid',
        amount: 10,
        currency: 'MXN',
      },
      boot(['Sales Invoice']),
    )
    expect(item.title).toBe('Ana')
    expect(item.subtitle).toBe('Factura · ACC-SINV-1 · Pagada · $10.00')
    expect(item.href).toBe('/documentos/facturas/ACC-SINV-1')
  })

  it('places only the readable lists', () => {
    const titles = documentosPlaces(boot(['Sales Invoice'])).map((i) => i.title)
    expect(titles).toContain('Documentos')
    expect(titles).toContain('Documentos › Facturas')
    expect(titles).toContain('Inventario › Entradas y traspasos')
    expect(titles).not.toContain('Documentos › Cotizaciones')
  })
})
