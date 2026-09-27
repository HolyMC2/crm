import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  logs: vi.fn(),
  start: vi.fn(),
  initSocket: vi.fn(),
  toast: vi.fn(),
}))

// Exercise the actual dependency component and its real dataImport helper.
// Only the transport/API and UI leaves are doubled; no refresh logic is copied.
vi.mock('../../node_modules/frappe-ui/src/utils/call', () => ({
  default: (name, args) => {
    if (name.endsWith('.get_preview_from_template')) return api.preview(args)
    if (name.endsWith('.get_import_logs')) return api.logs(args)
    if (name.endsWith('.form_start_import')) return api.start(args)
    throw new Error(`Unexpected API method: ${name}`)
  },
}))
vi.mock('../../node_modules/frappe-ui/src/utils/socketio', () => ({
  default: api.initSocket,
}))
vi.mock('../../node_modules/frappe-ui/src/components/Toast/toast', () => ({
  toast: { error: api.toast },
}))
vi.mock(
  '../../node_modules/frappe-ui/src/components/Button/Button.vue',
  async () => {
    const { h } = await import('vue')
    return {
      default: {
        props: ['label', 'loading'],
        setup:
          (props, { attrs }) =>
          () =>
            h(
              'button',
              { ...attrs, disabled: Boolean(props.loading) },
              props.label,
            ),
      },
    }
  },
)
vi.mock('../../node_modules/frappe-ui/src/components/FeatherIcon.vue', () => ({
  default: { render: () => null },
}))
vi.mock(
  '../../node_modules/frappe-ui/src/components/Popover/Popover.vue',
  () => ({ default: { render: () => null } }),
)
vi.mock(
  '../../node_modules/frappe-ui/src/components/TabButtons/TabButtons.vue',
  () => ({ default: { render: () => null } }),
)

import PreviewStep from '../../node_modules/frappe-ui/frappe/DataImport/PreviewStep.vue'

const mounted = new Set()
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function socket() {
  const listeners = new Map()
  const value = {
    on: vi.fn((event, fn) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return value
    }),
    off: vi.fn((event, fn) => {
      listeners.get(event)?.delete(fn)
      return value
    }),
    disconnect: vi.fn(),
    fire(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload)
    },
    count(event) {
      return listeners.get(event)?.size || 0
    },
  }
  return value
}
function row(name = 'IMPORT-A', changes = {}) {
  return {
    name,
    reference_doctype: 'CRM Lead',
    status: 'Pending',
    import_file: '/private/files/fictional.csv',
    google_sheets_url: '',
    ...changes,
  }
}
function preview(label = 'CURRENT PREVIEW') {
  return {
    columns: [{ header_title: 'No' }, { header_title: 'Name' }],
    data: [[2, label]],
    warnings: [],
  }
}
function logs(label = 'CURRENT LOG') {
  return [{ row_indexes: '[2]', messages: '[]', success: 1, docname: label }]
}
async function flush() {
  // Finite microtask drain covers Vue's DOM queue and deferred API continuations.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount({ shared = socket(), data = row(), echo = true } = {}) {
  const state = reactive({ data })
  const resource = reactive({
    data: [{ ...data }],
    reload: vi.fn(async () => {}),
  })
  const updates = vi.fn()
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({
    render: () =>
      h(PreviewStep, {
        data: state.data,
        dataImports: resource,
        fields: {},
        doctypeMap: {},
        onUpdateStep: (...args) => {
          updates(...args)
          // The real DataImport parent's updateStep replaces data.value with newData.
          if (echo) state.data = args[1]
        },
      }),
  })
  if (shared) app.config.globalProperties.$socket = shared
  app.mount(element)
  const result = {
    app,
    element,
    shared,
    state,
    resource,
    updates,
    unmount() {
      if (!mounted.delete(result)) return
      app.unmount()
      element.remove()
    },
  }
  mounted.add(result)
  return result
}
function click(view, text) {
  const button = [...view.element.querySelectorAll('button')].find(
    (node) => node.textContent === text,
  )
  expect(button, `button ${text}`).toBeTruthy()
  button.click()
}
function lastUpdate(view) {
  return view.updates.mock.calls.at(-1)?.[1]
}

beforeEach(() => {
  vi.resetAllMocks()
  api.preview.mockImplementation(async () => preview())
  api.logs.mockImplementation(async () => logs())
  api.start.mockResolvedValue(undefined)
  api.initSocket.mockImplementation(() => socket())
})
afterEach(() => {
  for (const view of [...mounted]) view.unmount()
  vi.restoreAllMocks()
})

describe('real pinned DataImport PreviewStep realtime lifecycle', () => {
  it('uses the app socket without allocating or disconnecting another connection', async () => {
    const view = mount()
    await flush()
    expect(api.initSocket).not.toHaveBeenCalled()
    expect(view.shared.count('data_import_refresh')).toBe(1)
    expect(view.shared.count('connect')).toBe(1)
    view.unmount()
    expect(view.shared.count('data_import_refresh')).toBe(0)
    expect(view.shared.count('connect')).toBe(0)
    expect(view.shared.disconnect).not.toHaveBeenCalled()
  })

  it('repeated mounts remove only their exact handlers and retain sibling listeners', async () => {
    const shared = socket(),
      siblingRefresh = vi.fn(),
      siblingConnect = vi.fn()
    shared.on('data_import_refresh', siblingRefresh)
    shared.on('connect', siblingConnect)
    for (let i = 0; i < 3; i++) {
      const offset = shared.on.mock.calls.length
      const view = mount({ shared })
      await flush()
      const own = shared.on.mock.calls.slice(offset)
      expect(own).toHaveLength(2)
      view.unmount()
      for (const args of own) expect(shared.off).toHaveBeenCalledWith(...args)
      expect(shared.count('data_import_refresh')).toBe(1)
      expect(shared.count('connect')).toBe(1)
    }
    shared.fire('data_import_refresh', { data_import: 'IMPORT-A' })
    shared.fire('connect')
    expect(siblingRefresh).toHaveBeenCalledOnce()
    expect(siblingConnect).toHaveBeenCalledOnce()
    expect(shared.disconnect).not.toHaveBeenCalled()
    expect(api.initSocket).not.toHaveBeenCalled()
  })

  it('owns one fallback socket and disconnects it once on unmount', async () => {
    const fallback = socket()
    api.initSocket.mockReturnValue(fallback)
    const view = mount({ shared: null })
    await flush()
    expect(api.initSocket).toHaveBeenCalledOnce()
    view.unmount()
    view.unmount()
    expect(fallback.disconnect).toHaveBeenCalledOnce()
    expect(fallback.count('connect')).toBe(0)
    expect(fallback.count('data_import_refresh')).toBe(0)
  })

  it('catches up on initial connect and reconnect for the current import only', async () => {
    const view = mount()
    await flush()
    view.shared.fire('connect')
    await flush()
    expect(view.resource.reload).toHaveBeenCalledTimes(1)
    view.state.data = row('IMPORT-B')
    view.resource.data = [row('IMPORT-B', { status: 'Success' })]
    await flush()
    view.shared.fire('disconnect')
    view.shared.fire('connect') // Socket.IO fires connect again after reconnect.
    await flush()
    expect(view.resource.reload).toHaveBeenCalledTimes(2)
    expect(lastUpdate(view)).toMatchObject({
      name: 'IMPORT-B',
      status: 'Success',
    })
    expect(api.logs).toHaveBeenLastCalledWith({ data_import: 'IMPORT-B' })
  })

  it('ignores missing and unrelated import events', async () => {
    const view = mount()
    await flush()
    for (const payload of [undefined, {}, { data_import: 'IMPORT-B' }])
      view.shared.fire('data_import_refresh', payload)
    await flush()
    expect(view.resource.reload).not.toHaveBeenCalled()
    expect(view.updates).not.toHaveBeenCalled()
    expect(api.logs).not.toHaveBeenCalled()
  })

  it('awaits the actual reload before emitting its newly fetched import', async () => {
    const view = mount(),
      wait = deferred()
    view.resource.reload.mockImplementation(() => wait.promise)
    await flush()
    view.shared.fire('data_import_refresh', { data_import: 'IMPORT-A' })
    await flush()
    expect(view.resource.reload).toHaveBeenCalledOnce()
    expect(view.updates).not.toHaveBeenCalled()
    expect(api.logs).not.toHaveBeenCalled()
    view.resource.data = [
      row('IMPORT-A', { status: 'Success', marker: 'after reload' }),
    ]
    wait.resolve()
    await flush()
    expect(view.updates).toHaveBeenCalledWith(
      'preview',
      expect.objectContaining({ status: 'Success', marker: 'after reload' }),
    )
  })

  it('coalesces pending events and performs one trailing refresh with the latest data', async () => {
    const view = mount(),
      first = deferred(),
      second = deferred()
    view.resource.reload
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    await flush()
    for (let i = 0; i < 3; i++)
      view.shared.fire('data_import_refresh', { data_import: 'IMPORT-A' })
    expect(view.resource.reload).toHaveBeenCalledTimes(1)
    view.resource.data = [row('IMPORT-A', { status: 'Partial Success' })]
    first.resolve()
    await flush()
    expect(view.resource.reload).toHaveBeenCalledTimes(2)
    view.resource.data = [row('IMPORT-A', { status: 'Success' })]
    second.resolve()
    await flush()
    expect(view.updates).toHaveBeenCalledTimes(2)
    expect(lastUpdate(view).status).toBe('Success')
    expect(view.resource.reload).toHaveBeenCalledTimes(2)
  })

  it('renders reload failure and retries the same import through the visible Refresh action', async () => {
    const view = mount()
    await flush()
    view.resource.reload.mockRejectedValueOnce(new Error('offline'))
    view.shared.fire('data_import_refresh', { data_import: 'IMPORT-A' })
    await flush()
    expect(view.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not refresh',
    )
    expect(view.updates).not.toHaveBeenCalled()
    view.resource.data = [row('IMPORT-A', { status: 'Success' })]
    click(view, 'Refresh import')
    await flush()
    expect(view.resource.reload).toHaveBeenCalledTimes(2)
    expect(lastUpdate(view).name).toBe('IMPORT-A')
    expect(view.element.querySelector('[role="alert"]')).toBeNull()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('makes an initial preview failure visible and retries it without starting an import', async () => {
    const failure = new Error('preview unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.preview.mockRejectedValueOnce(failure)
    const view = mount()
    await flush()
    expect(api.toast).toHaveBeenCalledWith(failure)
    expect(consoleError).toHaveBeenCalledWith(
      'Error fetching preview data:',
      failure,
    )
    const alert = view.element.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert.textContent).toContain('Could not refresh')
    click(view, 'Refresh import')
    await flush()
    expect(api.preview).toHaveBeenCalledTimes(2)
    expect(view.element.textContent).toContain('CURRENT PREVIEW')
    expect(view.element.querySelector('[role="alert"]')).toBeNull()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('treats a disappeared import as an error rather than emitting an empty record', async () => {
    const view = mount()
    await flush()
    view.resource.data = []
    view.shared.fire('connect')
    await flush()
    expect(view.updates).not.toHaveBeenCalled()
    expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('does not emit or request logs after unmount while reload is pending', async () => {
    const view = mount(),
      wait = deferred()
    view.resource.reload.mockImplementation(() => wait.promise)
    await flush()
    view.shared.fire('connect')
    view.unmount()
    wait.resolve()
    await flush()
    expect(view.updates).not.toHaveBeenCalled()
    expect(api.logs).not.toHaveBeenCalled()
  })

  it('does not apply a late initial preview or load its logs after unmount', async () => {
    const wait = deferred()
    api.preview.mockReturnValueOnce(wait.promise)
    const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
    view.unmount()
    wait.resolve(preview('STALE UNMOUNTED'))
    await flush()
    expect(api.logs).not.toHaveBeenCalled()
    expect(view.updates).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('STALE UNMOUNTED')
  })

  it('does not emit the old import when identity changes during a pending reload', async () => {
    const view = mount(),
      wait = deferred()
    view.resource.reload.mockImplementation(() => wait.promise)
    await flush()
    view.shared.fire('connect')
    view.state.data = row('IMPORT-B')
    view.resource.data = [
      row('IMPORT-A', { status: 'Success' }),
      row('IMPORT-B'),
    ]
    await flush()
    wait.resolve()
    await flush()
    expect(view.updates).not.toHaveBeenCalled()
    expect(api.logs).not.toHaveBeenCalled()
  })

  it.each(['name', 'import_file', 'google_sheets_url'])(
    'discards a stale preview when %s changes',
    async (field) => {
      const old = deferred()
      api.preview
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(preview('NEW IDENTITY'))
      const view = mount()
      view.state.data = {
        ...view.state.data,
        [field]: field === 'name' ? 'IMPORT-B' : 'new-source',
      }
      await flush()
      old.resolve(preview('STALE IDENTITY'))
      await flush()
      expect(view.element.textContent).toContain('NEW IDENTITY')
      expect(view.element.textContent).not.toContain('STALE IDENTITY')
    },
  )

  it.each(['resolve', 'reject'])(
    'ignores older log %s after a newer log result',
    async (outcome) => {
      const old = deferred()
      api.logs
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue(logs('LATEST LOG'))
      const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
      await flush()
      expect(api.logs).toHaveBeenCalledOnce()
      view.shared.fire('connect')
      await flush()
      expect(view.element.textContent).toContain('LATEST LOG')
      if (outcome === 'resolve') old.resolve(logs('STALE LOG'))
      else old.reject(new Error('stale failure'))
      await flush()
      expect(view.element.textContent).toContain('LATEST LOG')
      expect(view.element.textContent).not.toContain('STALE LOG')
      expect(view.element.querySelector('[role="alert"]')).toBeNull()
    },
  )

  it('does not let an old log success clear a newer visible log error', async () => {
    const old = deferred()
    api.logs
      .mockReturnValueOnce(old.promise)
      .mockRejectedValue(new Error('latest log failure'))
    const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
    await flush()
    view.shared.fire('connect')
    await flush()
    expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
    old.resolve(logs('STALE LOG'))
    await flush()
    expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
    expect(view.element.textContent).not.toContain('STALE LOG')
  })

  it.each(['resolve', 'reject'])(
    'does not let older refresh logs %s clear a newer preview-log failure',
    async (outcome) => {
      const initialPreview = deferred(),
        oldLogs = deferred()
      api.preview.mockReturnValueOnce(initialPreview.promise)
      api.logs
        .mockReturnValueOnce(oldLogs.promise)
        .mockRejectedValue(new Error('newer preview logs failed'))
      const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
      view.shared.fire('connect')
      await flush()
      expect(api.logs).toHaveBeenCalledOnce()
      initialPreview.resolve(preview('LATEST PREVIEW'))
      await flush()
      expect(api.logs).toHaveBeenCalledTimes(2)
      expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
      if (outcome === 'resolve') oldLogs.resolve(logs('OUTDATED REFRESH LOG'))
      else oldLogs.reject(new Error('old refresh failure'))
      await flush()
      expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
      expect(view.element.textContent).not.toContain('OUTDATED REFRESH LOG')
    },
  )

  it('does not publish late logs after unmount', async () => {
    const old = deferred()
    api.logs.mockReturnValueOnce(old.promise)
    const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
    await flush()
    expect(api.logs).toHaveBeenCalledOnce()
    view.unmount()
    old.resolve(logs('UNMOUNTED LOG'))
    await flush()
    expect(document.body.textContent).not.toContain('UNMOUNTED LOG')
    expect(view.updates).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'])(
    'ignores a previous identity log %s',
    async (outcome) => {
      const old = deferred()
      api.logs
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue(logs('IDENTITY B LOG'))
      const view = mount({ data: row('IMPORT-A', { status: 'Error' }) })
      await flush()
      view.state.data = row('IMPORT-B', { status: 'Error' })
      await flush()
      expect(view.element.textContent).toContain('IDENTITY B LOG')
      if (outcome === 'resolve') old.resolve(logs('IDENTITY A LOG'))
      else old.reject(new Error('identity A failure'))
      await flush()
      expect(view.element.textContent).toContain('IDENTITY B LOG')
      expect(view.element.textContent).not.toContain('IDENTITY A LOG')
      expect(view.element.querySelector('[role="alert"]')).toBeNull()
      expect(view.updates).not.toHaveBeenCalled()
    },
  )

  it('starts once per pending click and reports a start failure without silently retrying', async () => {
    const start = deferred()
    api.start.mockReturnValueOnce(start.promise)
    const view = mount()
    await flush()
    click(view, 'Import')
    click(view, 'Import')
    expect(api.start).toHaveBeenCalledOnce()
    expect(api.start).toHaveBeenCalledWith({ data_import: 'IMPORT-A' })
    start.reject(new Error('start failed'))
    await flush()
    expect(view.element.querySelector('[role="alert"]')).not.toBeNull()
    expect(view.resource.reload).not.toHaveBeenCalled()
  })
})
