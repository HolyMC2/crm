// Composer field memory: merge + rank of server and local suggestions, and the
// fail-soft network path (backend not deployed → local copy only).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callState = { behavior: async () => [] }
vi.mock('frappe-ui', () => ({
  call: (...args) => callState.behavior(...args),
}))

const NOW = Date.parse('2026-09-28T12:00:00')
const daysAgo = (d) => NOW - d * 86400000

describe('rankSuggestions', () => {
  let rankSuggestions
  beforeEach(async () => {
    ;({ rankSuggestions } = await import('@/composables/fieldMemory'))
  })

  it('puts values used with the same context first', () => {
    const out = rankSuggestions(
      [
        { value: 'otro@x.mx', context: 'CRM-DEAL-2', uses: 9, last_used: NOW },
        {
          value: 'ana@x.mx',
          context: 'CRM-DEAL-1',
          uses: 1,
          last_used: daysAgo(30),
        },
      ],
      [],
      { context: 'CRM-DEAL-1', now: NOW },
    )
    expect(out).toEqual(['ana@x.mx', 'otro@x.mx'])
  })

  it('then prefix matches before substring matches, and drops non-matches', () => {
    const out = rankSuggestions(
      [
        { value: 'mi ana', uses: 50, last_used: NOW },
        { value: 'ana@x.mx', uses: 1, last_used: NOW },
        { value: 'luis@x.mx', uses: 99, last_used: NOW },
      ],
      [],
      { prefix: 'an', now: NOW },
    )
    expect(out).toEqual(['ana@x.mx', 'mi ana'])
  })

  it('then uses × recency decay', () => {
    const out = rankSuggestions(
      [
        { value: 'viejo', uses: 10, last_used: daysAgo(60) }, // 10 × 0.5^(60/14) ≈ 0.51
        { value: 'nuevo', uses: 2, last_used: daysAgo(1) }, // ≈ 1.9
        { value: 'medio', uses: 4, last_used: daysAgo(14) }, // 2
      ],
      [],
      { now: NOW },
    )
    expect(out).toEqual(['medio', 'nuevo', 'viejo'])
  })

  it('merges server and local rows, deduping case/accent-insensitively', () => {
    const out = rankSuggestions(
      [{ value: 'Cotización', uses: 1, last_used: daysAgo(3) }],
      [
        { value: 'cotizacion', context: 'D1', uses: 5, last_used: NOW },
        { value: 'Saldo', uses: 1, last_used: NOW },
      ],
      { context: 'D1', now: NOW },
    )
    // the server spelling wins; the local row lends its context + uses
    expect(out).toEqual(['Cotización', 'Saldo'])
  })

  it('caps at 8 and skips blanks', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      value: `v${i}`,
      uses: 1,
      last_used: NOW,
    }))
    rows.push({ value: '   ' }, { value: null })
    const out = rankSuggestions(rows, [], { now: NOW })
    expect(out).toHaveLength(8)
    expect(out[0]).toBe('v0')
  })

  it('accepts Frappe datetime strings and bare strings', () => {
    const out = rankSuggestions(
      [
        { value: 'a', uses: 1, last_used: '2026-01-01 10:00:00' },
        { value: 'b', uses: 1, last_used: '2026-09-27 10:00:00' },
      ],
      ['c'],
      { now: NOW },
    )
    expect(out).toEqual(['b', 'a', 'c'])
  })
})

describe('suggest / remember (fail soft)', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('falls back to the local copy when the backend is missing', async () => {
    const calls = []
    callState.behavior = async (method, args) => {
      calls.push([method, args])
      throw new Error('404 method not found')
    }
    const { suggest, remember } = await import('@/composables/fieldMemory')
    remember([{ scope: 'email.to', value: 'ana@x.mx', context: 'D1' }])
    const out = await suggest('email.to', 'an', 'D1')
    expect(out).toEqual(['ana@x.mx'])
    // after the first failure it stops calling the server for a while
    const n = calls.length
    await suggest('email.to', '', 'D1')
    expect(calls.length).toBe(n)
  })

  it('merges server rows with local ones', async () => {
    callState.behavior = async (method) => {
      if (method.endsWith('suggest_values'))
        return [{ value: 'srv@x.mx', uses: 3, last_used: Date.now() }]
      return null
    }
    const { suggest, remember } = await import('@/composables/fieldMemory')
    remember([{ scope: 'email.to', value: 'loc@x.mx' }])
    const out = await suggest('email.to', '', null)
    expect(out.sort()).toEqual(['loc@x.mx', 'srv@x.mx'])
  })
})
