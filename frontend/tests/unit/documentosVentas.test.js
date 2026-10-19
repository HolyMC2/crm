// Ventas profiles (Shell D2): rows in worker words, the next step by state
// (DD4), «Filtros», the «Creado desde» steps and «¿De dónde vino?».
import { describe, expect, it } from 'vitest'
import quotation from '@/documentos/profiles/quotation.js'
import salesOrder, { deliveryLine } from '@/documentos/profiles/sales_order.js'
import deliveryNote from '@/documentos/profiles/delivery_note.js'
import salesInvoice from '@/documentos/profiles/sales_invoice.js'
import posInvoice from '@/documentos/profiles/pos_invoice.js'
import cobro from '@/documentos/profiles/payment_entry_receive.js'
import { itemsLine, PRINT } from '@/documentos/profiles/_ventas.js'
import { loadProfile } from '@/documentos/profiles'
import { profileFor } from '@/documentos/registry'
import { listFilters } from '@/documentos/listState'
import { itemFromQuery, relabel, wantedFields } from '@/documentos/form'
import { curateFormats } from '@/documentos/tools'
import {
  attributionRows,
  stepView,
  whoLine,
} from '@/components/documentos/ventas/origen.js'

const items = {
  count: 3,
  first: [
    { name: 'Concha', qty: 2, uom: 'Nos' },
    { name: 'Bolillo', qty: 1, uom: 'Nos' },
  ],
}
const row = (over = {}) => ({
  name: 'SAL-ORD-2026-00012',
  title: 'Ana López',
  docstatus: 1,
  amount: 420,
  currency: 'MXN',
  date: '2026-10-14',
  items,
  fields: {},
  ...over,
})
const record = (header, extra = {}) => ({
  doctype: 'Sales Order',
  name: 'SAL-ORD-2026-00012',
  submittable: true,
  header: { docstatus: 1, title: 'Ana López', ...header },
  actions: { submit: { allowed: true } },
  ...extra,
})

describe('rows: the customer, what they carry, when, the amount', () => {
  it('says the items in one line', () => {
    expect(itemsLine({ items })).toBe('Concha, 2 pzas y 2 más')
    expect(
      itemsLine({ items: { count: 1, first: [{ name: 'Pan', qty: 1 }] } }),
    ).toBe('Pan')
    expect(itemsLine({})).toBe('')
  })

  it('names the customer, never the ID, on every sales list', () => {
    for (const [profile, doctype] of [
      [quotation, 'Quotation'],
      [salesOrder, 'Sales Order'],
      [deliveryNote, 'Delivery Note'],
      [salesInvoice, 'Sales Invoice'],
      [posInvoice, 'POS Invoice'],
    ]) {
      const view = profile.row(row({ status: 'Draft', docstatus: 0 }), {
        doctype,
      })
      expect(view.title).toBe('Ana López')
      expect(view.subtitle).toContain('Concha, 2 pzas y 2 más')
      expect(view.meta).toBe('$420.00')
      expect(view.subtitle).not.toMatch(/SAL-|ACC-|\d{4}-\d{2}-\d{2}/)
    }
    const nameless = salesOrder.row(row({ title: '' }), {})
    expect(nameless.title).toBe('Pedido')
  })

  it('words a pedido as «él» and its late delivery in red', () => {
    const now = new Date(2026, 9, 18)
    const late = row({ status: 'To Deliver', due: '2026-10-15' })
    expect(deliveryLine(late, now)).toEqual({
      label: 'Entrega atrasada 3 días',
      late: true,
    })
    expect(
      deliveryLine(row({ status: 'To Deliver', due: '2026-10-18' }), now),
    ).toEqual({ label: 'Entrega hoy', late: false })
    expect(
      deliveryLine(row({ status: 'To Bill', due: '2026-10-15' }), now),
    ).toBe(null)
    const view = salesOrder.row(row({ status: 'Completed' }))
    expect(view.statusLabel).toBe('Completado')
    // the list chip is short (305/412); the record header keeps the whole state
    expect(
      salesOrder.row(row({ status: 'To Deliver and Bill' })).statusLabel,
    ).toBe('Por entregar')
    expect(
      salesOrder.header({
        doctype: 'Sales Order',
        header: { status: 'To Deliver and Bill', docstatus: 1 },
      }).statusLabel,
    ).toBe('Por entregar y facturar')
  })

  it('keeps tickets quiet when paid and cobros when registered', () => {
    expect(posInvoice.row(row({ status: 'Paid' })).tone).toBe('neutral')
    expect(posInvoice.row(row({ status: 'Consolidated' })).statusLabel).toBe(
      'En factura global',
    )
    const c = cobro.row(
      row({ status: 'Submitted', fields: { mode_of_payment: 'Efectivo' } }),
    )
    expect(c.subtitle).toMatch(/^Efectivo · /)
    expect(c.tone).toBe('neutral')
    expect(cobro.row(row({ status: 'Draft', docstatus: 0 })).tone).toBe(
      'warning',
    )
  })
})

describe('chips and «Filtros» per queue', () => {
  it('Pedidos: Por entregar · Por facturar · Atrasados · Todos', async () => {
    const profile = await loadProfile({
      doctype: 'Sales Order',
      entry: profileFor('Sales Order'),
    })
    expect(profile.chips.map((c) => c.label)).toEqual([
      'Por entregar',
      'Por facturar',
      'Atrasados',
      'Borradores',
      'Completados',
      'Todos',
    ])
    expect(profile.defaultChip).toBe('por-entregar')
    const late = profile.chips.find((c) => c.value === 'atrasados').filters
    expect(late[2][0]).toBe('delivery_date')
    expect(late[2][1]).toBe('<')
    expect(late[2][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(profile.filterFields.map((f) => f.label)).toEqual([
      'Cliente',
      'Vendedor',
      'Fechas',
    ])
    const filters = listFilters(profile, {
      chip: '',
      filters: { customer: 'Ana López', vendedor: 'Karla' },
    })
    expect(filters).toEqual([
      ['customer', '=', 'Ana López'],
      ['Sales Team', 'sales_person', '=', 'Karla'],
    ])
  })

  it('every sales profile loads and asks for the items line', async () => {
    for (const doctype of [
      'Quotation',
      'Sales Order',
      'Delivery Note',
      'Sales Invoice',
      'POS Invoice',
    ]) {
      const profile = await loadProfile({ doctype, entry: profileFor(doctype) })
      expect(profile.fields).toContain('_items')
      expect(profile.panels?.length).toBeGreaterThan(0)
    }
    const cobros = await loadProfile({
      doctype: 'Payment Entry',
      entry: profileFor('Payment Entry', { payment_type: 'Receive' }),
    })
    expect(cobros.slug).toBe('cobros')
    expect(cobros.defaults).toEqual({
      payment_type: 'Receive',
      party_type: 'Customer',
    })
    const pagos = await loadProfile({
      doctype: 'Payment Entry',
      entry: profileFor('Payment Entry', { payment_type: 'Pay' }),
    })
    expect(pagos.defaults).toBeUndefined()
    expect(posInvoice.creatable).toBe(false)
  })
})

describe('the next step by state (DD4)', () => {
  it('Pedido: Entregar (filled) and Facturar (tonal), then Facturar', () => {
    const both = record({ status: 'To Deliver and Bill' })
    expect(salesOrder.nextStep(both)).toMatchObject({
      label: 'Entregar',
      make: 'delivery_note',
    })
    expect(salesOrder.altSteps(both)).toEqual([
      expect.objectContaining({ label: 'Facturar', make: 'sales_invoice' }),
    ])
    const bill = record({ status: 'To Bill' })
    expect(salesOrder.nextStep(bill)).toMatchObject({ make: 'sales_invoice' })
    expect(salesOrder.altSteps(bill)).toEqual([])
    expect(salesOrder.nextStep(record({ status: 'Completed' }))).toBeNull()
    expect(salesOrder.nextStep(record({ docstatus: 0 }))).toMatchObject({
      submit: true,
    })
  })

  it('Entrega → Facturar; Cotización → Crear pedido; Factura → Registrar cobro', () => {
    expect(deliveryNote.nextStep(record({ status: 'To Bill' }))).toMatchObject({
      label: 'Facturar',
      make: 'sales_invoice',
    })
    expect(
      deliveryNote.nextStep(record({ status: 'To Bill', is_return: 1 })),
    ).toBeNull()
    expect(quotation.nextStep(record({ status: 'Open' }))).toMatchObject({
      label: 'Crear pedido',
      make: 'sales_order',
    })
    expect(
      salesInvoice.nextStep(record({ status: 'Unpaid', outstanding: 420 })),
    ).toMatchObject({ label: 'Registrar cobro', make: 'payment' })
    expect(posInvoice.nextStep(record({ status: 'Paid' }))).toBeNull()
    expect(cobro.nextStep(record({ docstatus: 0 }))).toMatchObject({
      submit: true,
    })
  })
})

describe('the cobro form: the worker first, the accounts behind «Más datos»', () => {
  it('asks cliente, monto, forma de pago first and words the labels', () => {
    expect(cobro.editFields.slice(0, 3)).toEqual([
      'party',
      'paid_amount',
      'mode_of_payment',
    ])
    expect(cobro.moreFields).toContain('paid_to')
    expect(wantedFields(cobro)).toEqual([
      ...cobro.editFields,
      ...cobro.moreFields,
    ])
    const shape = relabel(
      {
        fields: [
          { fieldname: 'party', label: 'Contraparte' },
          { fieldname: 'naming_series', label: 'Serie' },
        ],
      },
      cobro.fieldLabels,
    )
    expect(shape.fields.map((f) => f.label)).toEqual(['Cliente', 'Serie'])
    expect(relabel({ fields: [] }, null)).toEqual({ fields: [] })
  })

  it('a pedido asks for its delivery date before saving (ERPNext requires it in code)', async () => {
    const pedido = (await import('@/documentos/profiles/sales_order.js'))
      .default
    const shape = relabel(
      {
        fields: [
          { fieldname: 'delivery_date', label: 'Delivery Date', reqd: 0 },
        ],
      },
      pedido.fieldLabels,
    )
    expect(shape.fields[0]).toMatchObject({
      label: 'Fecha de entrega',
      reqd: 1,
    })
  })

  it('starts a cotización with the item Producto sent', () => {
    expect(itemFromQuery({ articulo: 'CONCHA', cantidad: '3' })).toEqual({
      item_code: 'CONCHA',
      qty: 3,
    })
    expect(itemFromQuery({ articulo: 'CONCHA', cantidad: 'x' }).qty).toBe(1)
    expect(itemFromQuery({})).toBeNull()
  })
})

describe('print formats a customer can get', () => {
  const server = [
    'Detailed Tax Invoice',
    'Factura CFDI 4.0',
    'Point of Sale',
    'POSA Nota de Crédito',
    'print 80mm',
    'Sales Auditing Voucher',
    'Ticket 80mm factura de venta',
    'Sales Invoice Standard',
    'Standard',
  ].map((name) => ({ name, label: name, default: name === 'Standard' }))

  it('the Factura picker shows Spanish names, the one that always prints first', () => {
    const out = curateFormats(server, PRINT['Sales Invoice'])
    // the CFDI one prints only once stamped; the Print Designer tickets fail on the lab
    expect(out.map((f) => f.label)).toEqual(['Factura', 'Factura (CFDI 4.0)'])
    expect(out[0].default).toBe(true)
    expect(out.some((f) => /Voucher|Detailed|80mm|80 mm/.test(f.label))).toBe(
      false,
    )
  })
})

describe('«Creado desde» and «¿De dónde vino?»', () => {
  const doc = (name, over = {}) => ({
    name,
    title: 'Ana López',
    docstatus: 1,
    amount: 420,
    currency: 'MXN',
    date: '2026-10-14',
    fields: {},
    ...over,
  })

  it('words each step and opens its one document or its list', () => {
    const done = stepView({
      key: 'pedido',
      doctype: 'Sales Order',
      label: 'Pedido',
      state: 'done',
      docs: [doc('SAL-ORD-1')],
    })
    expect(done.line).toMatch(/^Confirmado · 14 oct( 2026)? · \$420\.00$/)
    expect(done.to).toEqual({ path: '/documentos/pedidos/SAL-ORD-1' })
    const partial = stepView({
      key: 'entrega',
      doctype: 'Delivery Note',
      label: 'Entrega',
      state: 'done',
      partial: true,
      docs: [doc('DN-1'), doc('DN-2')],
    })
    expect(partial.state).toBe('partial')
    expect(partial.line).toBe('Entregado en parte · 2 documentos')
    expect(partial.to.path).toBe('/documentos/entregas')
    expect(JSON.parse(partial.to.query.de)).toEqual([
      ['Delivery Note', 'name', 'in', ['DN-1', 'DN-2']],
    ])
    const none = stepView({
      key: 'cobro',
      doctype: 'Payment Entry',
      label: 'Cobro',
      state: 'none',
      docs: [],
    })
    expect(none).toMatchObject({ line: 'Falta cobrar', to: null })
    const cobroDoc = stepView({
      key: 'cobro',
      doctype: 'Payment Entry',
      label: 'Cobro',
      state: 'draft',
      docs: [
        doc('ACC-PAY-1', { docstatus: 0, fields: { payment_type: 'Receive' } }),
      ],
    })
    expect(cobroDoc.to).toEqual({ path: '/documentos/cobros/ACC-PAY-1' })
    expect(cobroDoc.line).toMatch(/^En borrador/)
  })

  it('reads the channel, campaign and seller as icon rows', () => {
    const rows = attributionRows({
      canal: {
        kind: 'web',
        label: 'Tienda en línea',
        detail: 'Pedido en la web',
      },
      campana: {
        label: 'Buen Fin',
        source: 'facebook',
        medium: 'cpc',
        first_touch: '',
      },
      vendedor: {
        kind: 'equipo',
        people: [
          { name: 'Karla Ruiz', percent: 60 },
          { name: 'Juan Pérez', percent: 40 },
        ],
      },
    })
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Canal', 'Tienda en línea'],
      ['Campaña', 'Buen Fin'],
      ['Vendedor', 'Karla Ruiz (60 %), Juan Pérez (40 %)'],
    ])
    expect(rows[1].detail).toBe('facebook / cpc')
    expect(attributionRows(null)).toEqual([])
    const counter = attributionRows({
      canal: { kind: 'mostrador', label: 'Mostrador' },
      campana: null,
      vendedor: { kind: 'captura', people: [{ name: 'Ana', percent: null }] },
    })
    expect(counter.map((r) => r.label)).toEqual([
      'Canal',
      'Vendedor (quien la capturó)',
    ])
  })

  it('says who did each step with names, never emails', () => {
    expect(
      whoLine({
        created_by: 'Ana López',
        confirmed_by: 'Karla Ruiz',
        confirmed_at: '2026-10-14 12:30:00',
      }),
    ).toMatch(/^Capturó Ana López · confirmó Karla Ruiz 14 oct( 2026)? 12:30$/)
    expect(
      whoLine({
        created_by: 'Ana López',
        confirmed_by: 'Ana López',
        confirmed_at: '2026-10-14 12:30:00',
      }),
    ).toMatch(/^Ana López capturó y confirmó/)
    expect(whoLine({ created_by: 'Ana López' })).toBe('Capturó Ana López')
  })
})
