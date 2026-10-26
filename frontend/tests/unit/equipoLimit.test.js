import { describe, expect, it } from 'vitest'
import { liftAction } from '../../src/composables/useEquipo.js'

describe('a decider limited to their own employee record', () => {
  it('a refusal that offers the lift carries its label and the record to lift', () => {
    expect(
      liftAction({
        ok: false,
        code: 'own_record_only',
        employee: 'HR-EMP-9',
        actions: [{ id: 'lift_own_limit', label: 'Ver a todo el equipo' }],
      }),
    ).toEqual({ label: 'Ver a todo el equipo', employee: 'HR-EMP-9' })
  })
  it('without lift rights, or on any other refusal, there is nothing to lift', () => {
    expect(
      liftAction({
        code: 'own_record_only',
        employee: 'HR-EMP-9',
        actions: [],
      }),
    ).toBeNull()
    expect(
      liftAction({ code: 'stale', actions: [{ id: 'refresh', label: 'x' }] }),
    ).toBeNull()
    expect(liftAction(null)).toBeNull()
  })
})
