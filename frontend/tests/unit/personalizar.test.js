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
          props.modelValue
            ? h(
                'div',
                { 'data-dialog': props.options?.title },
                slots['body-content']?.(),
              )
            : null,
    },
    Button: {
      props: ['label', 'disabled', 'loading', 'variant', 'icon', 'iconLeft'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              disabled: !!props.disabled,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
    FormControl: {
      props: ['modelValue', 'label', 'type', 'options', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(props.type === 'textarea' ? 'textarea' : 'input', {
            ...attrs,
            'data-label': props.label,
            'data-type': props.type || 'text',
            value: props.modelValue ?? '',
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
    },
  }
})

import { Button, Dialog, FormControl } from 'frappe-ui'
import ExtraFieldsPanel from '@/components/contactos/ExtraFieldsPanel.vue'
import ExtraFieldForm from '@/components/contactos/ExtraFieldForm.vue'
import {
  accountExtraRoute,
  clauseLabel,
  coreFields,
  extraClauses,
  extraDisplay,
  extraFields,
  extraPayloadValue,
  isExtraClause,
  requestText,
  sectionPosition,
} from '@/utils/extraFields'

const META = [
  { fieldname: 'customer_name', label: 'Nombre', fieldtype: 'Data' },
  {
    fieldname: 'pz_como_nos_conocis_1a2b',
    label: '¿Cómo nos conociste?',
    fieldtype: 'Select',
    options: '\nFacebook\nRecomendación\nPasaba por aquí',
    group: 'extra',
    kind: 'list',
  },
  {
    fieldname: 'pz_mayoreo_3c4d',
    label: 'Mayoreo',
    fieldtype: 'Check',
    group: 'extra',
    kind: 'check',
  },
  {
    fieldname: 'pz_visitas_5e6f',
    label: 'Visitas',
    fieldtype: 'Float',
    group: 'extra',
    kind: 'number',
  },
  {
    fieldname: 'pz_cliente_desde_7a8b',
    label: 'Cliente desde',
    fieldtype: 'Date',
    group: 'extra',
    kind: 'date',
  },
  {
    fieldname: 'pz_nota_9c0d',
    label: 'Nota',
    fieldtype: 'Data',
    group: 'extra',
    kind: 'text',
  },
]
function record(fields = {}, version = 'v1') {
  return {
    source: 'customer',
    doctype: 'Customer',
    name: 'Ana López',
    title: 'Ana López',
    modified: version,
    capabilities: { read: true, write: true },
    editor_meta: { fields: META },
    fields: {
      customer_name: 'Ana López',
      pz_como_nos_conocis_1a2b: 'Facebook',
      pz_mayoreo_3c4d: 1,
      pz_visitas_5e6f: 12,
      pz_cliente_desde_7a8b: '2026-01-10',
      pz_nota_9c0d: null,
      ...fields,
    },
  }
}
class Refusal {
  constructor(guard, exc = 'ValidationError') {
    this.body = {
      exc_type: exc,
      _server_messages: JSON.stringify([
        JSON.stringify({ message: guard.message }),
      ]),
      guard,
    }
  }
}
function api(handlers) {
  state.call.mockImplementation(async (method, args) => {
    const name = method.split('.').pop()
    const handler = handlers[name]
    if (!handler) throw new Error(`unexpected ${method}`)
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
  state.call.mock.calls.filter(([m]) => m.split('.').pop() === name)

let app, root, events
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component, props) {
  root = document.createElement('div')
  document.body.append(root)
  events = []
  const listeners = Object.fromEntries(
    [
      'saved',
      'defined',
      'reload',
      'requested',
      'use-field',
      'open-section',
      'open-fields',
      'cancel',
    ].map((name) => [
      `on${name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`,
      (value) => events.push([name, value]),
    ]),
  )
  const host = { props: { ...props } }
  app = createApp({
    data: () => host,
    render() {
      return h(component, { ...this.props, ...listeners })
    },
  })
  app.component('Button', Button)
  app.component('Dialog', Dialog)
  app.component('FormControl', FormControl)
  app.config.globalProperties.__ = globalThis.__
  const vm = app.mount(root)
  await settle()
  return vm
}
function unmount() {
  app?.unmount()
  root?.remove()
  app = root = null
}
const q = (selector) => root.querySelector(selector)
const qa = (selector) => [...root.querySelectorAll(selector)]
async function click(selector) {
  q(selector).click()
  await settle()
}
async function type(selector, value) {
  const input = q(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await settle()
}

beforeEach(() => {
  state.call.mockReset()
  globalThis.window.__ = globalThis.__
  globalThis.window.lang = 'es-MX'
  window.sessionStorage?.clear?.()
  window.localStorage?.clear?.()
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  })
})
afterEach(unmount)

describe('extra field helpers', () => {
  it('splits «Datos» from «Más datos» by the server group', () => {
    expect(coreFields(META).map((f) => f.fieldname)).toEqual(['customer_name'])
    expect(extraFields(META)).toHaveLength(5)
  })

  it('turns one filter row into Contactos clauses per kind', () => {
    const [list, check, number, date, text] = extraFields(META)
    expect(extraClauses(list, { value: 'Recomendación' })).toEqual([
      ['pz_como_nos_conocis_1a2b', '=', 'Recomendación'],
    ])
    expect(extraClauses(check, { value: '0' })).toEqual([
      ['pz_mayoreo_3c4d', '=', 0],
    ])
    expect(extraClauses(number, { from: '10', to: '' })).toEqual([
      ['pz_visitas_5e6f', '>=', 10],
    ])
    expect(
      extraClauses(date, { from: '2026-01-01', to: '2026-02-01' }),
    ).toEqual([
      ['pz_cliente_desde_7a8b', '>=', '2026-01-01'],
      ['pz_cliente_desde_7a8b', '<=', '2026-02-01'],
    ])
    expect(extraClauses(text, { value: ' 50%_off ' })).toEqual([
      ['pz_nota_9c0d', 'like', '%50\\%\\_off%'],
    ])
    expect(extraClauses(list, { value: '' })).toEqual([])
    expect(isExtraClause(['pz_mayoreo_3c4d', '=', 1])).toBe(true)
    expect(isExtraClause(['customer_name', '=', 'x'])).toBe(false)
  })

  it('labels the chips like the record reads', () => {
    const boot = [
      { fieldname: 'pz_talla_1', label: 'Talla', kind: 'list' },
      { fieldname: 'pz_visitas_2', label: 'Visitas', kind: 'number' },
      { fieldname: 'pz_nota_3', label: 'Nota', kind: 'text' },
    ]
    expect(clauseLabel(['pz_talla_1', '=', 'M'], boot)).toBe('Talla: M')
    expect(clauseLabel(['pz_visitas_2', '>=', 10], boot, 'en')).toBe(
      'Visitas from 10',
    )
    expect(clauseLabel(['pz_nota_3', 'like', '%azul%'], boot)).toBe(
      'Nota contains «azul»',
    )
    expect(clauseLabel(['pz_gone_4', '=', 'x'], boot)).toBe('Retired field: x')
  })

  it('sends what the native type stores', () => {
    const [list, check, number, date, text] = extraFields(META)
    expect(extraPayloadValue(check, true)).toBe(1)
    expect(extraPayloadValue(check, 0)).toBe(0)
    expect(extraPayloadValue(number, '')).toBe(0)
    expect(extraPayloadValue(number, '12.5')).toBe(12.5)
    expect(extraPayloadValue(number, 'doce')).toBe('doce')
    expect(extraPayloadValue(date, '')).toBe(null)
    expect(extraPayloadValue(list, '')).toBe('')
    expect(extraPayloadValue(text, '  hola ')).toBe('hola')
    expect(extraDisplay(check, 0)).toBe('No')
    expect(extraDisplay(text, null)).toBe('No data')
  })

  it('puts a section a saved order does not list yet last', () => {
    const order = ['identity', 'followups', 'notes']
    expect(sectionPosition(order, 'notes')).toBe(2)
    expect(sectionPosition(order, 'extra')).toBe(4)
    expect(sectionPosition(undefined, 'extra')).toBe(1)
  })

  it('a person opens their client account extra details and comes back', () => {
    const person = { source: 'contact', name: 'CONT-7', title: 'Laura Pérez' }
    expect(accountExtraRoute(person, 'Laura Pérez', 2)).toEqual({
      name: 'Contacto',
      params: { source: 'customer', name: 'Laura Pérez' },
      query: {
        return_to: '/crm/contactos/contact/CONT-7',
        return_label: 'Laura Pérez',
      },
    })
    expect(accountExtraRoute(person, 'Laura Pérez', 0)).toBeNull()
    expect(accountExtraRoute(person, '', 2)).toBeNull()
    expect(
      accountExtraRoute({ source: 'customer', name: 'Laura Pérez' }, 'x', 2),
    ).toBeNull()
  })

  it('builds a request the owner can read', () => {
    expect(
      requestText({ label: 'Talla', kind: 'list', record: 'Ana López' }),
    ).toBe(
      'Please add the extra field «Talla · List» for clientes. I need it for Ana López.',
    )
  })
})

describe('«Más datos» on a cliente', () => {
  it('shows each kind and fills a value through save_record', async () => {
    let saved = null
    api({
      save_record: ({ payload }) => {
        saved = payload
        return record({ pz_nota_9c0d: 'Le gusta azul' }, 'v2')
      },
    })
    await mount(ExtraFieldsPanel, {
      record: record(),
      capabilities: { fields: { define: false }, manager: false },
    })
    const values = qa('.c-extra-item').map((li) => li.textContent.trim())
    expect(values[0]).toContain('Facebook')
    expect(values[1]).toContain('Yes')
    expect(values[2]).toContain('12')
    expect(values[4]).toContain('No data')
    // A Cajero fills values but never adds fields.
    expect(q('[data-act="add-field"]')).toBeNull()
    expect(q('[data-act="ask-owner"]')).not.toBeNull()
    await click('[data-field="pz_nota_9c0d"] [data-act="edit-extra"]')
    await type(
      '[data-field="pz_nota_9c0d"] [data-input="value"]',
      'Le gusta azul',
    )
    await click('[data-act="save-extra"]')
    expect(saved).toEqual({
      source: 'customer',
      name: 'Ana López',
      modified: 'v1',
      fields: { pz_nota_9c0d: 'Le gusta azul' },
      baseline: { pz_nota_9c0d: null },
    })
    expect(calls('save_record')[0][1].request_id).toBeTruthy()
    expect(events.find(([name]) => name === 'saved')[1].modified).toBe('v2')
    expect(q('[data-editing]')).toBeNull()
  })

  it('a stale version compares and keeps the typed value', async () => {
    const attempts = []
    api({
      save_record: ({ payload }) => {
        attempts.push(payload)
        if (attempts.length === 1)
          throw new Refusal(
            {
              code: 'conflict',
              message: 'Alguien cambió estos datos.',
              actions: [{ label: 'Comparar cambios', kind: 'call' }],
              retry_context: {},
            },
            'TimestampMismatchError',
          )
        return record({ pz_visitas_5e6f: 20 }, 'v3')
      },
      get_record: () => record({ pz_visitas_5e6f: 15 }, 'v2'),
    })
    await mount(ExtraFieldsPanel, {
      record: record(),
      capabilities: { fields: { define: true } },
    })
    await click('[data-field="pz_visitas_5e6f"] [data-act="edit-extra"]')
    await type('[data-field="pz_visitas_5e6f"] [data-input="value"]', '20')
    await click('[data-act="save-extra"]')
    const compare = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Comparar cambios'),
    )
    compare.click()
    await settle()
    expect(q('[data-compare="extra"]').textContent).toContain('15')
    expect(q('[data-field="pz_visitas_5e6f"] [data-input="value"]').value).toBe(
      '20',
    )
    const keep = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Keep mine'),
    )
    keep.click()
    await settle()
    expect(attempts[1]).toMatchObject({
      modified: 'v2',
      fields: { pz_visitas_5e6f: 20 },
      baseline: { pz_visitas_5e6f: 15 },
    })
  })

  it('the owner adds a field and comes back to it open, ready to fill', async () => {
    api({
      define_field: (args) => ({
        field: {
          fieldname: 'pz_talla_aa11',
          label: args.label,
          kind: args.kind,
          options: args.options,
          state: 'active',
        },
        replayed: false,
      }),
    })
    const vm = await mount(ExtraFieldsPanel, {
      record: record(),
      capabilities: { fields: { define: true } },
    })
    await click('[data-act="add-field"]')
    expect(q('[data-dialog]').dataset.dialog).toBe('Add field')
    await type('[data-input="label"]', 'Talla')
    await click('[data-kind="list"]')
    await type('[data-input="options"]', 'S\nM\nL')
    await click('[data-act="submit-extra-field"]')
    const [, args] = calls('define_field')[0]
    expect(args).toMatchObject({
      record_type: 'clientes',
      label: 'Talla',
      kind: 'list',
      options: ['S', 'M', 'L'],
    })
    expect(events.find(([name]) => name === 'defined')[1].fieldname).toBe(
      'pz_talla_aa11',
    )
    // Contacto reloads the record with the new field: it opens in edit mode.
    vm.props = {
      ...vm.props,
      record: {
        ...record(),
        editor_meta: {
          fields: [
            ...META,
            {
              fieldname: 'pz_talla_aa11',
              label: 'Talla',
              fieldtype: 'Select',
              options: '\nS\nM\nL',
              group: 'extra',
              kind: 'list',
            },
          ],
        },
      },
    }
    await settle()
    expect(q('[data-field="pz_talla_aa11"] [data-editing]')).not.toBeNull()
  })
})

describe('adding a field: guards keep the draft and offer the way out', () => {
  it('a manager who is not the owner asks the owner instead', async () => {
    api({
      define_field: () => {
        throw new Refusal(
          {
            code: 'not_owner',
            message: 'Solo el dueño agrega o retira campos.',
            actions: [{ label: 'Pedírselo al dueño', kind: 'request_field' }],
            retry_context: {},
          },
          'PermissionError',
        )
      },
      request_field: () => ({
        asked: [{ user: 'ana@example.test', full_name: 'Ana' }],
        already: [],
      }),
    })
    await mount(ExtraFieldForm, {
      initialMode: 'define',
      record: { name: 'Ana López', title: 'Ana López' },
    })
    await type('[data-input="label"]', '¿Cómo nos conociste?')
    await click('[data-act="submit-extra-field"]')
    expect(q('[data-hint="owner-only"]').textContent).toContain(
      'Solo el dueño agrega o retira campos.',
    )
    expect(q('[data-input="label"]').value).toBe('¿Cómo nos conociste?')
    expect(q('[data-act="submit-extra-field"]').textContent).toBe(
      'Ask the owner',
    )
    await click('[data-act="submit-extra-field"]')
    expect(calls('request_field')[0][1]).toMatchObject({
      record_type: 'clientes',
      name: 'Ana López',
      label: '¿Cómo nos conociste?',
    })
    expect(root.textContent).toContain('We asked Ana.')
  })

  it('«Reintentar» after a busy table sends the same request', async () => {
    let attempt = 0
    api({
      define_field: () => {
        attempt += 1
        if (attempt === 1)
          throw new Refusal({
            code: 'busy',
            message: 'Clientes está ocupado; no se creó el campo.',
            actions: [{ label: 'Reintentar', kind: 'retry' }],
            retry_context: {},
          })
        return {
          field: { fieldname: 'pz_mayoreo_1', label: 'Mayoreo', kind: 'check' },
        }
      },
    })
    await mount(ExtraFieldForm, { initialMode: 'define' })
    await type('[data-input="label"]', 'Mayoreo')
    await click('[data-kind="check"]')
    await click('[data-act="submit-extra-field"]')
    expect(q('[data-guard="busy"]').textContent).toContain(
      'Clientes está ocupado',
    )
    await click('[data-guard-action="retry"]')
    const ids = calls('define_field').map(([, args]) => args.request_id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(events.some(([name]) => name === 'defined')).toBe(true)
  })

  it('a taken name points to the field that already holds it', async () => {
    api({
      define_field: () => {
        throw new Refusal({
          code: 'exists',
          message: 'Ya existe un campo llamado «Talla».',
          actions: [
            {
              label: 'Usar ese campo',
              kind: 'use_field',
              target: 'pz_talla_1',
            },
          ],
          retry_context: {},
        })
      },
    })
    await mount(ExtraFieldForm, { initialMode: 'define' })
    await type('[data-input="label"]', 'talla')
    await click('[data-act="submit-extra-field"]')
    await click('[data-guard-action="use_field"]')
    expect(events).toContainEqual(['use-field', 'pz_talla_1'])
  })

  it('with nobody to ask, the request is copied', async () => {
    await mount(ExtraFieldForm, { initialMode: 'request' })
    await type('[data-input="label"]', 'Talla')
    expect(q('[data-act="submit-extra-field"]').textContent).toBe(
      'Copy request',
    )
    await click('[data-act="submit-extra-field"]')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Please add the extra field «Talla · Text» for clientes.',
    )
  })
})
