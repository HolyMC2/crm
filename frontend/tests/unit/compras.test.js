import { describe, expect, it } from 'vitest'
import { isNeutralModule } from '../../src/composables/muelleShell.js'
import {
  createOrder,
  followDestination,
  loadWholeOrder,
  missingFields,
  moreFrom,
  morePayload,
  moreValues,
  netRate,
  normalizeSegment,
  orderPayload,
  outcomeUnknown,
  parseDone,
  pendingSave,
  progressLabel,
  reapplyRows,
  recordRoute,
  rowPrice,
  ruleLocked,
  safeReturn,
  scannerReceiptUrl,
} from '../../src/composables/useCompras.js'

describe('Compras boot', () => {
  it('boots without the sales runtime', () => {
    expect(isNeutralModule('compras')).toBe(true)
    expect(isNeutralModule('contactos')).toBe(true)
    expect(isNeutralModule('ventas')).toBe(false)
    expect(isNeutralModule(undefined)).toBe(false)
  })
})

describe('queue and records', () => {
  it('keeps unknown segments on Por comprar', () => {
    expect(normalizeSegment('por-recibir')).toBe('por-recibir')
    expect(normalizeSegment('x')).toBe('por-comprar')
    expect(normalizeSegment(undefined)).toBe('por-comprar')
  })
  it('opens requests and orders on their own records', () => {
    expect(recordRoute({ kind: 'solicitud', name: 'MR-1' }).name).toBe(
      'CompraSolicitud',
    )
    expect(recordRoute({ kind: 'orden', name: 'PO-1' }).name).toBe(
      'CompraOrden',
    )
  })
  it('says received and missing in the order unit', () => {
    expect(progressLabel({ ordered_qty: 3, received_qty: 1, uom: 'Pza' })).toBe(
      'Received 1 of 3 Pza · 2 missing',
    )
    expect(progressLabel({ ordered_qty: 3, received_qty: 3, uom: 'Pza' })).toBe(
      'Received 3 of 3 Pza',
    )
    expect(progressLabel({ ordered_qty: 3, received_qty: 0 })).toBe(
      'Nothing received of 3',
    )
    expect(progressLabel({ ordered_qty: null, per_received: 40 })).toBe(
      '40% received',
    )
  })
})

describe('editor payload', () => {
  const form = {
    name: 'PO-1',
    modified: '2026-10-05 10:00:00',
    supplier: 'SUP',
    company: 'CO',
    schedule_date: '2026-10-08',
    set_warehouse: 'WH',
    items: [
      {
        key: 1,
        name: 'row1',
        item_code: 'A',
        qty: '3',
        uom: 'Pza',
        rate: '',
        item_label: 'x',
        uoms: [],
      },
      {
        key: 2,
        name: '',
        item_code: 'B',
        qty: 1,
        uom: '',
        rate: '12.5',
        warehouse: 'WH2',
      },
    ],
  }
  it('sends only allowlisted fields and keeps exact row names', () => {
    expect(orderPayload(form)).toEqual({
      name: 'PO-1',
      modified: '2026-10-05 10:00:00',
      supplier: 'SUP',
      company: 'CO',
      schedule_date: '2026-10-08',
      set_warehouse: 'WH',
      items: [
        { name: 'row1', item_code: 'A', qty: 3, uom: 'Pza' },
        { item_code: 'B', qty: 1, rate: 12.5, warehouse: 'WH2' },
      ],
    })
  })
  it('names what is missing instead of failing silently', () => {
    expect(
      missingFields({
        supplier: '',
        company: 'CO',
        schedule_date: '',
        set_warehouse: '',
        items: [{ qty: 0 }],
      }),
    ).toEqual(['supplier', 'schedule_date', 'warehouse', 'qty'])
  })
})

describe('more details and line discounts', () => {
  const document = {
    transaction_date: '2026-11-06',
    taxes_and_charges: 'IVA 16 % - DC',
    taxes_and_charges_label: 'IVA 16 %',
    additional_discount_percentage: 0,
    discount_amount: 0,
    apply_discount_on: 'Grand Total',
    payment_terms_template: '',
    terms: 'Entregar en mostrador',
    terms_rich: false,
    ignore_pricing_rule: 0,
  }
  const editing = () => {
    const more = moreFrom(document)
    return { ...more, more_base: moreValues(more) }
  }
  it('sends only the details the worker changed', () => {
    const form = editing()
    expect(morePayload(form)).toEqual({})
    form.payment_terms_template = '30 días'
    expect(morePayload(form)).toEqual({ payment_terms_template: '30 días' })
  })
  it('an amount discount clears the percentage', () => {
    const form = editing()
    form.discount_kind = 'amount'
    form.discount_value = '50'
    expect(morePayload(form)).toEqual({ discount_amount: 50 })
    form.discount_kind = 'percent'
    form.discount_value = '5'
    expect(morePayload(form)).toEqual({ additional_discount_percentage: 5 })
  })
  it('reads a saved amount discount as an amount', () => {
    const more = moreFrom({ ...document, discount_amount: 120 })
    expect([more.discount_kind, more.discount_value]).toEqual(['amount', 120])
  })
  it('never sends formatted notes', () => {
    const form = { ...editing(), terms_rich: true, terms: '<b>x</b>' }
    expect(morePayload(form)).not.toHaveProperty('terms')
  })
  it('a line shows its price before the discount and what it costs after', () => {
    const row = { rate: 85, price_list_rate: 100, discount_percentage: 15 }
    expect(rowPrice(row)).toBe(100)
    expect(
      rowPrice({ rate: 85, price_list_rate: 100, discount_percentage: 0 }),
    ).toBe(85)
    expect(netRate(100, 15)).toBe(85)
    expect(netRate(100, 150)).toBe(0)
  })
  it('sends a line discount, and none when a saved one is emptied', () => {
    const payload = orderPayload({
      name: 'PO-1',
      modified: 'v1',
      items: [
        {
          name: 'row1',
          item_code: 'A',
          qty: 1,
          rate: 100,
          discount_percentage: 15,
        },
        {
          name: 'row2',
          item_code: 'B',
          qty: 1,
          rate: 10,
          discount_percentage: '',
        },
        { name: '', item_code: 'C', qty: 1, rate: 10, discount_percentage: '' },
      ],
    })
    expect(payload.items.map((row) => row.discount_percentage)).toEqual([
      15,
      0,
      undefined,
    ])
  })
  it('a supplier discount owns the line % unless automatic discounts are off', () => {
    const row = { rules: [{ name: 'PRLE-0001', title: 'Tecnomaxx 10 %' }] }
    expect(ruleLocked(row, { ignore_pricing_rule: false })).toBe(true)
    expect(ruleLocked(row, { ignore_pricing_rule: true })).toBe(false)
    expect(ruleLocked({ rules: [] }, { ignore_pricing_rule: false })).toBe(
      false,
    )
  })
  it('a line discount above 100 % blocks the save', () => {
    expect(
      missingFields({
        supplier: 'S',
        company: 'CO',
        schedule_date: '2026-11-10',
        set_warehouse: 'WH',
        items: [{ qty: 1, discount_percentage: '101' }],
      }),
    ).toEqual(['discount'])
  })
  it('hears back which supplier discount was saved', () => {
    expect(parseDone('Pricing Rule:PRLE-0001')).toEqual({
      doctype: 'Pricing Rule',
      name: 'PRLE-0001',
    })
  })
})

describe('return-to protocol', () => {
  it('accepts only local allowed paths', () => {
    expect(safeReturn('/posapp/pos')).toBe('/posapp/pos')
    expect(safeReturn('/crm/pendientes?x=1')).toBe('/crm/pendientes?x=1')
    for (const bad of [
      '//evil.test/crm',
      'https://evil.test/crm/',
      '/crm/../app',
      '/files/x',
      'javascript:alert(1)',
      null,
    ]) {
      expect(safeReturn(bad)).toBeNull()
    }
  })
  it('round-trips the Escáner receipt hand-off', () => {
    expect(scannerReceiptUrl('PR-1', 'PO/1')).toBe(
      '/scan/docs/PR/PR-1?return_to=%2Fcrm%2Fcompras%2Forden%2FPO%252F1&return_label=Compras',
    )
    expect(parseDone('Purchase Receipt:PR-1')).toEqual({
      doctype: 'Purchase Receipt',
      name: 'PR-1',
    })
    expect(parseDone('User:admin')).toBeNull()
  })
})

describe('editor recovery (review findings 3, 5, 6)', () => {
  it('moves rows that followed the old destination, keeps deliberate ones', () => {
    const items = [
      { warehouse: 'WH-A' },
      { warehouse: '' },
      { warehouse: 'WH-C' },
    ]
    followDestination(items, 'WH-A', 'WH-B')
    expect(items.map((row) => row.warehouse)).toEqual(['WH-B', 'WH-B', 'WH-C'])
  })

  it('loads every row page before comparing or recovering', async () => {
    const all = Array.from({ length: 201 }, (_, i) => ({
      name: `row${i + 1}`,
      item_code: 'A',
      qty: 1,
    }))
    const api = async (_method, { row_start = 0 }) => ({
      document: { name: 'PO-1', modified: 'v2' },
      rows: all.slice(row_start, row_start + 200),
      rows_scope: { total: 201, has_more: row_start + 200 < 201 },
    })
    const whole = await loadWholeOrder(api, 'PO-1')
    expect(whole.rows).toHaveLength(201)
    expect(whole.complete).toBe(true)
    expect(whole.rows[200].name).toBe('row201')
  })

  it('reapplies without inventing identities or dropping request lineage', () => {
    const current = [{ name: 'row1' }, { name: 'row201' }]
    const mine = [
      { name: 'row1', item_code: 'A' },
      { name: 'row201', item_code: 'A', material_request: 'MR-1' },
      { name: 'gone', item_code: 'B' },
      { name: 'gone-mr', item_code: 'C', material_request: 'MR-2' },
      { name: '', item_code: 'D' },
    ]
    const { items, dropped } = reapplyRows(mine, current)
    expect(items.map((row) => row.name)).toEqual(['row1', 'row201', '', ''])
    expect(items[1].material_request).toBe('MR-1')
    expect(dropped.map((row) => row.name)).toEqual(['gone-mr'])
  })

  it('sends the loaded row count with a saved order', () => {
    const payload = orderPayload({
      name: 'PO-1',
      modified: 'v1',
      row_total: 201,
      items: [],
    })
    expect(payload.row_total).toBe(201)
    expect(orderPayload({ name: '', items: [] }).row_total).toBeUndefined()
  })

  it('a lost create answer plus a reload asks about the same operation', async () => {
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    }
    // A server that commits by request id (the creation key) and loses the
    // first answer on the wire.
    const created = new Map()
    let loseAnswer = true
    const api = async (method, { request_id, data }) => {
      expect(method).toBe('save_order')
      if (!created.has(request_id))
        created.set(request_id, { name: `PO-${created.size + 1}`, data })
      if (loseAnswer) {
        loseAnswer = false
        throw Object.assign(new Error('offline'), { offline: true })
      }
      return { name: created.get(request_id).name }
    }
    const form = {
      name: '',
      supplier: 'SUP',
      company: 'CO',
      schedule_date: '2026-10-08',
      set_warehouse: 'WH',
      items: [{ item_code: 'A', qty: 1 }],
    }
    await expect(createOrder(api, 'u:new', form)).rejects.toThrow('offline')
    expect(pendingSave('u:new')).toBeTruthy()
    // Reload: only the stored operation survives; the worker edits and saves.
    const edited = { ...form, items: [{ item_code: 'A', qty: 2 }] }
    const result = await createOrder(api, 'u:new', edited)
    expect(result.name).toBe('PO-1')
    expect(result.resent).toBe(true)
    expect(created.size).toBe(1)
    expect(pendingSave('u:new')).toBeNull()
  })

  it('a definite refusal releases the operation; an unknown outcome keeps it', async () => {
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    }
    const form = { name: '', items: [{ item_code: 'A', qty: 1 }] }
    const busy = async () => {
      throw Object.assign(new Error('busy'), { status: 429 })
    }
    await expect(createOrder(busy, 'k', form)).rejects.toThrow('busy')
    expect(outcomeUnknown({ status: 429 })).toBe(true)
    expect(pendingSave('k')).toBeTruthy()
    const refused = async () => {
      throw Object.assign(new Error('no'), { status: 417 })
    }
    await expect(createOrder(refused, 'k', form)).rejects.toThrow('no')
    expect(pendingSave('k')).toBeNull()
  })
})
