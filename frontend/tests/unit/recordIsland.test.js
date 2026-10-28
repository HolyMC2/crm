// A record's bar, WhatsApp-style: llamar, WhatsApp and correo share one
// island, the bolt holds the steps and the follow-ups, «⋯» the rest.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { recordActionsFor } from '@/documentos/acciones'
import RecordIsland from '@/components/documentos/RecordIsland.vue'

const labels = (group) => group.items.map((item) => item.label)

describe('recordActionsFor', () => {
  it('puts the steps and «Editar» first, then what keeps the record in sight', () => {
    const groups = recordActionsFor({
      steps: [
        { label: 'Confirmar', icon: 'lucide-check' },
        { label: 'Facturar' },
      ],
      canEdit: true,
      tools: [
        { key: 'assign', label: 'Asignar', allowed: true },
        { key: 'avisame', label: 'Avísame…', allowed: true },
        {
          key: 'repetir',
          label: 'Repetir cada…',
          allowed: true,
          hint: 'Se crea una copia sola',
        },
        { key: 'pendiente', label: 'Nuevo pendiente', allowed: true },
      ],
    })
    expect(groups.map((g) => g.title)).toEqual([
      'Siguiente paso',
      'Dar seguimiento',
    ])
    expect(labels(groups[0])).toEqual(['Confirmar', 'Facturar', 'Editar'])
    expect(groups[0].items.map((i) => i.key)).toEqual([
      'paso:0',
      'paso:1',
      'editar',
    ])
    expect(labels(groups[1])).toEqual([
      'Nuevo pendiente',
      'Avísame…',
      'Repetir cada…',
    ])
  })

  it('has nothing to show for a record with no step and no follow-up', () => {
    expect(recordActionsFor({ steps: [], canEdit: false, tools: [] })).toEqual(
      [],
    )
  })
})

let app
let root
function mount(props) {
  const events = []
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      h(RecordIsland, {
        who: 'Ana López',
        ...props,
        onMessage: () => events.push('message'),
        onMail: () => events.push('mail'),
        onTools: () => events.push('tools'),
      }),
  })
  app.mount(root)
  return events
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const reach = (kind) => root.querySelector(`[data-reach="${kind}"]`)

describe('the record island', () => {
  it('calls, writes on WhatsApp and mails the record’s person', () => {
    const events = mount({
      reach: { phone: '+52 (667) 100-2000', email: 'ana@example.com' },
      mail: { allowed: true },
    })
    expect(reach('call').getAttribute('href')).toBe('tel:+526671002000')
    expect(reach('call').getAttribute('aria-label')).toBe('Llamar a Ana López')
    expect(reach('whatsapp').getAttribute('href')).toBe(
      'https://wa.me/526671002000',
    )
    reach('mail').click()
    root.querySelector('[data-testid="documentos-tools-open"]').click()
    expect(events).toEqual(['mail', 'tools'])
  })

  it('opens the shop’s composer for WhatsApp when Ventas is on', () => {
    const events = mount({ reach: { phone: '6671002000' }, composer: true })
    expect(reach('whatsapp').tagName).toBe('BUTTON')
    reach('whatsapp').click()
    expect(events).toEqual(['message'])
  })

  it('shows only the ways the record has; correo waits in «⋯» on a phone', () => {
    mount({ reach: { email: 'ana@example.com' }, mail: { allowed: true } })
    expect(reach('call')).toBeNull()
    expect(reach('whatsapp')).toBeNull()
    expect(reach('mail')).not.toBeNull()
    app.unmount()
    root.remove()
    mount({
      reach: { phone: '6671002000', email: 'ana@example.com' },
      mail: { allowed: true },
      phone: true,
    })
    expect(reach('call')).not.toBeNull()
    expect(reach('mail')).toBeNull()
  })

  it('keeps a refused correo in place and says why', () => {
    const events = mount({
      reach: {},
      mail: { allowed: false, reason: 'Guarda el borrador primero.' },
    })
    expect(reach('mail').getAttribute('title')).toBe(
      'Guarda el borrador primero.',
    )
    reach('mail').click()
    expect(events).toEqual(['mail'])
  })
})
