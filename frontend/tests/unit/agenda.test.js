import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import {
  constraintActions,
  instantToWall,
  isWarningOnly,
  moveToDateTimes,
  parseEventKey,
  parseState,
  rangeFor,
  recordLink,
  rescheduleTimes,
  safeReturn,
  splitAllDay,
  stateQuery,
  step,
  toCalendarEvent,
  visibleHours,
  wallToInstant,
  weekStartsOn,
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
      { view: 'year', date: '2026-13-99x', cal: 'Event,Turno' },
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

  it('keeps the month view in the URL and steps whole months, clamping the day', () => {
    expect(
      parseState({ view: 'month' }, { phone: true, timeZone: MX }).view,
    ).toBe('month')
    expect(step({ view: 'month', date: '2026-10-31' }, 1)).toBe('2026-11-30')
    expect(step({ view: 'month', date: '2026-10-08' }, -1)).toBe('2026-09-08')
  })

  it('starts the list at its date (today by default), never at past days', () => {
    const range = rangeFor({ view: 'list', date: '2026-10-08' }, MX)
    expect(range.dates[0]).toBe('2026-10-08')
    expect(range.dates).toHaveLength(7)
    expect(range.start).toBe('2026-10-08T06:00:00.000Z')
    expect(range.end).toBe('2026-10-15T06:00:00.000Z')
  })

  it('fetches one six-week range per month from the site week start', () => {
    const monday = rangeFor({ view: 'month', date: '2026-10-08' }, MX, 1)
    expect(monday.dates[0]).toBe('2026-09-28')
    expect(monday.dates).toHaveLength(42)
    const sunday = rangeFor({ view: 'month', date: '2026-10-08' }, MX, 0)
    expect(sunday.dates[0]).toBe('2026-09-27')
    expect(rangeFor({ view: 'week', date: '2026-10-08' }, MX, 0).dates[0]).toBe(
      '2026-10-04',
    )
  })

  it('reads the first weekday from boot sysdefaults, Monday when unset', () => {
    expect(weekStartsOn({ first_day_of_the_week: 'Sunday' })).toBe(0)
    expect(weekStartsOn({ first_day_of_the_week: 'Saturday' })).toBe(6)
    expect(weekStartsOn({})).toBe(1)
    expect(weekStartsOn(undefined)).toBe(1)
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

  it('drops on a month day and keeps the wall time and duration', () => {
    const day = document.createElement('div')
    day.dataset.agendaDate = '2026-10-20'
    const chip = document.createElement('button')
    expect(dropSlot([chip, day], '2026-10-05')).toMatchObject({
      date: '2026-10-20',
      month: true,
    })
    const event = {
      start: '2026-10-07T16:00:00Z',
      end: '2026-10-07T17:30:00Z',
    }
    expect(moveToDateTimes(event, '2026-10-20', MX)).toEqual({
      start: '2026-10-20T16:00:00.000Z',
      end: '2026-10-20T17:30:00.000Z',
    })
    expect(moveToDateTimes(event, '2026-10-07', MX)).toBeNull()
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
