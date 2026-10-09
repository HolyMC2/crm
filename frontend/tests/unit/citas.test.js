import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn(() => Promise.resolve({})) }))

import { call } from 'frappe-ui'
import { constraintActions } from '@/composables/useAgenda'
import {
  CITAS_CALENDAR,
  citaAction,
  doneCita,
  querySourceKeys,
  receiveUrl,
  slotsOn,
  telHref,
  validHours,
  visibleFor,
} from '@/composables/useCitas'

const events = [
  { source: 'Event', id: 'EV-1', kind: 'event' },
  { source: 'Event', id: 'EV-2', kind: 'cita' },
  { source: 'Turno', id: 'T-1', kind: 'shift' },
]

describe('the «Citas» calendar', () => {
  it('asks the Event source once, whichever of the two is on', () => {
    expect(querySourceKeys([CITAS_CALENDAR])).toEqual(['Event'])
    expect(querySourceKeys(['Event', CITAS_CALENDAR, 'Turno'])).toEqual(['Event', 'Turno'])
  })

  it('shows only citas when it is the only Event calendar on', () => {
    expect(visibleFor(events, [CITAS_CALENDAR]).map((e) => e.id)).toEqual(['EV-2'])
    expect(visibleFor(events, ['Event']).map((e) => e.id)).toEqual(['EV-1', 'EV-2'])
    expect(visibleFor(events, ['Turno', CITAS_CALENDAR]).map((e) => e.id)).toEqual(['EV-2', 'T-1'])
  })
})

describe('«Recibir equipo» hand-off', () => {
  it('opens Taller Intake with the cita and a safe way back', () => {
    const url = receiveUrl({ name: 'APMT-Ana-0001' }, '/crm/agenda?view=day&event=Event:EV-2')
    const parsed = new URL(url, 'https://shop.example')
    expect(parsed.pathname).toBe('/taller/intake')
    expect(parsed.searchParams.get('cita')).toBe('APMT-Ana-0001')
    expect(parsed.searchParams.get('return')).toBe('/crm/agenda?view=day&event=Event:EV-2')
  })

  it('never returns to a foreign address', () => {
    const url = receiveUrl({ name: 'A' }, 'https://evil.example/x')
    expect(new URL(url, 'https://shop.example').searchParams.get('return')).toBe(
      '/crm/agenda?view=list&cal=citas',
    )
  })

  it('reads Taller’s return marker', () => {
    expect(doneCita({ done: 'Appointment:APMT-1' })).toBe('APMT-1')
    expect(doneCita({ done: 'Event:EV-1' })).toBe('')
    expect(doneCita({})).toBe('')
  })
})

describe('cita actions', () => {
  it('send the version the panel showed', async () => {
    await citaAction({ name: 'APMT-1', version: '2026-10-08 10:00:00' }, 'no_show')
    expect(call).toHaveBeenCalledWith('doco.citas.api.no_show', {
      name: 'APMT-1',
      version: '2026-10-08 10:00:00',
    })
  })

  it('refuse an unknown action', () => {
    expect(() => citaAction({ name: 'A', version: 'v' }, 'delete')).toThrow()
  })

  it('offer another time when the slot was just taken', () => {
    expect(constraintActions({ code: 'slot_taken' })).toEqual(['pick_time'])
    expect(constraintActions({ code: 'native' })).toEqual(['pick_time'])
    expect(constraintActions({ code: 'closed' })).toEqual(['refresh'])
  })
})

describe('helpers', () => {
  it('lists the free times of one day', () => {
    const days = [{ date: '2026-10-09', slots: [{ start: 'a', end: 'b' }] }]
    expect(slotsOn(days, '2026-10-09')).toHaveLength(1)
    expect(slotsOn(days, '2026-10-10')).toEqual([])
  })

  it('dials the number as written', () => {
    expect(telHref('+52 668 123 4567')).toBe('tel:+526681234567')
    expect(telHref('')).toBe('')
  })

  it('accepts only hours that open before they close', () => {
    expect(validHours([{ day: 'Monday', from: '09:00', to: '18:00' }])).toBe(true)
    expect(validHours([{ day: 'Monday', from: '18:00', to: '09:00' }])).toBe(false)
    expect(validHours([{ day: 'Lunes', from: '09:00', to: '18:00' }])).toBe(false)
    expect(validHours([])).toBe(false)
  })
})
