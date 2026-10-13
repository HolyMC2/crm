// Deal 360 stage stepper: a standard stage reads in Spanish, a tenant's own
// stage reads as written, and a pick still emits the stored stage name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({
  Button: {
    props: ['label'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', { onClick: () => emit('click') }, props.label),
  },
  Dropdown: {
    props: ['options'],
    setup:
      (props, { slots }) =>
      () =>
        h(
          'div',
          { 'data-options': props.options.map((o) => o.label).join('|') },
          slots.default?.(),
        ),
  },
  Tooltip: {
    props: ['text'],
    setup:
      (props, { slots }) =>
      () =>
        h('span', { 'data-tip': props.text }, slots.default?.()),
  },
}))

import StageStepper from '@/components/doco/StageStepper.vue'

const CATALOG = {
  Qualification: 'Calificación',
  'Proposal/Quotation': 'Propuesta/Cotización',
  Negotiation: 'Negociación',
  Won: 'Ganado',
  Lost: 'Perdido',
}
const identity = globalThis.__
const STAGES = [
  { name: 'Qualification', type: 'Open', position: 1, probability: 10 },
  { name: 'Proposal/Quotation', type: 'Ongoing', position: 2, probability: 50 },
  { name: 'Esperando Recepción', type: 'Open', position: 3, probability: 30 },
  { name: 'Won', type: 'Won', position: 4, probability: 100 },
  { name: 'Lost', type: 'Lost', position: 5, probability: 0 },
]

let app
let el
let changes
function mount(current) {
  changes = []
  el = document.createElement('div')
  document.body.appendChild(el)
  app = createApp({
    render: () =>
      h(StageStepper, {
        statuses: STAGES,
        current,
        onChange: (name) => changes.push(name),
      }),
  })
  app.config.globalProperties.__ = (text) => globalThis.__(text)
  app.mount(el)
}

beforeEach(() => {
  globalThis.__ = (text) => CATALOG[text] || text
  window.translated_doctypes = ['CRM Deal Status', 'CRM Lead Status']
})
afterEach(() => {
  app?.unmount()
  el?.remove()
  globalThis.__ = identity
  delete window.translated_doctypes
})

describe('stage stepper labels', () => {
  it('draws standard stages in Spanish and keeps custom ones as written', async () => {
    mount('Qualification')
    await nextTick()
    const segments = [...el.querySelectorAll('[data-tip] button')].map((b) =>
      b.textContent.trim(),
    )
    expect(segments).toEqual([
      'Calificación',
      'Propuesta/Cotización',
      'Esperando Recepción',
    ])
    expect(el.querySelector('[data-tip]').dataset.tip).toBe(
      'Calificación · 10%',
    )
    expect(el.querySelector('[data-options]').dataset.options).toBe('Perdido')
  })
  it('emits the stored stage name when a translated segment is picked', async () => {
    mount('Qualification')
    await nextTick()
    const proposal = [...el.querySelectorAll('[data-tip] button')].find(
      (b) => b.textContent.trim() === 'Propuesta/Cotización',
    )
    proposal.click()
    expect(changes).toEqual(['Proposal/Quotation'])
  })
  it('names the lost stage a closed deal sits on in Spanish', async () => {
    mount('Lost')
    await nextTick()
    const buttons = [...el.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(buttons).toContain('Perdido · Perdido')
  })
  it('shows a legacy stage outside the visible set by its Spanish name', async () => {
    mount('Negotiation')
    await nextTick()
    expect(el.textContent).toContain('Negociación')
    expect(el.textContent).not.toContain('Negotiation')
  })
})
