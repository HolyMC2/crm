import { describe, expect, it, vi } from 'vitest'
import { isNeutralModule } from '../../src/composables/muelleShell.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import {
  prefillFromQuery,
  returnWithDone,
} from '../../src/composables/useCompras.js'
import {
  backTarget,
  editPayload,
  missingAcks,
  normalizeView,
  notifyPriceOpener,
  parseDone,
  plain,
  priceCheck,
  pricePayload,
  problemOf,
  productRoute,
  purchaseRoute,
  requestedAction,
  scannerItemUrl,
  stockLabel,
} from '../../src/composables/useProductos.js'

describe('Productos boot and routes', () => {
  it('boots without the sales runtime and recovers as itself', () => {
    expect(isNeutralModule('productos')).toBe(true)
    expect(recoveryModule('/productos?vista=faltan')).toBe('productos')
  })
  it('keeps unknown views on Todos', () => {
    expect(normalizeView('sin-precio')).toBe('sin-precio')
    expect(normalizeView('bajo-minimo')).toBe('bajo-minimo')
    expect(normalizeView('nope')).toBe('todos')
    expect(normalizeView(undefined)).toBe('todos')
  })
  it('opens the product remembering the list', () => {
    expect(productRoute({ name: 'SKU 1' }, '/productos?vista=faltan')).toEqual({
      name: 'Producto',
      params: { item: 'SKU 1' },
      query: { list: '/productos?vista=faltan' },
    })
  })
  it('opens only the actions a link may ask for', () => {
    expect(requestedAction({ accion: 'precio' })).toBe('precio')
    expect(requestedAction({ accion: 'borrar' })).toBeNull()
  })
})

describe('list rows', () => {
  it('says stock in the chosen stores, or the store of a shortage', () => {
    expect(stockLabel({ uom: 'Pza', stock: { qty: 5, stores: 2 } })).toBe(
      '5 Pza in 2 stores',
    )
    expect(stockLabel({ uom: 'Pza', stock: { qty: 3, stores: 1 } })).toBe(
      '3 Pza',
    )
    expect(stockLabel({ stock: { qty: 0, stores: 0 } })).toBe('No stock')
    expect(
      stockLabel({
        uom: 'Pza',
        warehouse: 'Centro',
        actual_qty: 0,
        reorder_level: 10,
      }),
    ).toBe('0 Pza on hand in Centro · minimum 10')
  })
})

describe('Cambiar precio', () => {
  const row = {
    price_list: 'Venta',
    rate: 100,
    revision: 'r'.repeat(64),
    can_write: true,
    warning_percent: 30,
    requires_ack: false,
  }
  it('measures the change and asks for an OK on large ones', () => {
    expect(priceCheck(row, '110')).toMatchObject({
      changed: true,
      percent: 10,
      needsAck: false,
    })
    expect(priceCheck(row, '150')).toMatchObject({
      large: true,
      needsAck: true,
    })
    expect(priceCheck(row, '100').changed).toBe(false)
    expect(priceCheck(row, '0').valid).toBe(false)
    expect(priceCheck({ ...row, rate: null }, '20')).toMatchObject({
      first: true,
      needsAck: false,
    })
  })
  it('sends only changed writable lists against their reviewed revision', () => {
    const rows = [
      row,
      { ...row, price_list: 'Mayoreo', rate: null, revision: null },
      { ...row, price_list: 'Ajena', can_write: false },
    ]
    const drafts = { Venta: '150', Mayoreo: '80', Ajena: '5' }
    expect(missingAcks(rows, drafts, {})).toEqual(['Venta'])
    expect(pricePayload(rows, drafts, { Venta: true })).toEqual({
      prices: { Venta: 150, Mayoreo: 80 },
      expected: { Venta: 'r'.repeat(64), Mayoreo: null },
      acknowledged: ['Venta'],
    })
    expect(missingAcks(rows, drafts, { Venta: true })).toEqual([])
  })
  it('a unit-wide base price always needs the OK', () => {
    expect(
      missingAcks([{ ...row, requires_ack: true }], { Venta: '101' }, {}),
    ).toEqual(['Venta'])
  })
})

describe('Editar datos', () => {
  const original = {
    item_name: 'Cable',
    item_group: 'Accesorios',
    brand: '',
    description: 'USB',
    disabled: 0,
    barcodes: [{ barcode: '750', barcode_type: '' }],
  }
  it('sends only what changed', () => {
    expect(editPayload(original, { ...original })).toEqual({})
    expect(
      editPayload(original, { ...original, item_name: ' Cable USB-C ' }),
    ).toEqual({ item_name: 'Cable USB-C' })
    expect(editPayload(original, { ...original, disabled: 1 })).toEqual({
      disabled: 1,
    })
  })
  it('sends the whole visible barcode list when it changed', () => {
    expect(
      editPayload(original, {
        ...original,
        barcodes: [{ barcode: '750' }, { barcode: ' 751 ' }, { barcode: '' }],
      }),
    ).toEqual({
      barcodes: [
        { barcode: '750', barcode_type: '' },
        { barcode: '751', barcode_type: '' },
      ],
    })
  })
})

describe('chain and return', () => {
  it('«Pedir» opens a prefilled purchase that comes back here', () => {
    expect(purchaseRoute('SKU 1', { warehouse: 'Centro', qty: 24 })).toEqual({
      name: 'CompraNueva',
      query: {
        item: 'SKU 1',
        warehouse: 'Centro',
        qty: '24',
        return_to: '/crm/productos/SKU%201',
        return_label: 'Productos',
      },
    })
    expect(
      prefillFromQuery({ item: 'SKU 1', warehouse: 'Centro', qty: '24' }),
    ).toEqual({
      item: 'SKU 1',
      warehouse: 'Centro',
      qty: 24,
    })
    expect(prefillFromQuery({ qty: '-3' }).qty).toBe(1)
    expect(
      returnWithDone('/crm/productos/SKU%201', 'Purchase Order', 'PO-1'),
    ).toBe('/crm/productos/SKU%201?done=Purchase+Order%3APO-1')
    expect(parseDone('Purchase Order:PO-1')).toEqual({
      doctype: 'Purchase Order',
      name: 'PO-1',
    })
    expect(parseDone('User:x')).toBeNull()
  })
  it('Escáner returns to this product', () => {
    expect(scannerItemUrl('SKU 1')).toBe(
      '/scan/item/SKU%201?return_to=%2Fcrm%2Fproductos%2FSKU%25201&return_label=Productos',
    )
  })
  it('goes back to an allowed origin, the list, or Productos', () => {
    expect(backTarget({ return_to: '/app/muelle-inventario' })).toEqual({
      href: '/app/muelle-inventario',
    })
    expect(backTarget({ return_to: 'https://evil.invalid/x' })).toEqual({
      to: { name: 'Productos' },
    })
    expect(backTarget({ list: '/productos?vista=sin-precio' })).toEqual({
      to: '/productos?vista=sin-precio',
    })
    expect(backTarget({ list: '/deals' })).toEqual({
      to: { name: 'Productos' },
    })
  })
  it('tells a Desk opener the price is saved, never another page', () => {
    const postMessage = vi.fn()
    const win = {
      location: { host: 'shop.test', origin: 'https://shop.test' },
      opener: {
        closed: false,
        location: { origin: 'https://shop.test', pathname: '/app/item/SKU-1' },
        postMessage,
      },
    }
    const query = { context: 'a'.repeat(20), site: 'shop.test', user: 'ana@x' }
    expect(notifyPriceOpener(query, 'ana@x', 'SKU-1', win)).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'mercado:price-return',
        token: 'a'.repeat(20),
        item_code: 'SKU-1',
        site: 'shop.test',
        user: 'ana@x',
      },
      'https://shop.test',
    )
    expect(notifyPriceOpener(query, 'otro@x', 'SKU-1', win)).toBe(false)
    win.opener.location.pathname = '/posapp/pos'
    expect(notifyPriceOpener(query, 'ana@x', 'SKU-1', win)).toBe(false)
  })
})

describe('refusals', () => {
  it('turns server refusals into plain, actionable text', () => {
    expect(
      plain('Este precio lo cambia el encargado. <a href="/x">Pedir</a> ya.'),
    ).toBe('Este precio lo cambia el encargado. Pedir ya.')
    expect(
      problemOf({ exc_type: 'PermissionError', messages: ['No'] }).kind,
    ).toBe('permission')
    expect(
      problemOf({ exc_type: 'TimestampMismatchError', messages: ['Otro'] })
        .kind,
    ).toBe('conflict')
    expect(problemOf({ offline: true, messages: ['Sin red'] }).kind).toBe(
      'offline',
    )
  })
})
