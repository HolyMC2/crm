// The palette reach's match rule (Shell E7, DE9): the closest name first, and
// one slip forgiven when nothing answers as typed.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))

import {
  REACH_FIT,
  _resetPaletteReach,
  loadPaletteReach,
  namesIt,
  reachRanked,
} from '@/utils/paletteReach'

const types = [
  ['Bank Account', 'Cuenta bancaria'],
  ['Books Assistant Settings', 'Books Assistant Settings'],
  ['Employee', 'Empleado'],
  ['Employee Advance', 'Anticipo de empleado'],
  ['Employee Checkin', 'Registro de entrada del empleado'],
  ['Marital Status', 'Estado civil'],
  ['Brand', 'Marca'],
  ['Sales Invoice', 'Factura de venta'],
  ['Shift & Attendance', 'Turnos y asistencia'],
  ['Stock Settings', 'Configuración de inventario'],
  ['Unemployment Claim', 'Solicitud de desempleo'],
].map(([doctype, label]) => ({ doctype, label }))

let lists
beforeEach(async () => {
  _resetPaletteReach()
  state.call.mockReset()
  state.call.mockResolvedValue({ lists: types })
  lists = (await loadPaletteReach()).lists
})
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
