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

describe('who answers: sales on shift or these people', () => {
  const SHIFT_TEAM = {
    ...TEAM,
    people: TEAM.people.map((p, i) => ({ ...p, always: i === 1 })),
    kept: true,
    default_rule: 'shift',
    areas: [
      { key: 'Ventas - GD', label: 'Ventas', people: 2 },
      { key: 'Taller - GD', label: 'Taller', people: 1 },
      { key: '', label: '', people: 1 },
    ],
  }
  const NOW = {
    numbers: 1,
    closed: false,
    rule: 'shift',
    mode: 'shift',
    because: '',
    fallback: 'list',
    people: [
      {
        user: 'tere@example.com',
        full_name: 'Tere',
        kind: 'shift',
        shift: '9–15',
        checked_in: '9:02',
        reach: 'muelle',
      },
      {
        user: 'jenni@example.com',
        full_name: 'Jenni',
        kind: 'always',
        reach: 'muelle_off',
      },
    ],
  }
  async function mountShift(doc) {
    const el = await mount(doc, SHIFT_TEAM)
    api.call.mockImplementation(async (method, args) => {
      api.calls.push([method, args])
      if (method === 'crm.api.calls.ring_now') return NOW
      return SHIFT_TEAM
    })
    return el
  }
  const wait = () => new Promise((resolve) => setTimeout(resolve, 300))

  it('defaults to sales on shift where the shop keeps shifts', async () => {
    const el = await mountShift({
      call_ring_rule: '',
      call_ring_fallback: 'list',
    })
    const checked = el.querySelector('[data-ring-rule] [aria-checked="true"]')
    expect(checked.textContent).toContain('Sales on shift')
    expect(el.querySelector('[data-ring-areas]')).not.toBeNull()
    expect(el.querySelector('[data-ring-fallback]')).not.toBeNull()
    expect(el.querySelectorAll('[data-always]')).toHaveLength(2)
  })

  it('says who rings now and why, for the unsaved choices', async () => {
    const doc = reactive({
      call_ring_rule: 'shift',
      call_ring_fallback: 'list',
      call_ring_skip_areas: '',
    })
    const el = await mountShift(doc)
    await wait()
    await nextTick()
    const asked = api.call.mock.calls.filter(
      ([m]) => m === 'crm.api.calls.ring_now',
    )
    expect(asked.at(-1)[1]).toEqual({
      rule: 'shift',
      fallback: 'list',
      skip_areas: '',
    })
    const now = el.querySelector('[data-ring-now]')
    expect(now.querySelector('[data-ring-now-title]').textContent).toContain(
      'A call rings now',
    )
    const tere = now.querySelector('[data-ring-person="tere@example.com"]')
    expect(tere.textContent).toContain('shift 9–15')
    expect(tere.textContent).toContain('checked in 9:02')
    expect(tere.textContent).toContain('in Muelle')
    const jenni = now.querySelector('[data-ring-person="jenni@example.com"]')
    expect(jenni.textContent).toContain('always rings')
    expect(jenni.textContent).toContain('Muelle is closed')
  })

  it('takes an area off the line on the draft', async () => {
    const doc = reactive({
      call_ring_rule: 'shift',
      call_ring_fallback: 'list',
      call_ring_skip_areas: '',
    })
    const el = await mountShift(doc)
    const taller = el.querySelector('[data-area="Taller - GD"]')
    expect(taller.getAttribute('aria-pressed')).toBe('true')
    taller.click()
    await nextTick()
    expect(doc.call_ring_skip_areas).toBe('["Taller - GD"]')
    expect(
      el
        .querySelector('[data-area="Taller - GD"]')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    el.querySelector('[data-area="Taller - GD"]').click()
    await nextTick()
    expect(doc.call_ring_skip_areas).toBe('')
  })

  it('marks a person to always ring', async () => {
    const el = await mountShift({ call_ring_rule: 'shift' })
    el.querySelector('[data-always]').click()
    await nextTick()
    expect(api.call).toHaveBeenCalledWith('crm.api.calls.save_team_member', {
      user: 'tere@example.com',
      rings: 1,
      always: 1,
    })
  })

  it('hides the shift choices under these people', async () => {
    const el = await mountShift({ call_ring_rule: 'list' })
    expect(el.querySelector('[data-ring-areas]')).toBeNull()
    expect(el.querySelector('[data-ring-fallback]')).toBeNull()
    expect(el.querySelector('[data-always]')).toBeNull()
  })

  it('warns when nobody on shift would go to a message that is off', async () => {
    const el = await mountShift({
      call_ring_rule: 'shift',
      call_ring_fallback: 'message',
      call_voicemail: 0,
    })
    expect(el.textContent).toContain('Let callers leave a message first')
  })
})
