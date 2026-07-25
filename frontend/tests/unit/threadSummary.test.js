// Thread AI summary staleness label (ThreadSummary.vue, spec 5.2). Pure logic —
// no frappe-ui mock, so the vitest-4 spy-results trap (see outbox.test.js) is
// irrelevant here. Compares two UTC epoch-ms values.
import { describe, it, expect } from 'vitest'
import { stalenessBucket, stalenessLabel } from '@/utils/summaryStaleness'

const base = 1_700_000_000_000 // arbitrary fixed epoch ms
const at = (elapsedMs) => stalenessBucket(base, base + elapsedMs)
const label = (elapsedMs) => stalenessLabel(base, base + elapsedMs)

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('stalenessBucket', () => {
  it('returns null for a missing timestamp', () => {
    expect(stalenessBucket(null)).toBeNull()
    expect(stalenessBucket(undefined)).toBeNull()
    expect(stalenessBucket(0)).toBeNull()
  })

  it('buckets sub-45s as a moment', () => {
    expect(at(0)).toEqual({ unit: 'moment', value: 0 })
    expect(at(10 * SEC)).toEqual({ unit: 'moment', value: 0 })
    expect(at(44 * SEC)).toEqual({ unit: 'moment', value: 0 })
  })

  it('buckets minutes (never zero minutes above the moment threshold)', () => {
    expect(at(45 * SEC)).toEqual({ unit: 'min', value: 1 })
    expect(at(3 * MIN)).toEqual({ unit: 'min', value: 3 })
    expect(at(59 * MIN)).toEqual({ unit: 'min', value: 59 })
  })

  it('buckets hours', () => {
    expect(at(60 * MIN)).toEqual({ unit: 'hour', value: 1 })
    expect(at(2 * HOUR)).toEqual({ unit: 'hour', value: 2 })
    expect(at(23 * HOUR)).toEqual({ unit: 'hour', value: 23 })
  })

  it('buckets days', () => {
    expect(at(24 * HOUR)).toEqual({ unit: 'day', value: 1 })
    expect(at(50 * HOUR)).toEqual({ unit: 'day', value: 2 })
  })

  it('clamps a future timestamp to a moment (no negatives)', () => {
    expect(stalenessBucket(base, base - 5 * MIN)).toEqual({ unit: 'moment', value: 0 })
  })
})

describe('stalenessLabel', () => {
  it('returns empty string for a missing timestamp', () => {
    expect(stalenessLabel(null)).toBe('')
  })

  it('formats es-MX labels per bucket', () => {
    expect(label(10 * SEC)).toBe('hace un momento')
    expect(label(5 * MIN)).toBe('hace 5 min')
    expect(label(3 * HOUR)).toBe('hace 3 h')
    expect(label(2 * DAY)).toBe('hace 2 d')
  })
})
