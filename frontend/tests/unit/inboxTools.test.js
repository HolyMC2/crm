import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const context = vi.hoisted(() => ({
  call: vi.fn(),
  listeners: {},
  replace: vi.fn(),
  query: {},
}))
vi.mock('frappe-ui', async () => {
  const { h: render } = await import('vue')
  return {
    call: (...args) => context.call(...args),
    Dialog: {
      props: ['modelValue', 'title', 'size'],
      setup:
        (props, { slots }) =>
        () =>
          props.modelValue ? render('div', slots.default?.()) : null,
    },
  }
})
vi.mock('vue-router', async () => {
  const { h: render } = await import('vue')
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (props, { slots }) =>
        () =>
          render('a', slots.default?.()),
    },
    useRoute: () => ({ query: context.query }),
    useRouter: () => ({ replace: context.replace }),
    onBeforeRouteLeave: vi.fn(),
    onBeforeRouteUpdate: vi.fn(),
  }
})
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'agent@example.invalid' }),
}))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $socket: {
      on: (name, handler) => {
        context.listeners[name] = handler
      },
      off: (name) => {
        delete context.listeners[name]
      },
    },
  }),
}))
import Workspace from '@/components/Inbox/ConversationWorkspace.vue'

const account = {
  provider: 'Webchat',
  account_id: 'a'.repeat(64),
  label: 'Test store',
  active: true,
}
const conversation = {
  ...account,
  name: 'conv1',
  peer_id: 'b'.repeat(64),
  generation: 4,
  control_state: 'Human',
  human_owner: 'agent@example.invalid',
  allowed_actions: ['release'],
  send_available: true,
  display_name: 'Visitante BBBBBBBB',
  labels: [],
  snoozed_until: null,
}
const LABELS = [
  { name: 'VIP', color: 'red' },
  { name: 'Mayoreo', color: 'blue' },
]
const MACRO = {
  name: 'macro-1',
  title: 'Cerrar venta',
  steps: [
    { action: 'Add label', value: 'VIP' },
    { action: 'Close', value: '' },
  ],
}
const cleanups = []
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const calls = (suffix) =>
  context.call.mock.calls.filter(([m]) => m.endsWith(suffix))
function base(method) {
  if (method.endsWith('list_accounts')) return { accounts: [account] }
  if (method.endsWith('list_threads')) return { items: [], next_cursor: null }
  if (method.endsWith('list_queue'))
    return {
      items: [{ ...conversation, labels: ['VIP'], preview: 'Hola' }],
      next_start: null,
    }
  if (method.endsWith('get_history'))
    return { conversation, messages: [], next_cursor: null }
  if (method.endsWith('list_intents')) return []
  if (method.endsWith('get_settings'))
    return { labels: LABELS, can_manage: false }
  if (method.endsWith('list_macros')) return [MACRO]
  if (method.endsWith('list_notes')) return []
  if (method.endsWith('record_notes')) return { records: [], notes: [] }
  return {}
}
async function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(Workspace) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
const tools = (el) =>
  el.querySelector('section[aria-label="Etiquetas, posponer y macros"]')
const button = (el, text) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
async function choose(select, value) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}
beforeEach(() => {
  vi.useFakeTimers()
  context.call.mockReset()
  context.replace.mockReset()
  context.listeners = {}
  context.query = { conversation: 'conv1' }
  context.call.mockImplementation(base)
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
})

describe('inbox queue views', () => {
  it('reopens the queue the person left and filters it by label', async () => {
    context.query = { queue: 'mine' }
    const el = await mount()
    expect(calls('list_queue').at(-1)[1]).toMatchObject({
      view: 'mine',
      label: null,
    })
    expect(calls('list_threads')).toHaveLength(0)
    expect(el.textContent).toContain('VIP')
    await button(el, 'Sin asignar').click()
    await flush()
    expect(calls('list_queue').at(-1)[1]).toMatchObject({ view: 'unassigned' })
    expect(context.replace).toHaveBeenLastCalledWith({
      query: { queue: 'unassigned' },
    })
    const filter = [...el.querySelectorAll('select')].find((s) =>
      s.closest('label')?.textContent.includes('Etiqueta'),
    )
    await choose(filter, 'VIP')
    expect(calls('list_queue').at(-1)[1]).toMatchObject({
      view: 'unassigned',
      label: 'VIP',
    })
  })
  it('keeps the per-account list and hides the manager report from others', async () => {
    const el = await mount()
    expect(calls('list_threads')).toHaveLength(1)
    expect(calls('list_queue')).toHaveLength(0)
    expect(button(el, 'Desempeño del equipo')).toBeUndefined()
  })
})

describe('waiting customers and availability', () => {
  it('shows how long each customer waits and lists the longest wait first', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    context.query = { queue: 'all' }
    context.call.mockImplementation((method) => {
      if (method.endsWith('get_settings'))
        return { labels: [], can_manage: false, first_response_minutes: 15 }
      if (method.endsWith('list_queue'))
        return {
          items: [
            { ...conversation, waiting_since: '2026-11-03 11:40:00' },
            {
              ...conversation,
              name: 'conv2',
              waiting_since: '2026-11-03 11:52:00',
            },
          ],
          next_start: null,
        }
      return base(method)
    })
    const el = await mount()
    const waits = [...el.querySelectorAll('.num')].map((n) => n.textContent)
    expect(waits).toContain('Espera 20 min')
    expect(waits).toContain('Espera 8 min')
    const late = [...el.querySelectorAll('.num')].find(
      (n) => n.textContent === 'Espera 20 min',
    )
    expect(late.className).toContain('text-ink-red-7')
    await [...el.querySelectorAll('[role="radio"]')]
      .find((b) => b.textContent.includes('Esperan más'))
      .click()
    await flush()
    expect(calls('list_queue').at(-1)[1]).toMatchObject({
      view: 'all',
      sort: 'waiting',
    })
  })
  it('lets the person stop and resume receiving new conversations', async () => {
    context.query = { queue: 'mine' }
    context.call.mockImplementation((method) => {
      if (method.endsWith('get_settings'))
        return {
          labels: [],
          can_manage: false,
          auto_assign: true,
          availability: { listed: true, receives_new: true, open: 2 },
        }
      if (method.endsWith('set_availability'))
        return { listed: true, receives_new: false, open: 2 }
      return base(method)
    })
    const el = await mount()
    expect(el.textContent).toContain('Tienes 2 abiertas')
    el.querySelector('[role="switch"]').click()
    await flush()
    expect(calls('set_availability').at(-1)[1]).toEqual({ receives_new: 0 })
    expect(el.textContent).toContain('No te llegan nuevas')
  })
  it('hides the switch when automatic assignment is off', async () => {
    context.query = { queue: 'mine' }
    const el = await mount()
    expect(el.querySelector('[role="switch"]')).toBeNull()
  })
  it('shows the wait and the customer rating on the open conversation', async () => {
    context.call.mockImplementation((method) =>
      method.endsWith('get_history')
        ? {
            conversation: {
              ...conversation,
              waiting_since: '2026-11-03 11:40:00',
              ratings: [{ rating: 4, comment: 'Rápido' }],
            },
            messages: [],
            next_cursor: null,
          }
        : base(method),
    )
    const el = await mount()
    expect(el.textContent).toContain('Espera respuesta desde')
    expect(el.textContent).toContain('4/5')
    expect(el.textContent).toContain('«Rápido»')
  })
})

describe('conversation tools', () => {
  it('labels, snoozes and runs a macro against the open conversation', async () => {
    const el = await mount()
    const [labelSelect, snoozeSelect, macroSelect] =
      tools(el).querySelectorAll('select')
    await choose(labelSelect, 'Mayoreo')
    expect(calls('set_labels').at(-1)[1]).toMatchObject({
      name: 'conv1',
      labels: '["Mayoreo"]',
    })
    expect(typeof calls('set_labels').at(-1)[1].command_id).toBe('string')
    expect(el.textContent).toContain('Etiquetas guardadas.')
    await choose(snoozeSelect, '3h')
    expect(calls('snooze_conversation').at(-1)[1]).toMatchObject({
      name: 'conv1',
      preset: '3h',
    })
    await choose(macroSelect, 'macro-1')
    expect(tools(el).textContent).toContain('etiquetar VIP → cerrar')
    await button(el, 'Aplicar').click()
    await flush()
    expect(calls('run_macro').at(-1)[1]).toMatchObject({
      name: 'conv1',
      macro: 'macro-1',
      expected_generation: 4,
    })
    expect(el.textContent).toContain('Macro «Cerrar venta» aplicada.')
  })
  it('shows the server reason when a macro step is refused', async () => {
    const el = await mount()
    context.call.mockImplementation(async (method) => {
      if (method.endsWith('run_macro'))
        throw {
          messages: ['Step 1 (Add label) could not run: <b>VIP</b> no existe.'],
        }
      return base(method)
    })
    await choose(tools(el).querySelectorAll('select')[2], 'macro-1')
    await button(el, 'Aplicar').click()
    await flush()
    expect(tools(el).querySelector('[role="alert"]').textContent).toBe(
      'Step 1 (Add label) could not run: VIP no existe.',
    )
  })
  it('hides snooze and macros on a conversation someone else owns', async () => {
    context.call.mockImplementation((method) =>
      method.endsWith('get_history')
        ? {
            conversation: {
              ...conversation,
              human_owner: 'other@example.invalid',
            },
            messages: [],
            next_cursor: null,
          }
        : base(method),
    )
    const el = await mount()
    expect(tools(el).querySelectorAll('select')).toHaveLength(1)
    expect(tools(el).textContent).not.toContain('Posponer')
  })
})

describe('private notes and help articles', () => {
  it('loads notes when opened and saves one with a mention', async () => {
    const el = await mount()
    expect(calls('list_notes')).toHaveLength(0)
    const details = [...el.querySelectorAll('details')].find((d) =>
      d.querySelector('summary').textContent.includes('Notas internas'),
    )
    // Closed, the panel renders no field, so the reply composer is the first one.
    expect(details.querySelector('textarea')).toBeNull()
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    await flush()
    expect(calls('list_notes').at(-1)[1]).toEqual({ name: 'conv1' })
    context.call.mockImplementation((method) =>
      method.endsWith('mentionable')
        ? [{ name: 'two@example.invalid', label: 'Dos' }]
        : base(method),
    )
    const note = details.querySelector('textarea')
    note.value = 'Revisar el pedido'
    note.dispatchEvent(new Event('input', { bubbles: true }))
    const search = details.querySelector('input[type="search"]')
    search.value = 'do'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    await button(details, 'Dos').click()
    await flush()
    expect(details.textContent).toContain('@Dos')
    details
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(calls('add_note').at(-1)[1]).toMatchObject({
      name: 'conv1',
      content: 'Revisar el pedido',
      mentions: '["two@example.invalid"]',
    })
    expect(note.value).toBe('')
  })
  it('shows the linked deal notes and saves a note on the deal', async () => {
    const deal = { doctype: 'CRM Deal', name: 'DEAL-1', label: 'Mostrador' }
    context.call.mockImplementation((method) => {
      if (method.endsWith('list_notes'))
        return [
          {
            name: 'n1',
            author_name: 'Uno',
            content: 'Interna',
            creation: '2026-11-02 10:00:00',
          },
        ]
      if (method.endsWith('record_notes'))
        return {
          records: [deal],
          notes: [
            {
              name: 'f1',
              title: 'Llamar',
              content: 'Llamar el lunes',
              author_name: 'Dos',
              creation: '2026-11-01 09:00:00',
              record: deal,
            },
          ],
        }
      return base(method)
    })
    const el = await mount()
    const details = [...el.querySelectorAll('details')].find((d) =>
      d.querySelector('summary').textContent.includes('Notas internas'),
    )
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    await flush()
    const items = [...details.querySelectorAll('li')].map(
      (li) => li.textContent,
    )
    expect(items[0]).toContain('Trato «Mostrador»')
    expect(items[0]).toContain('Llamar el lunes')
    expect(items[1]).toContain('Interna')
    const where = [...details.querySelectorAll('select')][0]
    await choose(where, 'CRM Deal|DEAL-1')
    expect(details.querySelector('input[type="search"]')).toBeNull()
    const note = details.querySelector('textarea')
    note.value = 'Cotizar 3 piezas'
    note.dispatchEvent(new Event('input', { bubbles: true }))
    details
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(calls('add_record_note').at(-1)[1]).toEqual({
      name: 'conv1',
      doctype: 'CRM Deal',
      docname: 'DEAL-1',
      content: 'Cotizar 3 piezas',
    })
    expect(calls('add_note')).toHaveLength(0)
  })
  it('inserts a picked help article into the reply draft', async () => {
    const el = await mount()
    context.call.mockImplementation((method) =>
      method.endsWith('search_help')
        ? [
            {
              name: 'h1',
              title: 'Envíos',
              url: 'https://shop.example.invalid/envios',
              snippet: 'Tiempos de envío',
            },
          ]
        : base(method),
    )
    await button(el, 'Artículo de ayuda').click()
    await vi.advanceTimersByTimeAsync(300)
    await flush()
    await [...el.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Tiempos de envío'))
      .click()
    await flush()
    expect(el.querySelector('textarea').value).toBe(
      'Envíos: https://shop.example.invalid/envios',
    )
  })
})

describe('team performance', () => {
  it('opens for managers and shows each person and the team total', async () => {
    context.call.mockImplementation((method) => {
      if (method.endsWith('get_settings'))
        return { labels: [], can_manage: true }
      if (method.endsWith('performance'))
        return {
          from_date: '2026-10-05',
          to_date: '2026-11-03',
          targets: { first_response_minutes: 15, resolution_hours: 24 },
          rows: [
            {
              person: 'agent@example.invalid',
              person_name: 'Agente Uno',
              replies: 3,
              avg_first_response_minutes: 4.5,
              first_response_met_pct: 100,
              closed: 2,
              avg_resolution_hours: null,
              resolution_met_pct: null,
              ratings: 1,
              avg_rating: 5,
            },
          ],
          total: { person_name: 'Equipo', replies: 3, closed: 2 },
        }
      return base(method)
    })
    const el = await mount()
    await button(el, 'Desempeño del equipo').click()
    await flush()
    expect(calls('performance').at(-1)[1]).toEqual({
      from_date: null,
      to_date: null,
    })
    expect(el.textContent).toContain('Agente Uno')
    expect(el.textContent).toContain('100 %')
    expect(el.textContent).toContain('Equipo')
    expect(el.querySelector('input[type="date"]').value).toBe('2026-10-05')
  })
})
