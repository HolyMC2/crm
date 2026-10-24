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

describe('Actividad attribution', () => {
  it('names the person the assistant built the record for, with the assistant', async () => {
    const [bot, own] = await sentences([
      {
        kind: 'create',
        who: 'Ernesto Encargado',
        via: 'Contabot',
        at: '2026-10-18 12:00:00',
      },
      { kind: 'create', who: 'Marco', at: '2026-10-18 12:00:00' },
    ])
    expect(bot).toBe('Ernesto Encargado creó la orden · con Contabot')
    expect(own).toBe('Marco creó la orden')
  })
})

describe('Actividad contact rows', () => {
  it('reads an address, a phone and a toggled principal without quantities', async () => {
    const { sentences, lines } = await ledger([
      edit({
        rows: 3,
        tables: [
          { label: 'Correos', count: 2 },
          { label: 'Teléfonos', count: 1 },
        ],
        items: {
          added: [{ label: 'ana@x.mx', qty: null, amount: null }],
          removed: [{ label: 'vieja@x.mx', qty: null, amount: null }],
          changed: [
            {
              label: '55 1234 5678',
              changes: [
                { label: 'Es principal', type: 'check', from: 'No', to: 'Sí' },
              ],
            },
          ],
        },
      }),
    ])
    expect(sentences).toEqual(['Contabot cambió la factura'])
    expect(lines).toEqual([
      '+ ana@x.mx',
      '− vieja@x.mx',
      '55 1234 5678: Es principal No → Sí',
    ])
  })
})

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

// ── The attribution ledger: what each person changed, not only that they changed it ──

async function ledger(events, props = {}) {
  const el = document.createElement('div')
  const app = createApp({
    render: () =>
      h(Actividad, {
        activity: { events },
        noun: 'la factura',
        ...props,
      }),
  })
  app.mount(el)
  await nextTick()
  const sentences = [
    ...el.querySelectorAll('[data-testid="documentos-event"]'),
  ].map((li) => li.querySelector('span.text-base').textContent.trim())
  const lines = [
    ...el.querySelectorAll('[data-testid="documentos-diff-line"]'),
  ].map((li) => li.textContent.trim())
  app.unmount()
  return { sentences, lines }
}

const edit = (extra) => ({
  kind: 'edit',
  who: 'Contabot',
  at: '2026-10-18 12:00:00',
  ...extra,
})

describe('Actividad edit diff', () => {
  it('shows a money field as old → new in the record currency', async () => {
    const { sentences, lines } = await ledger([
      edit({
        changes: [{ label: 'Monto', type: 'money', from: 2000, to: 2500 }],
      }),
    ])
    expect(sentences[0]).toBe('Contabot cambió la factura')
    expect(lines).toEqual(['Monto: $2,000.00 → $2,500.00'])
  })

  it('keeps another currency in its code', async () => {
    const { lines } = await ledger(
      [
        edit({
          changes: [{ label: 'Monto', type: 'money', from: 12, to: 15 }],
        }),
      ],
      { currency: 'USD' },
    )
    expect(lines).toEqual(['Monto: USD 12.00 → USD 15.00'])
  })

  it('says an emptied field as «—» and a percentage with its sign', async () => {
    const { lines } = await ledger([
      edit({
        changes: [
          { label: 'Nota', type: 'text', from: 'Pagar el lunes', to: '' },
          { label: 'IVA', type: 'percent', from: 16, to: 8 },
        ],
      }),
    ])
    expect(lines).toEqual(['Nota: Pagar el lunes → —', 'IVA: 16% → 8%'])
  })

  it('names the items that came, went or changed', async () => {
    const { lines } = await ledger([
      edit({
        rows: 3,
        tables: [{ label: 'Artículos', count: 3 }],
        items: {
          added: [{ label: 'Funda iPhone', qty: 2, amount: 250 }],
          removed: [{ label: 'Mica templada', qty: 1, amount: null }],
          changed: [
            {
              label: 'Funda iPhone',
              changes: [{ label: 'Cantidad', type: 'number', from: 1, to: 2 }],
            },
          ],
        },
      }),
    ])
    expect(lines).toEqual([
      '+ Funda iPhone · 2 · $250.00',
      '− Mica templada · 1',
      'Funda iPhone: Cantidad 1 → 2',
    ])
  })

  it('counts the rows it did not detail and the fields it trimmed', async () => {
    const { lines } = await ledger([
      edit({
        rows: 5,
        changes: [{ label: 'Monto', type: 'money', from: 1, to: 2 }],
        changes_more: 2,
        items: { added: [{ label: 'Funda iPhone', qty: 1, amount: 10 }] },
      }),
    ])
    expect(lines).toContain('y 2 campos más')
    expect(lines).toContain('y 4 cambios más en las filas')
  })

  it('keeps the older sentence when the server sends only labels and a row count', async () => {
    const { sentences, lines } = await ledger([
      edit({ fields: ['Monto'], more: 1, rows: 2 }),
    ])
    expect(sentences[0]).toBe('Contabot cambió monto y 1 más y los artículos')
    expect(lines).toEqual([])
  })

  it('names the table that moved when there are no item details', async () => {
    const { sentences, lines } = await ledger([
      edit({ rows: 1, tables: [{ label: 'Pagos', count: 1 }] }),
    ])
    expect(sentences[0]).toBe('Contabot cambió pagos')
    expect(lines).toEqual([])
  })

  it('shows no diff lines under a comment or a submit', async () => {
    const { lines } = await ledger([
      {
        kind: 'comment',
        who: 'Ana',
        text: 'Revisado',
        at: '2026-10-18 11:00:00',
      },
      { kind: 'submit', who: 'Marco', at: '2026-10-18 10:00:00' },
    ])
    expect(lines).toEqual([])
  })
})
