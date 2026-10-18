// Documentos D1.2: the tools sheet rules, draft editing helpers, the worked
// profiles' next steps and the /nuevo and master-detail routes.
import { describe, expect, it } from 'vitest'
import {
  confirmCopy,
  deskUrl,
  pdfUrl,
  shellUrl,
  toolsFor,
} from '@/documentos/tools'
import {
  dependsOk,
  makeTarget,
  missingRequired,
  prefillFromQuery,
  rowsChanged,
  rowsForSave,
  sourceFromQuery,
} from '@/documentos/form'
import { loadProfile } from '@/documentos/profiles'
import { documentRoute } from '@/documentos/registry'

const allowed = (keys) =>
  Object.fromEntries(keys.map((k) => [k, { allowed: true, reason: null }]))
const ACTIONS = allowed([
  'edit',
  'submit',
  'cancel',
  'amend',
  'delete',
  'duplicate',
  'comment',
  'assign',
  'attach',
  'share',
  'print',
  'email',
])
const record = (docstatus, extra = {}) => ({
  doctype: 'Sales Invoice',
  name: 'ACC-SINV-2026-00001',
  submittable: true,
  header: { docstatus, status: 'Unpaid', outstanding: 100, ...extra },
  actions: ACTIONS,
})

describe('tools sheet (DD5)', () => {
  const keys = (r, opts) => toolsFor(r, opts).map((t) => t.key)

  it('a draft offers delete, not cancel or amend', () => {
    const k = keys(record(0))
    expect(k).toContain('delete')
    expect(k).not.toContain('cancel')
    expect(k).not.toContain('amend')
  })
  it('a confirmed document offers cancel and never delete', () => {
    const k = keys(record(1))
    expect(k).toContain('cancel')
    expect(k).not.toContain('delete')
  })
  it('a cancelled document offers amend («Modificar»)', () => {
    const tools = toolsFor(record(2))
    expect(tools.find((t) => t.key === 'amend')?.label).toBe('Modificar')
  })
  it('«Abrir en escritorio» only at ≥1024, and «Avísame…» only when asked', () => {
    expect(keys(record(1))).not.toContain('desk')
    expect(keys(record(1), { wide: true })).toContain('desk')
    expect(keys(record(1))).not.toContain('avisame')
    expect(keys(record(1), { avisame: true })).toContain('avisame')
  })
  it('a refused tool stays with the reason the server gave', () => {
    const r = record(1)
    r.actions = {
      ...ACTIONS,
      cancel: { allowed: false, reason: 'Tu usuario no tiene este permiso.' },
    }
    const cancel = toolsFor(r).find((t) => t.key === 'cancel')
    expect(cancel.allowed).toBe(false)
    expect(cancel.reason).toBe('Tu usuario no tiene este permiso.')
  })
  it('other packages add their entries (D6) before Duplicar', () => {
    const k = keys(record(1), {
      extra: [{ key: 'ajustes', label: 'Todos los ajustes', allowed: true }],
    })
    expect(k.indexOf('ajustes')).toBeLessThan(k.indexOf('duplicate'))
  })
  it('every label is Spanish', () => {
    for (const t of toolsFor(record(2), { wide: true, avisame: true }))
      expect(t.label).not.toMatch(/\b(Assign|Print|Cancel|Delete|Share)\b/)
  })
  it('links: Desk only through deskUrl, the PDF in Spanish, the shell link under /crm', () => {
    expect(deskUrl('Sales Invoice', 'A/1')).toBe('/app/sales-invoice/A%2F1')
    expect(pdfUrl('Sales Invoice', 'X', 'Factura MX')).toContain(
      'format=Factura+MX',
    )
    expect(pdfUrl('Sales Invoice', 'X')).toContain('language=es-MX')
    expect(shellUrl('/documentos/facturas/X', 'https://a.b')).toBe(
      'https://a.b/crm/documentos/facturas/X',
    )
  })
  it('confirm copy says what happens, in Spanish', () => {
    const c = confirmCopy('cancel', { noun: 'la factura', title: 'Ana López' })
    expect(c.title).toBe('¿Cancelar la factura de Ana López?')
    expect(c.tone).toBe('danger')
    expect(confirmCopy('submit').confirm).toBe('Confirmar')
  })
})

describe('draft editing', () => {
  it('depends_on: simple shapes evaluate, anything else shows the field', () => {
    expect(dependsOk('customer', { customer: 'A' })).toBe(true)
    expect(dependsOk('customer', {})).toBe(false)
    expect(
      dependsOk("eval:doc.quotation_to=='Customer'", { quotation_to: 'Lead' }),
    ).toBe(false)
    expect(dependsOk('eval:doc.is_return', { is_return: 1 })).toBe(true)
    expect(dependsOk('eval:!doc.is_return', { is_return: 1 })).toBe(false)
    expect(dependsOk('eval:in_list(["a"], doc.x)', {})).toBe(true)
  })
  it('missing required fields are named by label', () => {
    const fields = [
      { fieldname: 'customer', label: 'Cliente', reqd: 1 },
      { fieldname: 'remarks', label: 'Notas', reqd: 0 },
    ]
    expect(missingRequired(fields, {}, {})).toEqual(['Cliente'])
    expect(missingRequired(fields, { customer: 'C1' }, {})).toEqual([])
  })
  it('rows: kept rows by _idx, new rows by item_code; changes detected', () => {
    const before = [{ _idx: 1, item_code: 'A', qty: 1, item_name: 'Mica' }]
    const after = [
      { _idx: 1, item_code: 'A', qty: 3, item_name: 'Mica' },
      { item_code: 'B', qty: 1, _key: 'r9' },
    ]
    expect(rowsForSave(after)).toEqual([
      { _idx: 1, qty: 3 },
      { item_code: 'B', qty: 1 },
    ])
    expect(rowsChanged(before, before)).toBe(false)
    expect(rowsChanged(before, after)).toBe(true)
  })
  it('/nuevo reads its source and field prefills from the query', () => {
    expect(
      sourceFromQuery({
        origen: 'Quotation',
        desde: 'SAL-QTN-1',
        con: 'sales_order',
      }),
    ).toEqual({ make: 'sales_order', doctype: 'Quotation', name: 'SAL-QTN-1' })
    expect(sourceFromQuery({ duplicar: 'X' }, 'Quotation')).toEqual({
      duplicate: 'X',
      doctype: 'Quotation',
    })
    expect(sourceFromQuery({})).toBeNull()
    expect(
      prefillFromQuery({ customer: 'C1', origen: 'x', evil: '1' }, [
        { fieldname: 'customer' },
      ]),
    ).toEqual({ customer: 'C1' })
  })
  it('a mapper lands on the right list: cobros from a sale, pagos from a purchase', () => {
    expect(makeTarget('Sales Invoice', 'payment')).toEqual({
      doctype: 'Payment Entry',
      hint: { payment_type: 'Receive' },
    })
    const pago = makeTarget('Purchase Invoice', 'payment')
    expect(documentRoute(pago.doctype, 'nuevo', { hint: pago.hint }).path).toBe(
      '/documentos/pagos/nuevo',
    )
    expect(makeTarget('Sales Invoice', 'return').doctype).toBe('Sales Invoice')
  })
})

describe('worked profiles: the next step by state (DD4)', () => {
  it('Facturas: draft → Confirmar, owed → Registrar cobro, paid → none', async () => {
    const p = await loadProfile({ doctype: 'Sales Invoice' })
    expect(p.nextStep(record(0)).submit).toBe(true)
    expect(p.nextStep(record(1))).toMatchObject({
      label: 'Registrar cobro',
      make: 'payment',
    })
    expect(p.nextStep(record(1, { outstanding: 0, status: 'Paid' }))).toBeNull()
    expect(p.nextStep(record(1, { is_return: 1 }))).toBeNull()
    expect(p.editFields).toContain('customer')
  })
  it('Cotizaciones: open → Crear pedido, ordered → none', async () => {
    const p = await loadProfile({ doctype: 'Quotation' })
    const q = (docstatus, status) => ({
      ...record(docstatus),
      doctype: 'Quotation',
      header: { docstatus, status },
    })
    expect(p.nextStep(q(1, 'Open'))).toMatchObject({
      label: 'Crear pedido',
      make: 'sales_order',
    })
    expect(p.nextStep(q(1, 'Ordered'))).toBeNull()
    expect(p.nextStep(q(0, 'Draft')).label).toBe('Confirmar')
  })
  it('the generic floor confirms a submittable draft and nothing else', async () => {
    const p = await loadProfile({ doctype: 'Journal Entry' })
    expect(p.nextStep(record(0)).label).toBe('Confirmar')
    expect(p.nextStep({ ...record(0), submittable: false })).toBeNull()
    expect(p.nextStep(record(1))).toBeNull()
  })
})
