// Phone all-day lanes (polish walk 2026-10-13, row T3): task bars were 20 px tall
// at 390 px. With `compact` they are 44 px tap targets in 46 px lanes; desktop
// keeps its 24 px lanes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import AgendaTimeGrid from '@/components/agenda/AgendaTimeGrid.vue'

const MX = 'America/Mexico_City'
const task = (id, date) => ({
  id,
  source: 'ToDo',
  kind: 'task',
  title: `Tarea ${id}`,
  date,
  start: `${date}T06:00:00.000Z`,
  end: `${date}T06:00:00.000Z`,
  allDay: true,
  status: 'Scheduled',
  draggable: true,
})

let app, root
function mount(props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(AgendaTimeGrid, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('AgendaTimeGrid all-day lanes', () => {
  for (const [compact, lane] of [
    [true, 46],
    [false, 24],
  ]) {
    it(`stacks two tasks in ${lane} px lanes when compact is ${compact}`, async () => {
      mount({
        dates: ['2026-10-13', '2026-10-14'],
        events: [task('A', '2026-10-13'), task('B', '2026-10-13')],
        colorOf: () => '#039be5',
        timeZone: MX,
        today: '2026-10-13',
        compact,
      })
      await nextTick()
      expect(
        root.querySelector('.ag-tg').classList.contains('is-compact'),
      ).toBe(compact)
      expect(root.querySelector('.ag-tg__alldayarea').style.height).toBe(
        `${2 * lane + 6}px`,
      )
      const tops = [...root.querySelectorAll('.ag-bar')].map(
        (bar) => bar.style.top,
      )
      expect(tops).toEqual(['2px', `${lane + 2}px`])
    })
  }
})
