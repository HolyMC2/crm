// The next-step chip trusts the server's `_v_next_step.overdue` (site clock)
// and only falls back to the browser clock when the row has no verdict.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { nextStepDisplay } from '@/utils/activityState'
import { nextStepRow } from '@/utils/dealsListSummary'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'

// Friday 2026-09-11, 10:00 local.
const NOW = new Date(2026, 8, 11, 10, 0, 0)

describe('nextStepDisplay', () => {
  it('falls back to the client computation without a flag', () => {
    expect(nextStepDisplay('2026-09-09 12:00:00', { now: NOW })).toEqual({
      state: 'overdue',
      label: 'Vencida · 2 d',
    })
    expect(
      nextStepDisplay('2026-09-11 15:00:00', { overdue: null, now: NOW }),
    ).toEqual({ state: 'today', label: 'Hoy 15:00' })
    expect(nextStepDisplay('', { now: NOW }).state).toBe('none')
  })

  it('shows overdue when the server says so, though the browser clock is behind', () => {
    // browser thinks it is 10:00, the site already passed 15:00
    expect(
      nextStepDisplay('2026-09-11 15:00:00', {
        overdue: true,
        days: 0,
        now: NOW,
      }),
    ).toEqual({ state: 'overdue', label: 'Vencida' })
    // a day late on the site calendar, browser still on the due day
    expect(
      nextStepDisplay('2026-09-11 15:00:00', {
        overdue: true,
        days: -1,
        now: NOW,
      }),
    ).toEqual({ state: 'overdue', label: 'Vencida · 1 d' })
  })

  it('keeps the client wording (hours) when both clocks agree it is late', () => {
    expect(
      nextStepDisplay('2026-09-11 07:00:00', {
        overdue: true,
        days: 0,
        now: NOW,
      }),
    ).toEqual({ state: 'overdue', label: 'Vencida · 3 h' })
  })

  it('never turns red when the server says it is not overdue', () => {
    // browser clock ahead of the site: due 09:00 today looks past to it
    expect(
      nextStepDisplay('2026-09-11 09:00:00', {
        overdue: false,
        days: 0,
        now: NOW,
      }),
    ).toEqual({ state: 'today', label: 'Hoy 09:00' })
    expect(
      nextStepDisplay('2026-09-12 09:00:00', {
        overdue: false,
        days: 1,
        now: NOW,
      }),
    ).toEqual({ state: 'planned', label: 'Mañana' })
    expect(
      nextStepDisplay('2026-09-15 09:00:00', {
        overdue: false,
        days: 4,
        now: NOW,
      }).label,
    ).toBe('En 4 d')
    expect(
      nextStepDisplay('2026-10-20 09:00:00', { overdue: false, now: NOW }),
    ).toEqual({ state: 'planned', label: '20 oct' })
  })
})

describe('nextStepRow carries the verdict to the cell', () => {
  it('passes overdue/days when present and null when absent', () => {
    const row = nextStepRow(
      { name: 'D-1' },
      { at: '2026-09-11 15:00:00', task: 'T-1', overdue: true, days: -2 },
    )
    expect(row.next_activity_overdue).toBe(true)
    expect(row.next_activity_days).toBe(-2)
    const plain = nextStepRow(
      { name: 'D-1' },
      { at: '2026-09-11 15:00:00', task: 'T-1' },
    )
    expect(plain.next_activity_overdue).toBeNull()
    expect(plain.next_activity_days).toBeNull()
  })
})

describe('NextActivityChip', () => {
  const apps = []
  afterEach(() => {
    apps.splice(0).forEach((a) => a.unmount())
    vi.useRealTimers()
  })

  async function render(props) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render: () => h(NextActivityChip, props) })
    app.mount(el)
    apps.push(app)
    await nextTick()
    return el
  }

  it('paints the server verdict, not the browser clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const flagged = await render({
      at: '2026-09-11 15:00:00',
      overdue: true,
      days: 0,
    })
    expect(flagged.innerHTML).toContain('bg-surface-red-1')
    expect(flagged.textContent).toContain('Vencida')

    const unflagged = await render({ at: '2026-09-11 15:00:00' })
    expect(unflagged.innerHTML).toContain('bg-surface-amber-1')
    expect(unflagged.textContent).toContain('Hoy 15:00')

    const notLate = await render({
      at: '2026-09-11 09:00:00',
      overdue: false,
      days: 0,
    })
    expect(notLate.innerHTML).toContain('bg-surface-amber-1')
    expect(notLate.innerHTML).not.toContain('bg-surface-red-1')
  })
})
