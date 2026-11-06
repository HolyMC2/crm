// Proyectos (Shell SPEC §7 DE7): a project is a named group of pendientes
// with dates; the shell lists them, and one project reads as a lista, a
// tablero and a cronograma from the same Pendientes rows.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { hostedModules, moduleKeyFor } from '@/composables/muelleShell'
import { recoveryModule } from '@/utils/shellRoutes'
import {
  SECTIONS,
  dueLine,
  ganttModel,
  ganttScroll,
  isClosed,
  metaOf,
  normalizeScope,
  normalizeView,
  percentOf,
  progressText,
  proyectoError,
  proyectoRoute,
  rowTone,
  scopeLabel,
  sectionsOf,
  spanText,
  statusLabel,
} from '@/composables/useProyectos'
import Cronograma from '@/components/proyectos/Cronograma.vue'

const TODAY = '2026-11-05'
const row = (name, values = {}) => ({
  doctype: 'ToDo',
  name,
  description: `Tarea ${name}`,
  status: 'Open',
  state: 'open',
  modified: 'v1',
  mine: true,
  ...values,
})

describe('Proyectos module', () => {
  it('is hosted after Pendientes and recovers into itself', () => {
    const keys = hostedModules.map((m) => m.key)
    expect(keys.indexOf('proyectos')).toBe(keys.indexOf('pendientes') + 1)
    expect(hostedModules.find((m) => m.key === 'proyectos')?.to).toBe(
      '/proyectos',
    )
    expect(moduleKeyFor({ path: '/proyectos/PROJ-0001', meta: {} })).toBe(
      'proyectos',
    )
    expect(recoveryModule('/proyectos/PROJ-0001')).toBe('proyectos')
    expect(proyectoRoute('PROJ-0001', { list: 'all' })).toEqual({
      name: 'Proyecto',
      params: { name: 'PROJ-0001' },
      query: { list: 'all' },
    })
  })
  it('keeps unknown scopes and views on the defaults', () => {
    expect(normalizeScope('hold')).toBe('hold')
    expect(normalizeScope('x')).toBe('open')
    expect(normalizeView('gantt')).toBe('gantt')
    expect(normalizeView(undefined)).toBe('list')
    expect(scopeLabel('done')).toBe('Finished')
    expect(statusLabel('On hold')).toBe('On hold')
  })
})

describe('a project row', () => {
  it('says how its pendientes stand and what needs the eye', () => {
    expect(progressText({ total: 0 })).toBe('No pendientes yet')
    expect(progressText({ total: 8, done: 3 })).toBe('3 of 8 done')
    expect(percentOf({ total: 8, done: 3 })).toBe(38)
    expect(percentOf({ total: 0, percent_complete: 40 })).toBe(40)
    expect(
      dueLine({ status: 'Open', total: 8, done: 3, overdue: 2, late: false }),
    ).toBe('3 of 8 done · 2 overdue')
    expect(rowTone({ status: 'Open', total: 8, done: 3, overdue: 2 })).toBe(
      'danger',
    )
    expect(
      dueLine({ status: 'Open', total: 2, done: 0, next_due: '2026-11-20' }),
    ).toMatch(/^0 of 2 done · Next: /)
    expect(dueLine({ status: 'Open', total: 1, done: 0, late: true })).toBe(
      '1 of 1 done'.replace('1 of 1', '0 of 1') + ' · Past its end date',
    )
    expect(dueLine({ status: 'Completed', total: 3, done: 3 })).toBe('Finished')
    expect(rowTone({ status: 'Completed', late: true })).toBe('')
    expect(metaOf({ total: 4, done: 1 })).toBe('25 %')
    expect(spanText({})).toBe('')
    expect(
      spanText({ expected_start_date: '2026-11-01', expected_end_date: '' }),
    ).toMatch(/^From /)
  })
  it('groups rows into the list sections, empty ones left out', () => {
    const sections = sectionsOf(
      [
        row('a', { date: '2026-11-01' }),
        row('b', { date: TODAY }),
        row('c'),
        row('d', { status: 'Closed', date: '2026-11-01' }),
        row('e', { cancelled: true }),
      ],
      TODAY,
    )
    expect(sections.map((s) => s.key)).toEqual([
      'overdue',
      'today',
      'undated',
      'done',
    ])
    expect(sections.at(-1).rows.map((r) => r.name)).toEqual(['d', 'e'])
    expect(SECTIONS).toContain('upcoming')
  })
})

describe('cronograma', () => {
  it('spans at least two weeks from the earliest day and places a bar per dated row', () => {
    const model = ganttModel(
      [
        row('a', { start: '2026-11-03', date: '2026-11-06' }),
        row('b', { date: '2026-11-01' }),
        row('c'),
        row('d', { status: 'Closed', date: '2026-11-02' }),
      ],
      {
        project_name: 'Mes patrio',
        expected_start_date: '2026-11-01',
        expected_end_date: '2026-11-04',
      },
      TODAY,
      { dayWidth: 10 },
    )
    expect(model.from).toBe('2026-11-01')
    expect(model.to).toBe('2026-11-14')
    expect(model.days).toHaveLength(14)
    expect(model.width).toBe(140)
    expect(model.months).toEqual([
      { key: '2026-11', label: expect.any(String), days: 14 },
    ])
    expect(model.todayOffset).toBe(40)
    expect(model.project).toEqual({ left: 0, width: 40 })
    const bars = Object.fromEntries(model.bars.map((bar) => [bar.key, bar]))
    expect(bars['ToDo:a']).toMatchObject({ left: 20, width: 40, tone: 'open' })
    expect(bars['ToDo:b']).toMatchObject({ left: 0, width: 10, tone: 'late' })
    expect(bars['ToDo:d']).toMatchObject({ left: 10, width: 10, tone: 'done' })
    expect(model.undated.map((r) => r.name)).toEqual(['c'])
    expect(model.days[0].label).toBe('1')
    expect(model.days.filter((d) => d.weekend)).toHaveLength(4)
  })
  it('swaps a start after the due day and has nothing to draw without dates', () => {
    const swapped = ganttModel(
      [row('a', { start: '2026-11-09', date: '2026-11-07' })],
      null,
      '',
    )
    expect(swapped.bars[0]).toMatchObject({ left: 0, width: 3 * 28 })
    expect(swapped.todayOffset).toBeNull()
    const empty = ganttModel([row('x')], null, '')
    expect(empty.days).toEqual([])
    expect(empty.undated).toHaveLength(1)
  })
})

describe('a closed project', () => {
  it('is finished or cancelled, and says so instead of waiting for pendientes', () => {
    expect(isClosed({ status: 'Completed' })).toBe(true)
    expect(isClosed({ status: 'Cancelled' })).toBe(true)
    expect(isClosed({ status: 'On hold' })).toBe(false)
    expect(progressText({ status: 'Completed', total: 0 })).toBe(
      'No pendientes',
    )
    expect(progressText({ status: 'Open', total: 0 })).toBe('No pendientes yet')
  })
})

describe('where the cronograma opens', () => {
  it('opens two days before today, or at the first open bar when today is outside the window', () => {
    const planned = ganttModel(
      [row('a', { start: '2026-11-03', date: '2026-11-06' })],
      { expected_start_date: '2026-09-10', expected_end_date: '2026-10-05' },
      TODAY,
      { dayWidth: 10 },
    )
    expect(planned.todayOffset).toBeGreaterThan(0)
    expect(ganttScroll(planned, 10)).toBe(planned.todayOffset - 20)
    const past = ganttModel(
      [
        row('d', { status: 'Closed', date: '2026-11-02' }),
        row('a', { start: '2026-11-08', date: '2026-11-10' }),
      ],
      null,
      '',
      { dayWidth: 10 },
    )
    expect(past.todayOffset).toBeNull()
    expect(ganttScroll(past, 10)).toBe(40)
    expect(ganttScroll({ todayOffset: 5, bars: [] }, 10)).toBe(0)
  })
})

describe('Cronograma component', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
  })
  function mount(props) {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cronograma, props) })
    app.config.globalProperties.__ = globalThis.__
    app.component('RouterLink', {
      props: ['to'],
      setup:
        (p, { slots }) =>
        () =>
          h('a', { href: JSON.stringify(p.to) }, slots.default?.()),
    })
    app.mount(root)
  }
  it('draws one bar per dated row, names the undated ones and links each row to its pendiente', () => {
    mount({
      rows: [
        row('a', { start: '2026-11-03', date: '2026-11-06' }),
        row('b', { date: '2026-11-01' }),
        row('c'),
      ],
      project: { project_name: 'Mes patrio' },
      today: TODAY,
      query: { return_to: '/crm/proyectos/PROJ-1' },
    })
    expect(root.querySelectorAll('[data-cronograma-bar]')).toHaveLength(2)
    expect(root.querySelector('[data-cronograma-bar="late"]')).not.toBeNull()
    expect(
      root.querySelector('[data-cronograma-undated]').textContent,
    ).toContain('1 without a date')
    const link = root.querySelector('[data-cronograma-row="ToDo:a"]')
    expect(link.textContent).toContain('Tarea a')
    expect(link.getAttribute('href')).toContain(
      '"return_to":"/crm/proyectos/PROJ-1"',
    )
  })
  it('opens with today two days in from the name column', async () => {
    const rows = [row('a', { start: '2026-11-03', date: '2026-11-06' })]
    const project = {
      project_name: 'Mes patrio',
      expected_start_date: '2026-09-10',
      expected_end_date: '2026-10-05',
    }
    mount({ rows, project, today: TODAY, dayWidth: 10 })
    await nextTick()
    const model = ganttModel(rows, project, TODAY, { dayWidth: 10 })
    expect(root.querySelector('[data-cronograma]').scrollLeft).toBe(
      model.todayOffset - 20,
    )
  })
})

describe('errors', () => {
  it('names the project in a version conflict', () => {
    const error = new Error('x')
    error.exc_type = 'TimestampMismatchError'
    expect(proyectoError(error).title).toBe('This project changed')
  })
})
