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
    },
    {
      user: 'late@example.test',
      full_name: 'Late',
      open_total: 2,
      open_tasks: 3,
      overdue_tasks: 2,
    },
  ],
  total_agents: 2,
  capacity: { cap: 10 },
  unassigned: {},
  summary: { open_tasks: 3, overdue_tasks: 2 },
  candidates: [],
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
      // Due-today scan / queue: one task due later today for Late.
      if (args.kind === 'tasks' && !args.overdue)
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

  it('surfaces the person with overdue work first and counts due-today tasks', async () => {
    const el = await mount()
    const people = [...el.querySelectorAll('[data-person]')].map((row) =>
      row.getAttribute('data-person'),
    )
    expect(people).toEqual(['late@example.test', 'calm@example.test'])
    // The scan starts right after the scope's overdue tasks.
    await vi.waitFor(() =>
      expect(itemCalls()).toContainEqual(
        expect.objectContaining({ kind: 'tasks', owner: null, offset: 2 }),
      ),
    )
    const late = el.querySelector('[data-person="late@example.test"]')
    await vi.waitFor(() =>
      expect(
        late.querySelector('[aria-label="Late: Vencen hoy 1"]'),
      ).not.toBeNull(),
    )
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
    // Count this queue's overdue rows, then read from right after them.
    expect(calls[0]).toMatchObject({ overdue: true, offset: 0 })
    expect(calls[1]).toMatchObject({ overdue: false, offset: 2 })
    expect(el.textContent).toContain('1 vencen hoy en esta página')
    expect(mocks.navigations).toEqual([])
  })
})
