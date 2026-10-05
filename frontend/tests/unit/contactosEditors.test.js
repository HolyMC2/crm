import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    Dialog: {
      props: ['modelValue', 'options'],
      setup:
        (props, { slots }) =>
        () =>
          props.modelValue ? h('div', slots['body-content']?.()) : null,
    },
    Button: {
      props: ['label', 'disabled', 'loading', 'variant', 'icon'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { disabled: !!props.disabled, onClick: () => emit('click') },
            props.label,
          ),
    },
    FormControl: {
      props: ['modelValue', 'label', 'type', 'options', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            'data-label': props.label,
            value: props.modelValue ?? '',
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
    },
  }
})
// Editable inputs per meta field, enough to change one value like a worker.
vi.mock('@/components/contactos/MetaFields.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['modelValue', 'fields', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'div',
            (props.fields || []).map((field) =>
              h('input', {
                'data-field': field.fieldname,
                value: props.modelValue?.[field.fieldname] ?? '',
                onInput: (event) =>
                  emit('update:modelValue', {
                    ...props.modelValue,
                    [field.fieldname]: event.target.value,
                  }),
              }),
            ),
          ),
    },
  }
})

import { Button, Dialog, FormControl } from 'frappe-ui'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import FollowupEditor from '@/components/contactos/FollowupEditor.vue'
import TagEditor from '@/components/contactos/TagEditor.vue'
import AddressEditor from '@/components/contactos/AddressEditor.vue'

const CONTACT_META = {
  doctype: 'Contact',
  can_write: true,
  fields: [
    { fieldname: 'first_name', label: 'Nombre', fieldtype: 'Data' },
    { fieldname: 'last_name', label: 'Apellido', fieldtype: 'Data' },
    { fieldname: 'phone_nos', label: 'Teléfonos', fieldtype: 'Table' },
    { fieldname: 'email_ids', label: 'Correos', fieldtype: 'Table' },
  ],
}
const PHONES = [
  { phone: '5511111111', is_primary_mobile_no: 1, is_primary_phone: 1 },
  { phone: '5522222222', is_primary_mobile_no: 0, is_primary_phone: 0 },
]
const EMAILS = [
  { email_id: 'ana@example.com', is_primary: 1 },
  { email_id: 'ana.casa@example.com', is_primary: 0 },
]
function contact(version, overrides = {}) {
  return {
    doctype: 'Contact',
    name: 'CONT-1',
    source: 'contact',
    modified: version,
    fields: {
      first_name: 'Ana',
      last_name: 'López',
      phone_nos: PHONES,
      email_ids: EMAILS,
      ...overrides,
    },
  }
}
// A refused save as doco sends it: native exception type plus a top-level
// GuardDTO (reports/contactos-crm-followups.md).
class Refusal {
  constructor(code = 'conflict') {
    this.body = {
      exc_type: 'TimestampMismatchError',
      _server_messages: JSON.stringify([
        JSON.stringify({ message: 'Alguien cambió estos datos.' }),
      ]),
      guard: {
        code,
        message: 'Alguien cambió estos datos.',
        actions: [
          {
            label: 'Comparar cambios',
            kind: 'call',
            target: 'doco.contactos.api.get_record',
          },
        ],
        retry_context: {},
      },
    }
  }
}
function conflictError(code) {
  return new Refusal(code)
}
// contactosApi talks to Frappe with fetch so a refusal keeps its guard.
function api(handlers) {
  state.call.mockImplementation(async (method, args) => {
    const name = method.replace('doco.contactos.api.', '')
    const handler = handlers[name]
    if (!handler) throw new Error(`unexpected ${name}`)
    return handler(args)
  })
  globalThis.fetch = vi.fn(async (url, options) => {
    const method = url.replace('/api/method/', '')
    try {
      const message = await state.call(method, JSON.parse(options.body))
      return { ok: true, status: 200, json: async () => ({ message }) }
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      return { ok: false, status: 417, json: async () => error.body }
    }
  })
}
const calls = (name) =>
  state.call.mock.calls.filter(([m]) => m === `doco.contactos.api.${name}`)

let app, root
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component, props) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () => h(component, { modelValue: true, ...props }),
  })
  // main.js registers these globally for the whole SPA.
  app.component('Button', Button)
  app.component('Dialog', Dialog)
  app.component('FormControl', FormControl)
  app.mount(root)
  await settle()
}
function unmount() {
  app?.unmount()
  root?.remove()
  app = root = null
}
function button(text) {
  return [...root.querySelectorAll('button')].find((el) =>
    el.textContent.includes(text),
  )
}
async function type(selector, value) {
  const input = root.querySelector(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await settle()
}
async function click(text) {
  button(text).click()
  await settle()
}

beforeEach(() => {
  state.call.mockReset()
  sessionStorage.clear()
})
afterEach(unmount)

describe('IdentityEditor on an existing record', () => {
  it('a name-only edit from Inbox keeps both secondary channels (finding 2)', async () => {
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () => contact('v1'),
      save_record: () => ({ ok: true }),
    })
    // Inbox context carries only the primary channels; it must not seed an edit.
    await mount(IdentityEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
      defaults: {
        source: 'contact',
        fields: { first_name: 'Ana' },
        phones: [{ phone: '5511111111', is_primary_phone: 1 }],
        emails: [{ email_id: 'ana@example.com', is_primary: 1 }],
      },
    })
    expect(root.querySelectorAll('[data-label^="Teléfono "]')).toHaveLength(2)
    expect(root.querySelectorAll('[data-label^="Correo "]')).toHaveLength(2)
    await type('[data-field="first_name"]', 'Ana María')
    await click('Guardar cambios')
    const [[, { payload }]] = calls('save_record')
    expect(payload.fields).toEqual({ first_name: 'Ana María' })
    expect(payload.modified).toBe('v1')
    expect(payload.baseline).toEqual({ first_name: 'Ana' })
    expect(payload.channel_mode).toBeUndefined()
  })

  it('a restored draft over a newer version asks before saving (finding 3)', async () => {
    let version = 'v1'
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () =>
        version === 'v1'
          ? contact('v1')
          : contact('v2', { last_name: 'Pérez' }),
      save_record: () => ({ ok: true }),
    })
    const source = { doctype: 'Contact', name: 'CONT-1' }
    await mount(IdentityEditor, { source })
    await type('[data-field="first_name"]', 'Ana María')
    unmount() // closed or reloaded before any save
    version = 'v2' // another worker changed the last name meanwhile
    await mount(IdentityEditor, { source })
    expect(root.textContent).toContain('Comparar con la versión actual')
    expect(root.textContent).toContain('Pérez')
    expect(button('Guardar cambios').disabled).toBe(true)
    await click('Reaplicar mis cambios')
    await click('Guardar cambios')
    const [[, { payload }]] = calls('save_record')
    expect(payload.modified).toBe('v2')
    expect(payload.fields).toEqual({ first_name: 'Ana María' })
  })

  it('a save refused for a stale version shows the comparison and keeps the draft (finding 7)', async () => {
    let refused = false
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () =>
        refused ? contact('v2', { first_name: 'Anita' }) : contact('v1'),
      save_record: () => {
        refused = true
        throw conflictError()
      },
    })
    await mount(IdentityEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
    })
    await type('[data-field="first_name"]', 'Ana María')
    await click('Guardar cambios')
    expect(root.textContent).toContain(
      'Tú y otra persona cambiaron los mismos datos',
    )
    expect(root.querySelector('[data-field="first_name"]').value).toBe(
      'Ana María',
    )
    await click('Usar la versión actual')
    expect(root.querySelector('[data-field="first_name"]').value).toBe('Anita')
  })
})

describe('FollowupEditor conflicts', () => {
  const task = {
    name: 'TODO-1',
    modified: 't1',
    status: 'Open',
    date: '2026-10-05',
    description: 'Llamar',
  }
  it('compares, then reapplies my date on the latest task version', async () => {
    let attempt = 0
    api({
      update_followup: () => {
        if (attempt++ === 0) throw conflictError()
        return { ok: true }
      },
      get_followup: ({ name }) => ({
        ...task,
        name,
        modified: 't2',
        date: '2026-10-07',
      }),
    })
    await mount(FollowupEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
      followup: task,
    })
    await type('[data-label="Fecha *"]', '2026-10-09')
    await click('Guardar seguimiento')
    expect(root.textContent).toContain('Versión actual')
    await click('Reaplicar mis cambios')
    await click('Guardar seguimiento')
    const payload = calls('update_followup')[1][1].payload
    expect(payload).toMatchObject({ modified: 't2', date: '2026-10-09' })
  })
})

describe('TagEditor conflicts', () => {
  it('shows both tag sets and can continue from the latest record', async () => {
    api({
      save_tags: () => {
        throw conflictError()
      },
      get_record: () => ({ ...contact('v2'), tags: ['VIP', 'Mayoreo'] }),
    })
    await mount(TagEditor, {
      source: { doctype: 'Contact', name: 'CONT-1', modified: 'v1' },
      tags: ['VIP'],
    })
    await type('[data-label="Etiquetas separadas por coma"]', 'VIP, Frecuente')
    await click('Guardar etiquetas')
    expect(root.textContent).toContain('Mayoreo')
    await click('Usar la versión actual')
    expect(
      root.querySelector('[data-label="Etiquetas separadas por coma"]').value,
    ).toBe('VIP, Mayoreo')
  })
})

describe('AddressEditor conflicts', () => {
  const ADDRESS_META = {
    doctype: 'Address',
    fields: [{ fieldname: 'city', label: 'Ciudad', fieldtype: 'Data' }],
  }
  it('a new address with a changed parent adopts the parent version without crashing', async () => {
    let attempt = 0
    api({
      get_editor_meta: () => ADDRESS_META,
      get_record: () => contact('v2'),
      save_address: () => {
        if (attempt++ === 0) throw conflictError()
        return { ok: true }
      },
    })
    await mount(AddressEditor, {
      source: { doctype: 'Contact', name: 'CONT-1', modified: 'v1' },
    })
    await type('[data-field="city"]', 'Mazatlán')
    await click('Guardar dirección')
    await click('Guardar dirección')
    const payloads = calls('save_address').map(([, args]) => args.payload)
    expect(payloads[0].source_modified).toBe('v1')
    expect(payloads[1]).toMatchObject({
      source_modified: 'v2',
      fields: { city: 'Mazatlán' },
    })
  })

  it('an existing address shows field differences against the latest one', async () => {
    api({
      get_editor_meta: () => ADDRESS_META,
      get_record: ({ source }) =>
        source === 'address'
          ? {
              doctype: 'Address',
              name: 'ADDR-1',
              modified: 'a2',
              fields: { city: 'Culiacán' },
            }
          : contact('v1'),
      save_address: () => {
        throw conflictError()
      },
    })
    await mount(AddressEditor, {
      source: { doctype: 'Contact', name: 'CONT-1', modified: 'v1' },
      address: { name: 'ADDR-1', modified: 'a1', fields: { city: 'Mazatlán' } },
    })
    await type('[data-field="city"]', 'Escuinapa')
    await click('Guardar dirección')
    expect(root.textContent).toContain('Culiacán')
    expect(root.textContent).toContain('Escuinapa')
  })
})

describe('IdentityEditor channel replacement', () => {
  it('removing a phone sends the whole table against its whole original', async () => {
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () => contact('v1'),
      save_record: () => ({ ok: true }),
    })
    await mount(IdentityEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
    })
    root.querySelector('[aria-label="Quitar teléfono 2"]').click()
    await settle()
    await click('Guardar cambios')
    const [[, { payload }]] = calls('save_record')
    expect(payload.channel_mode).toBe('replace')
    expect(payload.fields.phone_nos).toEqual([PHONES[0]])
    expect(payload.baseline.phone_nos).toEqual(PHONES)
    expect(payload.fields).not.toHaveProperty('email_ids')
  })

  it('a baseline_required refusal opens the comparison instead of retrying', async () => {
    let refused = false
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () =>
        refused ? contact('v2', { last_name: 'Ruiz' }) : contact('v1'),
      save_record: () => {
        refused = true
        throw conflictError('baseline_required')
      },
    })
    await mount(IdentityEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
    })
    await type('[data-field="first_name"]', 'Ana María')
    await click('Guardar cambios')
    expect(calls('save_record')).toHaveLength(1)
    expect(root.textContent).toContain('Ruiz')
    expect(button('Guardar cambios').disabled).toBe(true)
  })
})

describe('review round 2', () => {
  it('Reintentar after a failed first save keeps the edits and replays one request (H3)', async () => {
    let attempts = 0
    api({
      get_editor_meta: () => CONTACT_META,
      get_record: () => contact('v1'),
      save_record: () => {
        if (attempts++ === 0) throw new Error('Network down')
        return { ok: true }
      },
    })
    await mount(IdentityEditor, {
      source: { doctype: 'Contact', name: 'CONT-1' },
    })
    await type('[data-field="first_name"]', 'Ana María')
    root.querySelector('[aria-label="Quitar correo 2"]').click()
    await settle()
    await click('Guardar cambios')
    expect(root.querySelector('[data-field="first_name"]').value).toBe(
      'Ana María',
    )
    await click('Reintentar')
    expect(root.querySelector('[data-field="first_name"]').value).toBe(
      'Ana María',
    )
    const sent = calls('save_record').map(([, args]) => args)
    expect(sent).toHaveLength(2)
    expect(sent[1].request_id).toBe(sent[0].request_id)
    expect(sent[1].payload.fields.email_ids).toEqual([EMAILS[0]])
  })

  it('unsent follow-ups of a Customer and a Supplier with the same name stay apart (M6)', async () => {
    api({ create_followup: () => ({ ok: true }) })
    await mount(FollowupEditor, {
      source: { doctype: 'Customer', name: 'ACME' },
    })
    await type(
      '[data-label="Qué necesitas hacer *"]',
      'Cobrar saldo del cliente',
    )
    unmount()
    await mount(FollowupEditor, {
      source: { doctype: 'Supplier', name: 'ACME' },
    })
    expect(
      root.querySelector('[data-label="Qué necesitas hacer *"]').value,
    ).toBe('')
  })
})
