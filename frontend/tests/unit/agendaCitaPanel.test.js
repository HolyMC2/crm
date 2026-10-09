// The cita block of the Agenda panel: one primary action per state, the Taller hand-off,
// and «Reagendar por WhatsApp» after a no-show.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({
  call: vi.fn(() =>
    Promise.resolve({
      days: [
        {
          date: '2026-10-09',
          slots: [
            { start: '2026-10-09T16:00:00Z', end: '2026-10-09T17:00:00Z' },
          ],
        },
      ],
    }),
  ),
  Button: {
    props: ['label', 'variant', 'loading', 'theme', 'iconLeft'],
    emits: ['click'],
    template:
      '<button :data-variant="variant" @click="$emit(\'click\')">{{ label }}</button>',
  },
}))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

import AgendaCitaPanel from '@/components/agenda/AgendaCitaPanel.vue'

const TZ = 'America/Mexico_City'
const CITA = {
  name: 'APMT-Ana-0001',
  folio: 'C-ABC123',
  version: 'v1',
  service: 'Cambio de pantalla',
  customer: 'Ana Pérez',
  state: 'scheduled',
  phone: '+52 668 123 4567',
  notes: 'No enciende',
  party: { doctype: 'Contact', name: 'CON-ANA' },
  actions: [
    { id: 'receive', label: 'Receive device' },
    { id: 'arrived', label: 'Arrived' },
    { id: 'no_show', label: 'Did not come' },
    { id: 'cancel', label: 'Cancel appointment' },
  ],
  whatsapp: { mode: 'manual', url: 'https://wa.me/526681234567?text=hola' },
}
let app
let root
function mountPanel(cita, events = []) {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(AgendaCitaPanel, {
    cita,
    timeZone: TZ,
    returnTo: '/crm/agenda?view=day',
    onAction: (id) => events.push(['action', id]),
    onMove: (slot) => events.push(['move', slot]),
  })
  app.config.globalProperties.__ = window.__
  app.mount(root)
  return events
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const buttons = () =>
  [...root.querySelectorAll('button')].map((b) => b.textContent.trim())

describe('Agenda cita panel', () => {
  it('makes «Recibir equipo» the one primary action when Taller can receive it', () => {
    mountPanel(CITA)
    const receive = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Receive device'),
    )
    expect(new URL(receive.href).pathname).toBe('/taller/intake')
    expect(new URL(receive.href).searchParams.get('cita')).toBe('APMT-Ana-0001')
    const arrived = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Arrived'),
    )
    expect(arrived.dataset.variant).toBe('subtle')
  })

  it('makes «Llegó» primary without Taller', () => {
    mountPanel({
      ...CITA,
      actions: CITA.actions.filter((a) => a.id !== 'receive'),
    })
    const arrived = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Arrived'),
    )
    expect(arrived.dataset.variant).toBe('solid')
  })

  it('asks before cancelling', async () => {
    const events = mountPanel(CITA)
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent === 'Cancel appointment')
      .click()
    await nextTick()
    expect(events).toEqual([])
    const confirm = [
      ...root.querySelectorAll('[role=alertdialog] button'),
    ].find((b) => b.textContent === 'Cancel appointment')
    confirm.click()
    expect(events).toEqual([['action', 'cancel']])
  })

  it('offers free times and moves to the chosen one', async () => {
    const events = mountPanel(CITA)
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent === 'Reschedule')
      .click()
    await new Promise((r) => setTimeout(r))
    await nextTick()
    const slot = [...root.querySelectorAll('button')].find((b) =>
      /\d:\d\d/.test(b.textContent),
    )
    slot.click()
    expect(events[0][0]).toBe('move')
    expect(events[0][1].start).toBe('2026-10-09T16:00:00Z')
  })

  it('after a no-show offers rebooking on WhatsApp and no actions', () => {
    mountPanel({ ...CITA, state: 'missed', outcome: 'No vino', actions: [] })
    const link = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Rebook on WhatsApp'),
    )
    expect(link.href).toContain('https://wa.me/')
    expect(buttons()).not.toContain('Arrived')
  })

  it('tells a reader without rights who to ask', () => {
    mountPanel({ ...CITA, actions: [] })
    expect(root.textContent).toContain(
      'Ask your manager for access to change appointments.',
    )
  })
})
