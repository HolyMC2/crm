import { describe, expect, it } from 'vitest'
import {
  isNeutralModule,
  hostedModules,
  moduleKeyFor,
} from '../../src/composables/muelleShell.js'
import {
  createPrefill,
  dueLabel,
  dueTheme,
  kindLabel,
  liveOutcome,
  remedyLabel,
  sourceOptions,
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

describe('fix: picker, hand-off and remedies', () => {
  it('a cancelled visit is no outcome, so the case does not offer to resolve with it', () => {
    const claim = {
      can_write: true,
      repair: { available: true },
      outcome: { name: 'RO-2', void: true },
      transitions: [{ action: 'Resolver' }],
    }
    expect(liveOutcome(claim)).toBeNull()
    expect(primaryAction(claim)).toEqual({ kind: 'repair' })
    expect(primaryAction({ ...claim, repair: { available: false } })).toBeNull()
  })
  it('does not offer to resolve with an unrepaired visit without a reason', () => {
    expect(
      primaryAction({
        can_write: true,
        repair: { available: false },
        outcome: { name: 'RO-3' },
        transitions: [{ action: 'Resolver', needs_details: true }],
      }),
    ).toBeNull()
  })
  it('asks for the purchase before anything else when the case has none', () => {
    expect(
      primaryAction({
        can_write: true,
        can_pick_source: true,
        against: null,
        repair: { available: false, pick_source: true },
        transitions: [{ action: 'Revisar' }],
      }),
    ).toEqual({ kind: 'pick_source' })
  })
  it('turns sales lines and delivered orders into picker choices', () => {
    const options = sourceOptions({
      sales: [
        {
          doctype: 'POS Invoice',
          name: 'PINV-1',
          date: '2026-10-01',
          items: [
            {
              row: 'r1',
              item_code: 'CARG',
              item_name: 'Cargador',
              serial_no: ['SN1'],
              batch_no: [],
            },
            {
              row: 'r2',
              item_code: 'FUN',
              item_name: 'Funda',
              serial_no: [],
              batch_no: ['B1'],
            },
          ],
        },
      ],
      orders: [
        {
          name: 'RO-1',
          title: 'iPhone 12',
          date: '2026-09-30',
          serial_no: ['IMEI1', 'IMEI2'],
        },
      ],
    })
    expect(
      options.map((o) => [
        o.against_doctype,
        o.against_name,
        o.against_row,
        o.serial_no,
        o.batch_no,
      ]),
    ).toEqual([
      ['POS Invoice', 'PINV-1', 'r1', 'SN1', ''],
      ['POS Invoice', 'PINV-1', 'r2', '', 'B1'],
      ['Repair Order', 'RO-1', '', '', ''],
    ])
    expect(options[2].serials).toEqual(['IMEI1', 'IMEI2'])
    expect(options[0].hint).toContain('PINV-1')
  })
  it('reads a Taller or POS hand-off and ignores anything else', () => {
    expect(
      createPrefill({
        create: '1',
        against_doctype: 'Repair Order',
        against_name: 'RO-9',
        return_to: '/taller/orders/RO-9',
        evil: 'x',
        serial_no: ['a', 'b'],
      }),
    ).toEqual({ against_doctype: 'Repair Order', against_name: 'RO-9' })
  })
  it('labels the remedy under way', () => {
    expect(remedyLabel('Reembolso')).toBe('Refund at the register')
    expect(remedyLabel('Otro')).toBe('Otro')
  })
})
