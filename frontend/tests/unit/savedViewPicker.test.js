// Shared saved views for the deals list: which rows the picker claims, what it
// sends to the upstream view API, and who may publish one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({ calls: [], rows: [], fail: null }))
const session = vi.hoisted(() => ({ manager: false }))
const dialogs = vi.hoisted(() => ({ input: [], confirm: [] }))

vi.mock('frappe-ui', () => ({
  call: (...args) => {
    api.calls.push(args)
    if (api.fail) return Promise.reject(api.fail)
    return Promise.resolve({ name: 99 })
  },
  toast: { success() {}, error() {} },
  createResource: (options) => {
    const resource = reactive({ data: null, loading: false, error: null, reload })
    async function reload() {
      resource.loading = true
      try {
        const rows = options.transform ? options.transform(api.rows) : api.rows
        resource.data = rows
        resource.error = null
        options.onSuccess?.(rows)
      } finally {
        resource.loading = false
      }
    }
    if (options.auto) reload()
    return resource
  },
}))
vi.mock('@/stores/users', () => ({ usersStore: () => ({ isManager: () => session.manager }) }))
vi.mock('@/utils/dialogs', () => ({
  inputDialog: (options) => dialogs.input.push(options),
  confirmDialog: (options) => dialogs.confirm.push(options),
}))

import SavedViewPicker from '@/components/doco/deals/SavedViewPicker.vue'
import { viewPayload } from '@/utils/dealViewSettings'

const SETTINGS = 'crm.fcrm.doctype.crm_view_settings.crm_view_settings'
const CONTEXT = {
  status: ['Aprobado'], source: [], owner: [],
  followUp: 'overdue', search: '', view: 'list', groupBy: 'status',
  sort: { field: 'next_activity_at', dir: 'asc' },
  columns: ['customer', 'next_activity'],
}
const row = (name, label, extra = {}) => ({
  ...viewPayload(CONTEXT, { label }),
  name,
  ...extra,
})
const CLASSIC = { name: 4, label: 'Clásica', route_name: 'Deals', filters: '{}', kanban_fields: '[]' }

const mounted = []
const events = { apply: [], selected: [], defaults: [], legacy: [], deleteLegacy: [] }

function mount(props = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(SavedViewPicker, {
          context: CONTEXT,
          selected: '',
          legacyViews: [],
          ...props,
          onApply: (context) => events.apply.push(context),
          'onUpdate:selected': (name) => events.selected.push(name),
          'onDefault-view': (payload) => events.defaults.push(payload),
          'onApply-legacy': (view) => events.legacy.push(view),
          'onDelete-legacy': (label) => events.deleteLegacy.push(label),
        }),
    }),
  )
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  mounted.push({ app, el })
  return el
}

const buttons = (root) => [...root.querySelectorAll('button')]
const byText = (root, text) => buttons(root).find((b) => b.textContent.trim().startsWith(text))
const byLabel = (root, label) => buttons(root).find((b) => b.getAttribute('aria-label') === label)
async function open(props) {
  const el = mount(props)
  await nextTick()
  byText(el, 'Vistas').click()
  await nextTick()
  return el
}
async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  api.calls = []
  api.fail = null
  api.rows = [row(11, 'Vencidos de Ana'), row(12, 'Del equipo', { public: 1 }), CLASSIC]
  session.manager = false
  dialogs.input = []
  dialogs.confirm = []
  Object.keys(events).forEach((k) => (events[k].length = 0))
})
afterEach(() => {
  mounted.splice(0).forEach(({ app, el }) => {
    app.unmount()
    el.remove()
  })
})

describe('listing views', () => {
  it('shows this list’s views and leaves the classic list’s own where they were made', async () => {
    const el = await open()
    expect(byText(el, 'Vencidos de Ana')).toBeTruthy()
    expect(byText(el, 'Del equipo')).toBeTruthy()
    expect(byText(el, 'Clásica')).toBeFalsy()
  })

  it('marks a published view as the team’s', async () => {
    const el = await open()
    expect(byText(el, 'Del equipo').textContent).toContain('Pública')
  })

  it('applies a view: the selection and the whole stored context', async () => {
    const el = await open()
    byText(el, 'Vencidos de Ana').click()
    await nextTick()
    expect(events.selected).toEqual(['11'])
    expect(events.apply[0]).toEqual(CONTEXT)
  })

  it('announces the worker’s default view once, on load', async () => {
    api.rows = [row(11, 'Vencidos de Ana', { is_default: 1 })]
    const el = await open()
    expect(events.defaults).toEqual([{ name: '11', context: CONTEXT }])
    byLabel(el, 'Fijar').click()
    await flush()
    expect(events.defaults).toHaveLength(1)
  })

  it('offers the browser-only views this list used to save', async () => {
    const el = await open({ legacyViews: [{ label: 'Vieja', status: ['Aprobado'] }] })
    byText(el, 'Vieja').click()
    await nextTick()
    expect(events.legacy).toEqual([{ label: 'Vieja', status: ['Aprobado'] }])
    expect(events.selected).toEqual([''])
  })
})

describe('writing views through the upstream API', () => {
  it('creates a view from the current context under the name the worker types', async () => {
    const el = await open()
    byText(el, '＋').click()
    await nextTick()
    await dialogs.input.at(-1).onConfirm('Mis vencidos')
    await flush()
    const [method, args] = api.calls[0]
    expect(method).toBe(`${SETTINGS}.create`)
    expect(args.view).toEqual(viewPayload(CONTEXT, { label: 'Mis vencidos' }))
    expect(events.selected).toEqual(['99'])
  })

  it('updates the selected view in place, keeping its name and label', async () => {
    const el = await open({ selected: '11' })
    byText(el, 'Actualizar').click()
    await flush()
    const [method, args] = api.calls[0]
    expect(method).toBe(`${SETTINGS}.update`)
    expect([args.view.name, args.view.label]).toEqual([11, 'Vencidos de Ana'])
  })

  it('pins and unpins through the shared endpoint', async () => {
    api.rows = [row(11, 'Vencidos de Ana'), row(12, 'Fijada', { pinned: 1 })]
    const el = await open()
    byLabel(el, 'Fijar').click()
    await flush()
    expect(api.calls[0]).toEqual([`${SETTINGS}.pin`, { name: 11, value: 1 }])
    byLabel(el, 'Quitar de fijadas').click()
    await flush()
    expect(api.calls[1]).toEqual([`${SETTINGS}.pin`, { name: 12, value: 0 }])
  })

  it('sets a default, which the server clears from the worker’s other views', async () => {
    const el = await open()
    byLabel(el, 'Usar como predeterminada').click()
    await flush()
    expect(api.calls[0]).toEqual([`${SETTINGS}.set_as_default`, { name: 11 }])
  })

  it('offers publishing to a manager only', async () => {
    let el = await open()
    expect(byLabel(el, 'Publicar para el equipo')).toBeFalsy()
    session.manager = true
    el = await open()
    byLabel(el, 'Publicar para el equipo').click()
    await flush()
    expect(api.calls[0]).toEqual([`${SETTINGS}.public`, { name: 11, value: 1 }])
  })

  it('confirms a delete before asking the server', async () => {
    const el = await open({ selected: '11' })
    byLabel(el, 'Eliminar vista').click()
    await nextTick()
    expect(api.calls).toEqual([])
    await dialogs.confirm.at(-1).onConfirm()
    await flush()
    expect(api.calls[0]).toEqual([`${SETTINGS}.delete`, { name: 11 }])
    expect(events.selected).toEqual([''])
  })

  it('leaves the picker usable when the server refuses a write', async () => {
    api.fail = { messages: ['Not permitted'] }
    const el = await open()
    byLabel(el, 'Fijar').click()
    await flush()
    expect(byText(el, 'Vencidos de Ana')).toBeTruthy()
  })
})
