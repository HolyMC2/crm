// Actividad (Shell SPEC §6 DD7): ERPNext notes a status change with the bare
// English status («To Bill»); the worker reads it as a change in the list's
// words, never «Marco: To Bill». Other notes keep their text.
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import Actividad from '@/components/documentos/Actividad.vue'

async function sentences(events) {
  const el = document.createElement('div')
  const app = createApp({
    render: () => h(Actividad, { activity: { events }, noun: 'la orden' }),
  })
  app.mount(el)
  await nextTick()
  const out = [...el.querySelectorAll('[data-testid="documentos-event"]')].map(
    (li) => li.querySelector('span.text-base').textContent.trim(),
  )
  app.unmount()
  return out
}

describe('Actividad status notes', () => {
  it('says a status note in either language as a change', async () => {
    const [en, es, none] = await sentences([
      {
        kind: 'status',
        who: 'Marco',
        text: 'To Bill',
        at: '2026-10-18 12:00:00',
      },
      {
        kind: 'status',
        who: 'Ana',
        text: 'Por facturar',
        at: '2026-10-18 11:00:00',
      },
      { kind: 'status', who: 'Ana', text: '', at: '2026-10-18 10:00:00' },
    ])
    expect(en).toBe('Marco cambió el estado a Por facturar')
    expect(es).toBe('Ana cambió el estado a Por facturar')
    expect(none).toBe('Ana cambió el estado')
  })

  it('says a bare English status as «cambió el estado a» with the list word', async () => {
    const [line] = await sentences([
      {
        kind: 'info',
        who: 'Marco',
        text: 'To Bill',
        at: '2026-10-18 10:00:00',
      },
    ])
    expect(line).toBe('Marco cambió el estado a Por facturar')
    expect(line).not.toMatch(/To Bill/)
  })

  it('keeps a note that is not a status as it is', async () => {
    const [line] = await sentences([
      {
        kind: 'info',
        who: 'Marco',
        text: 'Pedí precios al proveedor',
        at: '2026-10-18 10:00:00',
      },
    ])
    expect(line).toBe('Marco: Pedí precios al proveedor')
  })

  it('names nobody as «Alguien» and an empty note as just the person', async () => {
    const [a, b] = await sentences([
      { kind: 'info', text: 'Completed', at: '2026-10-18 10:00:00' },
      { kind: 'workflow', who: 'Ana', at: '2026-10-18 09:00:00' },
    ])
    expect(a).toMatch(/^Alguien cambió el estado a /)
    expect(a).not.toMatch(/Completed/)
    expect(b).toBe('Ana')
  })
})
