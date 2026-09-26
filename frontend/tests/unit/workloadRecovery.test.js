import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
import { workloadError } from '@/utils/workloadError'
const mocks = vi.hoisted(() => ({ call: vi.fn(), resources: [] }))
vi.mock('frappe-ui', () => ({
  call: mocks.call,
  createListResource: () => {
    const resource = reactive({
      data: [],
      loading: false,
      reload: vi.fn().mockResolvedValue([]),
    })
    mocks.resources.push(resource)
    return resource
  },
  toast: { success: vi.fn(), error: vi.fn() },
  Dropdown: { template: '<div><slot /></div>' },
}))
import WorkloadView from '@/pages/WorkloadView.vue'
const cleanups = []
beforeEach(() => {
  mocks.call.mockReset()
  mocks.resources.length = 0
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
  cap: 5,
  unassigned: 0,
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
    mocks.call.mockResolvedValue(workload)
    const el = await mount()
    mocks.resources[0].reload.mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    )
    el.querySelector('[aria-expanded]').click()
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
    expect(mocks.resources[0].reload).toHaveBeenCalledTimes(2)
  })
})
