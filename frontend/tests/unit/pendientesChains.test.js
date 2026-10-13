// Pendientes record and list chains, mounted with the real pages: stale
// responses, cancelled work, native CRM Task create/edit and recovery.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  showModal: vi.fn(),
  route: null,
  router: { push: vi.fn(), replace: vi.fn() },
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({ params: {}, query: {}, fullPath: '/pendientes' })
  return {
    useRoute: () => state.route,
    useRouter: () => state.router,
    onBeforeRouteLeave: (guard) => (state.leave = guard),
  }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  const button = {
    props: ['label', 'disabled', 'loading', 'variant', 'iconLeft'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'button',
          { disabled: !!props.disabled, onClick: () => emit('click') },
          props.label,
        ),
  }
  return {
    Button: button,
    Dropdown: {
      setup:
        (_p, { slots }) =>
        () =>
          h('div', slots.default?.()),
    },
    FeatherIcon: { render: () => null },
    FormControl: { render: () => null },
    toast: { success: vi.fn(), error: vi.fn() },
    call: vi.fn(),
  }
})
vi.mock('@/composables/usePendientes', async (importOriginal) => ({
  ...(await importOriginal()),
  pendientesApi: (...args) => state.api(...args),
}))
vi.mock('@/composables/muelleShell', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadShell: async () => actual.shellBoot.value,
  }
})
vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: state.showModal }),
}))
vi.mock('@/components/Modals/DoctypeModals.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/pendientes/CompleteDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/pendientes/CreateDialog.vue', () => ({
  default: {
    props: ['modelValue', 'reference'],
    setup: (props) => () =>
      props.modelValue
        ? h('div', { 'data-create': props.reference?.reference_type || '' })
        : null,
  },
}))
vi.mock('@/components/shell/ModuleLayout.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}))
vi.mock('@/components/pendientes/PendienteRow.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/pendientes/DeclineDialog.vue', () => ({
  default: { render: () => null },
}))

import { firstModuleRoute, shellBoot } from '@/composables/muelleShell'
import Pendiente from '@/pages/Pendiente.vue'
import Pendientes from '@/pages/Pendientes.vue'
import { recoveryModule, recoveryReady } from '@/utils/shellRoutes'

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
}
function item(name, values = {}) {
  return {
    doctype: 'CRM Task',
    name,
    description: `Tarea ${name}`,
    status: 'Open',
    source_status: 'Todo',
    date: '2026-10-05',
    modified: '2026-10-05 10:00:00',
    mine: true,
    can_write: true,
    can_edit: true,
    cancelled: false,
    next: [],
    ...values,
  }
}
function buttons(root) {
  return [...root.querySelectorAll('button')]
}
function button(root, label) {
  return buttons(root).find((node) => node.textContent.trim() === label)
}

let app, root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const page = reactive({ ...props })
  app = createApp({ render: () => h(component, page) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
  return page
}

beforeEach(() => {
  state.api.mockReset()
  state.showModal.mockReset()
  state.router.push.mockReset()
  state.router.replace.mockReset()
  state.route.query = {}
  shellBoot.value = {
    capabilities: { directory: false },
    sales_access: false,
    modules: {
      pendientes: {
        key: 'pendientes',
        enabled: true,
        reason: null,
        user: 'vendedor@example.test',
        today: '2026-10-05',
        sources: { ToDo: true, 'CRM Task': true },
        capabilities: {
          read: true,
          create: false,
          create_crm: true,
          team: true,
        },
      },
    },
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Pendiente record', () => {
  it('ignores an older response after the URL moved to another task', async () => {
    const first = deferred(),
      second = deferred()
    state.api
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const page = mount(Pendiente, { source: 'crm-task', name: 'A' })
    await flush()
    page.name = 'B'
    await flush()
    second.resolve(item('B'))
    await flush()
    first.resolve(item('A'))
    await flush()
    expect(root.querySelector('h1').textContent).toContain('Tarea B')
    state.api.mockResolvedValueOnce({ row: item('B', { status: 'Closed' }) })
    button(root, 'Mark done').click()
    await flush()
    expect(state.api).toHaveBeenLastCalledWith(
      'complete',
      expect.objectContaining({ doctype: 'CRM Task', name: 'B' }),
    )
  })

  it('undoes the task it completed even after moving to another one', async () => {
    const { toast } = await import('frappe-ui')
    state.api.mockResolvedValueOnce(item('A'))
    const page = mount(Pendiente, { source: 'crm-task', name: 'A' })
    await flush()
    const doneA = item('A', { status: 'Closed', modified: 'v2' })
    state.api.mockResolvedValueOnce({ row: doneA })
    button(root, 'Mark done').click()
    await flush()
    const undo = toast.success.mock.calls.at(-1)[1].action.onClick
    state.api.mockResolvedValueOnce(item('B'))
    page.name = 'B'
    await flush()
    state.api.mockResolvedValueOnce({ row: item('A') })
    undo()
    await flush()
    expect(state.api).toHaveBeenLastCalledWith(
      'reopen',
      expect.objectContaining({ name: 'A', modified: 'v2' }),
    )
    expect(root.querySelector('h1').textContent).toContain('Tarea B')
  })

  it('clears the previous task and disables actions while the next loads', async () => {
    state.api.mockResolvedValueOnce(item('A'))
    const page = mount(Pendiente, { source: 'crm-task', name: 'A' })
    await flush()
    const pending = deferred()
    state.api.mockImplementationOnce(() => pending.promise)
    page.name = 'B'
    await flush()
    expect(root.textContent).not.toContain('Tarea A')
    expect(button(root, 'Mark done')).toBeUndefined()
    pending.resolve(item('B'))
    await flush()
    expect(button(root, 'Mark done').disabled).toBe(false)
  })

  it('offers Reopen on cancelled work it owns and never Mark done', async () => {
    for (const [doctype, source, status] of [
      ['ToDo', 'todo', 'Cancelled'],
      ['CRM Task', 'crm-task', 'Canceled'],
    ]) {
      state.api.mockResolvedValueOnce(
        item('X', {
          doctype,
          status: 'Closed',
          source_status: status,
          cancelled: true,
          can_edit: false,
        }),
      )
      mount(Pendiente, { source, name: 'X' })
      await flush()
      expect(button(root, 'Mark done')).toBeUndefined()
      expect(button(root, 'Reopen')).toBeDefined()
      expect(root.textContent).toContain('Reopen it to work on it again')
      state.api.mockResolvedValueOnce({ row: item('X', { doctype }) })
      button(root, 'Reopen').click()
      await flush()
      expect(state.api).toHaveBeenLastCalledWith(
        'reopen',
        expect.objectContaining({ doctype, name: 'X' }),
      )
      app.unmount()
      root.remove()
    }
    app = null
  })

  it("shows an unlinked task's instructions and edits someone else's task natively", async () => {
    state.api.mockResolvedValueOnce(
      item('73', {
        mine: false,
        can_write: false,
        can_edit: true,
        assigned_to: 'ana@example.test',
        body: 'Llamar al 55 1234 5678 y pedir folio',
        blocked_reason: 'Solo quien lo tiene asignado puede completarlo.',
      }),
    )
    mount(Pendiente, { source: 'crm-task', name: '73' })
    await flush()
    expect(root.textContent).toContain('Instructions')
    expect(root.textContent).toContain('55 1234 5678')
    expect(button(root, 'Mark done')).toBeUndefined()
    button(root, 'Edit task').click()
    expect(state.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ doctype: 'CRM Task', name: '73' }),
    )
  })
})

describe('Pendientes list cutover', () => {
  it('creates CRM Tasks natively when ToDo creation is denied', async () => {
    state.api.mockResolvedValue({ sections: {} })
    mount(Pendientes)
    await flush()
    expect(button(root, 'New pendiente')).toBeUndefined()
    button(root, 'New sales task').click()
    expect(state.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: 'CRM Task',
        defaults: expect.objectContaining({
          assigned_to: 'vendedor@example.test',
        }),
      }),
    )
  })

  it('opens contextual creation on a deal through the sales capability', async () => {
    state.api.mockResolvedValue({ sections: {} })
    state.route.query = {
      create: '1',
      reference_type: 'CRM Deal',
      reference_name: 'D-1',
    }
    mount(Pendientes)
    await flush()
    expect(root.querySelector('[data-create]').dataset.create).toBe('CRM Deal')
  })

  it('returns to the same place after back, once the list has its height', async () => {
    // P1 (polish walk 2026-10-13): the position was written once, one frame
    // after the data arrived, while the list was still shorter than when the
    // worker left; the browser clamped it (98 instead of 120, or 0).
    const frames = []
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((fn) => frames.push(fn))
    const step = () => frames.splice(0).forEach((fn) => fn())
    // happy-dom has no layout: give the list a height and clamp like a browser
    const box = { height: 447, content: 447 }
    const layout = (el) => {
      let top = 0
      Object.defineProperties(el, {
        clientHeight: { get: () => box.height },
        scrollHeight: { get: () => box.content },
        scrollTop: {
          get: () => top,
          set: (v) =>
            (top = Math.min(Math.max(0, v), box.content - box.height)),
        },
      })
      return el
    }
    const list = () => root.querySelector('.overflow-y-auto')
    const queue = {
      sections: {
        overdue: { rows: [item('1')], count: 1 },
        today: { rows: [item('2'), item('3')], count: 2 },
      },
    }
    try {
      state.api.mockResolvedValue(queue)
      mount(Pendientes)
      await flush()
      box.content = 567
      layout(list()).scrollTop = 120
      list().dispatchEvent(new Event('scroll'))
      state.leave?.() // opening a record saves the place
      app.unmount()
      root.remove()

      // back: the page mounts again and the rows arrive afterwards
      const response = deferred()
      state.api.mockReturnValue(response.promise)
      box.content = 447
      mount(Pendientes)
      await flush()
      layout(list())
      response.resolve(queue)
      await flush()
      box.content = 545 // sections rendered, the last rows still laying out
      step()
      expect(list().scrollTop).toBe(98)
      box.content = 567
      step()
      expect(list().scrollTop).toBe(120)
    } finally {
      raf.mockRestore()
      sessionStorage.clear()
    }
  })

  it('back from an owner screen into «Por aprobar»: the same place first, then the next row', async () => {
    // Review F5: the approval lists load their own rows, so the list's own
    // `loaded` never let them save their place, and the focus alone scrolled
    // the next row «nearest». They save and restore through listScroll too,
    // and the focus waits for the restore.
    const frames = []
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((fn) => frames.push(fn))
    let clock = 1000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const step = () => {
      clock += 50
      frames.splice(0).forEach((fn) => fn())
    }
    const box = { height: 447, content: 447 }
    const layout = (el) => {
      let top = 0
      Object.defineProperties(el, {
        clientHeight: { get: () => box.height },
        scrollHeight: { get: () => box.content },
        scrollTop: {
          get: () => top,
          set: (v) =>
            (top = Math.min(Math.max(0, v), box.content - box.height)),
        },
      })
      return el
    }
    const list = () => root.querySelector('.overflow-y-auto')
    const row = (n) => ({
      doctype: 'Purchase Invoice',
      name: `PI-${n}`,
      title: `Factura ${n}`,
      detail: 'Pagar',
      requested_by_name: 'Ana',
      requested_at: '2026-10-13 09:00:00',
      url: `/crm/gastos/factura/PI-${n}`,
      state: 'pending',
      guard: null,
      ask: `TODO-${n}`,
      settle: false,
      kind: 'gastos',
      kind_label: 'Facturas',
    })
    const page = (rows) => ({
      view: 'decide',
      kinds: [{ key: 'gastos', label: 'Facturas', count: rows.length }],
      rows,
      has_more: false,
      count: { value: rows.length, capped: false },
    })
    const answers = {
      counts: {
        approve: { value: 8, capped: false },
        waiting: { value: 0, capped: false },
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const answer = answers[String(url).split('.').pop()]
        const message = typeof answer === 'function' ? await answer() : answer
        return { ok: true, status: 200, json: async () => ({ message }) }
      }),
    )
    const focusedAt = []
    const focus = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function () {
        focusedAt.push([this.dataset.row, list().scrollTop])
      })
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map(row)
    try {
      shellBoot.value.modules.pendientes.capabilities.approve = true
      state.route.query = { segment: 'approve' }
      answers.queue = page(rows)
      mount(Pendientes)
      await flush()
      box.content = 900
      layout(list()).scrollTop = 300
      list().dispatchEvent(new Event('scroll'))
      sessionStorage.setItem(
        'muelle:aprobaciones:opened',
        JSON.stringify({ key: 'Purchase Invoice:PI-4', index: 3, title: 'x' }),
      )
      state.leave?.() // opening the bill saves the place
      app.unmount()
      root.remove()

      // Paid: back with done; the rows arrive after the page mounted.
      const response = deferred()
      answers.queue = () => response.promise
      state.route.query = { segment: 'approve', done: 'Purchase Invoice:PI-4' }
      box.content = 447
      mount(Pendientes)
      await flush()
      layout(list())
      response.resolve(page(rows.filter((r) => r.name !== 'PI-4')))
      await flush()
      box.content = 850
      for (let i = 0; i < 12; i++) {
        step()
        await flush()
      }
      expect(list().scrollTop).toBe(300)
      expect(focusedAt).toEqual([['Purchase Invoice:PI-5', 300]])
    } finally {
      raf.mockRestore()
      now.mockRestore()
      focus.mockRestore()
      vi.unstubAllGlobals()
      sessionStorage.clear()
    }
  })
})

describe('Permission recovery', () => {
  it('classifies the refused module and lands on one the worker has', () => {
    expect(recoveryModule('/pendientes?segment=team')).toBe('pendientes')
    expect(recoveryModule('/tasks/view?open=73')).toBe('pendientes')
    expect(recoveryModule('/contactos/customer/C')).toBe('contactos')
    expect(recoveryModule('/deals/D-1')).toBe('ventas')
    const todoOnly = {
      modules: {
        pendientes: { enabled: true },
        contactos: { enabled: false },
        ventas: { enabled: false },
      },
    }
    expect(recoveryReady('pendientes', todoOnly)).toBe(true)
    expect(recoveryReady('ventas', todoOnly)).toBe(false)
    expect(firstModuleRoute(todoOnly, 'ventas')).toMatchObject({
      key: 'pendientes',
      to: '/pendientes',
    })
    expect(firstModuleRoute(todoOnly, 'pendientes')).toBeNull()
  })
})
