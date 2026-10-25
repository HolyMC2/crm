// A card title wraps to two lines and its chip gives way; nothing pushes text
// under a neighbour at 305 px (F16-8 Facebook lead forms, Hoy's due line).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

vi.mock('frappe-ui', () => ({
  createResource: () => ({ submit: vi.fn(), data: null, loading: false }),
  LoadingIndicator: { template: '<span />' },
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  Dropdown: { template: '<div data-dropdown><slot /></div>' },
}))

import MetaLeadForms from '@/components/Forms/channels/MetaLeadForms.vue'
import HoyTask from '@/components/hoy/HoyTask.vue'

let app
let root
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(component, props)
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    props: { to: { type: [String, Object], default: '' } },
    template: '<a><slot /></a>',
  })
  app.mount(root)
  return root
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})

const LONG =
  'Clientes interesados en reparación de pantallas Samsung y Motorola'

describe('Facebook and Messenger lead form cards', () => {
  const card = () =>
    mount(MetaLeadForms, {
      rows: [
        {
          kind: 'facebook_lead_form',
          id: '1',
          name: LONG,
          enabled: 1,
          label: 'Formulario de prospectos',
          leads: 0,
        },
      ],
    })

  it('shows the whole name on up to two lines, never a one-line cut', () => {
    const title = card().querySelector('h3')
    expect(title.textContent.trim()).toBe(LONG)
    expect(title.classList).toContain('line-clamp-2')
    expect(title.classList).toContain('break-words')
    expect(title.classList).not.toContain('truncate')
  })

  it('lets the sync chip wrap below the name and shrink instead of taking the row', () => {
    const chip = card().querySelector('h3 + span')
    expect(chip.textContent.trim()).toBe('Syncing leads')
    expect(chip.parentElement.classList).toContain('flex-wrap')
    expect(chip.classList).not.toContain('shrink-0')
    expect(chip.classList).toContain('min-w-0')
  })
})

describe('Hoy task row', () => {
  it('lets the due text wrap inside its column instead of running under the reschedule button', () => {
    const row = mount(HoyTask, {
      today: '2026-10-25',
      row: {
        name: 'T-1',
        description: 'Enviar cotización de fundas a Ana',
        date: '2026-10-18',
        time: '16:00',
        status: 'Open',
        group: 'overdue',
        reference_label: 'pruebas',
        priority: 'High',
      },
    })
    const due = [...row.querySelectorAll('span')].find((s) =>
      s.textContent.includes('16:00'),
    )
    expect(due.textContent).toContain('Overdue · 7 days · 16:00')
    expect(due.classList).not.toContain('shrink-0')
    expect(due.classList).toContain('min-w-0')
    expect(due.parentElement.classList).toContain('flex-wrap')
  })
})
