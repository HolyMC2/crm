// Actividad y comentarios (RecordActivity): one timeline of events, comments and
// the record's emails, filtered by Todo / Comentarios / Correos / Cambios.
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import Actividad from '@/components/documentos/Actividad.vue'
import {
  cleanTag,
  emailEvents,
  filterCounts,
  inFilter,
} from '@/documentos/actividad'

const events = [
  { kind: 'create', who: 'Ana', at: '2026-10-01 09:00:00' },
  {
    kind: 'comment',
    who: 'Beto',
    text: 'Llamar el lunes',
    at: '2026-10-02 10:00:00',
  },
  { kind: 'edit', who: 'Ana', fields: ['Monto'], at: '2026-10-03 11:00:00' },
  {
    kind: 'assignment',
    who: 'Ana',
    text: 'Asignado a Beto',
    at: '2026-10-03 12:00:00',
  },
]
const correos = [
  {
    name: 'COMM-1',
    asunto: 'Cotización 12',
    de: { nombre: 'Ana López', correo: 'ana@tienda.mx' },
    fecha: '2026-10-04 08:00:00',
    direccion: 'enviado',
    snippet: 'Te mando la cotización',
  },
  {
    name: 'COMM-2',
    asunto: 'Re: Cotización 12',
    de: { nombre: 'Cliente', correo: 'cliente@x.mx' },
    fecha: '2026-10-05 08:00:00',
    direccion: 'recibido',
  },
]

describe('record activity filters', () => {
  it('splits comments, emails and every other change', () => {
    const all = [...events, ...emailEvents(correos)]
    expect(filterCounts(all)).toEqual({
      all: 6,
      comment: 1,
      email: 2,
      change: 3,
    })
    expect(all.filter((e) => inFilter(e, 'change')).map((e) => e.kind)).toEqual(
      ['create', 'edit', 'assignment'],
    )
    expect(inFilter(events[1], 'all')).toBe(true)
    expect(inFilter(null, 'all')).toBe(false)
  })

  it('turns the record emails into events that name a person, never an address', () => {
    const [sent, received] = emailEvents(correos, (de) => de.nombre)
    expect(sent).toMatchObject({
      kind: 'email',
      id: 'COMM-1',
      who: 'Ana López',
      text: 'Cotización 12',
      direction: 'enviado',
    })
    expect(received.direction).toBe('recibido')
    expect(emailEvents([{ asunto: 'sin nombre' }])).toEqual([])
  })

  it('cleans a tag the way the server keeps it', () => {
    expect(cleanTag('  Cliente,  VIP ')).toBe('Cliente VIP')
    expect(cleanTag('x'.repeat(60))).toHaveLength(40)
    expect(cleanTag(null)).toBe('')
  })
})

async function render(props) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(Actividad, props) })
  app.component('RouterLink', {
    props: ['to'],
    setup:
      (p, { slots }) =>
      () =>
        h('a', { href: p.to.path }, slots.default?.()),
  })
  app.mount(el)
  await nextTick()
  return { el, app }
}

describe('Actividad inside RecordActivity', () => {
  it('shows only the chosen filter, emails among the events by date', async () => {
    const { el, app } = await render({
      activity: { events },
      heading: false,
      filter: 'all',
      emails: emailEvents(correos, (de) => de.nombre),
    })
    const rows = [...el.querySelectorAll('[data-testid="documentos-event"]')]
    expect(rows).toHaveLength(6)
    // newest first: the received email leads
    expect(rows[0].textContent).toContain('Llegó un correo de Cliente')
    expect(
      el.querySelector('[data-testid="documentos-email"]').getAttribute('href'),
    ).toBe('/correo/COMM-2')
    expect(el.querySelector('h2')).toBeNull()
    app.unmount()
  })

  it('draws a comment as a bubble and says when a filter is empty', async () => {
    const { el, app } = await render({
      activity: { events },
      heading: false,
      filter: 'comment',
    })
    expect(
      el.querySelector('[data-testid="documentos-comment"]').textContent,
    ).toBe('Llamar el lunes')
    app.unmount()
    const empty = await render({
      activity: { events },
      heading: false,
      filter: 'email',
    })
    expect(
      empty.el.querySelector('[data-testid="documentos-events-empty"]')
        .textContent,
    ).toContain('Aún no se ha mandado ningún correo')
    empty.app.unmount()
  })
})
