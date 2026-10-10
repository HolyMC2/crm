import { describe, expect, it } from 'vitest'
import {
  isNeutralModule,
  hostedModules,
  moduleKeyFor,
} from '../../src/composables/muelleShell.js'
import {
  balanceLine,
  decisions,
  lftLabel,
  nextRequest,
  normalizeSegment,
  personRoute,
  readyEmployees,
  segmentsFor,
  todayLabel,
  weekLabel,
} from '../../src/composables/useEquipo.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'

describe('Equipo boot', () => {
  it('is its own module and boots without the sales runtime', () => {
    expect(isNeutralModule('equipo')).toBe(true)
    expect(hostedModules.find((m) => m.key === 'equipo')?.to).toBe('/equipo')
    expect(moduleKeyFor({ path: '/equipo/persona/HR-EMP-1', meta: {} })).toBe(
      'equipo',
    )
  })
  it('a refused person link recovers into Equipo, not Ventas', () => {
    expect(recoveryModule('/equipo/persona/HR-EMP-00001')).toBe('equipo')
    expect(recoveryModule('/equipo?segment=por-revisar')).toBe('equipo')
  })
})

describe('queues', () => {
  it('without HRMS only the whole team remains', () => {
    expect(segmentsFor(true).map((s) => s.value)).toEqual([
      'hoy',
      'por-revisar',
      'sin-horario',
      'todos',
    ])
    expect(segmentsFor(false).map((s) => s.value)).toEqual(['todos'])
    expect(normalizeSegment('por-revisar', false)).toBe('todos')
    expect(normalizeSegment('por-revisar', true)).toBe('por-revisar')
    expect(normalizeSegment('x', true)).toBe('hoy')
  })
  it('labels the native board, schedule and law states', () => {
    expect(todayLabel('retardo')).toBe('Late')
    expect(todayLabel('otro')).toBe('otro')
    expect(weekLabel('sin_confirmar')).toBe('No schedule')
    expect(lftLabel('manual')).toBe('Assigned by hand')
    expect(personRoute('HR-EMP-1', { request: 'LA-1' })).toEqual({
      name: 'EquipoPersona',
      params: { employee: 'HR-EMP-1' },
      query: { request: 'LA-1' },
    })
  })
})

describe('review chain', () => {
  const queue = [
    { name: 'LA-1', employee: 'E1' },
    { name: 'LA-2', employee: 'E2' },
    { name: 'LA-3', employee: 'E3' },
  ]
  it('after a decision focuses the request that followed it', () => {
    expect(nextRequest(queue, 'LA-2')?.name).toBe('LA-3')
    expect(nextRequest(queue, 'LA-3')?.name).toBe('LA-2')
    // The decided one already left the queue: start from the top.
    expect(nextRequest(queue.slice(1), 'LA-1')?.name).toBe('LA-2')
    expect(nextRequest([{ name: 'LA-1' }], 'LA-1')).toBeNull()
    expect(nextRequest(null, 'LA-1')).toBeNull()
  })
  it('only offers the decisions the server allows', () => {
    expect(decisions({ actions: ['approve', 'reject', 'reassign'] })).toEqual([
      'approve',
      'reject',
    ])
    expect(decisions({ actions: ['withdraw'] })).toEqual([])
    expect(decisions(null)).toEqual([])
  })
  it('says the balance and when it ends', () => {
    expect(
      balanceLine({ balance: { days: 14, to_date: '2027-03-14' } }),
    ).toMatch(/^14 days left · until /)
    expect(balanceLine({ balance: null })).toBe('')
  })
  it('assigns statutory days only to rows the server marked ready', () => {
    expect(
      readyEmployees([
        { employee: 'E1', status: 'ready' },
        { employee: 'E2', status: 'manual' },
        { employee: 'E3', status: 'first_year' },
      ]),
    ).toEqual(['E1'])
  })
})
