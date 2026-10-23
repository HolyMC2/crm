// Ajustes de inventario en la ficha (Marco, 2026-10-23): a row says what the count
// found and what it moved («Antes 10 pzas · ahora 7 pzas · Diferencia −3 pzas»,
// «−$300.00») instead of a sale's qty × price, and the record says at a glance how
// it was made («Cómo se hizo»): who created it, from which cycle count, its Motivo
// and its store — read from Actividad, never invented.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

import ItemsCards from '@/components/documentos/ItemsCards.vue'
import {
  readCycleNote,
  readMotivo,
  ajusteOrigin,
} from '@/components/documentos/inventario/ajusteOrigen'
import stock from '@/documentos/profiles/stock_reconciliation'

const CYCLE_NOTE =
  'Ajuste por conteo cíclico · tarea CC-260929-CONTEO-CENTRO-0033 · fila u2fo0f9f8v · sistema 10.0 → contado 7.0 · verificó Jennifer Corona'

const COUNT_ROW = {
  name: 'row1',
  item_code: 'IPN007542',
  item_name: 'Pantalla iPhone 13 PRO MAX INCELL',
  qty: 7,
  uom: 'Nos',
  stock_uom: 'Nos',
  rate: 100,
  amount: 700,
  warehouse: 'W3TEST-Conteo Auto - GD',
  current_qty: 10,
  quantity_difference: -3,
  amount_difference: -300,
}

const SALE_ROW = {
  name: 'row2',
  item_code: 'IPN000001',
  item_name: 'Concha',
  qty: 1,
  uom: 'Nos',
  stock_uom: 'Nos',
  rate: 650,
  amount: 650,
}

function record(overrides = {}) {
  return {
    doctype: 'Stock Reconciliation',
    name: 'MAT-RECO-2026-00052',
    label: 'Stock Reconciliation',
    doc: {
      purpose: 'Stock Reconciliation',
      set_warehouse: null,
      docstatus: 1,
    },
    header: {
      title: '',
      number: 'MAT-RECO-2026-00052',
      random_name: false,
      status: 'Submitted',
      docstatus: 1,
      amount: -300,
      currency: null,
      date: '2026-09-29',
    },
    items: { fieldname: 'items', label: 'Productos', rows: [COUNT_ROW] },
    activity: {
      events: [
        {
          kind: 'comment',
          at: '2026-09-29 00:15:46',
          who: 'Administrator',
          text: CYCLE_NOTE,
        },
        { kind: 'create', at: '2026-09-29 00:15:45', who: 'Administrator' },
      ],
      assigned: [],
      attachments: [],
    },
    ...overrides,
  }
}

let app
let root
function mountCards(items) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(ItemsCards, { items, currency: 'MXN' })
  app.mount(root)
}
function text(testid) {
  return (
    root.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() || ''
  )
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Ajuste rows: antes, ahora y la diferencia', () => {
  it('says what the count found and what it left, never «qty × price»', async () => {
    mountCards({ rows: [COUNT_ROW] })
    await nextTick()
    expect(text('documentos-item-cantidad')).toBe(
      'Antes 10 pzas · ahora 7 pzas',
    )
    expect(text('documentos-item-diferencia')).toBe('Diferencia −3 pzas')
    // The amount that moved is the difference, signed and in red (stock went down).
    expect(text('documentos-item-monto')).toBe('−$300.00')
    expect(
      root.querySelector('[data-testid="documentos-item-monto"]').className,
    ).toContain('text-ink-red-7')
  })

  it('keeps a sale row as qty × price', async () => {
    mountCards({ rows: [SALE_ROW] })
    await nextTick()
    expect(text('documentos-item-cantidad')).toBe('1 pza × $650.00')
    expect(text('documentos-item-diferencia')).toBe('')
    expect(text('documentos-item-monto')).toBe('$650.00')
  })

  it('names the store on each row when one count moves several', async () => {
    mountCards({
      rows: [
        COUNT_ROW,
        { ...COUNT_ROW, name: 'row3', warehouse: 'Centro - GD' },
      ],
    })
    await nextTick()
    expect(text('documentos-item-diferencia')).toBe(
      'Diferencia −3 pzas · W3TEST-Conteo Auto',
    )
  })

  it('says «Sin diferencia» when the count left the quantity alone', async () => {
    mountCards({
      rows: [
        { ...COUNT_ROW, quantity_difference: 0, amount_difference: 0, qty: 10 },
      ],
    })
    await nextTick()
    expect(text('documentos-item-diferencia')).toBe('Sin diferencia')
    expect(text('documentos-item-monto')).toBe('')
  })
})

describe('Cómo se hizo', () => {
  it('reads the Escáner cycle-count note', () => {
    expect(readCycleNote(CYCLE_NOTE)).toEqual({
      task: 'CC-260929-CONTEO-CENTRO-0033',
      quantity: 'sistema 10.0 → contado 7.0',
      verified: 'verificó Jennifer Corona',
    })
    expect(readCycleNote('Motivo: Conteo físico')).toBeNull()
    expect(readCycleNote('')).toBeNull()
  })

  it('reads the Motivo a Producto adjustment leaves', () => {
    expect(readMotivo('Motivo: Conteo físico · se cayó')).toBe(
      'Conteo físico · se cayó',
    )
    expect(readMotivo('Motivo: Dañado')).toBe('Dañado')
    expect(readMotivo(CYCLE_NOTE)).toBe('')
    expect(readMotivo('Una nota cualquiera')).toBe('')
  })

  it('shows who created it, the count, its task, the Motivo and the store', () => {
    const rows = ajusteOrigin(record())
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
    expect(byKey.creado.value).toBe('Administrator')
    expect(byKey.creado.detail).toContain('29 sep')
    expect(byKey.origen.value).toBe('Conteo cíclico (Escáner)')
    expect(byKey.origen.detail).toBe(
      'sistema 10.0 → contado 7.0 · verificó Jennifer Corona',
    )
    expect(byKey.tarea.value).toBe('CC-260929-CONTEO-CENTRO-0033')
    expect(byKey.tarea.to).toBe(
      '/app/mercado-cycle-count-task/CC-260929-CONTEO-CENTRO-0033',
    )
    // No Motivo note on this one: it says so instead of inventing a reason.
    expect(byKey.motivo.value).toBe('Sin motivo registrado')
    // The header does not name a store, so the row store is the record's.
    expect(byKey.bodega.value).toBe('W3TEST-Conteo Auto')
  })

  it('does not repeat a store the header already names', () => {
    const doc = {
      ...record(),
      doc: { ...record().doc, set_warehouse: 'Centro - GD' },
    }
    const rows = ajusteOrigin(doc)
    expect(rows.find((row) => row.key === 'bodega')).toBeUndefined()
  })

  it('shows an old adjustment with no notes as «Sin registro», not as a guess', () => {
    const old = record()
    old.activity.events = [
      { kind: 'create', at: '2026-10-06 10:13:48', who: 'Jennifer Corona' },
    ]
    const rows = ajusteOrigin(old)
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
    expect(byKey.creado.value).toBe('Jennifer Corona')
    expect(byKey.origen.value).toBe('Sin registro en el ajuste')
    expect(byKey.origen.muted).toBe(true)
    expect(byKey.tarea).toBeUndefined()
    expect(byKey.motivo.value).toBe('Sin motivo registrado')
  })

  it('shows the Motivo and any other comment as a note', () => {
    const withNotes = record()
    withNotes.activity.events = [
      {
        kind: 'comment',
        at: '2026-10-06 10:13:49',
        who: 'Jennifer Corona',
        text: 'Motivo: Conteo físico',
      },
      {
        kind: 'comment',
        at: '2026-10-06 10:14:00',
        who: 'Marco',
        text: 'Revisar la segunda fila',
      },
      { kind: 'create', at: '2026-10-06 10:13:48', who: 'Jennifer Corona' },
    ]
    const byKey = Object.fromEntries(
      ajusteOrigin(withNotes).map((row) => [row.key, row]),
    )
    expect(byKey.motivo.value).toBe('Conteo físico')
    expect(byKey.nota.value).toBe('Revisar la segunda fila')
    // No cycle-count note: the Motivo does not become the origin.
    expect(byKey.origen.value).toBe('Sin registro en el ajuste')
  })
})

describe('la ficha del Ajuste', () => {
  it('titles the record by the store its rows moved', () => {
    const view = stock.header(record())
    expect(view.title).toBe('W3TEST-Conteo Auto')
    expect(view.kind).toBe('Ajuste')
  })

  it('shows the movement as the amount, signed', () => {
    expect(stock.header(record()).amount).toBe('−$300.00')
    const up = stock.header({
      ...record(),
      header: { ...record().header, amount: 70 },
    })
    expect(up.amount).toBe('+$70.00')
  })

  it('offers «Cómo se hizo» on the record', async () => {
    const panel = stock.panels.find((entry) => entry.key === 'origen')
    expect(panel.at).toBe('hero')
    const loaded = await panel.load()
    expect(loaded.default).toBeTruthy()
  })
})
