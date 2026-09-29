// Campaign-step template variable helpers. Pure logic — no frappe-ui mock.
import { describe, it, expect } from 'vitest'
import {
  templateVarCount,
  parseParams,
  paramsProblem,
} from '@/utils/templateParams'

const KEYS = ['nombre', 'folio', 'negocio']

describe('templateVarCount', () => {
  it('counts distinct placeholders', () => {
    expect(templateVarCount('Hola {{1}}, folio {{2}}. {{ 1 }}')).toBe(2)
  })
  it('is zero for plain or empty bodies', () => {
    expect(templateVarCount('Hola')).toBe(0)
    expect(templateVarCount(null)).toBe(0)
  })
})

describe('paramsProblem', () => {
  it('accepts an exact mapping', () => {
    expect(paramsProblem('{{1}} {{2}}', 'nombre, folio', KEYS)).toBeNull()
  })
  it('accepts no mapping for a zero-variable template', () => {
    expect(paramsProblem('Hola', '', KEYS)).toBeNull()
  })
  it('reports count mismatches', () => {
    expect(paramsProblem('{{1}} {{2}}', 'nombre', KEYS)).toEqual({
      need: 2,
      have: 1,
    })
  })
  it('reports unknown keys', () => {
    expect(paramsProblem('{{1}}', 'apodo', KEYS)).toEqual({
      unknown: ['apodo'],
    })
  })
  it('parses comma lists', () => {
    expect(parseParams(' a, ,b ')).toEqual(['a', 'b'])
  })
})
