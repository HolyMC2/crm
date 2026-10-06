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
