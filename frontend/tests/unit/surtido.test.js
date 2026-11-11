// ASI-S4 Surtido: the plan corrections the server understands, the budget bar,
// the create-items rows, and every string of the page in es-MX.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  budgetShare,
  buildChanges,
  closeSpecs,
  lineMeta,
  missingGroups,
  readyRows,
} from '@/utils/surtido'

const here = dirname(fileURLToPath(import.meta.url))
const plan = {
  budget: 20000,
  total: 15000,
  lines: [
    { line: 'L1', qty: 18, colour: 'Negro' },
    { line: 'L2', qty: 3, colour: 'Azul' },
    { line: 'L3', qty: 5, colour: '' },
  ],
  left_out: [{ line: 'L9', qty: 0, suggested: 4 }],
}

describe('surtido plan corrections', () => {
  it('turns edits into remove / qty / colour / add changes', () => {
    const changes = buildChanges(
      plan,
      {
        L1: { qty: 10 },
        L2: { remove: true, qty: 7 },
        L3: { qty: 5, colour: 'Rojo' },
      },
      { L9: 4, NOPE: 2 },
    )
    expect(changes).toEqual([
      { op: 'qty', line: 'L1', qty: 10 },
      { op: 'remove', line: 'L2' },
      { op: 'colour', line: 'L3', colour: 'Rojo' },
      { op: 'add', line: 'L9', qty: 4 },
    ])
  })

  it('ignores no-op and invalid edits', () => {
    expect(
      buildChanges(plan, { L1: { qty: 18 }, L2: { qty: 0 } }, { L9: 0 }),
    ).toEqual([])
    expect(buildChanges(null, { L1: { qty: 2 } })).toEqual([])
  })

  it('budget bar stays within 0–100', () => {
    expect(budgetShare(plan)).toBe(75)
    expect(budgetShare({ budget: 100, total: 130 })).toBe(100)
    expect(budgetShare({ budget: 0, total: 5 })).toBe(0)
  })

  it('a plan line says its code, model and colour once, with commas', () => {
    expect(
      lineMeta({
        name: 'Display Samsung A16 5G negro',
        code: 'PF-A165G',
        model: 'Galaxy A16 5G',
        colour: 'negro',
      }),
    ).toBe('PF-A165G, Galaxy A16 5G')
    expect(lineMeta({ name: 'PF-IP11', code: 'PF-IP11' })).toBe('')
    expect(lineMeta({ name: 'Mica', model: 'iPhone 11' })).toBe('iPhone 11')
  })

  it('create-items rows need batches and serials said for every row', () => {
    expect(readyRows([3], { 3: '1' }, {})).toEqual({ ok: false, rows: [] })
    expect(readyRows([], {}, {}).ok).toBe(false)
    expect(readyRows([3, 4], { 3: '1', 4: '0' }, { 3: '0', 4: '1' })).toEqual({
      ok: true,
      rows: [
        { index: 3, has_batch: true, has_serial: false },
        { index: 4, has_batch: false, has_serial: true },
      ],
    })
  })
})

describe('the items the close creates', () => {
  const items = [
    {
      catalogo_linea: 'L1',
      name: 'SAMSUNG A07 64GB/4GB NACIONAL',
      section: 'CELULARES',
      has_serial_default: true,
      group_missing: false,
    },
    {
      catalogo_linea: 'L2',
      name: 'HP 15-FD',
      section: 'LAPTOP',
      has_serial_default: false,
      group_missing: true,
    },
  ]

  it('answers serials from the section unless the owner said, and no batches by default', () => {
    expect(closeSpecs(items)).toEqual({
      L1: { has_serial: true, has_batch: false },
      L2: { has_serial: false, has_batch: false },
    })
    expect(closeSpecs(items, { L2: '1' }, { L1: '0' })).toEqual({
      L1: { has_serial: false, has_batch: false },
      L2: { has_serial: false, has_batch: true },
    })
    expect(closeSpecs([{ name: 'no line' }])).toEqual({})
  })

  it('names the items whose section has no product type', () => {
    expect(missingGroups(items)).toEqual(['HP 15-FD'])
    expect(missingGroups([])).toEqual([])
  })

  it('the page sends the specs with the close and holds it while a section lacks a type', () => {
    const page = readFileSync(
      resolve(here, '../../src/pages/CompraSurtido.vue'),
      'utf8',
    )
    expect(page).toContain(
      "act('close', 'close', { specs: JSON.stringify(specs) }, (out) => {",
    )
    expect(page).toContain(
      ':disabled="busy === \'close\' || Boolean(firstMissing)"',
    )
    expect(page).toContain('data-testid="surtido-new-items"')
  })
})

describe('surtido strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const page = [
    '../../src/pages/CompraSurtido.vue',
    '../../src/pages/Compras.vue',
    '../../src/components/compras/SurtidoTienda.vue',
    '../../src/components/compras/SurtidoProducto.vue',
    '../../src/utils/surtidoShop.js',
  ]
    .map((p) => readFileSync(resolve(here, p), 'utf8'))
    .join('\n')
  // trailing comma allowed: prettier wraps the long sentences
  const CALL =
    /\b__\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*'Surtido'\s*,?\s*\)/g
  const calls = [...page.matchAll(CALL)].map((m) => m[2])

  it('every Surtido call is a literal the check can read', () => {
    expect(calls.length).toBe((page.match(/'Surtido'\s*,?\s*\)/g) || []).length)
    expect(calls.length).toBeGreaterThan(100)
  })

  it('every Surtido msgid has its es-MX entry', () => {
    const esc = (s) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\\\"')
    const missing = calls.filter(
      (id) =>
        !new RegExp(
          `msgctxt "Surtido"\\nmsgid "${esc(id)}"\\nmsgstr "[^"]+"`,
        ).test(po),
    )
    expect(missing).toEqual([])
  })

  it('keeps the reviewed words', () => {
    for (const [id, es] of [
      ['Restock from a list', 'Surtir desde una lista'],
      [
        'Approve: draft order to the supplier',
        'Aprobar: pedido en borrador al proveedor',
      ],
      ['The supplier did not send ({0})', 'El proveedor no surtió ({0})'],
      ['p. {0}', 'pág. {0}'],
    ])
      expect(po).toContain(`msgctxt "Surtido"\nmsgid "${id}"\nmsgstr "${es}"`)
  })
})

describe('surtido supplier pickers', () => {
  const page = readFileSync(
    resolve(here, '../../src/pages/CompraSurtido.vue'),
    'utf8',
  )

  it('search through Surtido, which asks for the owner rather than the right to buy', () => {
    const loads = [...page.matchAll(/:load="\(q\) => (\w+)\('suppliers'/g)]
    expect(loads.map((m) => m[1])).toEqual(['call', 'call'])
    expect(page).toContain("const API = 'doco.workspaces.sourcing.'")
  })
})
