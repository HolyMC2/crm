// Niveles de surtido: which levels a filter shows, the tone bar, the mix
// presets and check, what the sheet saves, and every string of the page in es-MX.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  adoptedLevel,
  buyText,
  levelPayload,
  levelState,
  mixPresets,
  mixProblem,
  presetOf,
  toneSegments,
  visibleErp,
  visibleLevels,
} from '@/utils/niveles'

const here = dirname(fileURLToPath(import.meta.url))
const TONES = ['Oscuros', 'Vivos']
const ip12 = {
  model: 'iPhone 12',
  item_group: 'Fundas',
  target: 10,
  have: 4,
  incoming: 1,
  on: 5,
  need: 5,
  tones: [
    { tone: 'Oscuros', want: 5, have: 3, buy: 2 },
    { tone: 'Vivos', want: 5, have: 2, buy: 3 },
  ],
}
const a15 = {
  model: 'Samsung A15',
  item_group: 'Micas',
  target: 3,
  have: 5,
  on: 5,
  need: 0,
  tones: [],
}

describe('niveles list', () => {
  it('shows the short ones, a group, or all', () => {
    expect(visibleLevels([ip12, a15], 'faltan')).toEqual([ip12])
    expect(visibleLevels([ip12, a15], 'Micas')).toEqual([a15])
    expect(visibleLevels([ip12, a15], 'todos')).toEqual([ip12, a15])
  })

  it('draws each tone as its share of the level, never past the end', () => {
    expect(toneSegments(ip12).map((s) => [s.tone, s.pct])).toEqual([
      ['Oscuros', 30],
      ['Vivos', 20],
    ])
    expect(toneSegments(a15)).toEqual([{ tone: '', pieces: 5, pct: 100 }])
    expect(toneSegments({ target: 0 })).toEqual([])
    // 7 dark, 28 bright and 8 of no colour on hand: the bar shows all 43 of 60
    const real = {
      target: 60,
      on: 43,
      tones: [
        { tone: 'Oscuros', have: 7 },
        { tone: 'Vivos', have: 28 },
      ],
    }
    expect(
      toneSegments(real).map((s) => [s.pieces, Boolean(s.untoned)]),
    ).toEqual([
      [7, false],
      [28, false],
      [8, true],
    ])
  })

  it('tells a level that buys now from a full one and one waiting for its minimum', () => {
    expect(levelState(ip12)).toBe('short')
    expect(levelState(a15)).toBe('full')
    expect(
      levelState({ target: 10, min: 6, have: 8, incoming: 0, need: 0 }),
    ).toBe('waiting')
    expect(levelState({ target: 10, have: 8, incoming: 2, need: 0 })).toBe(
      'full',
    )
  })

  it('says what each tone still needs', () => {
    expect(buyText(ip12)).toBe('2 Oscuros, 3 Vivos')
    expect(buyText(a15)).toBe('')
  })
})

describe('niveles from the items reorder levels', () => {
  const erp = [
    {
      item_group: 'Fundas',
      model: 'Samsung A15',
      min_qty: 3,
      target_qty: 6,
      items: 1,
    },
    {
      item_group: 'Micas',
      model: 'iPhone 12',
      min_qty: 4,
      target_qty: 4,
      items: 2,
    },
  ]

  it('shows a group its own and every other filter all', () => {
    expect(visibleErp(erp, 'Micas')).toEqual([erp[1]])
    expect(visibleErp(erp, 'faltan')).toEqual(erp)
    expect(visibleErp(erp, 'todos')).toEqual(erp)
    expect(visibleErp(undefined, 'todos')).toEqual([])
  })

  it('opens a new level with the items numbers and no mix', () => {
    expect(adoptedLevel(erp[0])).toEqual({
      level: '',
      item_group: 'Fundas',
      level_model: 'Samsung A15',
      target: 6,
      min: 3,
    })
  })
})

describe('niveles sheet', () => {
  it('offers presets over the dark and bright tones and recognises them', () => {
    const presets = mixPresets(TONES)
    expect(presets.map((p) => p.value)).toEqual([
      'none',
      'half',
      'dark',
      'bright',
    ])
    expect(presetOf(presets[1].mix, TONES)).toBe('half')
    expect(presetOf([], TONES)).toBe('none')
    expect(
      presetOf(
        [
          { tone: 'Oscuros', share: 70 },
          { tone: 'Vivos', share: 30 },
        ],
        TONES,
      ),
    ).toBe('custom')
    expect(mixPresets([])).toEqual([])
  })

  it('saves a mix only when it adds up to 100', () => {
    expect(mixProblem([])).toBeNull()
    expect(
      mixProblem([
        { tone: 'Oscuros', share: 50 },
        { tone: 'Vivos', share: 50 },
      ]),
    ).toBeNull()
    expect(
      mixProblem([
        { tone: 'Oscuros', share: 60 },
        { tone: 'Vivos', share: 30 },
      ]),
    ).toBe(90)
  })

  it('sends whole numbers, an empty floor as 0 and only tones with a share', () => {
    const out = levelPayload({
      name: 'NS-1',
      item_group: 'Fundas',
      model: ' iPhone 12 ',
      target_qty: '10',
      min_qty: '',
      mix: [
        { tone: 'Oscuros', share: 100 },
        { tone: 'Vivos', share: 0 },
      ],
    })
    expect(out).toEqual({
      name: 'NS-1',
      item_group: 'Fundas',
      model: 'iPhone 12',
      target_qty: 10,
      min_qty: 0,
      mix: JSON.stringify([{ tone: 'Oscuros', share: 100 }]),
    })
    expect(
      levelPayload({ item_group: 'Fundas', target_qty: 4, min_qty: 2 }).name,
    ).toBeUndefined()
  })
})

describe('niveles strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const page = readFileSync(
    resolve(here, '../../src/pages/CompraNiveles.vue'),
    'utf8',
  )
  const CALL =
    /\b__\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*'Niveles'\s*,?\s*\)/g
  const calls = [...page.matchAll(CALL)].map((m) => m[2])

  it('every Niveles call is a literal the check can read', () => {
    expect(calls.length).toBe((page.match(/'Niveles'\s*,?\s*\)/g) || []).length)
  })

  it('every Niveles msgid has its es-MX entry', () => {
    for (const msgid of new Set(calls))
      expect(po, msgid).toContain(
        `msgctxt "Niveles"\nmsgid "${msgid}"\nmsgstr "`,
      )
  })

  it('reaches the levels from Compras and from Surtido', () => {
    const compras = readFileSync(
      resolve(here, '../../src/pages/Compras.vue'),
      'utf8',
    )
    const surtido = readFileSync(
      resolve(here, '../../src/pages/CompraSurtido.vue'),
      'utf8',
    )
    for (const source of [compras, surtido])
      expect(source).toContain("router.push({ name: 'CompraNiveles' })")
  })
})
