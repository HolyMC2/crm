import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, ref } from 'vue'
import {
  bookingRoute,
  clinicContext,
  retryIdentity,
} from '@/utils/clinicRelationships'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))
import { call } from 'frappe-ui'
import ClinicRelationships from '@/components/doco/ClinicRelationships.vue'
import { useClinicRelationships } from '@/composables/clinicRelationships'

const CONTEXT = 'doco.crm.api.context'
const EXECUTE = 'doco.crm.api.execute'
const fixture = (links = []) => ({
  schemaVersion: 1,
  version: 'version-1',
  links,
  appointments: [],
  actions: [
    'link_patient',
    'register_patient',
    'unlink_patient',
    'book_appointment',
  ],
})
const link = {
  id: 'opaque-link-1',
  label: 'Ana Fixture',
  relationship: 'Patient',
}
const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
let app, root, scope
const mount = async (context = fixture()) => {
  call.mockImplementation(async (method) => {
    if (method === CONTEXT) return context
    if (method === 'clinica.api.patients')
      return [{ name: 'PAT-PRIVATE', patient_name: 'Ana Fixture' }]
    if (method === 'clinica.api.bootstrap')
      return {
        canCreatePatient: true,
        timeZone: 'America/Mazatlan',
        sexes: [{ value: 'Female', label: 'Femenino' }],
      }
    return { context: fixture([link]), replayed: false }
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ClinicRelationships, {
    doctype: 'CRM Lead',
    docname: 'lead-fixture',
  })
  app.mount(root)
  await settle()
}
const button = (text) =>
  [...root.querySelectorAll('button')].find(
    (element) => element.textContent.trim() === text,
  )
const click = async (text) => {
  expect(button(text), text).toBeTruthy()
  button(text).click()
  await settle()
}
const input = async (element, value) => {
  element.value = value
  element.dispatchEvent(
    new Event(element.tagName === 'SELECT' ? 'change' : 'input', {
      bubbles: true,
    }),
  )
  await settle()
}
const submit = async () => {
  root
    .querySelector('form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(() => {
  call.mockReset()
  scope = effectScope()
})
afterEach(() => {
  app?.unmount()
  app = null
  root?.remove()
  root = null
  scope.stop()
  vi.restoreAllMocks()
})

describe('clinic relationship panel', () => {
  it('requires explicit patient selection and relationship, preserving the same request ID on retry', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    await mount()
    await click('Vincular paciente existente')
    await input(root.querySelector('input[type="search"]'), 'Ana')
    await submit()
    await click('Ana Fixture · PAT-PRIVATE')
    await input(root.querySelector('select'), 'Guardian')
    let attempts = 0
    const previous = call.getMockImplementation()
    call.mockImplementation(async (method, args) => {
      if (method === EXECUTE && attempts++ === 0)
        throw new Error('connection lost')
      return previous(method, args)
    })
    await click('Confirmar vínculo')
    expect(root.querySelector('input').value).toBe('Ana')
    expect(root.textContent).toContain('No pudimos confirmar el resultado')
    await click('Confirmar vínculo')
    const writes = call.mock.calls
      .filter(([method]) => method === EXECUTE)
      .map(([, args]) => args)
    expect(writes).toHaveLength(2)
    expect(writes[0].request_id).toBe(writes[1].request_id)
    expect(writes[0]).toMatchObject({
      provider: 'clinica:clinic',
      entity: { doctype: 'CRM Lead', name: 'lead-fixture' },
      action: 'link_patient',
      payload: { patient: 'PAT-PRIVATE', relationship: 'Guardian' },
      version: 'version-1',
    })
    expect(root.querySelector('form')).toBeNull()
    expect(storage).not.toHaveBeenCalled()
  })

  it('registers only explicit identity fields with server-provided sex options', async () => {
    await mount()
    await click('Registrar paciente')
    const values = ['Ana', 'Fixture', 'Prueba', '1990-01-02', '+526691234567']
    for (const [index, element] of [
      ...root.querySelectorAll('input'),
    ].entries())
      await input(element, values[index])
    await input(root.querySelector('select'), 'Female')
    await submit()
    const [, request] = call.mock.calls.find(([method]) => method === EXECUTE)
    expect(request.action).toBe('register_patient')
    expect(request.payload).toEqual({
      first_name: 'Ana',
      last_name: 'Fixture',
      maternal_surname: 'Prueba',
      dob: '1990-01-02',
      mobile: '+526691234567',
      sex: 'Female',
    })
    expect(request.payload).not.toHaveProperty('request_id')
    expect(request.request_id).toMatch(/^[\da-f-]{36}$/)
  })

  it('uses only the opaque link in booking URLs and confirms unlinking separately', async () => {
    const context = fixture([{ ...link, id: 'opaque/link?1' }])
    context.appointments = [
      {
        id: 'appointment-1',
        link: 'opaque/link?1',
        start: '2026-09-15T18:00:00Z',
        end: '2026-09-15T18:30:00Z',
        status: 'Confirmed',
        label: 'Cita',
      },
    ]
    await mount(context)
    expect(root.querySelector('a').getAttribute('href')).toBe(
      '/clinica#crm-link=opaque%2Flink%3F1',
    )
    expect(root.textContent).toContain('Próximas citas')
    expect(root.textContent).toContain('Confirmada')
    await click('Quitar vínculo')
    expect(call.mock.calls.some(([method]) => method === EXECUTE)).toBe(false)
    await click('Confirmar desvinculación')
    expect(
      call.mock.calls.find(([method]) => method === EXECUTE)[1],
    ).toMatchObject({
      action: 'unlink_patient',
      payload: { link: 'opaque/link?1' },
    })
  })

  it('preserves drafts on transient revalidation but clears all protected data when read access is revoked', async () => {
    await mount(fixture([link]))
    await click('Registrar paciente')
    await input(root.querySelector('input'), 'Sensitive draft')
    call.mockRejectedValue(new Error('offline'))
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(root.querySelector('input').value).toBe('Sensitive draft')
    call.mockResolvedValue({
      constraints: [{ code: 'permission_denied', severity: 'block' }],
    })
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(root.textContent).not.toContain('Ana Fixture')
    expect(root.querySelector('form')).toBeNull()
    expect(root.textContent).toContain('Se borraron los datos')
    call.mockResolvedValue(fixture())
    await click('Actualizar')
    call.mockResolvedValue({
      canCreatePatient: true,
      sexes: [{ value: 'Female', label: 'Femenino' }],
    })
    await click('Registrar paciente')
    expect(root.querySelector('input').value).toBe('')
  })

  it('does not expose unsupported actions in a read-only context', async () => {
    await mount({ ...fixture([link]), actions: [] })
    expect(button('Vincular paciente existente')).toBeUndefined()
    expect(button('Registrar paciente')).toBeUndefined()
    expect(button('Quitar vínculo')).toBeUndefined()
    expect(root.querySelector('a')).toBeNull()
  })
})

describe('clinic request lifecycle and wire projections', () => {
  it('discards late patient search and mutation results after context navigation', async () => {
    const record = ref({ doctype: 'Contact', name: 'old' })
    const pending = {}
    call.mockImplementation((method) => {
      if (method === CONTEXT) return Promise.resolve(fixture())
      return new Promise((resolve) => {
        pending[method] = resolve
      })
    })
    const state = scope.run(() => useClinicRelationships(() => record.value))
    await settle()
    state.findPatients('Ana')
    state.execute('link_patient', {
      patient: 'old-patient',
      relationship: 'Patient',
    })
    record.value = { doctype: 'Contact', name: 'new' }
    await settle()
    pending['clinica.api.patients']([
      { name: 'old-patient', patient_name: 'Old private identity' },
    ])
    pending[EXECUTE]({ context: fixture([link]) })
    await settle()
    expect(state.candidates.value).toEqual([])
    expect(state.context.value.links).toEqual([])
  })

  it('refreshes stale versions without changing unchanged mutation identity', async () => {
    let reads = 0
    let writes = 0
    call.mockImplementation(async (method) => {
      if (method === CONTEXT) return { ...fixture(), version: `v${++reads}` }
      return writes++ === 0
        ? { constraints: [{ code: 'stale_version' }] }
        : { context: fixture([link]), replayed: false }
    })
    const state = scope.run(() =>
      useClinicRelationships(() => ({ doctype: 'CRM Deal', name: 'deal' })),
    )
    await settle()
    const payload = { patient: 'patient', relationship: 'Patient' }
    await state.execute('link_patient', payload)
    expect(state.errorCode.value).toBe('stale_version')
    expect(state.context.value.version).toBe('v2')
    await state.execute('link_patient', payload)
    const mutations = call.mock.calls
      .filter(([method]) => method === EXECUTE)
      .map(([, args]) => args)
    expect(mutations[0].request_id).toBe(mutations[1].request_id)
    expect(mutations[1].version).toBe('v2')
  })

  it('changes retry identity for edited payloads and strips unexpected context fields', () => {
    let next = 0
    const identity = retryIdentity(() => String(++next))
    expect(identity.for('link_patient', { patient: 'one' })).toBe('1')
    expect(identity.for('link_patient', { patient: 'one' })).toBe('1')
    expect(identity.for('link_patient', { patient: 'two' })).toBe('2')
    expect(
      clinicContext({ ...fixture([link]), medical_notes: 'must not copy' }),
    ).not.toHaveProperty('medical_notes')
    expect(bookingRoute('a/b')).toBe('/clinica#crm-link=a%2Fb')
    expect(() => clinicContext({ ...fixture(), schemaVersion: 2 })).toThrow()
  })
})
