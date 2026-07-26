// In-thread search pure helpers (spec 2.7).
import { describe, it, expect } from 'vitest'
import { normalizeSearch, matchesQuery, stepMatch } from '@/utils/threadSearch'

describe('threadSearch', () => {
  it('normalizes case + diacritics', () => {
    expect(normalizeSearch('Qué Pásó')).toBe('que paso')
  })

  it('matches diacritic-insensitively both directions', () => {
    expect(matchesQuery('¿cuánto por la reparación?', 'reparacion')).toBe(true)
    expect(matchesQuery('sin acento aqui', 'aquí')).toBe(true)
  })

  it('requires 2+ chars', () => {
    expect(matchesQuery('hola', 'h')).toBe(false)
    expect(matchesQuery('hola', ' h ')).toBe(false)
  })

  it('no match when absent', () => {
    expect(matchesQuery('nota de voz', 'factura')).toBe(false)
  })

  it('stepMatch wraps both directions and handles empty', () => {
    expect(stepMatch(-1, 0, 1)).toBe(-1)
    expect(stepMatch(-1, 3, 1)).toBe(0)
    expect(stepMatch(-1, 3, -1)).toBe(2)
    expect(stepMatch(2, 3, 1)).toBe(0)
    expect(stepMatch(0, 3, -1)).toBe(2)
  })
})
