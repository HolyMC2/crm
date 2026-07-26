// Intent → action-chip mapping (IntentChips.vue, spec 5.3). Pure logic — no
// frappe-ui mock, so the vitest-4 spy-results trap (see outbox.test.js) is
// irrelevant here. Covers the confidence gate + the intent→chip resolution.
import { describe, it, expect } from 'vitest'
import { chipForIntent, passesConfidence, MIN_CONFIDENCE, INTENT_CHIPS } from '@/utils/intentActions'

describe('passesConfidence', () => {
  it('accepts a number at or above the threshold', () => {
    expect(passesConfidence(MIN_CONFIDENCE)).toBe(true)
    expect(passesConfidence(0.6)).toBe(true)
    expect(passesConfidence(1)).toBe(true)
  })

  it('rejects below the threshold', () => {
    expect(passesConfidence(0.59)).toBe(false)
    expect(passesConfidence(0)).toBe(false)
  })

  it('fails closed on non-numbers', () => {
    expect(passesConfidence(null)).toBe(false)
    expect(passesConfidence(undefined)).toBe(false)
    expect(passesConfidence('0.9')).toBe(false)
    expect(passesConfidence(NaN)).toBe(false)
    expect(passesConfidence(Infinity)).toBe(false)
  })
})

describe('chipForIntent', () => {
  it('maps each known intent to its icon + event', () => {
    expect(chipForIntent('pago', 0.9)).toMatchObject({ icon: '💳', event: 'cobrar' })
    expect(chipForIntent('factura', 0.9)).toMatchObject({ icon: '🧾', event: 'factura' })
    expect(chipForIntent('cotizar_reparacion', 0.9)).toMatchObject({ icon: '🔧', event: 'taller' })
    expect(chipForIntent('precio', 0.9)).toMatchObject({ icon: '🏷', event: 'catalogo' })
  })

  it('renders nothing below the confidence threshold', () => {
    expect(chipForIntent('pago', 0.59)).toBeNull()
    expect(chipForIntent('factura', 0)).toBeNull()
  })

  it('renders nothing for otro / unknown / null intents', () => {
    expect(chipForIntent('otro', 0.99)).toBeNull()
    expect(chipForIntent('reclamo', 0.99)).toBeNull()
    expect(chipForIntent(null, 0.99)).toBeNull()
    expect(chipForIntent(undefined, 0.99)).toBeNull()
  })

  it('uses the static default label when no backend label is given', () => {
    expect(chipForIntent('precio', 0.9).label).toBe('Ver catálogo')
    expect(chipForIntent('precio', 0.9, '').label).toBe('Ver catálogo')
    expect(chipForIntent('precio', 0.9, '   ').label).toBe('Ver catálogo')
  })

  it('prefers a non-empty backend label over the default', () => {
    expect(chipForIntent('precio', 0.9, 'Ver precio').label).toBe('Ver precio')
    expect(chipForIntent('factura', 0.9, 'Quiere factura').label).toBe('Quiere factura')
  })

  it('ignores a non-string label and falls back to the default', () => {
    expect(chipForIntent('pago', 0.9, 123).label).toBe('Cobrar')
    expect(chipForIntent('pago', 0.9, null).label).toBe('Cobrar')
  })

  it('every mapped chip has icon, event and a default label', () => {
    for (const [intent, chip] of Object.entries(INTENT_CHIPS)) {
      expect(chip.icon).toBeTruthy()
      expect(chip.event).toBeTruthy()
      expect(chip.label).toBeTruthy()
      // and it resolves through chipForIntent at high confidence
      expect(chipForIntent(intent, 0.95)).not.toBeNull()
    }
  })
})
