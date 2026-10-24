// The «Nueva cita» gate: one action per setup problem, and who can fix it otherwise.
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

import AgendaCitaForm from '@/components/agenda/AgendaCitaForm.vue'

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
const buttons = () =>
  [...root.querySelectorAll('button')].map((b) => b.textContent.trim())

describe('the «Nueva cita» gate', () => {
  it('offers one button per problem the user can fix, opening its section', async () => {
    call.mockResolvedValue({ problems: [SERVICES], fixers: [], days: [] })
    const opened = []
    mount(AgendaCitaForm, {
      timeZone: 'America/Mexico_City',
      onOpenSettings: (section) => opened.push(section),
    })
    await flush()
    await nextTick()
    expect(root.textContent).toContain('Publish at least one service.')
    expect(buttons()).toEqual(['Publish services'])
    root.querySelector('button').click()
    expect(opened).toEqual(['services'])
  })

  it('names who can fix it and offers the setup request to everyone else', async () => {
    call.mockResolvedValue({
      problems: [{ ...SERVICES, can_fix: false }],
      fixers: ['Marco Dueño'],
      days: [],
    })
    mount(AgendaCitaForm, { timeZone: 'America/Mexico_City' })
    await flush()
    await nextTick()
    expect(root.textContent).toContain('Marco Dueño can set this up.')
    expect(buttons()).toEqual(['Ask for it to be set up'])
  })

  it('keeps «Try again» only for a problem nothing in the shell fixes', async () => {
    call.mockResolvedValue({
      problems: [
        {
          code: 'not_installed',
          message: 'Being set up.',
          section: null,
          can_fix: false,
        },
      ],
      fixers: [],
      days: [],
    })
    mount(AgendaCitaForm, { timeZone: 'America/Mexico_City' })
    await flush()
    await nextTick()
    expect(buttons()).toEqual(['Try again'])
  })

  it('shows a failed load with a way to retry', async () => {
    call.mockRejectedValue(new Error('offline'))
    mount(AgendaCitaForm, { timeZone: 'America/Mexico_City' })
    await flush()
    await nextTick()
    expect(root.textContent).toContain('offline')
    expect(buttons()).toEqual(['Try again'])
  })
})
