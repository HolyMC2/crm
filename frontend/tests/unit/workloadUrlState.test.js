import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  route: null,
  navigations: [],
}))
vi.mock('frappe-ui', () => ({ call: mocks.call }))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ path: '/workload', query: {} })
  mocks.route = route
  const go = (method) => (location) => {
    mocks.navigations.push([method, location.query])
    route.query = { ...location.query }
    return Promise.resolve()
  }
  return {
    onBeforeRouteLeave: () => {},
    useRoute: () => route,
    useRouter: () => ({ push: go('push'), replace: go('replace') }),
  }
})
import WorkloadView from '@/pages/WorkloadView.vue'

const asOf = '2026-09-28 10:00:00'
const workload = {
  as_of: asOf,
  agents: [
    {
      user: 'calm@example.test',
      full_name: 'Calm',
      open_total: 1,
      open_tasks: 0,
      overdue_tasks: 0,
      due_today: 0,
    },
    {
      user: 'late@example.test',
      full_name: 'Late',
      open_total: 2,
      open_tasks: 3,
      overdue_tasks: 2,
      due_today: 1,
    },
  ],
  total_agents: 2,
  capacity: { cap: 10 },
  unassigned: {},
  summary: { open_tasks: 3, overdue_tasks: 2, due_today: 1 },
  candidates: [],
  scope: 'team',
  can_reassign: true,
}
const itemCalls = () =>
  mocks.call.mock.calls
    .filter(([url]) => url.endsWith('get_work_items'))
    .map(([, args]) => args)

const cleanups = []
beforeEach(() => {
  mocks.call.mockReset()
  mocks.navigations.length = 0
  mocks.route.query = {}
  sessionStorage.clear()
})
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp(WorkloadView)
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await vi.waitFor(() => expect(el.textContent).toContain('Cola'))
  return el
}

describe('workload URL state', () => {
  beforeEach(() => {
    mocks.call.mockImplementation(async (url, args) => {
      if (url.endsWith('get_workload')) return workload
      // Due-today queue: one task due later today for Late.
      if (args.due_today)
        return {
          items: [
            {
              doctype: 'CRM Task',
              name: '7',
              label: 'Call back',
              owner: 'late@example.test',
              status: 'Todo',
              modified: '2026-09-20 09:00:00',
              due_date: '2026-09-28 16:00:00',
            },
          ],
          total: 1,
          has_more: false,
        }
      return { items: [], total: 2, has_more: false }
    })
  })

  it('surfaces the person with overdue work first and shows the server due-today counts', async () => {
    const el = await mount()
    const people = [...el.querySelectorAll('[data-person]')].map((row) =>
      row.getAttribute('data-person'),
    )
    expect(people).toEqual(['late@example.test', 'calm@example.test'])
    const late = el.querySelector('[data-person="late@example.test"]')
    expect(
      late.querySelector('[aria-label="Late: Vencen hoy 1"]'),
    ).not.toBeNull()
    const calm = el.querySelector('[data-person="calm@example.test"]')
    expect(
      calm.querySelector('[aria-label="Calm: Vencen hoy 0"]'),
    ).not.toBeNull()
    // No client-side scan: the only item request is the visible queue.
    await vi.waitFor(() => expect(itemCalls()).toHaveLength(1))
    expect(itemCalls()[0]).toMatchObject({ kind: 'deals', due_today: false })
    expect(el.textContent).not.toContain('parcial')
    expect(el.textContent).not.toContain('1+')
  })

  it('shows — and keeps the bucket closed when the server sends no due-today count', async () => {
    const legacy = {
      ...workload,
      agents: workload.agents.map((agent) => {
        const copy = { ...agent }
        delete copy.due_today
        return copy
      }),
      summary: { open_tasks: 3, overdue_tasks: 2 },
    }
    mocks.call.mockImplementation(async (url) =>
      url.endsWith('get_workload')
        ? legacy
        : { items: [], total: 0, has_more: false },
    )
    const el = await mount()
    const stat = el.querySelector('[aria-label="Late: Vencen hoy —"]')
    expect(stat).not.toBeNull()
    expect(stat.disabled).toBe(true)
    await vi.waitFor(() => expect(itemCalls()).toHaveLength(1))
  })

  it('opens a person bucket, writes it to the URL, and Back restores the previous queue', async () => {
    const el = await mount()
    const late = el.querySelector('[data-person="late@example.test"]')
    late.querySelector('[aria-label="Late: Vencidas 2"]').click()
    await vi.waitFor(() =>
      expect(itemCalls().at(-1)).toEqual({
        filters: { pipeline: '', company: '' },
        kind: 'tasks',
        owner: 'late@example.test',
        overdue: true,
        due_today: false,
        offset: 0,
      }),
    )
    expect(mocks.navigations.at(-1)).toEqual([
      'push',
      { owner: 'late@example.test', kind: 'tasks', bucket: 'overdue' },
    ])
    expect(el.textContent).toContain('Cola · Late')
    expect(
      JSON.parse(sessionStorage.getItem('crm.workload.queue.v2')),
    ).toMatchObject({ owner: 'late@example.test', bucket: 'overdue' })

    // Browser Back: the route query returns to the default queue.
    mocks.route.query = {}
    await vi.waitFor(() => expect(el.textContent).toContain('Cola · Todos'))
    expect(itemCalls().at(-1)).toMatchObject({
      kind: 'deals',
      owner: null,
      overdue: false,
    })
  })

  it('restores a shared link, including the due-today bucket', async () => {
    mocks.route.query = {
      owner: 'late@example.test',
      kind: 'tasks',
      bucket: 'today',
    }
    const el = await mount()
    await vi.waitFor(() => expect(el.textContent).toContain('Call back'))
    const calls = itemCalls().filter(
      (args) => args.owner === 'late@example.test',
    )
    // One server-filtered request for the bucket; no scan past overdue rows.
    expect(calls).toEqual([
      {
        filters: { pipeline: '', company: '' },
        kind: 'tasks',
        owner: 'late@example.test',
        overdue: false,
        due_today: true,
        offset: 0,
      },
    ])
    expect(el.textContent).toContain('1 registros en total')
    expect(mocks.navigations).toEqual([])
  })
})

describe('workload for a person without the manager role', () => {
  const own = {
    ...workload,
    agents: [
      { ...workload.agents[1], user: 'me@example.test', full_name: 'Yo' },
    ],
    total_agents: 1,
    candidates: [],
    scope: 'self',
    can_reassign: false,
  }
  const row = {
    doctype: 'CRM Deal',
    name: 'CRM-DEAL-1',
    label: 'Mi deal',
    owner: 'me@example.test',
    status: 'Open',
    modified: '2026-09-27 09:00:00',
  }
  beforeEach(() => {
    mocks.call.mockImplementation(async (url) =>
      url.endsWith('get_workload')
        ? own
        : { items: [row], total: 1, has_more: false },
    )
  })

  it('shows only their own row and queue, without selection or reassignment', async () => {
    mocks.route.query = { owner: 'late@example.test' }
    const el = await mount()
    await vi.waitFor(() => expect(el.textContent).toContain('Mi deal'))
    expect(el.querySelector('h1').textContent).toContain('Tu carga de trabajo')
    expect(
      el.querySelector('[data-testid="self-view-note"]').textContent,
    ).toContain('Reasignar registros a otra persona es tarea de un gerente')
    expect(el.textContent).toContain('Tu resumen')
    expect(el.textContent).not.toContain('Personas ·')
    expect(
      [...el.querySelectorAll('[data-person]')].map((r) => r.dataset.person),
    ).toEqual(['me@example.test'])
    expect(el.textContent).toContain('Cola · Yo')
    expect(el.textContent).not.toContain('Todos los propietarios')
    expect(el.querySelector('[data-row-check]')).toBeNull()
    expect(el.querySelector('[role="checkbox"]')).toBeNull()
    expect(el.textContent).not.toContain('Reasignar a')
    expect(
      mocks.call.mock.calls.some(([url]) => url.endsWith('reassign_bulk')),
    ).toBe(false)
  })
})
