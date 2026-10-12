import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import {
  dayRange,
  daySegments,
  durationText,
  eventDates,
  isBar,
  layoutDay,
  monthWeeks,
  packBars,
  placeCard,
  snap,
  wallInstant,
  wallParts,
} from '@/components/agenda/agendaGrid'
import {
  defaultCalendarColor,
  eventColor,
  normalizeHex,
  textOn,
} from '@/components/agenda/agendaColors'
import { cleanPrefs, DEFAULT_PREFS } from '@/composables/useAgendaPrefs'
import {
  calendarKey,
  createRangeCache,
  sourcesFor,
  taskToEvent,
} from '@/composables/useAgenda'

const MX = 'America/Mexico_City'
const ev = (id, start, end, extra = {}) => ({
  id,
  source: 'Event',
  title: id,
  start,
  end,
  ...extra,
})

describe('wall time in the business zone', () => {
  it('reads date and minutes and builds instants back, midnight included', () => {
    expect(wallParts('2026-10-07T15:30:00Z', MX)).toEqual({
      date: '2026-10-07',
      minutes: 570,
    })
    expect(wallInstant('2026-10-07', 570, MX)).toBe('2026-10-07T15:30:00.000Z')
    expect(wallInstant('2026-10-07', 1440, MX)).toBe('2026-10-08T06:00:00.000Z')
  })

  it('treats a midnight end as exclusive and long events as bars', () => {
    const allDay = ev('A', '2026-10-07T06:00:00Z', '2026-10-09T06:00:00Z', {
      allDay: true,
    })
    expect(eventDates(allDay, MX)).toMatchObject({
      first: '2026-10-07',
      last: '2026-10-08',
    })
    expect(isBar(allDay)).toBe(true)
    expect(isBar(ev('B', '2026-10-07T15:00:00Z', '2026-10-07T16:00:00Z'))).toBe(
      false,
    )
    expect(isBar(ev('C', '2026-10-07T15:00:00Z', '2026-10-08T16:00:00Z'))).toBe(
      true,
    )
  })
})

describe('time grid layout', () => {
  const dates = ['2026-10-07', '2026-10-08']

  it('splits an overnight event into one segment per day', () => {
    const night = ev('N', '2026-10-08T03:00:00Z', '2026-10-08T08:00:00Z') // 21:00 → 02:00
    const segments = daySegments([night], dates, MX)
    expect(segments['2026-10-07']).toMatchObject([
      { start: 1260, end: 1440, after: true },
    ])
    expect(segments['2026-10-08']).toMatchObject([
      { start: 0, end: 120, before: true },
    ])
  })

  it('shares the width between overlaps and stretches over free columns', () => {
    const rows = layoutDay([
      { event: ev('A', '', ''), start: 540, end: 660 },
      { event: ev('B', '', ''), start: 570, end: 600 },
      { event: ev('C', '', ''), start: 610, end: 640 },
      { event: ev('D', '', ''), start: 700, end: 760 },
    ])
    const by = Object.fromEntries(rows.map((row) => [row.event.id, row]))
    expect(by.A).toMatchObject({ col: 0, cols: 2, span: 1 })
    expect(by.B).toMatchObject({ col: 1, cols: 2 })
    expect(by.C).toMatchObject({ col: 1, cols: 2 })
    expect(by.D).toMatchObject({ col: 0, cols: 1, span: 1 })
  })

  it('packs multi-day bars into the first free lane', () => {
    const week = [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]
    const day = (d) => `2026-10-${d}T06:00:00Z`
    const { bars, lanes } = packBars(
      [
        ev('Long', day('04'), day('08'), { allDay: true }),
        ev('Short', day('07'), day('08'), { allDay: true }),
        ev('Late', day('09'), day('10'), { allDay: true }),
        {
          id: 'T',
          source: 'tasks',
          kind: 'task',
          date: '2026-10-06',
          title: 'Task',
        },
      ],
      week,
      MX,
    )
    const by = Object.fromEntries(bars.map((bar) => [bar.event.id, bar]))
    expect(by.Long).toMatchObject({ from: 0, to: 2, before: true, lane: 0 })
    expect(by.Late).toMatchObject({ from: 4, to: 4, lane: 0 })
    expect(by.Short.lane).toBe(1)
    expect(by.T.lane).toBe(1)
    expect(lanes).toBe(2)
  })

  it('snaps to quarter hours inside the day', () => {
    expect(snap(52)).toBe(45)
    expect(snap(-20)).toBe(0)
    expect(snap(1500)).toBe(1440)
    expect(durationText(90)).toBe('1 h 30 min')
    expect(durationText(45)).toBe('45 min')
  })
})

describe('month and selections', () => {
  it('draws only the weeks that hold the month, from the chosen week start', () => {
    const weeks = monthWeeks('2026-10-14', 1)
    expect(weeks[0][0]).toBe('2026-09-28')
    expect(weeks.at(-1).at(-1)).toBe('2026-11-01')
    expect(weeks).toHaveLength(5)
    expect(monthWeeks('2026-10-14', 0)[0][0]).toBe('2026-09-27')
  })

  it('selects every day between two dragged days in either direction', () => {
    expect(dayRange('2026-10-09', '2026-10-07')).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ])
  })

  it('places a card right of its anchor, else left, always on screen', () => {
    const viewport = { width: 1200, height: 800 }
    const size = { width: 400, height: 300 }
    expect(
      placeCard(
        { left: 100, right: 300, top: 100, width: 200 },
        size,
        viewport,
      ),
    ).toEqual({ left: 312, top: 100 })
    expect(
      placeCard(
        { left: 900, right: 1100, top: 700, width: 200 },
        size,
        viewport,
      ),
    ).toEqual({ left: 488, top: 492 })
    expect(placeCard(null, size, viewport).left).toBe(400)
  })
})

describe('colors and calendars', () => {
  it('normalizes colors and picks a readable text color', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('red')).toBe('')
    expect(textOn('#f6bf26')).toBe('#1f1f1f')
    expect(textOn('#3f51b5')).toBe('#ffffff')
  })

  it('an event color beats its type color, which beats its calendar', () => {
    expect(eventColor({ color: '#d50000' }, '#039be5')).toBe('#d50000')
    expect(eventColor({ appointmentTypeColor: '#33b679' }, '#039be5')).toBe(
      '#33b679',
    )
    expect(eventColor({}, '#8e24aa')).toBe('#8e24aa')
    expect(defaultCalendarColor('Turno')).toBe('#616161')
  })

  it('maps events to calendars and calendars to the sources to load', () => {
    expect(calendarKey({ source: 'Event', kind: 'cita' })).toBe('Event:cita')
    expect(calendarKey({ source: 'Turno' })).toBe('Turno')
    expect(calendarKey({ kind: 'task', source: 'tasks' })).toBe('tasks')
    expect(
      sourcesFor(['Event:cita', 'tasks', 'Turno', 'Nope'], ['Event', 'Turno']),
    ).toEqual(['Event', 'Turno'])
  })

  it('turns a pendiente into an all-day calendar task', () => {
    const task = taskToEvent(
      {
        doctype: 'CRM Task',
        name: 12,
        date: '2026-10-07',
        description: 'Call',
        status: 'Open',
        modified: 'x',
      },
      MX,
    )
    expect(task).toMatchObject({
      id: 'CRM Task:12',
      kind: 'task',
      allDay: true,
      status: 'Scheduled',
      draggable: true,
    })
    expect(task.start).toBe('2026-10-07T06:00:00.000Z')
  })

  it('keeps only valid preferences from storage', () => {
    const prefs = cleanPrefs({
      view: 'year',
      density: 'spacious',
      colors: { Event: '#ABC', bad: 'nope' },
      hidden: ['Turno', 3],
      weekStart: 9,
    })
    expect(prefs.view).toBe(DEFAULT_PREFS.view)
    expect(prefs.density).toBe('spacious')
    expect(prefs.colors).toEqual({ Event: '#aabbcc' })
    expect(prefs.hidden).toEqual(['Turno'])
    expect(prefs.weekStart).toBeNull()
    expect(cleanPrefs(null).hidden).toContain('Turno')
  })

  it('caches ranges and forgets the oldest', () => {
    const cache = createRangeCache(2)
    const r = (n) => ({ start: `s${n}`, end: `e${n}` })
    for (const n of [1, 2, 3]) cache.set(cache.key('Event', r(n)), [n])
    expect(cache.get(cache.key('Event', r(1)))).toBeUndefined()
    expect(cache.get(cache.key('Event', r(3))).value).toEqual([3])
  })
})

describe('phone swipe paging', () => {
  it('commits a long or quick horizontal swipe, springs back a short one', async () => {
    const { swipeOutcome, swipeAxis } = await import(
      '@/components/agenda/agendaSwipe'
    )
    expect(swipeOutcome(-120, 400, 390)).toBe(1)
    expect(swipeOutcome(120, 400, 390)).toBe(-1)
    expect(swipeOutcome(-50, 400, 390)).toBe(0)
    expect(swipeOutcome(-50, 60, 390)).toBe(1)
    expect(swipeAxis(4, 3)).toBe('')
    expect(swipeAxis(30, 5)).toBe('x')
    expect(swipeAxis(12, 30)).toBe('y')
  })

  it('keys a doctor or technician calendar by source and person', async () => {
    const { calendarKey, splitCalendarKey, sourcesFor } = await import(
      '@/composables/useAgenda'
    )
    expect(
      calendarKey({ source: 'Patient Appointment', resourceIds: ['DR-1'] }),
    ).toBe('Patient Appointment/DR-1')
    expect(
      calendarKey({ source: 'Taller', resourceIds: ['beto@example.test'] }),
    ).toBe('Taller/beto@example.test')
    expect(splitCalendarKey('Taller/beto@example.test')).toEqual({
      source: 'Taller',
      resource: 'beto@example.test',
    })
    expect(splitCalendarKey('Event:cita').resource).toBeNull()
    expect(
      sourcesFor(
        ['Patient Appointment/DR-1', 'Taller/x', 'Event'],
        ['Event', 'Patient Appointment', 'Taller'],
      ),
    ).toEqual(['Patient Appointment', 'Taller', 'Event'])
  })
})
