import { describe, expect, it } from 'vitest'
import {
  conteoReviewUrl,
  decodeSelection,
  deskReconciliationUrl,
  encodeSelection,
  escanerDone,
  healthChips,
  isInventoryView,
  lastCountedLabel,
  listReturn,
  listState,
  normalizeDays,
  normalizeView,
  requestedLabel,
  rowActions,
  scannerItemUrl,
  scannerMoveUrl,
  scrollKey,
  selectable,
  selectionGroups,
} from '../../src/composables/useProductos.js'
import { readReturn } from '../../src/vendor/muelle-shell/contracts'

const W = 'Escuinapa, Hidalgo #1 DOCO - GD'
const stock = (extra = {}) => ({
  kind: 'stock',
  key: `IPN 1|${W}`,
  name: 'IPN 1',
  title: 'Funda',
  warehouse: W,
  warehouse_label: 'Escuinapa',
  actual_qty: 3,
  cajones: [],
  requested: [],
  can_request_count: true,
  ...extra,
})

describe('Inventario views', () => {
  it('are Productos views with their own group', () => {
    for (const view of [
      'sin-cajon',
      'sin-contar',
      'negativo',
      'por-revisar',
      'conteos-abiertos',
    ]) {
      expect(normalizeView(view)).toBe(view)
      expect(isInventoryView(view)).toBe(true)
    }
    expect(isInventoryView('faltan')).toBe(false)
    expect(normalizeDays('180')).toBe(180)
    expect(normalizeDays('7')).toBe(90)
  })
})

describe('list state in the URL', () => {
  it('reads view, store, filters, selection and focus', () => {
    const state = listState({
      vista: 'sin-contar',
      tienda: W,
      q: 'funda',
      dias: '30',
      grupo: 'Fundas',
      marca: 'Generico',
      sel: `IPN 1~IPN 2~OTRO|Centro - GD`,
      fila: 'IPN 2',
    })
    expect(state).toEqual({
      view: 'sin-contar',
      store: W,
      search: 'funda',
      days: 30,
      group: 'Fundas',
      brand: 'Generico',
      selected: [`IPN 1|${W}`, `IPN 2|${W}`, 'OTRO|Centro - GD'],
      focus: `IPN 2|${W}`,
    })
    expect(listState({ vista: 'nope', dias: 'x' })).toMatchObject({
      view: 'todos',
      days: 90,
      selected: [],
      focus: '',
    })
  })
  it('keeps the selection short when a store is chosen', () => {
    const keys = [`IPN 1|${W}`, 'OTRO|Centro - GD']
    expect(encodeSelection(keys, W)).toBe('IPN 1~OTRO|Centro - GD')
    expect(decodeSelection(encodeSelection(keys, W), W)).toEqual(keys)
    expect(encodeSelection(keys, '')).toBe(keys.join('~'))
    const many = Array.from({ length: 150 }, (_, i) => `I${i}`).join('~')
    expect(decodeSelection(many, W)).toHaveLength(100)
  })
  it('comes back to the same row, without a consumed done', () => {
    const back = listReturn(
      `/productos?vista=sin-cajon&tienda=${encodeURIComponent(W)}&done=Taller+Item+Ubicacion%3ATIU-1`,
      stock(),
      W,
    )
    expect(back.label).toBe('Productos')
    const url = new URL(back.to, 'https://x.invalid')
    expect(url.pathname).toBe('/crm/productos')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      vista: 'sin-cajon',
      tienda: W,
      fila: 'IPN 1',
    })
  })
  it('remembers the scroll of the list, whatever row is focused', () => {
    expect(scrollKey('/productos?vista=negativo&fila=A&done=x:y&sel=A')).toBe(
      scrollKey('/productos?vista=negativo'),
    )
    expect(scrollKey('/productos?vista=negativo')).not.toBe(
      scrollKey('/productos?vista=sin-cajon'),
    )
  })
})

describe('Escáner links carry the way back', () => {
  const back = listReturn('/productos?vista=sin-cajon', stock(), '')
  it('opens the product to file or count it, back to this row', () => {
    const href = scannerItemUrl('IPN 1', {
      back,
      warehouse: W,
      action: 'asignar',
    })
    const url = new URL(href, 'https://x.invalid')
    expect(url.pathname).toBe('/scan/item/IPN%201')
    expect(url.searchParams.get('warehouse')).toBe(W)
    expect(url.searchParams.get('accion')).toBe('asignar')
    // The receiver reads it with the shared contract.
    expect(readReturn(url.search)).toEqual({
      to: `/crm/productos?vista=sin-cajon&fila=${encodeURIComponent(`IPN 1|${W}`).replace(/%20/g, '+')}`,
      label: 'Productos',
      legacy: false,
    })
  })
  it('opens the mover with product, cajón and store', () => {
    const url = new URL(
      scannerMoveUrl({ item: 'IPN 1', from: 'CAJ-1', warehouse: W }, back),
      'https://x.invalid',
    )
    expect(url.pathname).toBe('/scan/bins/move')
    expect(url.searchParams.get('item')).toBe('IPN 1')
    expect(url.searchParams.get('from')).toBe('CAJ-1')
    expect(url.searchParams.get('warehouse')).toBe(W)
    expect(readReturn(url.search)?.to).toBe(back.to)
  })
  it('opens the review on the row with the difference', () => {
    const url = new URL(
      conteoReviewUrl({ task: 'CC-1', warehouse: W, row: 'r1' }, back),
      'https://x.invalid',
    )
    expect(url.pathname).toBe('/scan/conteo/revision/CC-1')
    expect(url.searchParams.get('row')).toBe('r1')
    expect(url.searchParams.get('wh')).toBe(W)
    expect(deskReconciliationUrl('MAT-RECO-1')).toBe(
      '/app/stock-reconciliation/MAT-RECO-1',
    )
  })
  it('says what came back from Escáner', () => {
    expect(escanerDone('Taller Item Ubicacion:TIU-9')).toMatchObject({
      doctype: 'Taller Item Ubicacion',
      name: 'TIU-9',
      text: 'Bin assigned (TIU-9).',
    })
    expect(escanerDone('Scan Task:SCT-1').text).toBe('Scan Task SCT-1 saved.')
    expect(escanerDone('sin-dos-puntos')).toBeNull()
    expect(escanerDone(undefined)).toBeNull()
  })
})

describe('row actions', () => {
  const back = { to: '/crm/productos?vista=sin-cajon', label: 'Productos' }
  const keys = (row, caps = { scanner: true }) =>
    rowActions(row, { back, caps }).map((a) => a.key)
  it('a product without a bin: count, assign a bin, count now', () => {
    expect(keys(stock())).toEqual(['count', 'assign', 'count-now'])
    expect(keys(stock(), { scanner: false })).toEqual(['count'])
    const assign = rowActions(stock(), { back, caps: { scanner: true } })[1]
    expect(
      readReturn(new URL(assign.href, 'https://x.invalid').search)?.to,
    ).toBe(back.to)
  })
  it('a filed product moves from its first bin; a non-manager asks', () => {
    const filed = stock({
      cajones: [{ ubicacion: 'CAJ-1', label: 'A-1' }],
      can_request_count: false,
    })
    expect(keys(filed)).toEqual(['ask', 'move', 'count-now'])
    const move = rowActions(filed, { back, caps: { scanner: true } })[1]
    expect(
      new URL(move.href, 'https://x.invalid').searchParams.get('from'),
    ).toBe('CAJ-1')
  })
  it('a difference opens its review, or says who reviews it', () => {
    const conteo = {
      kind: 'conteo',
      key: 'conteo|r1',
      name: 'IPN 1',
      warehouse: W,
      warehouse_label: 'Escuinapa',
      task: 'CC-1',
      row: 'r1',
      can_review: true,
    }
    expect(
      rowActions(conteo, { back, caps: { scanner: true } })[0].href,
    ).toMatch(/^\/scan\/conteo\/revision\/CC-1\?/)
    const refused = rowActions(
      { ...conteo, can_review: false },
      { back, caps: { scanner: true } },
    )[0]
    expect(refused.disabled).toBe(true)
    expect(refused.reason).toContain('Escuinapa')
  })
  it('open counts can be reassigned by their manager', () => {
    const task = { kind: 'task', key: 'task|CC-1', task: 'CC-1', warehouse: W }
    expect(keys({ ...task, can_manage: true })).toEqual([
      'open-task',
      'reassign',
    ])
    expect(keys({ ...task, can_manage: false })).toEqual(['open-task'])
    expect(
      rowActions({ kind: 'reconciliation', name: 'MAT-RECO-1' }, { back })[0],
    ).toMatchObject({ key: 'desk', external: true })
  })
})

describe('selection and labels', () => {
  it('groups the selection by store, one request each', () => {
    const rows = [
      stock(),
      stock({ key: `IPN 2|${W}`, name: 'IPN 2', title: 'Mica' }),
      stock({
        key: 'IPN 3|Centro',
        name: 'IPN 3',
        warehouse: 'Centro',
        warehouse_label: 'Centro',
      }),
      { kind: 'task', key: 'task|x', warehouse: W },
    ].filter(selectable)
    expect(selectionGroups(rows)).toEqual([
      {
        warehouse: W,
        label: 'Escuinapa',
        items: [
          { name: 'IPN 1', title: 'Funda' },
          { name: 'IPN 2', title: 'Mica' },
        ],
      },
      {
        warehouse: 'Centro',
        label: 'Centro',
        items: [{ name: 'IPN 3', title: 'Funda' }],
      },
    ])
  })
  it('says when and how it was last counted, and who was asked', () => {
    expect(lastCountedLabel(null, '2026-10-14')).toBe('Never counted')
    expect(
      lastCountedLabel({ date: '2026-10-02', source: 'cajon' }, '2026-10-14'),
    ).toBe('Counted 12 days ago (bin count)')
    expect(
      lastCountedLabel({ date: '2026-10-14', source: 'ajuste' }, '2026-10-14'),
    ).toBe('Counted today (stock adjustment)')
    expect(
      requestedLabel([
        { assigned_to_name: 'Ana', assigned_date: '2026-10-14' },
        { assigned_to_name: 'Beto', assigned_date: '2026-10-13' },
      ]),
    ).toBe('Count asked of Ana · 2026-10-14 (+1)')
  })
  it('the summary chips say the share without a bin and not counted', () => {
    const chips = healthChips({
      days: 90,
      views: {
        'sin-cajon': { count: 3830, pct: 89.1 },
        'sin-contar': { count: 4032, pct: 93.8 },
        negativo: { count: 28 },
        'por-revisar': { count: 12 },
        'conteos-abiertos': { count: 4 },
      },
    })
    expect(chips.map((c) => c.view)).toEqual([
      'sin-cajon',
      'sin-contar',
      'negativo',
      'por-revisar',
      'conteos-abiertos',
    ])
    expect(chips[0].text).toMatch(/^89[.,]1 % without a bin$/)
    expect(chips[1].text).toMatch(/not counted in 90 days$/)
    expect(chips[2].text).toBe('28 negative')
  })
})
