import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
vi.mock('frappe-ui', async () => {
  const dates = await import('../../node_modules/frappe-ui/src/utils/dayjs.ts')
  const config =
    await import('../../node_modules/frappe-ui/src/utils/config.ts')
  return {
    call: (...args) => {
      api.calls.push(args)
      return api.behavior(...args)
    },
    dayjsLocal: dates.dayjsLocal,
    dayjs: dates.dayjs,
    getConfig: config.getConfig,
  }
})
vi.mock('@/components/Controls/Link.vue', () => ({
  default: defineComponent({
    props: ['modelValue', 'doctype'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-testid': 'lead-picker',
          'data-doctype': props.doctype,
          value: props.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
    },
  }),
}))
import CaptureForm from '@/components/Inquiries/CaptureForm.vue'
import InquiryDetail from '@/components/Inquiries/InquiryDetail.vue'

const mounted = []
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, no) => {
    resolve = ok
    reject = no
  })
  return { promise, resolve, reject }
}
function mount(component, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(component, props) })
  app.component(
    'RouterLink',
    defineComponent({
      props: ['to'],
      setup(props, { slots }) {
        return () =>
          h('a', { 'data-route': JSON.stringify(props.to) }, slots.default?.())
      },
    }),
  )
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  mounted.push({ app, el })
  return el
}
async function input(el, selector, value) {
  const field = el.querySelector(selector)
  field.value = value
  field.dispatchEvent(
    new Event(
      field.tagName === 'SELECT' || field.type === 'radio' ? 'change' : 'input',
      { bubbles: true },
    ),
  )
  await nextTick()
}
async function submit(el, selector) {
  el.querySelector(selector).dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
  await flush()
}
const inquiry = (extra = {}) => ({
  name: 'INQ-1',
  title: 'Consulta inicial',
  status: 'New',
  can_write: true,
  source_type: 'Manual',
  source_text: 'Texto público',
  source_url: 'https://example.test/post',
  assigned_to: 'staff@example.test',
  modified: 'v1',
  people: [],
  ...extra,
})
beforeEach(() => {
  api.calls = []
  api.behavior = async () => inquiry()
})
afterEach(() => {
  mounted.splice(0).forEach(({ app, el }) => {
    app.unmount()
    el.remove()
  })
})

describe('manual inquiry capture', () => {
  it('keeps input and the same request ID across failed retries, then resets on success', async () => {
    let fail = true
    api.behavior = async () => {
      if (fail) throw new TypeError('Failed to fetch')
      return inquiry()
    }
    const created = []
    const el = mount(CaptureForm, {
      actor: 'staff',
      currentActor: () => 'staff',
      onCreated: (value) => created.push(value),
    })
    await input(el, '[name="title"]', 'Reparación consultada')
    await input(
      el,
      '[name="source_text"]',
      'Un vecino pregunta por una reparación',
    )
    await submit(el, 'form')
    expect(el.querySelector('[role="alert"]').textContent).toContain(
      'Conservamos tu borrador',
    )
    expect(el.querySelector('[name="title"]').value).toBe(
      'Reparación consultada',
    )
    expect(el.querySelector('fieldset').disabled).toBe(true)
    expect(created).toEqual([])
    const first = JSON.parse(JSON.stringify(api.calls[0][1].payload))
    fail = false
    await submit(el, 'form')
    expect(api.calls[1][1].payload).toEqual(first)
    expect(created).toHaveLength(1)
    expect(el.querySelector('[name="title"]').value).toBe('')
    await input(el, '[name="title"]', 'Otra consulta')
    await input(el, '[name="source_text"]', 'Otro texto')
    await submit(el, 'form')
    expect(api.calls[2][1].payload.client_request_id).not.toBe(
      first.client_request_id,
    )
  })

  it('changes request identity only through an explicit new-capture action after failure', async () => {
    api.behavior = async () => {
      throw { exc_type: 'ValidationError', messages: ['Revisa el texto.'] }
    }
    const el = mount(CaptureForm, {
      actor: 'staff',
      currentActor: () => 'staff',
    })
    await input(el, '[name="title"]', 'Consulta')
    await input(el, '[name="source_text"]', 'Texto')
    await submit(el, 'form')
    const id = api.calls[0][1].payload.client_request_id
    el.querySelector('[data-testid="capture-new-attempt"]').click()
    await nextTick()
    expect(el.querySelector('fieldset').disabled).toBe(false)
    expect(el.querySelector('[name="source_text"]').value).toBe('Texto')
    await input(el, '[name="source_text"]', 'Texto corregido')
    await submit(el, 'form')
    expect(api.calls[1][1].payload.client_request_id).not.toBe(id)
  })

  it('guards duplicate submits and never emits an old actor’s late capture response', async () => {
    const pending = deferred()
    api.behavior = () => pending.promise
    const actor = ref('staff')
    const created = []
    const el = mount(CaptureForm, {
      actor: 'staff',
      currentActor: () => actor.value,
      onCreated: (value) => created.push(value),
    })
    await input(el, '[name="title"]', 'Consulta privada')
    await input(el, '[name="source_text"]', 'Texto')
    await submit(el, 'form')
    await submit(el, 'form')
    expect(api.calls).toHaveLength(1)
    actor.value = 'other'
    pending.resolve(inquiry())
    await flush()
    expect(created).toEqual([])
    expect(el.querySelector('[name="title"]').value).toBe('')
  })

  it('collects separate people and sends their explicit roles without automatic matching', async () => {
    const el = mount(CaptureForm, {
      actor: 'staff',
      currentActor: () => 'staff',
    })
    await input(el, '[name="title"]', 'Dos personas')
    await input(el, '[name="source_text"]', 'Conversación')
    el.querySelector('[data-testid="capture-add-person"]').click()
    await nextTick()
    await input(el, '[data-field="display_name"]', '@referente')
    await input(el, '[data-field="role"]', 'Referrer')
    await submit(el, 'form')
    expect(api.calls).toHaveLength(1)
    expect(api.calls[0][1].payload.people).toEqual([
      { display_name: '@referente', role: 'Referrer', email: '', phone: '' },
    ])
  })
})

describe('inquiry detail actions', () => {
  it('renders source text as plain text and hides unsafe source URLs', () => {
    const el = mount(InquiryDetail, {
      inquiry: inquiry({
        source_text: '<img src=x onerror="alert(1)">',
        source_url: 'javascript:alert(1)',
      }),
      mutate: async () => null,
    })
    expect(
      el.querySelector('[data-testid="inquiry-source-text"]').textContent,
    ).toContain('<img')
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('[href]')).toBeNull()
  })

  it('only offers conversion for distinct unconverted prospects, including redacted lead protection', () => {
    const el = mount(InquiryDetail, {
      inquiry: inquiry({
        people: [
          { person_key: 'ref', display_name: 'Referente', role: 'Referrer' },
          {
            person_key: 'one',
            display_name: 'Interesada',
            role: 'Interested Person',
          },
          { person_key: 'two', display_name: 'Solicitante', role: 'Requester' },
          {
            person_key: 'hidden',
            display_name: 'Convertida',
            role: 'Requester',
            lead: null,
            lead_accessible: false,
            converted_at: '2026-09-09 09:00:00',
          },
        ],
      }),
      mutate: async () => null,
    })
    expect(
      el.querySelector('[data-person="ref"] [data-testid="select-prospect"]'),
    ).toBeNull()
    expect(
      el.querySelector(
        '[data-person="hidden"] [data-testid="select-prospect"]',
      ),
    ).toBeNull()
    expect(el.querySelectorAll('[data-testid="select-prospect"]')).toHaveLength(
      2,
    )
  })

  it('creates for the selected person and links another only after explicit lead selection', async () => {
    const mutations = []
    const props = reactive({
      inquiry: inquiry({
        people: [
          { person_key: 'one', display_name: 'Primera', role: 'Requester' },
          {
            person_key: 'two',
            display_name: 'Segunda',
            role: 'Interested Person',
          },
        ],
      }),
      mutate: async (method, args) => {
        mutations.push([method, args])
        props.inquiry = {
          ...props.inquiry,
          people: props.inquiry.people.map((person) =>
            person.person_key === args.person_key
              ? {
                  ...person,
                  lead: args.existing_lead || 'NEW-LEAD',
                  lead_accessible: true,
                }
              : person,
          ),
        }
        return {
          inquiry: props.inquiry,
          lead: args.existing_lead || 'NEW-LEAD',
          created: !args.existing_lead,
        }
      },
    })
    const el = mount(InquiryDetail, props)
    el.querySelector(
      '[data-person="one"] [data-testid="select-prospect"]',
    ).click()
    await nextTick()
    await submit(el, '[data-person="one"] form')
    expect(mutations[0]).toEqual(['convert_person', { person_key: 'one' }])
    expect(el.querySelector('[data-person="one"] a').dataset.route).toContain(
      'NEW-LEAD',
    )
    el.querySelector(
      '[data-person="two"] [data-testid="select-prospect"]',
    ).click()
    await nextTick()
    el.querySelector('[data-person="two"] [value="link"]').click()
    await nextTick()
    await submit(el, '[data-person="two"] form')
    expect(mutations).toHaveLength(1)
    expect(el.querySelector('[role="alert"]').textContent).toContain(
      'explícitamente',
    )
    await input(el, '[data-testid="lead-picker"]', 'EXISTING-42')
    await submit(el, '[data-person="two"] form')
    expect(mutations[1]).toEqual([
      'convert_person',
      { person_key: 'two', existing_lead: 'EXISTING-42' },
    ])
  })

  it('preserves follow-up drafts after a conflict and a reload of server values', async () => {
    const mutations = []
    const props = reactive({
      inquiry: inquiry(),
      mutate: async (method, args) => {
        mutations.push([method, args])
        return null
      },
      error: null,
    })
    const el = mount(InquiryDetail, props)
    await input(el, '[name="detail-title"]', 'Borrador pendiente')
    await input(el, '[name="next_action_at"]', '2026-09-12T09:30:00')
    await submit(el, 'form')
    props.error = { kind: 'conflict', message: 'Recarga la consulta.' }
    props.inquiry = inquiry({
      title: 'Otro usuario editó',
      assigned_to: 'new-owner@example.test',
      modified: 'v2',
    })
    await nextTick()
    expect(el.querySelector('h2').textContent).toBe('Otro usuario editó')
    expect(el.querySelector('[name="detail-title"]').value).toBe(
      'Borrador pendiente',
    )
    expect(el.querySelector('[name="next_action_at"]').value).toContain(
      '2026-09-12T09:30',
    )
    expect(el.querySelector('[name="assigned_to"]').value).toBe(
      'new-owner@example.test',
    )
    await submit(el, 'form')
    expect(mutations.at(-1)[1].values.title).toBe('Borrador pendiente')
    expect(mutations.at(-1)[1].values).not.toHaveProperty('assigned_to')
  })

  it('shows explicit close/reopen and prevents write controls on read-only detail', async () => {
    const calls = []
    const props = reactive({
      inquiry: inquiry(),
      mutate: async (method, args) => {
        calls.push([method, args])
        props.inquiry = { ...props.inquiry, ...args.values }
        return props.inquiry
      },
    })
    const el = mount(InquiryDetail, props)
    el.querySelector('[data-testid="detail-close"]').click()
    await flush()
    expect(calls[0]).toEqual([
      'update_inquiry',
      { values: { status: 'Closed' } },
    ])
    expect(el.querySelector('[data-testid="detail-add-person"]')).toBeNull()
    expect(el.querySelector('[data-testid="detail-close"]').textContent).toBe(
      'Reabrir consulta',
    )
    el.querySelector('[data-testid="detail-close"]').click()
    await flush()
    expect(calls[1][1]).toEqual({ values: { status: 'New' } })
    props.inquiry = inquiry({ can_write: false })
    await nextTick()
    expect(el.querySelector('fieldset').disabled).toBe(true)
    expect(el.querySelector('[data-testid="detail-add-person"]')).toBeNull()
  })
})

describe('inquiry source evidence', () => {
  const evidence = (extra = {}) => ({
    version: 1,
    mode: 'automatic',
    provider: 'Messenger',
    account_id: '970000000000031',
    source_kind: 'lead_ad',
    source_id: 'fictional-source-31',
    form_id: 'fictional-form-31',
    leadgen_id: 'fictional-response-31',
    purpose_statement: 'Responder a la solicitud de reparación de pantalla.',
    response_channel: 'Phone call',
    submitted_at: '2026-09-10 10:30:00',
    original_respondent: {
      display_name: 'Solicitante del formulario',
      role: 'Requester',
      email: 'original@example.test',
      phone: '+15555550131',
    },
    ...extra,
  })

  it.each([undefined, null])(
    'hides absent evidence (%s) and preserves the existing source context',
    (source_evidence) => {
      const el = mount(InquiryDetail, {
        inquiry: inquiry({ source_evidence }),
        mutate: vi.fn(),
      })
      expect(
        el.querySelector('[data-testid="inquiry-source-evidence"]'),
      ).toBeNull()
      expect(
        el.querySelector('[data-testid="inquiry-source-text"]').textContent,
      ).toBe('Texto público')
      expect(el.querySelector('a[href]').getAttribute('href')).toBe(
        'https://example.test/post',
      )
    },
  )

  it('keeps original form purpose and respondent separate when another person is added', async () => {
    const original = evidence()
    const snapshot = JSON.stringify(original)
    const mutate = vi.fn()
    const props = reactive({
      inquiry: inquiry({ source_evidence: original }),
      mutate,
    })
    const el = mount(InquiryDetail, props)
    const block = el.querySelector('[data-testid="inquiry-source-evidence"]')
    expect(block.textContent).toContain('Finalidad de contacto del formulario')
    expect(
      block.querySelector('[data-testid="inquiry-form-purpose"]').textContent,
    ).toContain(original.purpose_statement)
    expect(block.textContent).toContain('Llamada telefónica')
    expect(block.textContent).toContain('Captura automática')
    expect(block.textContent).toContain('Formulario de anuncio')
    expect(block.textContent).toContain(original.form_id)
    expect(block.textContent).toContain(original.leadgen_id)
    expect(block.textContent).toContain(original.submitted_at)

    props.inquiry = {
      ...props.inquiry,
      people: [
        {
          person_key: 'added',
          display_name: 'Otra persona interesada',
          role: 'Interested Person',
          email: 'added@example.test',
        },
      ],
    }
    await nextTick()
    const respondent = block.querySelector(
      '[data-testid="inquiry-original-respondent"]',
    )
    expect(respondent.textContent).toContain(
      original.original_respondent.display_name,
    )
    expect(respondent.textContent).toContain(original.original_respondent.email)
    expect(respondent.textContent).toContain(original.original_respondent.phone)
    expect(block.textContent).not.toContain('Otra persona interesada')
    const added = el.querySelector('[data-person="added"]')
    expect(added.textContent).toContain('Otra persona interesada')
    expect(added.textContent).not.toContain(original.purpose_statement)
    expect(added.textContent).not.toContain(original.original_respondent.email)
    expect(block.textContent).toContain(
      'Agregar otra persona no le transfiere esa finalidad.',
    )
    expect(block.textContent).toContain(
      'no acredita consentimiento de marketing ni autoriza envíos',
    )
    expect(JSON.stringify(props.inquiry.source_evidence)).toBe(snapshot)
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'renders malicious evidence as inert read-only text when can_write=%s',
    async (can_write) => {
      const text =
        '<img src=x onerror="alert(1)"><script>alert(2)</script><svg onload="alert(3)">'
      const mutate = vi.fn()
      const el = mount(InquiryDetail, {
        inquiry: inquiry({
          can_write,
          source_evidence: evidence({
            account_id: text,
            source_id: text,
            form_id: text,
            leadgen_id: text,
            purpose_statement: text,
            submitted_at: text,
            original_respondent: {
              display_name: text,
              role: 'Requester',
              email: text,
              phone: text,
            },
          }),
        }),
        mutate,
      })
      await nextTick()
      const block = el.querySelector('[data-testid="inquiry-source-evidence"]')
      expect(block.textContent.split(text)).toHaveLength(10)
      expect(block.querySelector('img, script, svg, iframe')).toBeNull()
      expect(
        block.querySelector(
          'a, button, input, select, textarea, form, [contenteditable]',
        ),
      ).toBeNull()
      expect(mutate).not.toHaveBeenCalled()
      expect(api.calls).toEqual([])
    },
  )
})
