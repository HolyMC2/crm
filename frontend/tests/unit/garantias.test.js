import { describe, expect, it } from 'vitest'
import {
  isNeutralModule,
  hostedModules,
  moduleKeyFor,
} from '../../src/composables/muelleShell.js'
import {
  dueLabel,
  dueTheme,
  kindLabel,
  normalizeSegment,
  primaryAction,
  recordRoute,
  stateLabel,
  tallerIntakeUrl,
  tallerOrderUrl,
} from '../../src/composables/useGarantias.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'

describe('Garantías boot', () => {
  it('is its own module and boots without the sales runtime', () => {
    expect(isNeutralModule('garantias')).toBe(true)
    expect(hostedModules.find((m) => m.key === 'garantias')?.to).toBe(
      '/garantias',
    )
    expect(moduleKeyFor({ path: '/garantias/SER-WRN-1', meta: {} })).toBe(
      'garantias',
    )
  })
  it('a refused case link recovers into Garantías, not Ventas', () => {
    expect(recoveryModule('/garantias/SER-WRN-2026-00001')).toBe('garantias')
    expect(recoveryModule('/garantias?segment=cerradas')).toBe('garantias')
  })
})

describe('queue', () => {
  it('keeps unknown segments on Nuevas', () => {
    expect(normalizeSegment('en-revision')).toBe('en-revision')
    expect(normalizeSegment('x')).toBe('nuevas')
    expect(normalizeSegment(undefined)).toBe('nuevas')
  })
  it('labels native values and leaves unknown ones as they are', () => {
    expect(kindLabel('Reingreso')).toBe('Back for repair')
    expect(kindLabel('Otro')).toBe('Otro')
    expect(stateLabel('En revisión')).toBe('In review')
    expect(recordRoute('SER-WRN-1')).toEqual({
      name: 'Garantia',
      params: { name: 'SER-WRN-1' },
    })
  })
  it('turns the native SLA due time into a chip', () => {
    const now = new Date('2026-10-06T10:00:00')
    expect(dueLabel('2026-10-06 13:00:00', now)).toBe('Due in 3 h')
    expect(dueTheme('2026-10-06 13:00:00', now)).toBe('orange')
    expect(dueLabel('2026-10-06 08:00:00', now)).toBe('Overdue by 2 h')
    expect(dueTheme('2026-10-06 08:00:00', now)).toBe('red')
    expect(dueLabel(null, now)).toBe('')
  })
})

describe('record', () => {
  it('hands off to Taller with the way back to the case', () => {
    const url = new URL(tallerOrderUrl('RO-0001', 'SER-WRN-1'), 'https://x')
    expect(url.pathname).toBe('/taller/orders/RO-0001')
    expect(url.searchParams.get('return_to')).toBe('/crm/garantias/SER-WRN-1')
    expect(url.searchParams.get('return_label')).toBe('Garantías')
    expect(new URL(tallerIntakeUrl('SER-WRN-1'), 'https://x').pathname).toBe(
      '/taller/orders/new',
    )
  })
  it('offers one primary next step for the state', () => {
    expect(primaryAction(null)).toBeNull()
    expect(
      primaryAction({ can_write: false, repair: { available: true } }),
    ).toBeNull()
    expect(
      primaryAction({
        can_write: true,
        repair: { available: true },
        transitions: [],
      }),
    ).toEqual({ kind: 'repair' })
    expect(
      primaryAction({
        can_write: true,
        repair: { open: 'RO-2' },
        transitions: [],
      }),
    ).toEqual({ kind: 'open_repair' })
    expect(
      primaryAction({
        can_write: true,
        repair: { available: false },
        outcome: { name: 'RO-2' },
        transitions: [{ action: 'Resolver' }],
      }),
    ).toEqual({ kind: 'transition', action: 'Resolver' })
    expect(
      primaryAction({
        can_write: true,
        repair: { available: false },
        transitions: [{ action: 'Revisar' }, { action: 'Cancelar' }],
      }),
    ).toEqual({ kind: 'transition', action: 'Revisar' })
  })
})
