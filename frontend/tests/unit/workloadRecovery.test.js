import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { workloadError } from '@/utils/workloadError'
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  leave: null,
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
    onBeforeRouteLeave: (callback) => {
      mocks.leave = callback
    },
    useRoute: () => route,
    useRouter: () => ({ push: go('push'), replace: go('replace') }),
  }
})
import WorkloadView from '@/pages/WorkloadView.vue'
const cleanups = []
beforeEach(() => {
  mocks.call.mockReset()
  mocks.leave = null
  mocks.navigations.length = 0
  if (mocks.route) mocks.route.query = {}
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
  await vi.waitFor(() => expect(mocks.call).toHaveBeenCalled())
  await nextTick()
  return el
}
const workload = {
  agents: [{ user: 'seller@example.test', full_name: 'Ana', open_total: 1 }],
  capacity: { cap: 5 },
  unassigned: {},
  candidates: [
    { user: 'target@example.test', full_name: 'Beto', eligible: true },
  ],
}

describe('workload recovery', () => {
  it.each([
    [{ exc_type: 'PermissionError' }, 'permission'],
    [{ status: 403 }, 'permission'],
    [{ status: 401 }, 'session'],
    [{ exc_type: 'AuthenticationError' }, 'session'],
    [{ exc_type: 'ModuleNotFoundError' }, 'unavailable'],
    [{ status: 503 }, 'unavailable'],
    [
      { status: 500, message: 'Permission lookup failed internally' },
      'transient',
    ],
    [new TypeError('Failed to fetch'), 'transient'],
  ])(
    'classifies structured errors without mistaking server failures for denied access',
    (error, kind) => {
      expect(workloadError(error)).toBe(kind)
    },
  )

  it('shows connection recovery, retries, then displays the real empty state', async () => {
    mocks.call
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ agents: [] })
    const el = await mount()
    expect(el.textContent).toContain('Revisa tu conexión')
    expect(el.textContent).not.toContain('requiere permiso de gerente')
    expect(el.textContent).not.toContain('Nadie en la rotación')
    el.querySelector('[role="alert"] button').click()
    await vi.waitFor(() =>
      expect(el.textContent).toContain('Nadie en la rotación'),
    )
    expect(el.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows a true manager denial and can recover after permissions change', async () => {
    mocks.call
      .mockRejectedValueOnce({ exc_type: 'PermissionError', status: 403 })
      .mockResolvedValueOnce(workload)
    const el = await mount()
    expect(el.textContent).toContain('requiere permiso de gerente')
    el.querySelector('[role="alert"] button').click()
    await vi.waitFor(() => expect(el.textContent).toContain('Ana'))
    expect(el.querySelector('[role="alert"]')).toBeNull()
  })

  it('separates unavailable service from an empty rotation', async () => {
    mocks.call.mockRejectedValueOnce({ exc_type: 'ModuleNotFoundError' })
    const el = await mount()
    expect(el.textContent).toContain('El servicio no está disponible')
    expect(el.textContent).not.toContain('Nadie en la rotación')
  })

  it('keeps a failed conversation load out of the empty state and allows retry', async () => {
    let itemCalls = 0
    mocks.call.mockImplementation(async (url) => {
      if (url.endsWith('get_workload')) return workload
      if (++itemCalls === 1) throw new TypeError('Failed to fetch')
      return { items: [], total: 0 }
    })
    const el = await mount()
    await vi.waitFor(() =>
      expect(el.textContent).toContain(
        'No se pudieron cargar las conversaciones',
      ),
    )
    expect(el.textContent).not.toContain('Sin conversaciones')
    el.querySelector('[role="alert"] button').click()
    await vi.waitFor(() =>
      expect(el.textContent).toContain('Sin conversaciones'),
    )
    expect(itemCalls).toBe(2)
  })

  it('retains only failed commands with their original version after partial reassignment', async () => {
    const records = [1, 2].map((number) => ({
      doctype: 'CRM Deal',
      name: `deal-${number}`,
      label: `Deal ${number}`,
      owner: 'seller@example.test',
      modified: `2026-09-26 10:00:0${number}`,
    }))
    const commands = records.map(({ doctype, name, owner, modified }) => ({
      doctype,
      name,
      owner,
      modified,
    }))
    mocks.call.mockImplementation(async (url) => {
      if (url.endsWith('get_workload')) return workload
      if (url.endsWith('get_work_items')) return { items: records, total: 2 }
      return {
        results: [
          { ...commands[0], ok: true },
          {
            ...commands[1],
            ok: false,
            error: 'This record changed. Reload it before reassigning.',
          },
        ],
      }
    })
    const el = await mount()
    await vi.waitFor(() =>
      expect(el.querySelectorAll('input[type="checkbox"]')).toHaveLength(2),
    )
    el.querySelectorAll('input[type="checkbox"]').forEach((input) =>
      input.click(),
    )
    // The reassignment bar appears once something is selected.
    await nextTick()
    const target = [...el.querySelectorAll('select')].at(-1)
    target.value = 'target@example.test'
    target.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    const move = [...el.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Reasignar selección'),
    )
    move.click()
    await vi.waitFor(() =>
      expect(el.textContent).toContain('This record changed.'),
    )
    expect(el.textContent).toContain('1 seleccionados')
    expect(el.textContent).toContain(
      'Responsables de tareas vinculadas conservados',
    )
    expect(mocks.call).toHaveBeenCalledWith('crm.api.workload.reassign_bulk', {
      items: commands,
      target: 'target@example.test',
      filters: { pipeline: '', company: '' },
    })
    const moveAgain = () =>
      [...el.querySelectorAll('button')].find((button) =>
        button.textContent.includes('Reasignar selección'),
      )
    await vi.waitFor(() => expect(moveAgain()?.disabled).toBe(false))
    moveAgain().click()
    await vi.waitFor(() =>
      expect(
        mocks.call.mock.calls.filter(([url]) => url.endsWith('reassign_bulk')),
      ).toHaveLength(2),
    )
    expect(
      mocks.call.mock.calls.filter(([url]) =>
        url.endsWith('reassign_bulk'),
      )[1][1].items,
    ).toEqual([commands[1]])
  })

  it('opens unassigned tasks with exact scope, and preserves pagination for return', async () => {
    sessionStorage.setItem(
      'crm.workload.queue.v2',
      JSON.stringify({
        pipeline: 'team-a',
        company: 'company-a',
        kind: 'tasks',
        owner: '',
        offset: 25,
      }),
    )
    mocks.call.mockImplementation(async (url) =>
      url.endsWith('get_workload')
        ? workload
        : { items: [], total: 26, has_more: false },
    )
    const el = await mount()
    await vi.waitFor(() =>
      expect(mocks.call).toHaveBeenCalledWith(
        'crm.api.workload.get_work_items',
        {
          filters: { pipeline: 'team-a', company: 'company-a' },
          kind: 'tasks',
          owner: '',
          overdue: false,
          offset: 25,
        },
      ),
    )
    expect(el.textContent).toContain('Página 2')
    expect(el.textContent).toContain('Cola · Sin asignar')
    expect(el.querySelector('a[href="/app/assignment-rule"]')).not.toBeNull()
  })
  it('does not fabricate empty totals or capacity while the first response is delayed', async () => {
    let resolve
    mocks.call.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const el = await mount()
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Cargando el alcance seleccionado',
    )
    expect(el.textContent).not.toContain('Sin límite orientativo')
    expect(el.textContent).not.toContain('Leads abiertos')
    resolve({ agents: [] })
  })

  it('hides prior counts and rows while a new scope response is delayed', async () => {
    let resolveScope
    mocks.call.mockImplementation(async (url, args) => {
      if (url.endsWith('get_workload')) {
        if (args.filters.pipeline === 'next')
          return new Promise((resolve) => {
            resolveScope = resolve
          })
        return {
          ...workload,
          summary: { open_deals: 41 },
          pipelines: [{ name: 'next', label: 'Next scope' }],
        }
      }
      if (args.filters.pipeline === 'next') return { items: [], total: 0 }
      return {
        items: [
          {
            doctype: 'CRM Deal',
            name: 'old-scope',
            label: 'Old scope row',
            modified: 'old',
            owner: '',
          },
        ],
        total: 1,
      }
    })
    const el = await mount()
    await vi.waitFor(() => expect(el.textContent).toContain('Old scope row'))
    const pipeline = el.querySelector('select')
    pipeline.value = 'next'
    pipeline.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(el.querySelector('[role="status"]')).not.toBeNull()
    expect(el.textContent).not.toContain('Old scope row')
    expect(el.textContent).not.toContain('41')
    resolveScope({ agents: [], summary: { open_deals: 0 } })
  })

  it('blocks route/record leave and warns before unload while reassignment is uncertain', async () => {
    let finish
    const record = {
      doctype: 'CRM Deal',
      name: 'pending',
      label: 'Pending record',
      owner: '',
      modified: 'old',
    }
    mocks.call.mockImplementation(async (url) => {
      if (url.endsWith('get_workload')) return workload
      if (url.endsWith('get_work_items')) return { items: [record], total: 1 }
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const el = await mount()
    await vi.waitFor(() =>
      expect(el.querySelector('input[type="checkbox"]')).not.toBeNull(),
    )
    el.querySelector('input[type="checkbox"]').click()
    await nextTick()
    const target = [...el.querySelectorAll('select')].at(-1)
    target.value = 'target@example.test'
    target.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    ;[...el.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Reasignar selección'))
      .click()
    await nextTick()
    expect(mocks.leave()).toBe(false)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.querySelector('a[href="/crm/deals/pending"]').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(el.textContent).toContain('1 seleccionados')
    finish({ results: [{ ...record, ok: false, error: 'Reload this record' }] })
    await vi.waitFor(() => expect(mocks.leave()).toBe(true))
    expect(el.textContent).toContain('1 seleccionados')
  })
})
