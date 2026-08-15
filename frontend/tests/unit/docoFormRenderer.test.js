// F3: DocoFormRenderer — thin frappe-ui-skin renderer over the vendored
// muelle-forms contract. frappe-ui + Link are mocked to minimal inputs so the
// test pins RENDERER behavior (sections, visibility, updates, errors), not
// upstream widget internals.
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, reactive } from 'vue'

vi.mock('frappe-ui', () => ({
  FormControl: defineComponent({
    name: 'FormControl',
    props: ['type', 'label', 'options', 'modelValue', 'disabled', 'rows', 'placeholder'],
    emits: ['update:modelValue', 'blur'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-mock': 'formcontrol',
          'data-type': props.type || 'text',
          value: props.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
          onBlur: (e) => emit('blur', e),
        })
    },
  }),
  call: vi.fn(),
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: defineComponent({
    name: 'Link',
    props: ['doctype', 'modelValue', 'label', 'placeholder', 'filters'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-mock': 'link',
          'data-doctype': props.doctype,
          value: props.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
    },
  }),
}))

import DocoFormRenderer from '@/components/doco/forms/DocoFormRenderer.vue'

const DESCRIPTOR = {
  contract: 'muelle-forms/1',
  kind: 'form',
  doctype: 'Repair Order',
  surface: 'crm',
  variant: 'intake-inline',
  hash: 'sha256:' + 'a'.repeat(64),
  lang: 'es',
  sections: [
    {
      key: 'equipo',
      columns: 3,
      fields: [
        { fieldname: 'device_model', label: 'Modelo', type: 'Link', widget: 'link', link: { doctype: 'Device Model' } },
        { fieldname: 'general_status', label: 'Condición', type: 'Select', widget: 'select', options: ['Good', 'Bad'] },
      ],
    },
    {
      key: 'falla',
      fields: [{ fieldname: 'falla_reportada', label: 'Falla', type: 'Small Text', widget: 'textarea', reqd: true }],
    },
    {
      key: 'oculta',
      visible_when: { '==': [{ var: 'kind' }, 'never'] },
      fields: [{ fieldname: 'phone_pin', label: 'PIN', type: 'Password', widget: 'password' }],
    },
  ],
}

function mountRenderer(props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(DocoFormRenderer, props)
  app.config.warnHandler = () => {}
  app.mount(el)
  return el
}

describe('DocoFormRenderer', () => {
  it('renders visible sections + fields, skips false visible_when sections', () => {
    const el = mountRenderer({ descriptor: DESCRIPTOR, draft: reactive({}) })
    expect(el.querySelector('[data-section="equipo"]')).toBeTruthy()
    expect(el.querySelector('[data-fieldname="device_model"] [data-mock="link"]')).toBeTruthy()
    expect(el.querySelector('[data-fieldname="device_model"] [data-doctype="Device Model"]')).toBeTruthy()
    expect(el.querySelector('[data-fieldname="falla_reportada"] [data-type="textarea"]')).toBeTruthy()
    expect(el.querySelector('[data-section="oculta"]')).toBeNull()
  })

  it('sections filter renders only requested keys', () => {
    const el = mountRenderer({ descriptor: DESCRIPTOR, draft: reactive({}), sections: ['falla'] })
    expect(el.querySelector('[data-section="falla"]')).toBeTruthy()
    expect(el.querySelector('[data-section="equipo"]')).toBeNull()
  })

  it('emits update:draft, never mutates the draft itself', async () => {
    const draft = reactive({})
    const updates = []
    const el = mountRenderer({
      descriptor: DESCRIPTOR,
      draft,
      'onUpdate:draft': (fieldname, v) => updates.push([fieldname, v]),
    })
    const input = el.querySelector('[data-fieldname="falla_reportada"] input')
    input.value = 'no prende'
    input.dispatchEvent(new Event('input'))
    expect(updates).toEqual([['falla_reportada', 'no prende']])
    expect(draft.falla_reportada).toBeUndefined()
  })

  it('renders field-bound errors with aria-live', () => {
    const el = mountRenderer({
      descriptor: DESCRIPTOR,
      draft: reactive({}),
      errors: [{ fieldname: 'falla_reportada', kind: 'reqd', message: 'Falla: requerido' }],
    })
    const err = el.querySelector('[data-fieldname="falla_reportada"] [aria-live="polite"]')
    expect(err).toBeTruthy()
    expect(err.textContent.trim()).toBe('Falla: requerido')
  })

  it('unknown widget falls back to a text input, never throws', () => {
    const mutated = JSON.parse(JSON.stringify(DESCRIPTOR))
    mutated.sections[0].fields[1].widget = 'x-unknown-99'
    const el = mountRenderer({ descriptor: mutated, draft: reactive({}) })
    expect(el.querySelector('[data-fieldname="general_status"] [data-mock="formcontrol"]')).toBeTruthy()
  })
})
