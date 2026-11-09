// The price-list workbench (/compras/lista/:name): which lines a search, a
// filter and a section leave; the tier a quantity reaches and what the next
// one costs; the change against the previous list; the stock against the
// level; the correction form's payload; the history chart's geometry; the
// files a drop brings; and every string of the page and its sheets in es-MX.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FILTERS,
  activeTier,
  belowLevel,
  canReadMore,
  changeOf,
  changedFields,
  cleanTiers,
  copyText,
  draftCounts,
  dropFiles,
  filterCounts,
  formOf,
  historyModel,
  historySeries,
  isPicture,
  manualFields,
  nextTier,
  otherGap,
  promoFor,
  retireChoice,
  retireDefaults,
  rowTotal,
  specParts,
  stepQty,
  tierCells,
  toTarget,
  unitPrice,
  visibleSections,
} from '@/utils/listaPrecios'
import { addPictures, uploadPictures } from '@/utils/catalogUpload'

const here = dirname(fileURLToPath(import.meta.url))

const TIERS = [
  { min_qty: 1, price: 1450, label: '' },
  { min_qty: 5, price: 1400, label: 'Mayoreo' },
  { min_qty: 10, price: 1380, label: '' },
]
const realme = {
  name: 'L1',
  brand: 'Realme',
  model: 'C85 Plus',
  name1: '',
  storage: '128GB',
  ram: '6GB',
  version: 'Nacional',
  nom: true,
  section: 'CELULARES',
  price: 1450,
  currency: 'MXN',
  tiers: TIERS,
  tags: ['Pay Joy'],
  item: 'ITEM-1',
  change: { kind: 'up', old_price: 1400, new_price: 1450 },
  other: {
    supplier: 'SUP-B',
    supplier_name: 'Ipsa',
    price: 1380,
    currency: 'MXN',
  },
  stock: { have: 2, ordered: 1 },
  level: { min: 3, target: 7, source: 'nivel' },
}
const moto = {
  name: 'L2',
  brand: 'Motorola',
  model: 'G06',
  name1: '',
  storage: '64GB',
  ram: '4GB',
  version: 'Nacional',
  nom: false,
  section: 'CELULARES',
  price: 2100,
  currency: 'MXN',
  tiers: [],
  tags: [],
  item: '',
  change: { kind: 'new', old_price: null, new_price: 2100 },
  other: null,
  stock: null,
  level: null,
}
const laptop = {
  name: 'L3',
  brand: 'HP',
  model: '',
  name1: 'Laptop HP 15 i5',
  section: 'LAPTOPS',
  price: 9800,
  currency: 'MXN',
  tiers: [],
  tags: [],
  item: 'ITEM-3',
  change: { kind: 'down', old_price: 10200, new_price: 9800 },
  stock: { have: 9, ordered: 0 },
  level: { min: 2, target: 4, source: 'erp' },
}
const sections = [
  { name: 'CELULARES', lines: [realme, moto] },
  { name: 'LAPTOPS', lines: [laptop] },
]
const promos = [
  {
    name: 'P1',
    text: 'Por 3 Realme C85 Plus bocina',
    brand: 'Realme',
    model: 'C85 Plus',
    kind: 'Regalo',
    active: true,
  },
  {
    name: 'P2',
    text: 'HP 5 %',
    brand: 'HP',
    model: '',
    kind: 'Descuento',
    active: false,
  },
]

describe('tiers', () => {
  it('picks the largest minimum the quantity reaches, the lowest under the first', () => {
    expect(activeTier(TIERS, 0).price).toBe(1450)
    expect(activeTier(TIERS, 4).price).toBe(1450)
    expect(activeTier(TIERS, 5).price).toBe(1400)
    expect(activeTier(TIERS, 40).price).toBe(1380)
    expect(activeTier([], 3)).toBeNull()
    expect(activeTier([{ min_qty: 5, price: 10 }], 2).price).toBe(10)
  })

  it('prints every tier and marks the one reached', () => {
    const cells = tierCells(realme, 6)
    expect(cells.map((c) => [c.min_qty, c.price, c.active])).toEqual([
      [1, 1450, false],
      [5, 1400, true],
      [10, 1380, false],
    ])
    expect(tierCells(realme, 0).every((c) => !c.active)).toBe(true)
    expect(tierCells(moto, 2)).toEqual([
      { min_qty: 1, price: 2100, label: '', active: true },
    ])
  })

  it('knows the unit price and the next step', () => {
    expect(unitPrice(realme, 0)).toBe(1450)
    expect(unitPrice(realme, 5)).toBe(1400)
    expect(unitPrice(moto, 9)).toBe(2100)
    expect(nextTier(realme, 3)).toEqual({ missing: 2, price: 1400 })
    expect(nextTier(realme, 10)).toBeNull()
    expect(nextTier(moto, 1)).toBeNull()
  })

  it('totals a row at the server price, else at the tier', () => {
    expect(rowTotal({ qty: 2, catalog_price: 1400 }, realme)).toBe(2800)
    expect(rowTotal({ qty: 5, catalog_price: null }, realme)).toBe(7000)
    expect(rowTotal(null, realme)).toBe(0)
    expect(stepQty(0, -1)).toBe(0)
    expect(stepQty('3', 1)).toBe(4)
    expect(
      draftCounts({ L1: { qty: 2 }, L2: { qty: 0 }, L3: { qty: 5 } }),
    ).toEqual({ lines: 2, pieces: 7 })
  })
})

describe('what changed and what the shop holds', () => {
  it('reads the change with its percentage', () => {
    expect(changeOf(realme)).toEqual({
      kind: 'up',
      oldPrice: 1400,
      newPrice: 1450,
      pct: 3.6,
      delta: 50,
    })
    expect(changeOf(laptop).pct).toBe(-3.9)
    expect(changeOf(moto)).toEqual({
      kind: 'new',
      oldPrice: null,
      newPrice: 2100,
      pct: null,
      delta: null,
    })
    expect(changeOf({})).toBeNull()
  })

  it('measures the gap to another supplier', () => {
    expect(otherGap(realme)).toBe(70)
    expect(otherGap(moto)).toBeNull()
  })

  it('counts stock and what is coming against the level', () => {
    expect(belowLevel(realme)).toBe(true)
    expect(toTarget(realme)).toBe(4)
    expect(belowLevel(laptop)).toBe(false)
    expect(toTarget(laptop)).toBe(0)
    expect(belowLevel(moto)).toBe(false)
  })

  it('writes the specs of a phone in one line', () => {
    expect(specParts(realme)).toEqual(['128GB', '6GB RAM', 'Nacional', 'NOM'])
    expect(specParts(laptop)).toEqual([])
  })
})

describe('which lines show', () => {
  it('searches across brand, model, code and marks', () => {
    const names = (out) => out.flatMap((s) => s.lines.map((l) => l.name))
    expect(names(visibleSections(sections, { search: 'realme 128' }))).toEqual([
      'L1',
    ])
    expect(names(visibleSections(sections, { search: 'pay joy' }))).toEqual([
      'L1',
    ])
    expect(names(visibleSections(sections, { search: 'laptop' }))).toEqual([
      'L3',
    ])
    expect(names(visibleSections(sections, { search: 'zzz' }))).toEqual([])
  })

  it('filters by change, promo, order and level, and by section', () => {
    const names = (opts) =>
      visibleSections(sections, opts).flatMap((s) => s.lines.map((l) => l.name))
    expect(names({ filter: 'nuevos' })).toEqual(['L2'])
    expect(names({ filter: 'subieron' })).toEqual(['L1'])
    expect(names({ filter: 'bajaron' })).toEqual(['L3'])
    expect(names({ filter: 'promo', promos })).toEqual(['L1'])
    expect(names({ filter: 'pedido', rows: { L3: { qty: 2 } } })).toEqual([
      'L3',
    ])
    expect(names({ filter: 'bajo' })).toEqual(['L1'])
    expect(names({ section: 'LAPTOPS' })).toEqual(['L3'])
    expect(
      visibleSections(sections, { section: 'LAPTOPS' }).map((s) => s.name),
    ).toEqual(['LAPTOPS'])
  })

  it('the order view keeps only the lines it holds, a search still finds among them', () => {
    const names = (opts) =>
      visibleSections(sections, opts).flatMap((s) => s.lines.map((l) => l.name))
    expect(names({ only: new Set(['L3']) })).toEqual(['L3'])
    expect(
      visibleSections(sections, { only: new Set(['L3']) }).map((s) => s.name),
    ).toEqual(['LAPTOPS'])
    expect(names({ only: new Set(), search: 'realme' })).toEqual([])
    // without `only` the whole list shows
    expect(names({})).toHaveLength(3)
  })

  it('counts each filter chip and marks the promo on the line', () => {
    expect(filterCounts(sections, { L1: { qty: 1 } }, promos)).toEqual({
      nuevos: 1,
      subieron: 1,
      bajaron: 1,
      promo: 1,
      pedido: 1,
      bajo: 1,
    })
    expect(FILTERS).toEqual([
      'nuevos',
      'subieron',
      'bajaron',
      'promo',
      'pedido',
      'bajo',
    ])
    const [first] = visibleSections(sections, { promos })
    expect(first.lines[0].promo.name).toBe('P1')
    expect(first.lines[1].promo).toBeNull()
  })

  it('applies a promo by brand and model as the server does, never one switched off', () => {
    expect(promoFor(realme, promos).name).toBe('P1')
    // «C85» alone is another model: the banner names the exact one, as the server reads it
    expect(promoFor(realme, [{ brand: 'Realme', model: 'C85' }])).toBeNull()
    expect(
      promoFor(
        laptop,
        promos.filter((p) => p.active),
      ),
    ).toBeNull()
    expect(promoFor(laptop, [{ brand: 'HP', model: '' }])).toBeTruthy()
    expect(promoFor(moto, [{ brand: '', model: '' }])).toBeNull()
    expect(
      promoFor({ name1: 'Bocina Realme Buds', brand: '', model: '' }, [
        { brand: 'realme', model: '' },
      ]),
    ).toBeTruthy()
  })
})

describe('what the paid read still offers', () => {
  it('offers the read on an indexed list with nothing read, and on the pages a read left unwritten', () => {
    expect(canReadMore({ status: 'Indexado', pages_unread: 2 }, 0)).toBe(true)
    expect(canReadMore({ status: 'Listo', pages_unread: 0 }, 35)).toBe(false)
    expect(canReadMore({ status: 'Listo', pages_unread: 1 }, 35)).toBe(true)
    expect(
      canReadMore({ status: 'Listo', pages_unread: 1, reading: true }, 35),
    ).toBe(false)
    expect(canReadMore({ status: 'Error', pages_unread: 1 }, 0)).toBe(false)
  })
})

describe('copying the order text', () => {
  it('copies when the browser lets it', async () => {
    const written = []
    const clipboard = { writeText: async (t) => written.push(t) }
    expect(await copyText('Telefonía\nALCATEL T451A × 10', clipboard)).toBe(
      true,
    )
    expect(written).toEqual(['Telefonía\nALCATEL T451A × 10'])
  })

  it('keeps the sheet open when the clipboard is refused or missing', async () => {
    const refused = {
      writeText: async () => {
        throw new Error('Write permission denied.')
      },
    }
    expect(await copyText('x', refused)).toBe(false)
    expect(await copyText('x', null)).toBe(false)
    expect(await copyText('', { writeText: async () => {} })).toBe(false)
  })
})

describe('the correction form', () => {
  it('opens with the line and four tier rows', () => {
    const form = formOf(realme)
    expect(form.brand).toBe('Realme')
    expect(form.tiers).toHaveLength(4)
    expect(form.tiers[3]).toEqual({ min_qty: '', price: '', label: '' })
    expect(formOf(null).nom).toBe(false)
  })

  it('sends only what changed, with clean tiers', () => {
    const form = { ...formOf(realme), model: 'C85+', nom: false }
    form.tiers[1].price = '1390'
    expect(changedFields(realme, form)).toEqual({
      model: 'C85+',
      nom: false,
      tiers: [
        { min_qty: 1, price: 1450, label: '' },
        { min_qty: 5, price: 1390, label: 'Mayoreo' },
        { min_qty: 10, price: 1380, label: '' },
      ],
    })
    expect(changedFields(realme, formOf(realme))).toEqual({})
    expect(
      changedFields(moto, { ...formOf(moto), tiers: [], price: '2050' }),
    ).toEqual({ price: 2050 })
    expect(
      changedFields(realme, {
        ...formOf(realme),
        tags: ['Pay Joy', 'Pieza única'],
      }),
    ).toEqual({
      tags: ['Pay Joy', 'Pieza única'],
    })
  })

  it('cleans typed tiers: a price each, one per minimum, sorted', () => {
    expect(
      cleanTiers([
        { min_qty: '10', price: '1380', label: '' },
        { min_qty: '', price: '1450', label: '' },
        { min_qty: '0', price: '1440', label: 'x' },
        { min_qty: 5, price: '', label: 'Mayoreo' },
        { min_qty: 5, price: 'abc' },
      ]),
    ).toEqual([
      { min_qty: 1, price: 1440, label: 'x' },
      { min_qty: 10, price: 1380, label: '' },
    ])
  })

  it('builds a manual line from what was typed', () => {
    const form = {
      ...formOf(null),
      brand: 'Motorola',
      model: 'G06',
      storage: '128GB',
      nom: true,
      price: '2100',
    }
    expect(manualFields(form)).toEqual({
      brand: 'Motorola',
      model: 'G06',
      storage: '128GB',
      nom: true,
      price: 2100,
    })
    form.tiers[0] = { min_qty: 1, price: 2100, label: '' }
    form.tiers[1] = { min_qty: 5, price: 2000, label: '' }
    expect(manualFields(form).tiers).toHaveLength(2)
    expect(manualFields(form).price).toBeUndefined()
  })
})

describe('the history chart', () => {
  const points = [
    {
      date: '2026-08-05',
      price: 1400,
      source: 'lista',
      supplier_name: 'Perfeccel',
    },
    {
      date: '2026-09-02',
      price: 1380,
      source: 'recibo',
      supplier_name: 'Perfeccel',
    },
    {
      date: '2026-10-07',
      price: 1450,
      source: 'lista',
      supplier_name: 'Perfeccel',
    },
    { date: '2026-10-20', price: 1420, source: 'orden', supplier_name: 'Ipsa' },
    { date: 'bad', price: 1, source: 'lista' },
    { date: '2026-10-21', price: null, source: 'lista' },
  ]

  it('splits list prices into steps and purchases into dots, dropping what has no date or price', () => {
    const { steps, dots } = historySeries(points)
    expect(steps.map((s) => s.value)).toEqual([1400, 1450])
    expect(dots.map((d) => [d.source, d.value])).toEqual([
      ['recibo', 1380],
      ['orden', 1420],
    ])
  })

  it('lays the steps out as a path that holds to the right edge, with ticks and months', () => {
    const m = historyModel(points, { width: 400, height: 180 })
    expect(m.empty).toBe(false)
    expect(m.path.startsWith('M')).toBe(true)
    expect(m.path.split('H').length).toBe(3)
    expect(m.lo).toBeLessThanOrEqual(1380)
    expect(m.hi).toBeGreaterThanOrEqual(1450)
    expect(m.ticks.length).toBeGreaterThanOrEqual(3)
    expect(m.months.map((x) => new Date(x.t).getUTCMonth())).toEqual([8, 9])
    expect(m.priceAt(Date.UTC(2026, 8, 15))).toBe(1400)
    expect(m.priceAt(Date.UTC(2026, 9, 10))).toBe(1450)
    expect(m.priceAt(Date.UTC(2026, 7, 1))).toBeNull()
    expect(
      m.dots.every((d) => d.x >= m.pad.left && d.x <= 400 - m.pad.right),
    ).toBe(true)
  })

  it('says when there is nothing to draw', () => {
    expect(historyModel([]).empty).toBe(true)
    expect(
      historyModel([{ date: '2026-01-01', price: 100, source: 'lista' }]).empty,
    ).toBe(false)
  })
})

describe('models the list no longer carries', () => {
  const rows = [
    {
      item: 'X7',
      item_name: 'Realme X7',
      stock: 0,
      can_archive: true,
      can_delete: true,
    },
    {
      item: 'OLD',
      item_name: 'Old part',
      stock: 2,
      can_archive: false,
      can_delete: false,
    },
    {
      item: 'SOLD',
      item_name: 'Sold once',
      stock: 0,
      can_archive: true,
      can_delete: false,
    },
  ]

  it('chooses by default every model that can go, never one with stock', () => {
    expect(retireDefaults(rows)).toEqual({ X7: true, SOLD: true })
    expect(retireDefaults([])).toEqual({})
  })

  it('allows archive without stock and delete only without a record', () => {
    expect(retireChoice(rows, { X7: true })).toEqual({
      items: ['X7'],
      canArchive: true,
      canDelete: true,
      blocked: [],
      recorded: [],
    })
    const sold = retireChoice(rows, { X7: true, SOLD: true })
    expect([sold.canArchive, sold.canDelete, sold.recorded]).toEqual([
      true,
      false,
      ['Sold once'],
    ])
    const stocked = retireChoice(rows, { OLD: true, X7: true })
    expect([stocked.canArchive, stocked.canDelete, stocked.blocked]).toEqual([
      false,
      false,
      ['Old part'],
    ])
    expect(retireChoice(rows, {}).canArchive).toBe(false)
  })

  it('the page opens the sheet from the card and sends the decision to the order', () => {
    const page = readFileSync(
      resolve(here, '../../src/pages/CompraLista.vue'),
      'utf8',
    )
    expect(page.match(/data-lista-retiro/g)).toHaveLength(2)
    expect(page).toContain("call('retire_models', {")
    expect(page).toContain(
      "call('retire_candidates', { pedido: pedidoName, refresh: 1 })",
    )
  })
})

describe('what a drop brings', () => {
  const pic = (name, type) => new File(['x'], name, { type })

  it('keeps pictures and documents, nothing else', () => {
    const out = dropFiles([
      pic('a.jpg', 'image/jpeg'),
      pic('b.PNG', ''),
      pic('lista.pdf', 'application/pdf'),
      pic('precios.xlsx', ''),
      pic('notas.txt', 'text/plain'),
      new File([], 'vacio.jpg', { type: 'image/jpeg' }),
    ])
    expect(out.pictures.map((f) => f.name)).toEqual(['a.jpg', 'b.PNG'])
    expect(out.documents.map((f) => f.name)).toEqual([
      'lista.pdf',
      'precios.xlsx',
    ])
    expect(isPicture(pic('c.webp', 'image/webp'))).toBe(true)
    expect(isPicture(pic('c.gif', 'image/gif'))).toBe(false)
  })

  it('uploads the first picture on the session, the rest beside it, then asks for the read', async () => {
    const calls = []
    const api = async (method, args) => {
      calls.push([method.split('.').pop(), args])
      return method.endsWith('initiate')
        ? { part_size: 8, parts: [{ n: 1, url: '/p/1' }] }
        : {}
    }
    const put = async () => 'etag-1'
    const post = async (method, args, file) => {
      calls.push([method.split('.').pop(), { ...args, file: file.name }])
      return {}
    }
    const progress = []
    await uploadPictures(
      '/catalogo_subir?t=tok',
      'CAT-1',
      [
        pic('1.jpg', 'image/jpeg'),
        pic('2.jpg', 'image/jpeg'),
        pic('3.jpg', 'image/jpeg'),
      ],
      {
        api,
        put,
        post,
        onProgress: (done, total) => progress.push([done, total]),
      },
    )
    expect(calls.map((c) => c[0])).toEqual([
      'initiate',
      'complete',
      'add_picture',
      'add_picture',
      'index_now',
    ])
    expect(calls[1][1]).toEqual({
      token: 'tok',
      parts: [{ n: 1, etag: 'etag-1' }],
      more: 1,
    })
    expect(calls[2][1]).toEqual({ catalogo: 'CAT-1', file: '2.jpg' })
    expect(progress.at(-1)).toEqual([3, 3])
  })

  it('a single picture completes without waiting for more', async () => {
    const calls = []
    const api = async (method, args) => {
      calls.push([method.split('.').pop(), args])
      return method.endsWith('initiate')
        ? { part_size: 8, parts: [{ n: 1, url: '/p/1' }] }
        : {}
    }
    await uploadPictures(
      '/catalogo_subir?t=tok',
      'CAT-1',
      [pic('1.jpg', 'image/jpeg')],
      {
        api,
        put: async () => 'e',
        post: async () => ({}),
      },
    )
    expect(calls.map((c) => c[0])).toEqual(['initiate', 'complete'])
    expect(calls[1][1]).toEqual({ token: 'tok', parts: [{ n: 1, etag: 'e' }] })
  })

  it('adds pictures to a list that already has one, then asks for the read', async () => {
    const calls = []
    await addPictures(
      'CAT-1',
      [pic('4.jpg', 'image/jpeg'), pic('5.jpg', 'image/jpeg')],
      {
        api: async (method, args) =>
          calls.push([method.split('.').pop(), args]),
        post: async (method, args, file) =>
          calls.push([method.split('.').pop(), file.name]),
      },
    )
    expect(calls).toEqual([
      ['add_picture', '4.jpg'],
      ['add_picture', '5.jpg'],
      ['index_now', { catalogo: 'CAT-1' }],
    ])
  })
})

describe('lista strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const files = [
    '../../src/pages/CompraLista.vue',
    '../../src/components/compras/lista/ListaLinea.vue',
    '../../src/components/compras/lista/ListaForma.vue',
    '../../src/components/compras/lista/ListaPromos.vue',
    '../../src/components/compras/lista/ListaPedido.vue',
    '../../src/components/compras/lista/ListaRetiro.vue',
    '../../src/components/compras/lista/ListaHistoria.vue',
    '../../src/components/compras/lista/ListaStepper.vue',
    '../../src/components/compras/lista/ListaTipos.vue',
    '../../src/components/compras/lista/ListaTipo.vue',
    '../../src/components/compras/lista/ListaHistoriaMini.vue',
    '../../src/components/compras/lista/ListaPresencia.vue',
  ]
  const page = files
    .map((p) => readFileSync(resolve(here, p), 'utf8'))
    .join('\n')
  const CALL =
    /\b__\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*'Lista'\s*,?\s*\)/g
  const calls = [...page.matchAll(CALL)].map((m) => m[2])

  it('every Lista call is a literal the check can read', () => {
    expect(calls.length).toBe((page.match(/'Lista'\s*,?\s*\)/g) || []).length)
    expect(calls.length).toBeGreaterThan(200)
  })

  it('every Lista msgid has its es-MX entry', () => {
    const esc = (s) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\\\"')
    const missing = [...new Set(calls)].filter(
      (id) =>
        !new RegExp(
          `msgctxt "Lista"\\nmsgid "${esc(id)}"\\nmsgstr "[^"]+"`,
        ).test(po),
    )
    expect(missing).toEqual([])
  })

  it('keeps the reviewed words', () => {
    for (const [id, es] of [
      ['Send the order', 'Enviar pedido'],
      ['Take {0} more {1} for the {2}', 'Lleva {0} {1} más para {2}'],
      ['Correct the read', 'Corregir lectura'],
      [
        'Name the supplier of this list in Restock before ordering from it.',
        'Indica el proveedor de esta lista en Surtido antes de pedirle.',
      ],
      ['{0} pieces · {1} models', '{0} pzas · {1} modelos'],
      [
        'Models the list no longer carries',
        'Modelos que ya no vienen en la lista',
      ],
      ['Archive chosen', 'Archivar elegidos'],
      ['Delete for good', 'Borrar definitivamente'],
    ])
      expect(po).toContain(`msgctxt "Lista"\nmsgid "${id}"\nmsgstr "${es}"`)
  })

  it('Compras Hoy names the models the lists dropped and opens the list', () => {
    expect(po).toContain(
      'msgctxt "ComprasHoy"\nmsgid "Models the lists no longer carry"\nmsgstr "Modelos que ya no vienen en las listas"',
    )
    const hoy = readFileSync(
      resolve(here, '../../src/pages/CompraHoy.vue'),
      'utf8',
    )
    expect(hoy).toContain(
      ':to="{ name: \'CompraLista\', params: { name: r.catalog } }"',
    )
    expect(hoy).toContain('v-if="board.retire?.length"')
  })

  it('Surtido names the open-list link and the pictures it takes', () => {
    for (const [id, es] of [
      ['Open the list', 'Abrir lista'],
      [
        '{0} pictures uploaded; the list reads itself now',
        '{0} fotos subidas; la lista ya se está leyendo',
      ],
    ])
      expect(po).toContain(`msgctxt "Surtido"\nmsgid "${id}"\nmsgstr "${es}"`)
    const surtido = readFileSync(
      resolve(here, '../../src/pages/CompraSurtido.vue'),
      'utf8',
    )
    expect(surtido).toContain(
      ':to="{ name: \'CompraLista\', params: { name: c.name } }"',
    )
    expect(surtido).toContain(':accept="LIST_ACCEPT"')
  })
})

describe('the route and the chunk rules', () => {
  const page = readFileSync(
    resolve(here, '../../src/pages/CompraLista.vue'),
    'utf8',
  )
  const router = readFileSync(resolve(here, '../../src/router.js'), 'utf8')

  it('is a lazy route with its sheets loaded on first open', () => {
    expect(router).toMatch(
      /path: '\/compras\/lista\/:name',\s*name: 'CompraLista',\s*component: \(\) => import\('@\/pages\/CompraLista\.vue'\)/,
    )
    for (const sheet of [
      'ListaLinea',
      'ListaForma',
      'ListaPromos',
      'ListaPedido',
      'ListaRetiro',
      'ListaTipo',
    ])
      expect(page).toMatch(
        new RegExp(
          `const ${sheet} = defineAsyncComponent\\(\\s*\\(\\) =>\\s*import\\('@/components/compras/lista/${sheet}\\.vue'\\),?\\s*\\)`,
        ),
      )
  })

  it('writes icons as literal class names', () => {
    expect(page).not.toMatch(/`lucide-\$\{/)
    expect(page).not.toContain("'lucide-' +")
  })
})
