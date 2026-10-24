// The settings sheet opens at the fieldset that fixes a problem and publishes services.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...args) => call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
  Button: {
    props: ['label', 'variant', 'loading', 'disabled', 'icon', 'iconLeft'],
    emits: ['click'],
    template:
      '<button type="button" :data-variant="variant" @click="$emit(\'click\')">{{ label }}</button>',
  },
}))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

import AgendaCitasSettings from '@/components/agenda/AgendaCitasSettings.vue'

const SERVICES = {
  code: 'services',
  message: 'Publish at least one service.',
  section: 'services',
  can_fix: true,
}
const flush = () => new Promise((done) => setTimeout(done, 0))
let app
let root
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(component, props)
  app.config.globalProperties.__ = globalThis.__
  return app.mount(root)
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  call.mockReset()
})
describe('the settings sheet', () => {
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
    profiles: [{ name: 'docomexico', label: 'docomexico', on: true }],
    problems: [SERVICES],
    fixers: [],
    channel: { mode: 'manual', reason: '', templates: {} },
    flow: { account: '', flow: '', status: '', ready: false },
    bookingUrl: '',
  }
  const services = {
    profile: { name: 'docomexico', label: 'docomexico', on: true },
    group: '',
    groups: [{ name: 'Servicios', label: 'Servicios' }],
    items: [],
    can_fix: true,
  }

  it('opens at the «Services» fieldset and lists the group and its switches', async () => {
    call.mockImplementation((method, args) => {
      if (method.endsWith('.settings_get')) return Promise.resolve(settings)
      if (method.endsWith('.services_get'))
        return Promise.resolve(
          args?.group
            ? {
                ...services,
                group: args.group,
                items: [
                  { id: 'SVC-1', label: 'Pantalla', published: false },
                  { id: 'SVC-2', label: 'Batería', published: true },
                ],
              }
            : services,
        )
      return Promise.resolve({})
    })
    const scrolled = []
    Element.prototype.scrollIntoView = function () {
      scrolled.push(this.getAttribute('data-section'))
    }
    mount(AgendaCitasSettings, { section: 'services' })
    await flush()
    await nextTick()
    await flush()
    expect(scrolled).toEqual(['services'])
    const fieldset = root.querySelector('[data-section~="services"]')
    expect(fieldset.textContent).toContain('Your online shop: docomexico')
    const select = fieldset.querySelector('select')
    select.value = 'Servicios'
    select.dispatchEvent(new Event('change'))
    await flush()
    await nextTick()
    const labels = [...fieldset.querySelectorAll('label')].map((l) =>
      l.textContent.trim(),
    )
    expect(labels).toEqual(expect.arrayContaining(['Pantalla', 'Batería']))
    expect(
      [...fieldset.querySelectorAll('input[type=checkbox]')].map(
        (box) => box.checked,
      ),
    ).toEqual([false, true])
  })
})
