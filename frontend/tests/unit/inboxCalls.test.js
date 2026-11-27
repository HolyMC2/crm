// Bandeja › Llamadas (InboxCalls.vue): who the shop's line rings and where each
// person takes calls (crm.api.calls.team / save_team_member), what a caller hears
// when nobody can answer, and the call goals (moved here from «Service»).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({
  calls: [],
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  toast: api.toast,
  Button: {
    props: ['label', 'disabled', 'type'],
    setup: (p) => () =>
      h('button', { type: p.type || 'button', disabled: p.disabled }, p.label),
  },
  FormControl: {
    props: ['modelValue', 'label', 'type'],
    emits: ['update:modelValue'],
    setup:
      (p, { emit }) =>
      () =>
        h('input', {
          'aria-label': p.label,
          'data-field': p.label,
          value: p.modelValue ?? '',
          onInput: (e) => emit('update:modelValue', e.target.value),
        }),
  },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Settings/Inbox/SettingSwitch.vue', () => ({
  default: {
    props: ['label', 'modelValue', 'disabled', 'blocked'],
    setup: (p) => () =>
      h(
        'div',
        { 'data-switch': p.label, 'data-disabled': String(!!p.disabled) },
        p.blocked || '',
      ),
  },
}))

import InboxCalls from '@/components/Settings/Inbox/InboxCalls.vue'

const TEAM = {
  numbers: ['+526690000001'],
  enabled: true,
  people: [
    {
      user: 'tere@example.com',
      full_name: 'Tere',
      device: 'Computer',
      has_mobile: false,
      mobile_end: '',
      has_sip: false,
    },
    {
      user: 'jenni@example.com',
      full_name: 'Jenni',
      device: 'Phone',
      has_mobile: true,
      mobile_end: '4321',
      has_sip: false,
    },
  ],
}

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
beforeEach(() => api.call.mockReset())

async function mount(doc, team = TEAM) {
  api.call.mockImplementation(async (method) => (api.calls.push(method), team))
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(InboxCalls, { doc: reactive(doc) }) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  await nextTick()
  return el
}

describe('the shop line settings', () => {
  it('lists who answers and where, with the phone ending shown', async () => {
    const el = await mount({})
    expect(api.call).toHaveBeenCalledWith('crm.api.calls.team')
    const rows = [...el.querySelectorAll('[data-call-team] li')]
    expect(rows.map((r) => r.querySelector('p').textContent.trim())).toEqual([
      'Tere',
      'Jenni',
    ])
    expect(rows[1].querySelector('select').value).toBe('Phone')
    expect(rows[1].textContent).toContain('On their phone ···4321')
  })

  it('asks for the mobile number before sending calls to a phone', async () => {
    const el = await mount({})
    const select = el.querySelector('[data-call-team] li select')
    select.value = 'Phone'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    expect(api.call).toHaveBeenCalledTimes(1)
    const form = el.querySelector('[data-ask-mobile]')
    const input = form.querySelector('input')
    input.value = '669 555 0000'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await nextTick()
    expect(api.call).toHaveBeenLastCalledWith(
      'crm.api.calls.save_team_member',
      {
        user: 'tere@example.com',
        rings: 1,
        device: 'Phone',
        mobile_no: '669 555 0000',
      },
    )
  })

  it('says to connect the number when the shop has none', async () => {
    const el = await mount({}, { numbers: [], people: [], enabled: false })
    expect(el.querySelector('[data-no-line]').textContent).toContain(
      'Ajustes › Teléfono',
    )
    expect(el.querySelector('[data-call-team]')).toBeNull()
  })

  it('blocks the after-hours message until office hours are on', async () => {
    const el = await mount({ office_hours_enabled: 0, call_after_hours: 0 })
    const after = el.querySelector(
      '[data-switch="Answer calls outside office hours with a message"]',
    )
    expect(after.dataset.disabled).toBe('true')
    expect(after.textContent).toContain('Turn office hours on')
  })

  it('shows the messages only while their switch is on', async () => {
    const el = await mount({
      office_hours_enabled: 1,
      call_after_hours: 1,
      call_after_hours_message: '',
      call_voicemail: 0,
      call_ring_seconds: 25,
    })
    const fields = [...el.querySelectorAll('[data-field]')].map(
      (n) => n.dataset.field,
    )
    expect(fields).toContain('Ring the team for (seconds)')
    expect(fields).toContain('Message for calls outside office hours')
    expect(fields).not.toContain('What callers hear before leaving a message')
    expect(el.textContent).toContain(
      'Write what callers hear outside office hours.',
    )
  })

  it('keeps the call goals here, only where the server has them', async () => {
    let el = await mount({ call_callback_minutes: 30, call_pickup_goal: 80 })
    let fields = [...el.querySelectorAll('[data-field]')].map(
      (n) => n.dataset.field,
    )
    expect(fields).toEqual(
      expect.arrayContaining([
        'Return a missed call within (minutes)',
        'Calls picked up goal (%)',
      ]),
    )
    cleanups.splice(0).forEach((cleanup) => cleanup())
    el = await mount({})
    fields = [...el.querySelectorAll('[data-field]')].map(
      (n) => n.dataset.field,
    )
    expect(fields.join('\n')).not.toMatch(/missed call|picked up|Ring the team/)
  })
})
