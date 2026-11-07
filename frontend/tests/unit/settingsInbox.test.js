import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'

const api = vi.hoisted(() => ({
  call: vi.fn(),
  resource: null,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  toast: api.toast,
  createDocumentResource: () => api.resource,
  getCachedDocumentResource: () => null,
  Button: {
    props: ['label', 'disabled', 'loading', 'type'],
    emits: ['click'],
    setup(p, { emit }) {
      return () =>
        h(
          'button',
          {
            type: p.type || 'button',
            disabled: p.disabled || p.loading,
            onClick: () => emit('click'),
          },
          p.label,
        )
    },
  },
  FormControl: {
    props: ['modelValue', 'label', 'type'],
    emits: ['update:modelValue'],
    setup(p, { emit }) {
      return () =>
        h('input', {
          'aria-label': p.label,
          value: p.modelValue ?? '',
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
    },
  },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: {
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    setup(p, { emit }) {
      return () =>
        h('input', {
          'aria-label': p.label,
          value: p.modelValue ?? '',
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
    },
  },
}))
vi.mock('@/composables/settings', () => ({
  activeSettingsPage: { value: '' },
  showSettings: { value: false },
}))

import WeekHours from '@/components/Settings/Inbox/WeekHours.vue'
import InboxPeople from '@/components/Settings/Inbox/InboxPeople.vue'
import InboxMacros from '@/components/Settings/Inbox/InboxMacros.vue'
import AutomationConnection from '@/components/Settings/Automations/AutomationConnection.vue'

const cleanups = []
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
const buttons = (el, text) =>
  [...el.querySelectorAll('button')].filter((b) =>
    b.textContent.trim().startsWith(text),
  )
async function click(el, text) {
  buttons(el, text)[0].click()
  await flush()
}
function documentResource(doc) {
  const state = reactive({
    doc,
    originalDoc: JSON.parse(JSON.stringify(doc)),
    get isDirty() {
      return JSON.stringify(state.doc) !== JSON.stringify(state.originalDoc)
    },
    save: {
      loading: false,
      submit: vi.fn((_, { onSuccess }) => {
        state.originalDoc = JSON.parse(JSON.stringify(state.doc))
        onSuccess()
      }),
    },
    reload: vi.fn(),
  })
  return state
}
beforeEach(() => {
  api.call.mockReset()
  api.toast.success.mockReset()
})
afterEach(() => cleanups.splice(0).forEach((fn) => fn()))

describe('office hours', () => {
  it('shows the times Frappe sends without a leading zero', async () => {
    const doc = ref({
      working_hours: [
        {
          name: 'r1',
          workday: 'Monday',
          start_time: '9:00:00',
          end_time: '18:30:00',
        },
      ],
    })
    const el = await mount(WeekHours, {
      doc: doc.value,
      'onUpdate:doc': (v) => (doc.value = v),
    })
    const [start, end] = el.querySelectorAll('input[type="time"]')
    expect([start.value, end.value]).toEqual(['09:00', '18:30'])
    expect(el.textContent).not.toContain('Ends before it starts')
    start.value = '08:15'
    start.dispatchEvent(new Event('input'))
    await flush()
    expect(doc.value.working_hours[0].start_time).toBe('08:15')
  })
  it('opens a day with the hours of the day before and flags a backwards range', async () => {
    const doc = ref({
      working_hours: [
        {
          name: 'r1',
          workday: 'Monday',
          start_time: '09:00:00',
          end_time: '14:00:00',
        },
        {
          name: 'r2',
          workday: 'Monday',
          start_time: '16:00:00',
          end_time: '19:00:00',
        },
      ],
    })
    const el = await mount(WeekHours, {
      doc: doc.value,
      'onUpdate:doc': (v) => (doc.value = v),
    })
    const tuesday = el.querySelectorAll('[role="switch"]')[1]
    expect(tuesday.getAttribute('aria-checked')).toBe('false')
    tuesday.click()
    await flush()
    const copied = doc.value.working_hours.filter(
      (r) => r.workday === 'Tuesday',
    )
    expect(copied.map((r) => [r.start_time, r.end_time])).toEqual([
      ['09:00:00', '14:00:00'],
      ['16:00:00', '19:00:00'],
    ])
    copied[0].end_time = '08:00'
    await flush()
    expect(el.textContent).toContain('Ends before it starts')
    el.querySelectorAll('[role="switch"]')[0].click()
    await flush()
    expect(doc.value.working_hours.some((r) => r.workday === 'Monday')).toBe(
      false,
    )
  })
})

describe('who receives conversations', () => {
  const person = {
    user: 'ana@example.com',
    full_name: 'Ana Ficticia',
    receives_new: true,
    department: '',
    max_open: 0,
    open: 3,
  }
  it('shows each person with their open conversations and saves a change at once', async () => {
    api.call.mockImplementation((method, args) =>
      Promise.resolve(
        method.endsWith('save_agent')
          ? [{ ...person, receives_new: !!args.receives_new }]
          : [person],
      ),
    )
    const el = await mount(InboxPeople, { doc: { auto_assign_enabled: 1 } })
    expect(el.textContent).toContain('Ana Ficticia')
    expect(el.textContent).toContain('3 open')
    expect(el.textContent).toContain('1 of 1 available')
    el.querySelector(
      '[aria-label="Ana Ficticia: Receives new conversations"]',
    ).click()
    await flush()
    expect(api.call).toHaveBeenCalledWith('crm.api.inbox.save_agent', {
      user: 'ana@example.com',
      receives_new: 0,
      department: '',
      max_open: 0,
    })
    expect(el.textContent).toContain('0 of 1 available')
  })
  it('removes a person only on the second tap', async () => {
    api.call.mockImplementation((method) =>
      Promise.resolve(method.endsWith('remove_agent') ? [] : [person]),
    )
    const el = await mount(InboxPeople, { doc: { auto_assign_enabled: 1 } })
    const bin = el.querySelector('[aria-label="Remove from the list"]')
    bin.click()
    await flush()
    expect(api.call).not.toHaveBeenCalledWith(
      'crm.api.inbox.remove_agent',
      expect.anything(),
    )
    await click(el, 'Remove')
    expect(api.call).toHaveBeenCalledWith('crm.api.inbox.remove_agent', {
      user: 'ana@example.com',
    })
    expect(el.textContent).toContain('Nobody is on the list yet')
  })
})

describe('macros', () => {
  it('builds a macro step by step and saves the steps in order', async () => {
    api.call.mockImplementation((method) =>
      Promise.resolve(method.endsWith('list_macros') ? [] : {}),
    )
    const el = await mount(InboxMacros, {
      labels: [{ name: 'Garantía', color: 'amber' }],
    })
    await click(el, 'New macro')
    const title = el.querySelector('[aria-label="Name"]')
    title.value = 'Garantía recibida'
    title.dispatchEvent(new Event('input'))
    const reply = el.querySelector('textarea')
    reply.value = 'Recibimos tu equipo.'
    reply.dispatchEvent(new Event('input'))
    await click(el, 'Add a step')
    const label = el.querySelector('[aria-label="Label"]')
    label.value = 'Garantía'
    label.dispatchEvent(new Event('change'))
    await flush()
    await click(el, 'Save macro')
    const [, args] = api.call.mock.calls.find(
      ([m]) => m === 'frappe.client.insert',
    )
    expect(args.doc.title).toBe('Garantía recibida')
    expect(args.doc.actions.map((s) => [s.idx, s.action, s.value])).toEqual([
      [1, 'Send reply', 'Recibimos tu equipo.'],
      [2, 'Add label', 'Garantía'],
    ])
  })
})

describe('automation connection', () => {
  const catalog = [
    { event: 'lead.created', record: 'CRM Lead', label: 'A lead was created.' },
    {
      event: 'lead.updated',
      record: 'CRM Lead',
      label: 'A lead was changed.',
      watches_fields: true,
    },
    {
      event: 'conversation.updated',
      record: 'CRM Conversation',
      label: 'Team, labels or snooze changed.',
    },
    {
      event: 'conversation.created',
      record: 'CRM Conversation',
      label: 'A customer conversation was opened.',
    },
    ...['created', 'updated', 'submitted', 'cancelled', 'deleted'].map((v) => ({
      event: `document.${v}`,
      record: 'Any record type',
      label: v,
      needs_document_type: true,
      ...(v === 'updated' ? { watches_fields: true } : {}),
    })),
  ]
  function respond(overrides = {}) {
    api.call.mockImplementation((method, args) => {
      if (method in overrides) return Promise.resolve(overrides[method](args))
      if (method.endsWith('.events')) return Promise.resolve(catalog)
      if (method.endsWith('.summary'))
        return Promise.resolve({
          counts: { Delivered: 4 },
          problems: [],
          blocker: null,
          api_key_ready: false,
        })
      if (method.endsWith('.document_types'))
        return Promise.resolve([
          {
            name: 'Sales Invoice',
            label: 'Sales Invoice',
            module: 'Accounts',
            submittable: true,
          },
        ])
      return Promise.resolve({})
    })
  }
  beforeEach(() => {
    api.resource = documentResource({
      name: 'INT-0001',
      title: 'Fictional flow',
      enabled: 0,
      webhook_url: 'https://hooks.example.com/n8n',
      integration_user: 'n8n@example.com',
      subscriptions: [],
      skip_own_changes: 1,
    })
  })
  it('groups events by what they describe and adds a record type with its usual events', async () => {
    respond()
    vi.useFakeTimers()
    const el = await mount(AutomationConnection, { name: 'INT-0001' })
    expect(el.textContent).toContain('Contacts, leads, deals and inquiries')
    expect(el.textContent).toContain('lead.created')
    const lead = [...el.querySelectorAll('label')].find((l) =>
      l.textContent.includes('lead.created'),
    )
    lead.querySelector('input').click()
    await flush()
    expect(api.resource.doc.subscriptions).toEqual([
      expect.objectContaining({ event: 'lead.created', document_type: null }),
    ])
    const search = el.querySelector('[aria-label="Add a record type"]')
    search.value = 'invoice'
    search.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await flush()
    await click(el, 'Sales Invoice')
    const chosen = api.resource.doc.subscriptions
      .filter((r) => r.document_type === 'Sales Invoice')
      .map((r) => r.event)
    expect(chosen).toEqual([
      'document.created',
      'document.updated',
      'document.submitted',
    ])
    expect(buttons(el, 'Save').length).toBe(1)
  })
  it('lets an update event wait for chosen fields, and only the events that can', async () => {
    respond()
    const el = await mount(AutomationConnection, { name: 'INT-0001' })
    const tick = async (event) => {
      ;[...el.querySelectorAll('label')]
        .find((l) => l.textContent.includes(event))
        .querySelector('input')
        .click()
      await flush()
    }
    const watched = () =>
      [...el.querySelectorAll('label')].filter((l) =>
        l.textContent.includes('Only when these fields change'),
      )
    await tick('lead.created')
    await tick('conversation.updated')
    expect(watched()).toHaveLength(0)
    await tick('lead.updated')
    expect(watched()).toHaveLength(1)
    const input = watched()[0].querySelector('input')
    input.value = ' status, priority '
    input.dispatchEvent(new Event('change'))
    await flush()
    const row = () =>
      api.resource.doc.subscriptions.find((r) => r.event === 'lead.updated')
    expect(row().only_fields).toBe('status, priority')
    input.value = '  '
    input.dispatchEvent(new Event('change'))
    await flush()
    expect(row().only_fields).toBeNull()
    api.resource.doc.subscriptions.push({
      event: 'document.updated',
      document_type: 'ToDo',
      only_fields: 'status',
    })
    await flush()
    expect(watched()).toHaveLength(2)
    expect(watched()[1].querySelector('input').value).toBe('status')
  })
  it('saves pending changes before the test event and reports what n8n answered', async () => {
    respond({
      'crm.api.integration.send_test': () => ({
        status: 'Delivered',
        response_code: 200,
      }),
    })
    const el = await mount(AutomationConnection, { name: 'INT-0001' })
    api.resource.doc.title = 'Renamed flow'
    await flush()
    await click(el, 'Send test event')
    expect(api.resource.save.submit).toHaveBeenCalled()
    expect(api.call).toHaveBeenCalledWith('crm.api.integration.send_test', {
      name: 'INT-0001',
    })
    expect(el.textContent).toContain('n8n answered 200. The connection works.')
  })
  it('creates an API key for the connection user and shows the header once', async () => {
    respond({
      'frappe.core.doctype.user.user.generate_keys': () => ({
        api_key: 'k1',
        api_secret: 's1',
      }),
    })
    const el = await mount(AutomationConnection, { name: 'INT-0001' })
    await click(el, 'Create API key')
    expect(api.call).toHaveBeenCalledWith(
      'frappe.core.doctype.user.user.generate_keys',
      { user: 'n8n@example.com' },
    )
    expect(el.textContent).toContain('token k1:s1')
    expect(el.textContent).toContain('the secret is shown only once')
  })
  it('says how long the old signature keeps going out after the secret is replaced', async () => {
    respond()
    const el = await mount(AutomationConnection, { name: 'INT-0001' })
    expect(el.textContent).not.toContain('also carry the old signature')
    api.resource.doc.previous_secret_until = '2999-01-01 10:00:00'
    await flush()
    expect(el.textContent).toContain(
      'Events also carry the old signature until',
    )
    api.resource.doc.previous_secret_until = '2000-01-01 10:00:00'
    await flush()
    expect(el.textContent).not.toContain('also carry the old signature')
  })
})
