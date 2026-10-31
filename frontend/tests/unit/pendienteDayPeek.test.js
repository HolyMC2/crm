// The pendiente editor's day peek: that day's Agenda by hour and the free hours a tap
// can take; a timed pendiente sits at its hour on the calendar.
import { describe, expect, it, vi } from 'vitest'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import { freeHours, peekItems } from '@/components/pendientes/dayPeek'
import { isBar } from '@/components/agenda/agendaGrid'
import { moveTaskTo, taskToEvent } from '@/composables/useAgenda'

const MX = 'America/Mexico_City'
const ev = (id, start, end, extra = {}) => ({
  id,
  source: 'Event',
  title: id,
  start,
  end,
  status: 'Scheduled',
  ...extra,
})

describe('the day peek', () => {
  it('lists the day by hour, whole-day items last, without the pendiente being edited', () => {
    const items = peekItems(
      [
        ev('Junta', '2026-10-20T17:00:00Z', '2026-10-20T18:00:00Z'),
        ev('Inventario', '2026-10-20T06:00:00Z', '2026-10-21T06:00:00Z', {
          allDay: true,
        }),
        ev('Visita', '2026-10-20T15:30:00Z', '2026-10-20T16:00:00Z'),
        ev('Cancelada', '2026-10-20T16:00:00Z', '2026-10-20T17:00:00Z', {
          status: 'Cancelled',
        }),
        ev('ToDo:7', '2026-10-20T19:00:00Z', '2026-10-20T19:30:00Z', {
          source: 'tasks',
          kind: 'task',
        }),
      ],
      MX,
      'ToDo:7',
    )
    expect(items.map((item) => [item.time, item.title])).toEqual([
      ['09:30', 'Visita'],
      ['11:00', 'Junta'],
      ['', 'Inventario'],
    ])
    expect(items[1].until).toBe('12:00')
  })

  it('offers the free hours of the working day, from the next hour today', () => {
    const items = [
      { time: '09:30', until: '10:00' },
      { time: '11:00', until: '12:30' },
      { time: '15:00', until: '', done: true },
      { time: '', until: '' },
    ]
    expect(
      freeHours(items, { date: '2026-10-20', today: '2026-10-19' }),
    ).toEqual(['10:00', '13:00', '14:00', '15:00'])
    expect(
      freeHours(items, {
        date: '2026-10-20',
        today: '2026-10-20',
        nowMinutes: 13 * 60 + 10,
        max: 9,
      }),
    ).toEqual(['14:00', '15:00', '16:00', '17:00', '18:00'])
  })
})

describe('a pendiente with a time on the calendar', () => {
  const row = (extra = {}) => ({
    doctype: 'ToDo',
    name: '7',
    date: '2026-10-20',
    description: 'Llamar a Ana',
    status: 'Open',
    modified: 'm1',
    ...extra,
  })

  it('sits at its hour for half an hour; without a time it stays a chip of its day', () => {
    const timed = taskToEvent(row({ time: '10:30' }), MX)
    expect(timed).toMatchObject({
      allDay: false,
      timed: true,
      time: '10:30',
      start: '2026-10-20T16:30:00.000Z',
      end: '2026-10-20T17:00:00.000Z',
    })
    expect(isBar(timed)).toBe(false)
    const day = taskToEvent(row({ time: null }), MX)
    expect(day).toMatchObject({ allDay: true, timed: false, time: '' })
    expect(isBar(day)).toBe(true)
  })

  it('moves through the editor writer: day and hour, or only the day keeping the hour', async () => {
    call.mockResolvedValue({})
    const event = taskToEvent(row({ time: '10:30' }), MX)
    await moveTaskTo(event, { date: '2026-10-21', time: '12:00' })
    expect(call).toHaveBeenLastCalledWith(
      'doco.pendientes.api.update',
      expect.objectContaining({
        doctype: 'ToDo',
        name: '7',
        modified: 'm1',
        values: { date: '2026-10-21', time: '12:00' },
      }),
    )
    await moveTaskTo(event, { date: '2026-10-22' })
    expect(call.mock.calls.at(-1)[1].values).toEqual({ date: '2026-10-22' })
  })
})
