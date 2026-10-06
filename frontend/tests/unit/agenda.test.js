import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import {
  constraintActions,
  instantToWall,
  isWarningOnly,
  parseEventKey,
  parseState,
  recordLink,
  rescheduleTimes,
  safeReturn,
  splitAllDay,
  stateQuery,
  step,
  toCalendarEvent,
  visibleHours,
  wallToInstant,
} from '@/composables/useAgenda'
import { dropSlot } from '@/components/agenda/agendaDrag'

const MX = 'America/Mexico_City'

describe('URL state', () => {
  it('defaults to the agenda list on phones and the week on desktop', () => {
    expect(parseState({}, { phone: true, timeZone: MX }).view).toBe('list')
    expect(parseState({}, { phone: false, timeZone: MX }).view).toBe('week')
  })

  it('rejects unknown views and malformed dates', () => {
    const state = parseState(
      { view: 'month', date: '2026-13-99x', cal: 'Event,Turno' },
      { phone: false, timeZone: MX },
    )
    expect(state.view).toBe('week')
    expect(state.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(state.calendars).toEqual(['Event', 'Turno'])
  })

  it('round-trips through the query without default noise', () => {
    const query = stateQuery(
      {
        view: 'day',
        date: '2026-10-05',
        event: 'Event:EV-1',
        calendars: ['Event'],
      },
      { return_to: '/crm/contactos' },
    )
    expect(query).toEqual({
      return_to: '/crm/contactos',
      view: 'day',
      date: '2026-10-05',
      event: 'Event:EV-1',
    })
    expect(
      stateQuery({
        view: 'week',
        date: '2026-10-05',
        event: '',
        calendars: ['Event', 'Turno'],
      }).cal,
    ).toBe('Event,Turno')
  })

  it('steps one week in the list and week views, one day in the day view', () => {
    expect(step({ view: 'list', date: '2026-10-05' }, 1)).toBe('2026-10-12')
    expect(step({ view: 'day', date: '2026-10-05' }, -1)).toBe('2026-10-04')
  })

  it('parses event keys whose ids contain colons or occurrence dates', () => {
    expect(parseEventKey('Event:EV-1@2026-10-07')).toEqual({
      source: 'Event',
      id: 'EV-1@2026-10-07',
    })
    expect(parseEventKey('nonsense')).toBeNull()
  })
})

describe('business time zone', () => {
  it('converts wall time to the instant of the business zone', () => {
    expect(wallToInstant('2026-10-05', '10:30', MX)).toBe(
      '2026-10-05T16:30:00.000Z',
    )
    expect(instantToWall('2026-10-05T16:30:00.000Z', MX)).toEqual({
      date: '2026-10-05',
      time: '10:30',
    })
  })

  it('handles a DST zone on both sides of the change', () => {
    const zone = 'America/New_York'
    expect(wallToInstant('2026-03-07', '09:00', zone)).toBe(
      '2026-03-07T14:00:00.000Z',
    )
    expect(wallToInstant('2026-03-09', '09:00', zone)).toBe(
      '2026-03-09T13:00:00.000Z',
    )
  })

  it('rejects malformed wall times', () => {
    expect(wallToInstant('2026-10-05', '9:00', MX)).toBeNull()
  })
})

describe('calendar shaping', () => {
  const event = {
    id: 'EV-1',
    source: 'Event',
    start: '2026-10-05T12:00:00Z',
    end: '2026-10-05T13:30:00Z',
    resourceIds: ['ana@example.test'],
  }

  it('renders every source in one column and keeps the source resource', () => {
    const mapped = toCalendarEvent(event)
    expect(mapped.resourceIds).toEqual(['agenda'])
    expect(mapped.sourceResourceIds).toEqual(['ana@example.test'])
  })

  it('splits all-day events out of the timed grid', () => {
    const { timed, allDay } = splitAllDay([
      event,
      { ...event, id: 'EV-2', allDay: true },
    ])
    expect(timed.map((row) => row.id)).toEqual(['EV-1'])
    expect(allDay.map((row) => row.id)).toEqual(['EV-2'])
  })

  it('widens visible hours to early starts and overnight shifts', () => {
    expect(visibleHours([], MX)).toEqual({ start: 7, end: 21 })
    const early = {
      ...event,
      start: '2026-10-05T11:00:00Z',
      end: '2026-10-05T12:15:00Z',
    }
    expect(visibleHours([early], MX).start).toBe(5)
    const overnight = {
      ...event,
      start: '2026-10-06T03:00:00Z',
      end: '2026-10-06T09:00:00Z',
    }
    expect(visibleHours([overnight], MX).end).toBe(24)
  })

  it('drops keep the duration and land on the slot instant', () => {
    const times = rescheduleTimes(event, '2026-10-07', 4, {
      timeZone: MX,
      slotMinutes: 30,
      startHour: 7,
      endHour: 21,
    })
    // Slot 4 of 7:00 is 9:00 local = 15:00Z; 90 minutes long.
    expect(times).toEqual({
      start: '2026-10-07T15:00:00.000Z',
      end: '2026-10-07T16:30:00.000Z',
    })
    expect(
      rescheduleTimes(event, '2026-10-07', 999, {
        timeZone: MX,
        slotMinutes: 30,
        startHour: 7,
        endHour: 21,
      }),
    ).toBeNull()
  })

  it('finds the drop slot under the pointer and its column date', () => {
    const column = document.createElement('div')
    column.setAttribute('data-mc-selection-column', '')
    column.dataset.date = '2026-10-08'
    const slot = document.createElement('button')
    slot.dataset.mcSlotIndex = '3'
    column.appendChild(slot)
    const chip = document.createElement('button')
    expect(dropSlot([chip, slot, column], '2026-10-05')).toMatchObject({
      date: '2026-10-08',
      index: 3,
    })
    delete column.dataset.date
    expect(dropSlot([slot], '2026-10-05').date).toBe('2026-10-05')
    expect(dropSlot([chip], '2026-10-05')).toBeNull()
  })
})

describe('guards always offer a way forward', () => {
  it('maps every refusal to resolve actions', () => {
    expect(constraintActions({ code: 'stale_version' })).toEqual(['retry'])
    expect(constraintActions({ code: 'recurring_occurrence' })[0]).toBe(
      'move_series',
    )
    expect(constraintActions({ code: 'overlap' })).toEqual([
      'confirm',
      'pick_time',
    ])
    expect(constraintActions({ code: 'organizer_only' })).toEqual([
      'request_change',
    ])
    expect(constraintActions({ code: 'read_only' })).toEqual(['open_turnos'])
    expect(constraintActions({ code: 'something_new' })).toEqual(['retry'])
  })

  it('treats a response as overridable only when every constraint is a warning', () => {
    expect(isWarningOnly([{ severity: 'warn' }, { severity: 'warn' }])).toBe(
      true,
    )
    expect(isWarningOnly([{ severity: 'warn' }, { severity: 'block' }])).toBe(
      false,
    )
    expect(isWarningOnly([])).toBe(false)
  })
})

describe('return protocol and record links', () => {
  it('accepts only local app paths', () => {
    expect(safeReturn('/crm/contactos/contact/C-1')).toBe(
      '/crm/contactos/contact/C-1',
    )
    for (const bad of [
      '//evil.invalid/crm/',
      'https://evil.invalid/crm/',
      '/crm/../app/user',
      '/crm/%2e%2e/app',
      '/desk/event',
      '/crm\\x',
      'javascript:alert(1)',
    ])
      expect(safeReturn(bad)).toBe('')
  })

  it('links shell-owned records in the shell and others to the native form', () => {
    expect(recordLink('Contact', 'Ana P')).toEqual({
      to: '/contactos/contact/Ana%20P',
    })
    expect(recordLink('CRM Deal', 'D-1')).toEqual({ to: '/deals/D-1' })
    expect(recordLink('Repair Order', 'RO-1')).toEqual({
      href: '/app/repair-order/RO-1',
    })
  })
})
