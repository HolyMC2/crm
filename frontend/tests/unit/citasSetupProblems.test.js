// Shell F15b: every place Citas says why a booking cannot happen shows one list
// with its fix; rest days are chosen in the sheet; «who can fix it» names people
// in correct Spanish.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...args) => call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
  Button: {
    props: ['label', 'variant', 'loading', 'disabled'],
    emits: ['click'],
    template:
      '<button type="button" :data-variant="variant" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
}))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))
// ClaimGuard's own unit covers its buttons; here only what it is told to say.
vi.mock('@/components/gastos/ClaimGuard.vue', () => ({
  default: {
    props: ['guard'],
    template: '<p data-guard>{{ guard.message }}</p>',
  },
}))

import CitasSetupProblems from '@/components/agenda/CitasSetupProblems.vue'
import AgendaCitaPanel from '@/components/agenda/AgendaCitaPanel.vue'
import AgendaCitasSettings from '@/components/agenda/AgendaCitasSettings.vue'
import { namesList, setupGuard } from '@/composables/useCitas'

const REST = {
  code: 'rest_days',
  message: 'Choose your rest days so nobody books when you are closed.',
  section: 'rest_days',
  can_fix: true,
}
const HOURS = {
  code: 'hours',
  message: 'Add the days and hours you take appointments.',
  section: 'hours',
  can_fix: false,
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick()
  await new Promise((done) => setTimeout(done, 0))
}
let app, root, events
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  events = []
  app = createApp({
    render: () =>
      h(component, {
        ...props,
        onFix: (section) => events.push(['fix', section]),
        onOpenSettings: (section) => events.push(['open-settings', section]),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  call.mockReset()
})

describe('one list of setup problems', () => {
  it('gives a row its fix when this person may fix it, and names who can otherwise', async () => {
    mount(CitasSetupProblems, {
      problems: [REST, HOURS],
      fixers: ['Ana', 'Beto'],
    })
    await flush()
    const fix = root.querySelector('[data-fix="rest_days"]')
    expect(fix.textContent).toBe('Choose your rest days')
    expect(root.querySelector('[data-fix="hours"]')).toBeNull()
    fix.click()
    expect(events).toEqual([['fix', 'rest_days']])
    expect(root.querySelector('[data-guard]').textContent).toContain(
      'Ana y Beto',
    )
  })

  it('in the settings sheet every row has its section and nobody else is asked', async () => {
    mount(CitasSetupProblems, {
      problems: [REST, HOURS],
      fixers: ['Ana'],
      inSettings: true,
    })
    await flush()
    expect(root.querySelectorAll('[data-fix]')).toHaveLength(2)
    expect(root.querySelector('[data-guard]')).toBeNull()
  })
})

describe('who can set it up', () => {
  it('reads one name, several names and nobody in correct Spanish', () => {
    const translate = globalThis.__
    globalThis.__ = (text, replace, context) =>
      `${context === 'several' ? '[several] ' : ''}${translate(text, replace)}`
    try {
      expect(setupGuard(['Ana']).message).toBe('Ana can set this up.')
      expect(setupGuard(['Ana', 'Beto'], 'es-MX').message).toBe(
        '[several] Ana y Beto can set this up.',
      )
      expect(setupGuard([]).message).toBe('An administrator can set this up.')
    } finally {
      globalThis.__ = translate
    }
    expect(namesList(['Ana', 'Beto', 'Carla'], 'es-MX')).toBe(
      'Ana, Beto y Carla',
    )
  })
})

describe('a reschedule that hits a setup problem', () => {
  it('shows the same list and opens the settings at the right section', async () => {
    call.mockResolvedValue({ days: [], problems: [REST], fixers: [] })
    mount(AgendaCitaPanel, {
      cita: {
        name: 'APMT-1',
        version: 'v1',
        state: 'scheduled',
        actions: [{ id: 'cancel', label: 'Cancel appointment' }],
        party: null,
      },
      timeZone: 'America/Mazatlan',
      locale: 'es-MX',
    })
    await flush()
    const reschedule = [...root.querySelectorAll('button')].find((b) =>
      /Reschedule|Cambiar/.test(b.textContent),
    )
    expect(reschedule).toBeTruthy()
    reschedule.click()
    await flush()
    root.querySelector('[data-fix="rest_days"]').click()
    expect(events).toEqual([['open-settings', 'rest_days']])
  })
})

describe('rest days in the sheet', () => {
  it('chooses the closed days, saves one list and picks it without leaving the sheet', async () => {
    const settings = {
      version: 'v1',
      durationMinutes: 30,
      daysAhead: 14,
      holidayList: '',
      suggestedHolidayList: '',
      holidayLists: [],
      hours: [{ day: 'Monday', from: '09:00', to: '18:00' }],
      agents: [],
      users: [],
      autoMessages: false,
      profiles: [],
      problems: [REST],
      fixers: [],
      channel: { mode: 'manual', reason: '', templates: {} },
      flow: { account: '', flow: '', status: '', ready: false },
      bookingUrl: '',
    }
    call.mockImplementation((method, args) => {
      if (method.endsWith('.settings_get')) return Promise.resolve(settings)
      if (method.endsWith('.services_get'))
        return Promise.resolve({
          profile: null,
          group: '',
          groups: [],
          items: [],
          can_fix: true,
        })
      if (method.endsWith('.rest_days_save'))
        return Promise.resolve({
          holidayList: 'Días de descanso',
          holidayLists: ['Días de descanso'],
          days: JSON.parse(args.payload).days,
        })
      return Promise.resolve({})
    })
    Element.prototype.scrollIntoView = () => {}
    mount(AgendaCitasSettings, { section: 'rest_days' })
    await flush()
    expect(root.querySelector('a[href="/app/holiday-list/new"]')).toBeNull()
    root.querySelector('[data-rest-day="Saturday"]').click()
    await flush()
    root.querySelector('[data-rest-days-save]').click()
    await flush()
    const saved = call.mock.calls.find(([method]) =>
      method.endsWith('.rest_days_save'),
    )
    expect(JSON.parse(saved[1].payload)).toEqual({
      days: ['Sunday', 'Saturday'],
    })
    const select = root.querySelector('[data-section="rest_days"] select')
    expect(select.value).toBe('Días de descanso')
    expect(root.querySelector('[data-rest-days]')).toBeNull()
  })
})
