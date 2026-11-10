// The palette reach's match rule (Shell E7, DE9): the closest name first,
// abbreviations, one slip forgiven when nothing answers as typed, and the
// copy this browser keeps between visits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))

import {
  PALETTE_REACH_TTL_MS,
  REACH_FIT,
  _resetPaletteReach,
  hasStoredReach,
  kindTerm,
  loadPaletteReach,
  namesIt,
  reachRanked,
  reachRankedAs,
} from '@/utils/paletteReach'

const types = [
  ['Bank Account', 'Cuenta bancaria'],
  ['Books Assistant Settings', 'Books Assistant Settings'],
  ['Employee', 'Empleado'],
  ['Employee Advance', 'Anticipo de empleado'],
  ['Employee Checkin', 'Registro de entrada del empleado'],
  ['Marital Status', 'Estado civil'],
  ['Brand', 'Marca'],
  ['Payment Entry', 'Pago contable'],
  ['Price List', 'Lista de precios'],
  ['Role Profile', 'Perfil de rol'],
  ['Sales Invoice', 'Factura de venta'],
  ['Shift & Attendance', 'Turnos y asistencia'],
  ['Stock Settings', 'Configuración de inventario'],
  ['Unemployment Claim', 'Solicitud de desempleo'],
].map(([doctype, label]) => ({ doctype, label }))

let lists
beforeEach(async () => {
  localStorage.clear()
  _resetPaletteReach()
  state.call.mockReset()
  state.call.mockResolvedValue({ lists: types, tags: ['urgente', 'vip'] })
  lists = (await loadPaletteReach()).lists
})
afterEach(() => localStorage.clear())
const found = (text) =>
  reachRanked(lists, text).map(({ row, fit }) => [row.doctype, fit])
const names = (text) => found(text).map(([doctype]) => doctype)

describe('reachRanked: the closest name first', () => {
  it('the name itself, then the names it starts, then the ones that mention it', () => {
    expect(found('employee')).toEqual([
      ['Employee', REACH_FIT.exact],
      ['Employee Advance', REACH_FIT.start],
      ['Employee Checkin', REACH_FIT.start],
    ])
    expect(found('employ').at(-1)).toEqual([
      'Unemployment Claim',
      REACH_FIT.inside,
    ])
    // By the Spanish label too, accents aside; the label mentions it as a word.
    expect(found('empleado')).toEqual([
      ['Employee', REACH_FIT.exact],
      ['Employee Advance', REACH_FIT.words],
      ['Employee Checkin', REACH_FIT.words],
    ])
  })

  it('every word, in any order, each starting a word: «settings books», «sal inv»', () => {
    expect(found('settings books')).toEqual([
      ['Books Assistant Settings', REACH_FIT.words],
    ])
    expect(found('sal inv')).toEqual([['Sales Invoice', REACH_FIT.words]])
    expect(found('assistant')).toEqual([
      ['Books Assistant Settings', REACH_FIT.words],
    ])
    // Punctuation is not a word: «shift attendance» is the whole name.
    expect(found('shift attendance')).toEqual([
      ['Shift & Attendance', REACH_FIT.exact],
    ])
  })

  it('initials find the name: «bas», «si»', () => {
    expect(names('bas')).toEqual(['Books Assistant Settings'])
    expect(found('si')[0]).toEqual(['Sales Invoice', REACH_FIT.words])
    // Initials are the whole name's: «ba» is not Books Assistant Settings.
    expect(names('ba')).toEqual(['Bank Account'])
  })

  it('at the same fit the shortest name the term was found in leads', () => {
    expect(names('settings')).toEqual([
      'Stock Settings',
      'Books Assistant Settings',
    ])
  })
})

describe('reachRanked: an abbreviation spells the name word by word', () => {
  it('each piece is the start of its word or its consonants: «slsinv», «pymtent», «factven»', () => {
    for (const [typed, doctype] of [
      ['slsinv', 'Sales Invoice'],
      ['sinv', 'Sales Invoice'],
      ['salinv', 'Sales Invoice'],
      ['sls inv', 'Sales Invoice'],
      ['pymtent', 'Payment Entry'],
      ['stksett', 'Stock Settings'],
      ['basset', 'Books Assistant Settings'],
      ['empadv', 'Employee Advance'],
      // The Spanish label, without its «de».
      ['factven', 'Sales Invoice'],
      ['listprec', 'Price List'],
    ])
      expect(found(typed), typed).toEqual([[doctype, REACH_FIT.short]])
  })

  it('never letters that merely appear in order, a word left out, or a small word spelled', () => {
    // «emplado» has the letters of «empleado», not its start nor its
    // consonants: it is no abbreviation, only a slip away.
    expect(found('emplado').map(([, fit]) => fit)).toEqual([
      REACH_FIT.near,
      REACH_FIT.near,
      REACH_FIT.near,
    ])
    // Books Assistant Settings has three words: «bkset» names two.
    expect(found('bkset')).toEqual([])
    // «pedro» is not Pe(rfil) d(e) ro(l).
    expect(found('pedro')).toEqual([])
    // Under four letters only whole initials count.
    expect(found('sin')).toEqual([])
  })

  it('sits after every row that answers as typed and before a slip', () => {
    expect(REACH_FIT.inside).toBeLessThan(REACH_FIT.short)
    expect(REACH_FIT.short).toBeLessThan(REACH_FIT.near)
    expect(namesIt(REACH_FIT.short, 'slsinv')).toBe(false)
  })
})

describe('a last word that names the kind of row', () => {
  it('kindTerm takes it off: «customer list», «almacén árbol», «stock ledger report»', () => {
    expect(kindTerm('sales invoice list', 'list')).toBe('sales invoice')
    expect(kindTerm('factura de venta lista', 'list')).toBe('factura de venta')
    expect(kindTerm('Almacén Árbol', 'tree')).toBe('almacen')
    expect(kindTerm('stock ledger report', 'report')).toBe('stock ledger')
    expect(kindTerm('stock dashboard', 'dashboard')).toBe('stock')
    // The word alone, or another kind's word, is just the term.
    expect(kindTerm('list', 'list')).toBe('')
    expect(kindTerm('sales invoice list', 'report')).toBe('')
  })

  it('reachRankedAs keeps a name that ends in the word («Price List») and falls back to the rest', () => {
    const price = reachRankedAs(lists, 'price list', 'list')
    expect(price.term).toBe('price list')
    expect(price.found[0].row.doctype).toBe('Price List')
    const invoice = reachRankedAs(lists, 'sales invoice list', 'list')
    expect(invoice.term).toBe('sales invoice')
    expect(invoice.found.map(({ row }) => row.doctype)).toEqual([
      'Sales Invoice',
    ])
    expect(reachRankedAs(lists, 'zzz list', 'list').found).toEqual([])
  })
})

describe('the reach is kept in this browser between visits', () => {
  const now = 1_700_000_000_000
  const second = { lists: [{ doctype: 'Warehouse', label: 'Almacén' }] }

  it('a new page answers from the kept copy at once and reads again only when it is old', async () => {
    // beforeEach read it once and kept it.
    expect(state.call).toHaveBeenCalledTimes(1)
    expect(hasStoredReach()).toBe(true)
    _resetPaletteReach()
    state.call.mockClear()
    // Still fresh: no request at all.
    const kept = await loadPaletteReach()
    expect(kept.lists.map((row) => row.doctype)).toContain('Employee')
    expect(kept.tags.map((row) => row.tag)).toEqual(['urgente', 'vip'])
    expect(state.call).not.toHaveBeenCalled()
  })

  it('an old copy answers while the new read runs, then the new one does', async () => {
    _resetPaletteReach()
    state.call.mockClear()
    let arrive
    state.call.mockReturnValueOnce(
      new Promise((resolve) => {
        arrive = resolve
      }),
    )
    const later = Date.now() + PALETTE_REACH_TTL_MS + 1
    const old = await loadPaletteReach({ now: later })
    expect(old.lists.map((row) => row.doctype)).toContain('Employee')
    expect(state.call).toHaveBeenCalledTimes(1)
    // Another keystroke while it runs asks nothing more.
    await loadPaletteReach({ now: later + 50 })
    expect(state.call).toHaveBeenCalledTimes(1)
    arrive(second)
    await Promise.resolve()
    await Promise.resolve()
    const fresh = await loadPaletteReach({ now: later + 100 })
    expect(fresh.lists.map((row) => row.doctype)).toEqual(['Warehouse'])
    expect(state.call).toHaveBeenCalledTimes(1)
  })

  it('a failed read keeps what there is and the next search asks again', async () => {
    _resetPaletteReach()
    state.call.mockClear()
    state.call.mockRejectedValueOnce(new Error('offline'))
    const later = Date.now() + PALETTE_REACH_TTL_MS + 1
    const kept = await loadPaletteReach({ now: later })
    expect(kept.lists.length).toBeGreaterThan(0)
    await Promise.resolve()
    await Promise.resolve()
    state.call.mockResolvedValueOnce(second)
    await loadPaletteReach({ now: later + 10 })
    expect(state.call).toHaveBeenCalledTimes(2)
  })

  it('with nothing kept the search waits for the read; unreadable storage is no copy', async () => {
    localStorage.clear()
    _resetPaletteReach()
    expect(hasStoredReach()).toBe(false)
    state.call.mockClear()
    state.call.mockResolvedValueOnce(second)
    const read = await loadPaletteReach({ now })
    expect(read.lists.map((row) => row.doctype)).toEqual(['Warehouse'])
    localStorage.clear()
    _resetPaletteReach()
    for (const key of Object.keys(localStorage)) localStorage.removeItem(key)
    localStorage.setItem('muelle:palette-reach:junk', '{not json')
    expect(hasStoredReach()).toBe(false)
  })

  it('an empty query finds nothing', () => {
    expect(found('')).toEqual([])
    expect(found('   ')).toEqual([])
  })
})

describe('reachRanked: one slip forgiven when nothing answers as typed', () => {
  it('a letter missing, extra, wrong or swapped in a long word', () => {
    for (const typo of [
      'asistant', // missing
      'asssistant', // extra
      'assistent', // wrong
      'assitsant', // swapped
    ])
      expect(found(typo), typo).toEqual([
        ['Books Assistant Settings', REACH_FIT.near],
      ])
    expect(names('boks asistant')).toEqual(['Books Assistant Settings'])
    expect(names('slaes invoice')).toEqual(['Sales Invoice'])
    expect(names('setings stock')).toEqual(['Stock Settings'])
  })

  it('never when a row answers as typed', () => {
    // «marital» is there; «Marca» one slip from «marita» is not offered.
    expect(found('marital')).toEqual([['Marital Status', REACH_FIT.start]])
  })

  it('a short word is not guessed at: «maria» is a name, not «Marca» or «Marital»', () => {
    expect(found('maria')).toEqual([])
    expect(found('marka')).toEqual([])
    // With a long word to hold on to, a short one may slip too.
    expect(names('boks assistant')).toEqual(['Books Assistant Settings'])
  })

  it('never a slip in the first letter, nor in the last one typed', () => {
    expect(found('zettings')).toEqual([])
    // «employex» is «employe» plus a different ending, not a typo of Employee.
    expect(found('employex')).toEqual([])
    // Two slips are another word.
    expect(found('asistnat')).toEqual([])
  })
})

describe('namesIt: the term is the row’s name, or four letters of its start', () => {
  it('exact always; a start from four letters; never a mention', () => {
    expect(namesIt(REACH_FIT.exact, 'pos')).toBe(true)
    expect(namesIt(REACH_FIT.start, 'empl')).toBe(true)
    expect(namesIt(REACH_FIT.start, 'emp')).toBe(false)
    expect(namesIt(REACH_FIT.words, 'assistant')).toBe(false)
    expect(namesIt(REACH_FIT.inside, 'employ')).toBe(false)
    expect(namesIt(REACH_FIT.near, 'asistant')).toBe(false)
  })
})
