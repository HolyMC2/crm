// ASI-S4 Surtido: the plan corrections the server understands, the budget bar,
// the create-items rows, and every string of the page in es-MX.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { budgetShare, buildChanges, readyRows } from '@/utils/surtido'

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

describe('surtido strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const page = [
    '../../src/pages/CompraSurtido.vue',
    '../../src/pages/Compras.vue',
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
