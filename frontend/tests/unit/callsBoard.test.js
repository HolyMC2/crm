// The calls page's board (components/doco/calls/board.js and CallsBoard.vue):
// pickup against the goal, what happened to each missed call, the hour bars, and
// the tiles that narrow the list.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  hourBars,
  namesFor,
  pickupTile,
  verdictLine,
  verdictTone,
  waited,
  weekBars,
} from '@/components/doco/calls/board'
import CallsBoard from '@/components/doco/calls/CallsBoard.vue'

const hour = (h, answered = 0, missed = 0, open = h >= 9 && h < 20) => ({
  hour: h,
  answered,
  missed,
  open,
})

const BOARD = {
  hours_configured: true,
  goals: { pickup_goal: 80, callback_minutes: 30 },
  totals: {
    incoming: 42,
    answered: 22,
    incoming_open: 32,
    answered_open: 22,
    pickup_pct: 52,
    pickup_open_pct: 69,
    missed_open: 10,
    missed_closed: 10,
    messages: 2,
    waiting_numbers: 6,
    on_time_pct: 25,
  },
  by_hour: Array.from({ length: 24 }, (_, h) =>
    hour(h, h === 12 ? 4 : 0, h === 8 ? 3 : 0),
  ),
  weeks: [
    { start: '2026-11-16', incoming: 10, answered: 9, missed: 1 },
    { start: '2026-11-23', incoming: 4, answered: 1, missed: 3 },
  ],
  items: {
    a: { verdict: 'returned', minutes: 2, closed: false, message: false },
    b: { verdict: 'not_returned', minutes: null, closed: true, message: true },
    c: { verdict: 'late', minutes: 1440, closed: false, message: false },
  },
  waiting: ['b'],
  people: null,
}

describe('board figures', () => {
  it('says how long it took in words', () => {
    expect(waited(2)).toBe('2 min')
    expect(waited(65)).toBe('1 h 5 min')
    expect(waited(120)).toBe('2 h')
    expect(waited(3000)).toBe('2 d')
  })

  it('judges pickup inside office hours against the goal', () => {
    expect(pickupTile(BOARD)).toEqual({
      value: '69 %',
      hint: '22 de 32 en horario · meta 80 %',
      tone: 'danger',
    })
    const noHours = { ...BOARD, hours_configured: false }
    expect(pickupTile(noHours).value).toBe('52 %')
    expect(pickupTile(noHours).hint).toBe('22 de 42 · meta 80 %')
    expect(pickupTile({ totals: {}, goals: {} }).value).toBe('—')
  })

  it('tells what happened after each missed call', () => {
    expect(verdictLine(BOARD.items.a)).toBe('Devuelta en 2 min')
    expect(verdictLine(BOARD.items.b)).toBe(
      'Fuera de horario · Sin devolver · Dejó recado',
    )
    expect(verdictTone(BOARD.items.b)).toBe('danger')
    expect(verdictTone(BOARD.items.c)).toBe('warning')
    expect(verdictLine(null)).toBe('')
  })

  it('draws the hours from the first open or busy hour to the last', () => {
    const bars = hourBars(BOARD.by_hour)
    expect(bars[0].hour).toBe(8)
    expect(bars.at(-1).hour).toBe(19)
    expect(bars.find((b) => b.hour === 12).answeredPct).toBe(100)
    expect(bars.find((b) => b.hour === 8)).toMatchObject({
      missedPct: 75,
      open: false,
    })
    expect(hourBars([hour(3, 0, 0, false)])).toEqual([])
  })

  it('gives each week its pickup', () => {
    const weeks = weekBars(BOARD.weeks, { now: new Date(2026, 10, 26) })
    expect(weeks.map((w) => w.pct)).toEqual([90, 25])
    expect(weeks[1].label).toMatch(/23/)
  })

  it('narrows the list to a tile’s calls', () => {
    expect(namesFor(BOARD, 'waiting')).toEqual(['b'])
    expect(namesFor(BOARD, 'closed')).toEqual(['b'])
    expect(namesFor(BOARD, 'missed_open')).toEqual(['a', 'c'])
    expect(namesFor(BOARD, '')).toBeNull()
  })
})

describe('the board on the page', () => {
  const cleanups = []
  afterEach(() => cleanups.splice(0).forEach((c) => c()))

  async function mount(props) {
    const events = []
    const el = document.createElement('div')
    document.body.append(el)
    const app = createApp({
      render: () =>
        h(CallsBoard, {
          ...props,
          'onUpdate:focus': (v) => events.push(['focus', v]),
          onSettings: () => events.push(['settings']),
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    cleanups.push(() => {
      app.unmount()
      el.remove()
    })
    await nextTick()
    return { el, events }
  }

  it('a tile narrows the list and pressing it again clears it', async () => {
    const { el, events } = await mount({ board: BOARD, focus: '' })
    el.querySelector('[data-tile="waiting"]').click()
    expect(events).toEqual([['focus', 'waiting']])
    cleanups.splice(0).forEach((c) => c())
    const again = await mount({ board: BOARD, focus: 'waiting' })
    const tile = again.el.querySelector('[data-tile="waiting"]')
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    tile.click()
    expect(again.events).toEqual([['focus', '']])
  })

  it('a manager without office hours is offered to set them', async () => {
    const { el, events } = await mount({
      board: { ...BOARD, hours_configured: false, people: [] },
      canSetUp: true,
    })
    el.querySelector('[data-set-hours]').click()
    expect(events).toEqual([['settings']])
    expect(el.querySelector('[data-tile="closed"]')).not.toBeNull()
  })

  it('shows who took the calls only when the server sends people', async () => {
    const { el } = await mount({
      board: {
        ...BOARD,
        people: [{ user: 'tere', name: 'Tere', answered: 12, made: 3 }],
      },
    })
    expect(el.querySelector('[data-call-people]').textContent).toContain(
      'contestó 12 · llamó 3',
    )
  })
})
