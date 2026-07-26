// Cadence authoring helpers (spec 4.2 completion): the day-1/3/7 scaffold builder
// and the enrollment-flip guard. Pure logic — no frappe-ui mock, so the vitest-4
// spy-results trap (see outbox.test.js) does not apply here.
import { describe, it, expect } from 'vitest'
import {
  buildCadenceScaffold,
  cadenceToggleLocked,
  CADENCE_TOUCH_WAITS_HOURS,
} from '@/utils/cadenceScaffold'

const SEND_TYPES = new Set(['send_whatsapp', 'send_email'])

describe('buildCadenceScaffold', () => {
  it('alternates wait → send_whatsapp, one pair per touch', () => {
    const steps = buildCadenceScaffold()
    // 3 touches (24/48/96) → 6 steps
    expect(steps).toHaveLength(CADENCE_TOUCH_WAITS_HOURS.length * 2)
    steps.forEach((s, i) => {
      expect(s.step_type).toBe(i % 2 === 0 ? 'wait' : 'send_whatsapp')
    })
  })

  it('spaces the waits at día 1 / 3 / 7 (24 / 48 / 96 h inter-step gaps)', () => {
    const waits = buildCadenceScaffold()
      .filter((s) => s.step_type === 'wait')
      .map((s) => s.wait_hours)
    expect(waits).toEqual([24, 48, 96])
  })

  it('leaves every send step with a BLANK template for the operator to fill', () => {
    const sends = buildCadenceScaffold().filter((s) => SEND_TYPES.has(s.step_type))
    expect(sends).toHaveLength(3)
    for (const s of sends) {
      expect(s.template).toBe('')
      expect(s.channel).toBe('whatsapp')
      expect(s.wait_hours).toBe(0)
    }
  })

  it('gives wait steps no channel and no template (valid Draft rows)', () => {
    for (const s of buildCadenceScaffold().filter((x) => x.step_type === 'wait')) {
      expect(s.channel).toBe('')
      expect(s.template).toBe('')
      expect(Number.isInteger(s.wait_hours)).toBe(true)
    }
  })

  it('honors a custom wait schedule', () => {
    const steps = buildCadenceScaffold([12])
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ step_type: 'wait', wait_hours: 12 })
    expect(steps[1]).toMatchObject({ step_type: 'send_whatsapp', template: '' })
  })

  it('returns a fresh array each call (no shared step objects)', () => {
    const a = buildCadenceScaffold()
    const b = buildCadenceScaffold()
    expect(a).not.toBe(b)
    a[1].template = 'mutated'
    expect(b[1].template).toBe('') // no aliasing between builds
  })
})

describe('cadenceToggleLocked', () => {
  it('unlocks when there are no enrollments', () => {
    expect(cadenceToggleLocked(0)).toBe(false)
    expect(cadenceToggleLocked(undefined)).toBe(false)
    expect(cadenceToggleLocked(null)).toBe(false)
    expect(cadenceToggleLocked('')).toBe(false)
  })

  it('locks the moment a deal is enrolled', () => {
    expect(cadenceToggleLocked(1)).toBe(true)
    expect(cadenceToggleLocked(42)).toBe(true)
    expect(cadenceToggleLocked('2')).toBe(true) // stringified count from the API
  })

  it('fails safe (locked) on a non-numeric truthy value', () => {
    expect(cadenceToggleLocked('many')).toBe(true)
  })
})
