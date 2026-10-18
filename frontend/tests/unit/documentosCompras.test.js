// Shell SPEC §6, D3: the purchase and payment profiles, the chain, late deliveries.
import { describe, expect, it } from 'vitest'
import { documentRoute } from '@/documentos/registry'
import { listFilters } from '@/documentos/listState'
import { makeTarget } from '@/documentos/form'
import { loadProfile } from '@/documentos/profiles'
import materialRequest from '@/documentos/profiles/material_request'
import rfq from '@/documentos/profiles/request_for_quotation'
import supplierQuotation from '@/documentos/profiles/supplier_quotation'
import purchaseOrder from '@/documentos/profiles/purchase_order'
import purchaseReceipt from '@/documentos/profiles/purchase_receipt'
import purchaseInvoice from '@/documentos/profiles/purchase_invoice'
import pago from '@/documentos/profiles/payment_entry_pay'
import {
  arrivalLine,
  itemsLine,
  localToday,
  requestTitle,
} from '@/documentos/profiles/_compras'
import { chainSteps, pendingStep } from '@/components/documentos/compras/cadena'

const iso = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localToday(d)
}
const record = (header, doc = {}, extra = {}) => ({
  header,
  doc,
  submittable: true,
  actions: { submit: { allowed: true } },
  ...extra,
})
const items = (count, name = 'Pantalla Moto G15') => ({
  count,
  first: [{ name, qty: 2, uom: 'Nos' }],
})

describe('purchase profiles', () => {
  it('loads a curated profile for every purchase list', async () => {
    for (const doctype of [
      'Material Request',
      'Request for Quotation',
      'Supplier Quotation',
      'Purchase Order',
      'Purchase Receipt',
      'Purchase Invoice',
    ]) {
      const profile = await loadProfile({ doctype })
      expect(profile.nextStep, doctype).toBeTypeOf('function')
      expect(profile.chips.length, doctype).toBeGreaterThan(2)
      expect(profile.row, doctype).not.toBe(undefined)
    }
    const pagos = await loadProfile({
      doctype: 'Payment Entry',
      entry: {
        doctype: 'Payment Entry',
        slug: 'pagos',
        filters: [['payment_type', '=', 'Pay']],
      },
    })
    expect(pagos.editFields.slice(0, 3)).toEqual([
      'party',
      'paid_amount',
      'mode_of_payment',
    ])
  })

  it('names órdenes chips as the brief asks, with Atrasadas by the local day', () => {
    const labels = purchaseOrder.chips.map((c) => c.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        'Por recibir',
        'Atrasadas',
        'Por facturar',
        'Todas',
      ]),
    )
    const late = purchaseOrder.chips.find((c) => c.value === 'atrasadas')
    expect(late.filters).toContainEqual(['schedule_date', '<', localToday()])
    const filters = listFilters(purchaseOrder, {
      chip: 'atrasadas',
      filters: {},
    })
    expect(filters).toContainEqual(['schedule_date', '<', localToday()])
  })

  it('names facturas de proveedor chips Por pagar · Vencidas · Pagadas', () => {
    const labels = purchaseInvoice.chips.map((c) => c.label)
    for (const l of ['Por pagar', 'Vencidas', 'Pagadas'])
      expect(labels).toContain(l)
    expect(purchaseInvoice.defaultChip).toBe('por-pagar')
  })

  it('offers proveedor, tienda, comprador and fechas in «Filtros»', () => {
    const kinds = purchaseOrder.filterFields.map((f) => [f.fieldname, f.kind])
    expect(kinds).toEqual([
      ['supplier', 'link'],
      ['set_warehouse', 'link'],
      ['owner', 'link'],
      ['fecha', 'period'],
    ])
    expect(purchaseOrder.fields).toContain('_items')
  })

  it('titles an order row with the supplier, items, and a late delivery in red', () => {
    const row = purchaseOrder.row({
      name: 'PUR-ORD-2026-00001',
      title: 'Refacciones del Pacífico',
      status: 'To Receive and Bill',
      docstatus: 1,
      amount: 1840,
      currency: 'MXN',
      due: iso(-3),
      date: iso(-10),
      items: items(3),
      fields: {},
    })
    expect(row.title).toBe('Refacciones del Pacífico')
    expect(row.subtitle).toBe('Atrasada 3 días · Pantalla Moto G15 y 2 más')
    expect(row.subtitleTone).toBe('danger')
    expect(row.meta).toMatch(/\$1,840\.00/)
    expect(row.title).not.toMatch(/PUR-ORD/)
  })

  it('says when an order arrives in words', () => {
    expect(arrivalLine(iso(0)).label).toBe('Llega hoy')
    expect(arrivalLine(iso(1)).label).toBe('Llega mañana')
    expect(arrivalLine(iso(-1))).toEqual({
      label: 'Atrasada 1 día',
      late: true,
    })
  })

  it('titles a requisición with what it asks for, never ERPNext’s English', () => {
    expect(requestTitle('Purchase Request for Samsung A55')).toBe('Samsung A55')
    const row = materialRequest.row({
      name: 'MAT-MR-2025-00003',
      title: 'Purchase Request for Samsung A55',
      status: 'Pending',
      docstatus: 1,
      due: iso(2),
      date: iso(-1),
      items: items(1, 'Samsung A55'),
      fields: {},
    })
    expect(row.title).toBe('Samsung A55')
    expect(row.subtitle).toMatch(/^Para /)
    expect(row.subtitle).not.toMatch(/Purchase|MAT-MR/)
    expect(itemsLine({ items: items(1) })).toBe('Pantalla Moto G15')
  })

  it('bills: what is owed, overdue in red, and Pagar as the next step', () => {
    const row = purchaseInvoice.row({
      name: 'ACC-PINV-2026-00001',
      title: 'Distribuidora Sinaloa',
      status: 'Overdue',
      docstatus: 1,
      amount: 900,
      outstanding: 400,
      currency: 'MXN',
      due: iso(-2),
      date: iso(-30),
      fields: {},
    })
    expect(row.subtitle).toMatch(/^Venció hace 2 días · debes \$400\.00/)
    expect(row.subtitleTone).toBe('danger')
    const step = purchaseInvoice.nextStep(
      record({ docstatus: 1, outstanding: 400 }),
    )
    expect(step).toMatchObject({ label: 'Pagar', make: 'payment' })
    expect(makeTarget('Purchase Invoice', 'payment')).toEqual({
      doctype: 'Payment Entry',
      hint: { payment_type: 'Pay' },
    })
  })
})

describe('next step by state (DD4)', () => {
  it('requisición → Pedir, and Cotizar beside it', () => {
    const r = record(
      { docstatus: 1, status: 'Pending' },
      { material_request_type: 'Purchase' },
    )
    expect(materialRequest.nextStep(r)).toMatchObject({
      label: 'Pedir',
      make: 'purchase_order',
    })
    expect(materialRequest.altSteps(r)).toEqual([
      expect.objectContaining({ label: 'Cotizar', make: 'supplier_quotation' }),
    ])
    // A transfer between stores is not bought.
    const transfer = record(
      { docstatus: 1, status: 'Pending' },
      { material_request_type: 'Material Transfer' },
    )
    expect(materialRequest.nextStep(transfer)).toBe(null)
  })

  it('orden → Recibir, then Facturar', () => {
    expect(
      purchaseOrder.nextStep(
        record({ docstatus: 1, status: 'To Receive and Bill' }),
      ),
    ).toMatchObject({ label: 'Recibir', make: 'purchase_receipt' })
    expect(
      purchaseOrder.nextStep(record({ docstatus: 1, status: 'To Bill' })),
    ).toMatchObject({ label: 'Facturar', make: 'purchase_invoice' })
  })

  it('recepción → Facturar; cotización → Pedir; solicitud → Registrar cotización', () => {
    expect(
      purchaseReceipt.nextStep(record({ docstatus: 1, status: 'To Bill' })),
    ).toMatchObject({ label: 'Facturar', make: 'purchase_invoice' })
    expect(
      supplierQuotation.nextStep(record({ docstatus: 1, status: 'Submitted' })),
    ).toMatchObject({ label: 'Pedir', make: 'purchase_order' })
    expect(
      rfq.nextStep(record({ docstatus: 1, status: 'Submitted' })),
    ).toMatchObject({
      make: 'supplier_quotation',
    })
    expect(
      makeTarget('Request for Quotation', 'supplier_quotation').doctype,
    ).toBe('Supplier Quotation')
  })

  it('a draft confirms first, a pago has nothing after it', () => {
    for (const profile of [
      materialRequest,
      purchaseOrder,
      purchaseReceipt,
      pago,
    ])
      expect(profile.nextStep(record({ docstatus: 0 }))).toMatchObject({
        label: 'Confirmar',
        submit: true,
      })
    expect(pago.nextStep(record({ docstatus: 1 }))).toBe(null)
  })

  it('draws the order stepper from what was received and billed', () => {
    const stages = purchaseOrder.stages(
      record({ docstatus: 1, status: 'To Bill' }, { per_received: 100 }),
    )
    expect(stages.map((s) => s.label)).toEqual([
      'Borrador',
      'Por recibir',
      'Recibida',
      'Facturada',
    ])
    expect(stages.find((s) => s.current).label).toBe('Recibida')
  })
})

describe('routes', () => {
  it('opens a new orden or factura in the engine form, records in their pages', () => {
    expect(documentRoute('Purchase Order', 'nuevo')).toEqual({
      path: '/documentos/ordenes-compra/nuevo',
    })
    expect(documentRoute('Purchase Invoice', 'nuevo')).toEqual({
      path: '/documentos/facturas-proveedor/nuevo',
    })
    expect(documentRoute('Purchase Order', 'PUR-ORD-1')).toEqual({
      path: '/compras/orden/PUR-ORD-1',
    })
    expect(
      documentRoute('Payment Entry', 'ACC-PAY-1', {
        hint: { payment_type: 'Pay' },
      }),
    ).toEqual({ path: '/documentos/pagos/ACC-PAY-1' })
  })
})

describe('«Creado desde» chain', () => {
  const data = {
    stages: [
      {
        key: 'requisicion',
        label: 'Requisición',
        docs: [
          {
            doctype: 'Material Request',
            name: 'MAT-MR-1',
            status: 'Ordered',
            docstatus: 1,
            people: [{ verb: 'Pidió', name: 'Ana López' }],
          },
        ],
      },
      { key: 'cotizacion', label: 'Cotización', docs: [] },
      {
        key: 'orden',
        label: 'Orden',
        docs: [
          {
            doctype: 'Purchase Order',
            name: 'PUR-ORD-1',
            status: 'To Receive and Bill',
            docstatus: 1,
            here: true,
            people: [{ verb: 'Aprobó', name: 'Marco' }],
          },
        ],
      },
      { key: 'recepcion', label: 'Recepción', docs: [] },
      { key: 'factura', label: 'Factura', docs: [] },
      { key: 'pago', label: 'Pago', docs: [] },
    ],
  }

  it('lists each document in chain order with its Spanish kind', () => {
    expect(chainSteps(data).map((s) => [s.stage, s.label])).toEqual([
      ['requisicion', 'Requisición'],
      ['orden', 'Orden de compra'],
    ])
  })

  it('waits for the next step in grey, and none after a draft or a payment', () => {
    expect(pendingStep(data)).toMatchObject({
      key: 'recepcion',
      line: 'Todavía no llega',
    })
    const draft = structuredClone(data)
    draft.stages[2].docs[0].docstatus = 0
    expect(pendingStep(draft)).toBe(null)
    const billed = structuredClone(data)
    billed.stages[2].docs[0].status = 'To Bill'
    expect(pendingStep(billed).key).toBe('factura')
  })
})

describe('requisition titles from what it asks for (walk 2026-10-18)', () => {
  it('the record title reads the rows, not the cut ERPNext title', () => {
    const r = record(
      {
        title: 'Purchase Request for Pantalla A, Pantalla B, Pantalla i',
        docstatus: 1,
      },
      {},
      {
        items: {
          rows: [
            { item_name: 'Pantalla A' },
            { item_name: 'Pantalla B' },
            { item_code: 'X' },
          ],
        },
      },
    )
    expect(materialRequest.header(r).title).toBe('Pantalla A y 2 más')
    const one = record(
      { title: 'Purchase Request for Pantalla A', docstatus: 0 },
      {},
      { items: { rows: [] } },
    )
    expect(materialRequest.header(one).title).toBe('Pantalla A')
  })

  it('the chain shortens a joined requisition title', async () => {
    const { requestShort } =
      await import('@/components/documentos/compras/words')
    expect(
      requestShort('Purchase Request for Pantalla A, Pantalla B, Pantalla i'),
    ).toBe('Pantalla A y más')
    expect(requestShort('Purchase Request for Funda')).toBe('Funda')
  })

  it('a bare English status in the activity is a known status', async () => {
    const { statusEntry } = await import('@/utils/display')
    expect(statusEntry('To Receive and Bill')?.[0]).toBe(
      'Por recibir y facturar',
    )
    expect(statusEntry('Pedí precios al proveedor')).toBeNull()
  })
})

describe('an unpaid bill past its due date', () => {
  it('reads Vencida on the chip as on the red line', () => {
    const row = purchaseInvoice.row({
      name: 'ACC-PINV-2026-00048',
      title: 'Refacciones',
      status: 'Unpaid',
      docstatus: 1,
      amount: 1500,
      outstanding: 1500,
      due: iso(-3),
      date: iso(-10),
      fields: {},
    })
    expect(row.subtitleTone).toBe('danger')
    expect(row.status).toBe('Vencida')
    expect(row.tone).toBe('danger')
    const later = purchaseInvoice.row({
      name: 'B',
      title: 'B',
      status: 'Unpaid',
      docstatus: 1,
      amount: 1,
      outstanding: 1,
      due: iso(3),
      fields: {},
    })
    expect(later.status).not.toBe('Vencida')
  })
})

describe('feminine document nouns', () => {
  it('orden is la orden; pago is el pago', async () => {
    const { feminineNoun } = await import('@/utils/display')
    expect(
      [
        'Orden de compra',
        'factura',
        'Recepción',
        'Solicitud de cotización',
      ].every(feminineNoun),
    ).toBe(true)
    expect(['Pago', 'pedido', 'Ajuste'].some(feminineNoun)).toBe(false)
  })
})
