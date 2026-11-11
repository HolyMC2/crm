// The item ranker the shell runs on the device (utils/itemRank). Real
// catalogue names from the doco mirror: doco/docoutils/test_search.py and the
// Taller and Mercado search.spec.ts carry the same cases; change them together.
import { describe, expect, it } from 'vitest'
import {
  fold,
  isCandidate,
  queryTerms,
  rank,
  searchable,
  termPatterns,
  words,
} from '@/utils/itemRank'

const ITEMS = [
  ['MOD00131', 'Pantalla iPhone XS INCELL', 'Pantallas y Displays'],
  ['MOD00135', 'Pantalla iPhone 11 INCELL', 'Pantallas y Displays'],
  ['MOD00139', 'Pantalla iPhone 12 INCELL', 'Pantallas y Displays'],
  ['MOD00154', 'Pantalla iPhone 13 PRO MAX INCELL', 'Pantallas y Displays'],
  ['MOD00148', 'Pantalla iPhone 13 INCELL', 'Pantallas y Displays'],
  ['IPN003214', 'Bateria para iPhone 13', 'Baterías'],
  ['IPN003216', 'Bateria para iPhone 13 Pro Max', 'Baterías'],
  ['IPN003215', 'Bateria para iPhone 13 Pro', 'Baterías'],
  ['IPN000180', 'Anillo Case Samsung A13 5G Azul', 'Fundas y Carcasas'],
  ['IPN002697', 'Anillo Case Redmi 13C Gris', 'Fundas y Carcasas'],
  ['IPN004713', 'Camara Trasera para IPhone XS MAX', 'Refacciones'],
  ['IPN000017', 'Cable C a C IP 1m OEM', 'Cargadores y Cables'],
  ['IPN001339', 'Adaptador para cargador Europeo', 'Cargadores y Cables'],
  ['IPN004720', 'Flex de Carga para Equipo 13', 'Refacciones'],
].map(([code, name, group]) => ({
  code,
  name,
  texts: `${name}\n${group}`,
  search: searchable(name, [group], [code]),
}))

const ranked = (query, limit) =>
  rank(ITEMS, query, (row) => row.search, limit).map((row) => row.name)

describe('words', () => {
  it('splits glued model numbers and suffixes', () => {
    expect(words('iPhone13ProMax')).toEqual(['iphone', '13', 'pro', 'max'])
    expect(words('Redmi Note 13Pro+')).toEqual(['redmi', 'note', '13', 'pro'])
  })
  it('keeps short model codes whole', () => {
    expect(words('Samsung A13 5G / G13')).toEqual([
      'samsung',
      'a13',
      '5g',
      'g13',
    ])
  })
  it('folds accents', () => {
    expect(words('Batería Cámara')).toEqual(['bateria', 'camara'])
  })
})

describe('queryTerms', () => {
  it('joins a lone letter to the following number', () => {
    expect(queryTerms('sam a 13')).toEqual([['sam'], ['a13']])
  })
  it('lists stems and aliases as alternatives', () => {
    expect(queryTerms('fundas sm')).toEqual([
      ['fundas', 'funda'],
      ['sm', 'samsung'],
    ])
  })
})

describe('rank', () => {
  it('never matches a model number inside codes or other words', () => {
    // The technician's report: «ip 13» listed XS/11/12 screens through MOD0013x
    // codes, «Samsung A13» and «Redmi 13C» through substrings.
    expect(ranked('ip 13')).toEqual([
      'Pantalla iPhone 13 INCELL',
      'Bateria para iPhone 13',
      'Bateria para iPhone 13 Pro',
      // Equal scores keep the caller's order.
      'Pantalla iPhone 13 PRO MAX INCELL',
      'Bateria para iPhone 13 Pro Max',
    ])
  })
  it('ranks the exact model before longer variants', () => {
    expect(ranked('bateria iphone 13')).toEqual([
      'Bateria para iPhone 13',
      'Bateria para iPhone 13 Pro',
      'Bateria para iPhone 13 Pro Max',
    ])
  })
  it('matches a generic word through the group field', () => {
    expect(ranked('funda a13')).toEqual(['Anillo Case Samsung A13 5G Azul'])
  })
  it('finds an item by code fragment', () => {
    expect(ranked('4713')).toEqual(['Camara Trasera para IPhone XS MAX'])
    expect(ranked('MOD00148')).toEqual(['Pantalla iPhone 13 INCELL'])
  })
  it('needs a word start for short words', () => {
    expect(ranked('ip 13')).not.toContain('Flex de Carga para Equipo 13')
    expect(ranked('ip')).not.toContain('Adaptador para cargador Europeo')
  })
  it('uses loose matches only when nothing is strict', () => {
    expect(ranked('iphone 1')).toContain('Pantalla iPhone 11 INCELL')
    expect(ranked('cable 1')).toEqual(['Cable C a C IP 1m OEM'])
  })
  it('keeps the caller order for ties', () => {
    const rows = ['Case iPhone 13 Azul', 'Case iPhone 13 Rojo'].map((name) => ({
      name,
      search: searchable(name),
    }))
    expect(rank(rows, 'iphone 13')).toEqual(rows)
  })
  it('returns rows unchanged for an empty query', () => {
    expect(rank(ITEMS, '  ')).toEqual(ITEMS)
  })
  it('caps the rows', () => {
    expect(ranked('ip 13', 2)).toEqual([
      'Pantalla iPhone 13 INCELL',
      'Bateria para iPhone 13',
    ])
  })
})

describe('fold', () => {
  it('lowercases and drops accents, with or without them', () => {
    expect(fold('Batería CÁMARA Ñu')).toBe('bateria camara nu')
    expect(fold('Pantalla SM A05')).toBe('pantalla sm a05')
    expect(fold(null)).toBe('')
  })
})

// doco/docoutils/search.py term_patterns and candidate_clause: the prefilter
// the server runs in SQL before it ranks.
describe('the prefilter', () => {
  const candidates = (query) => {
    const patterns = termPatterns(query)
    return ITEMS.filter((row) =>
      isCandidate(patterns, fold(row.texts), fold(row.code)),
    ).map((row) => row.code)
  }
  it('a term is somewhere in a text, or starts the code', () => {
    expect(termPatterns('fundas sm a05 13')).toEqual([
      { texts: ['fundas', 'funda'], code: 'fundas', inside: false },
      { texts: ['sm', 'samsung'], code: null, inside: false },
      { texts: ['a05'], code: 'a05', inside: false },
      { texts: ['13'], code: null, inside: false },
    ])
    expect(termPatterns('4713')).toEqual([
      { texts: ['4713'], code: '4713', inside: true },
    ])
  })
  it('keeps every row rank() keeps, and the near misses it will drop', () => {
    for (const query of ['ip 13', 'bateria iphone 13', 'funda a13', '4713'])
      for (const row of rank(ITEMS, query))
        expect(candidates(query)).toContain(row.code)
    // «13» is inside «A13» and «13C»: candidates here, dropped by rank().
    expect(candidates('13')).toContain('IPN000180')
    expect(candidates('mod')).toEqual([
      'MOD00131',
      'MOD00135',
      'MOD00139',
      'MOD00154',
      'MOD00148',
    ])
    expect(candidates('4713')).toEqual(['IPN004713'])
    // A match never spans the name and the group.
    expect(candidates('incell pantallas')).toHaveLength(5)
    expect(candidates('incellpantallas')).toEqual([])
  })
})
