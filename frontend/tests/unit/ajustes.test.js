// «Todos los ajustes» (Shell SPEC DD13, SHELL-D6): search and «Solo lo
// activado» over the field guide, the pending change set, and the field row.
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: mocks.call }))

import {
  RECORD_FIELDS,
  ajustesRoute,
  controlKind,
  createPending,
  currentValue,
  doctypeFromSlug,
  filterSections,
  fold,
  loadGuide,
  pendingDisplay,
  saveChanges,
} from '@/components/ajustes/ajustes'
import AjustesField from '@/components/ajustes/AjustesField.vue'

const SECTIONS = [
  {
    key: 'unidades',
    title: 'Unidades y conversiones',
    fields: [
      {
        fieldname: 'purchase_uom',
        label: 'Unidad de compra',
        help: 'La unidad que se propone al pedir al proveedor.',
        keywords: 'caja comprar',
        fieldtype: 'Link',
        link: 'UOM',
        display: 'Sin definir',
        value: null,
        set: false,
        can_write: true,
      },
    ],
  },
  {
    key: 'series',
    title: 'Números de serie y lotes',
    fields: [
      {
        fieldname: 'has_serial_no',
        label: 'Lleva número de serie',
        help: 'Cada pieza se registra con su número.',
        keywords: 'serie imei',
        fieldtype: 'Check',
        display: 'No',
        value: 0,
        set: false,
        can_write: true,
        when: 'Solo aplica si «Lleva inventario» está activado.',
        applies: true,
      },
      {
        fieldname: 'has_batch_no',
        label: 'Lleva lote',
        fieldtype: 'Check',
        display: 'Sí',
        value: 1,
        set: true,
        can_write: false,
        reason: 'No tienes permiso para cambiar el producto.',
      },
    ],
  },
  {
    key: 'sat',
    title: 'Facturación e impuestos (SAT)',
    fields: [
      {
        fieldname: 'mx_product_service_key',
        label: 'Clave de producto o servicio (SAT)',
        keywords: 'sat cfdi',
        fieldtype: 'Link',
        display: 'Sin definir',
        set: false,
        can_write: true,
      },
    ],
  },
]

describe('field search', () => {
  it('folds accents and case', () => {
    expect(fold('Número de SERIE')).toBe('numero de serie')
  })

  it('finds fields by label, keywords and section, every word', () => {
    const keys = (q, onlySet = false) =>
      filterSections(SECTIONS, q, onlySet).flatMap((s) =>
        s.fields.map((f) => f.fieldname),
      )
    expect(keys('serie')).toEqual(['has_serial_no', 'has_batch_no'])
    expect(keys('numero serie')).toEqual(['has_serial_no', 'has_batch_no'])
    expect(keys('SAT')).toEqual(['mx_product_service_key'])
    expect(keys('caja')).toEqual(['purchase_uom'])
    expect(keys('')).toHaveLength(4)
    expect(keys('', true)).toEqual(['has_batch_no'])
    expect(keys('nada que ver')).toEqual([])
  })

  it('counts pending edits as on for «Solo lo activado»', () => {
    const isSet = (f) => f.fieldname === 'has_serial_no' || f.set
    const shown = filterSections(SECTIONS, '', true, isSet)
    expect(shown.map((s) => s.key)).toEqual(['series'])
    expect(shown[0].fields).toHaveLength(2)
  })
})

describe('the pending change set', () => {
  it('keeps scalar edits and drops an edit back to the saved value', () => {
    const pending = reactive(createPending())
    const field = SECTIONS[1].fields[0]
    pending.setValue(field, 1, 0)
    expect(pending.count()).toBe(1)
    expect(currentValue(field, pending)).toBe(1)
    pending.setValue(field, 0, 0)
    expect(pending.count()).toBe(0)
    expect(currentValue(field, pending)).toBe(0)
  })

  it('turns row edits into table operations', () => {
    const pending = reactive(createPending())
    const saved = [
      { name: 'r1', values: { uom: 'Nos', conversion_factor: 1 } },
      { name: 'r2', values: { uom: 'Box', conversion_factor: 10 } },
    ]
    pending.addRow('uoms', { uom: 'Pack', conversion_factor: 6 })
    pending.setRow('uoms', saved[1], { uom: 'Box', conversion_factor: 12 })
    pending.removeRow('uoms', saved[0])
    const rows = pending.tableRows('uoms', saved)
    expect(rows.map((r) => r.values.uom)).toEqual(['Box', 'Pack'])
    expect(rows[0].values.conversion_factor).toBe(12)
    pending.setValue({ fieldname: 'purchase_uom' }, 'Box', null)
    expect(pending.changes()).toEqual([
      { field: 'purchase_uom', value: 'Box' },
      {
        table: 'uoms',
        op: 'add',
        values: { uom: 'Pack', conversion_factor: 6 },
      },
      {
        table: 'uoms',
        op: 'set',
        row: 'r2',
        values: { conversion_factor: 12 },
      },
      { table: 'uoms', op: 'remove', row: 'r1' },
    ])
    // Editing a row that is not saved yet edits its «add».
    const added = rows.find((r) => r.added)
    pending.setRow('uoms', added, { conversion_factor: 8 })
    expect(pending.changes()[1].values.conversion_factor).toBe(8)
    pending.removeRow('uoms', added)
    expect(pending.changes().filter((c) => c.op === 'add')).toEqual([])
    pending.clear()
    expect(pending.count()).toBe(0)
  })

  it('reads pending values in words', () => {
    const select = {
      fieldtype: 'Select',
      options: [
        { value: 'FIFO', label: 'PEPS: primeras entradas, primeras salidas' },
      ],
    }
    expect(pendingDisplay(select, 'FIFO')).toBe(
      'PEPS: primeras entradas, primeras salidas',
    )
    expect(pendingDisplay({ fieldtype: 'Check' }, 1)).toBe('Sí')
    expect(pendingDisplay({ fieldtype: 'Link', link: 'UOM' }, 'Box')).toBe(
      'Caja',
    )
    expect(pendingDisplay({ fieldtype: 'Data' }, '')).toBe('Sin definir')
    expect(pendingDisplay({ fieldtype: 'Currency' }, 1234.5)).toMatch(
      /^\$1,234\.50$/,
    )
  })

  it('picks a control by fieldtype', () => {
    expect(controlKind('Check')).toBe('switch')
    expect(controlKind('Select')).toBe('select')
    expect(controlKind('Link')).toBe('link')
    expect(controlKind('Currency')).toBe('number')
    expect(controlKind('Table')).toBe('table')
    expect(controlKind('Text Editor')).toBe('text')
    expect(controlKind('Data')).toBe('line')
  })
})

describe('routes and server calls', () => {
  it('maps Spanish slugs and record routes', () => {
    expect(doctypeFromSlug('producto')).toBe('Item')
    expect(doctypeFromSlug('cliente')).toBe('Customer')
    expect(doctypeFromSlug('Sales%20Order')).toBe('Sales Order')
    expect(ajustesRoute('Item', 'TOR-1')).toEqual({
      name: 'ProductoAjustes',
      params: { item: 'TOR-1' },
    })
    expect(ajustesRoute('Supplier', 'ACME')).toEqual({
      name: 'Ajustes',
      params: { slug: 'proveedor', name: 'ACME' },
    })
  })

  it('calls doco record_fields with the change set as JSON', async () => {
    mocks.call.mockResolvedValue({ ok: true })
    await loadGuide('Item', 'TOR-1')
    expect(mocks.call).toHaveBeenLastCalledWith(`${RECORD_FIELDS}.guide`, {
      doctype: 'Item',
      name: 'TOR-1',
    })
    await saveChanges(
      'Item',
      'TOR-1',
      [{ field: 'has_serial_no', value: 1 }],
      'm1',
    )
    expect(mocks.call).toHaveBeenLastCalledWith(`${RECORD_FIELDS}.save`, {
      doctype: 'Item',
      name: 'TOR-1',
      changes: '[{"field":"has_serial_no","value":1}]',
      modified: 'm1',
    })
  })
})

function mount(props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const events = []
  const app = createApp({
    render: () =>
      h(AjustesField, {
        ...props,
        onEdit: (f) => events.push(['edit', f.fieldname]),
        onToggle: (f, v) => events.push(['toggle', f.fieldname, v]),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  return { el, events, unmount: () => app.unmount() }
}

describe('a field row', () => {
  it('toggles a switch in place and says when it applies', async () => {
    const field = SECTIONS[1].fields[0]
    const { el, events, unmount } = mount({ field, value: 0 })
    expect(el.textContent).toContain('Solo aplica si «Lleva inventario»')
    const sw = el.querySelector('[role="switch"]')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    sw.click()
    await nextTick()
    expect(events).toEqual([['toggle', 'has_serial_no', 1]])
    unmount()
  })

  it('shows why a locked field cannot change and does not toggle', async () => {
    const field = SECTIONS[1].fields[1]
    const { el, events, unmount } = mount({ field, value: 1 })
    expect(el.querySelector('[data-ajustes-locked]').textContent).toContain(
      'No tienes permiso para cambiar el producto.',
    )
    const sw = el.querySelector('[role="switch"]')
    expect(sw.disabled).toBe(true)
    unmount()
    expect(events).toEqual([])
  })

  it('opens the editor for other types and shows the pending value', async () => {
    const field = SECTIONS[0].fields[0]
    const { el, events, unmount } = mount({
      field,
      value: 'Box',
      pending: true,
    })
    expect(el.querySelector('[data-ajustes-value]').textContent).toBe('Caja')
    expect(el.textContent).toContain('Sin guardar')
    el.querySelector('button').click()
    await nextTick()
    expect(events).toEqual([['edit', 'purchase_uom']])
    unmount()
  })
})
