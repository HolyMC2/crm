import { describe, expect, it, vi } from 'vitest'

const calls = []
vi.mock('frappe-ui', () => ({
  call: (method, args) => {
    calls.push({ method, args })
    return Promise.resolve({})
  },
}))

const turno = await import('@/documentos/turno')
const { default: profile, cashierName } = await import(
  '@/documentos/profiles/pos_shift'
)
const { hasCuratedProfile, loadProfile } = await import('@/documentos/profiles')

const now = new Date(2026, 10, 23, 20, 0)

// shift_view.shift for a closed turn, as the owner reads it.
function closedTurn(over = {}) {
  return {
    shift: {
      name: 'POSA-OS-707',
      status: 'Closed',
      cashier: 'jenni@x',
      caja: 'Doco Ventas',
      pos_profile: 'Doco Ventas',
      store: null,
      currency: 'MXN',
      opened: '2026-11-23 09:05:58.128709',
      closed: '2026-11-23 19:49:00',
      closing: 'POSA-CS-707',
    },
    cash_mode: 'Efectivo',
    amounts: true,
    blind: false,
    opening: [{ mode_of_payment: 'Efectivo', amount: 500 }],
    sales: {
      rows: [
        {
          doctype: 'Sales Invoice',
          name: 'SINV-3',
          customer: 'Público en General',
          amount: -50,
          currency: 'MXN',
          at: '2026-11-23 12:00:00',
          is_return: true,
          status: 'Return',
        },
        {
          doctype: 'Sales Invoice',
          name: 'SINV-2',
          customer: 'Ana López',
          amount: 300,
          currency: 'MXN',
          at: '2026-11-23 11:00:00',
          is_return: false,
          status: 'Paid',
        },
      ],
      count: 1,
      returns: 1,
      drafts: 1,
      total: 250,
      returns_total: 50,
      has_more: false,
    },
    payments: [
      {
        mode_of_payment: 'Efectivo',
        opening: 500,
        counted: 900,
        expected: 910,
        difference: -10,
      },
      {
        mode_of_payment: 'Tarjeta',
        opening: 0,
        counted: 200,
        expected: 200,
        difference: 0,
      },
    ],
    cobros: [],
    movements: [
      {
        name: 'CM-1',
        type: 'Expense',
        kind: null,
        amount: 40,
        reason: 'Garrafón de agua',
        employee: null,
        user: 'jenni@x',
        at: '2026-11-23 13:15:00',
      },
    ],
    drawer_opens: {
      count: 1,
      rows: [
        {
          name: 'AC-1',
          occurred_at: '2026-11-23 11:30:00',
          user_name: 'Jenni',
          reason_code: 'Dar cambio',
          reason_note: '',
        },
      ],
    },
    transfers: [],
    bags: [
      {
        name: 'BAG-1',
        seal: 'T-0042',
        purpose: 'Takings',
        state: 'Unverified',
        direction: 'out',
        amount: 410,
        currency: 'MXN',
        user: 'jenni@x',
      },
    ],
    counts: [
      {
        name: 'CC-1',
        scope: 'Drawer',
        state: 'Exception',
        amount: 900,
        expected_amount: 910,
        difference: -10,
        counted_by: 'jenni@x',
        at: '2026-11-23 19:48:00',
      },
    ],
    handovers: null,
    people: { 'jenni@x': 'Jennifer Corona' },
    ...over,
  }
}

describe('a register turn on its document page', () => {
  it('reads posawesome’s whole-turn read for either half', () => {
    turno.readShift('POS Closing Shift', 'POSA-CS-707')
    expect(calls.at(-1)).toEqual({
      method: 'posawesome.posawesome.api.shift_view.shift',
      args: { doctype: 'POS Closing Shift', name: 'POSA-CS-707' },
    })
  })

  it('says where and when the turn ran', () => {
    expect(turno.turnLine(closedTurn(), { now })).toBe(
      'Doco Ventas · hoy, 09:05–19:49',
    )
    const open = closedTurn()
    open.shift = { ...open.shift, closed: null, closing: null, status: 'Open' }
    expect(turno.turnLine(open, { now })).toBe(
      'Doco Ventas · abierto desde hoy 09:05',
    )
  })

  it('tiles: what it sold, the cash counted against expected, the difference', () => {
    const tiles = turno.tiles(closedTurn())
    expect(tiles.map((t) => [t.key, t.label, t.value])).toEqual([
      ['ventas', 'Ventas', '$250.00'],
      ['efectivo', 'Efectivo contado', '$900.00'],
      ['diferencia', 'Diferencia', '−$10.00'],
    ])
    expect(tiles[0].hint).toBe('1 ticket · 1 devolución · 1 en espera')
    expect(tiles[1].hint).toBe('Esperado $910.00')
    expect(tiles[2].tone).toBe('danger')
  })

  it('an open turn shows the cash in the drawer now; a balanced one says so', () => {
    const open = closedTurn({
      payments: [
        {
          mode_of_payment: 'Efectivo',
          opening: 500,
          counted: null,
          expected: 760,
          difference: null,
        },
      ],
    })
    open.shift = { ...open.shift, closing: null, closed: null, status: 'Open' }
    expect(turno.tiles(open).map((t) => [t.label, t.value, t.hint])).toEqual([
      ['Ventas', '$250.00', '1 ticket · 1 devolución · 1 en espera'],
      ['Efectivo en caja', '$760.00', 'Fondo $500.00'],
    ])
    const even = closedTurn({
      payments: [
        {
          mode_of_payment: 'Efectivo',
          opening: 500,
          counted: 910,
          expected: 910,
          difference: 0,
        },
      ],
    })
    const tile = turno.tiles(even).find((t) => t.key === 'diferencia')
    expect([tile.value, tile.tone]).toEqual(['Cuadró', 'success'])
  })

  it('a reader without the amounts gets counts, never a believable zero', () => {
    const hidden = closedTurn({
      amounts: false,
      payments: null,
      sales: { ...closedTurn().sales, total: null, returns_total: null },
    })
    hidden.sales.rows = hidden.sales.rows.map((r) => ({ ...r, amount: null }))
    expect(turno.tiles(hidden).map((t) => [t.label, t.value])).toEqual([
      ['Tickets', '1'],
    ])
    const rows = turno.views(hidden).ventas
    expect(rows.every((r) => !r.meta)).toBe(true)
  })

  it('every view is a list of rows that open what they name', () => {
    const v = turno.views(closedTurn())
    expect(v.ventas.map((r) => [r.title, r.meta])).toEqual([
      ['1 ticket en espera', undefined],
      ['Público en General', '−$50.00'],
      ['Ana López', '$300.00'],
    ])
    expect(v.ventas[1].subtitle).toBe('Devolución · 12:00 · SINV-3')
    expect(v.ventas[2].to).toBeTruthy()
    expect(v.pagos.map((r) => [r.title, r.subtitle, r.meta])).toEqual([
      [
        'Efectivo',
        'Fondo $500.00 · Esperado $910.00 · Contado $900.00',
        '−$10.00',
      ],
      ['Tarjeta', 'Esperado $200.00 · Contado $200.00', 'Cuadró'],
    ])
    expect(v.movimientos[0]).toMatchObject({
      title: 'Gasto',
      subtitle: '«Garrafón de agua» · Jennifer Corona · 13:15',
      meta: '−$40.00',
    })
    expect(v.bolsas[0]).toMatchObject({
      title: 'Bolsa T-0042',
      subtitle: 'Recaudación · Sellada, falta verificar · Jennifer Corona',
      meta: '$410.00',
      to: { name: 'EfectivoBolsa', params: { name: 'BAG-1' } },
    })
    expect(v.conteos[0]).toMatchObject({
      title: 'Corte de caja',
      meta: '−$10.00',
      subtitleTone: 'danger',
    })
    expect(v.cajon[0]).toMatchObject({ title: 'Dar cambio', meta: '11:30' })
  })

  it('chips name only the views that hold something, with their counts', () => {
    const data = closedTurn()
    const chips = turno.viewChips(turno.views(data), data)
    expect(chips.map((c) => [c.value, c.count])).toEqual([
      ['ventas', 2],
      ['pagos', 2],
      ['movimientos', 1],
      ['bolsas', 1],
      ['conteos', 1],
      ['cajon', 1],
    ])
  })

  it('a blind count keeps the expected side out of every row', () => {
    const blind = closedTurn({
      blind: true,
      payments: [
        {
          mode_of_payment: 'Efectivo',
          opening: 500,
          counted: 900,
          expected: null,
          difference: null,
        },
      ],
      movements: [{ ...closedTurn().movements[0], amount: null }],
      counts: [
        {
          name: 'CC-1',
          scope: 'Drawer',
          state: 'Closed',
          amount: 900,
          counted_by: 'jenni@x',
        },
      ],
    })
    const v = turno.views(blind)
    expect(v.pagos[0].subtitle).toBe('Fondo $500.00 · Contado $900.00')
    expect(v.pagos[0].meta).toBe('$900.00')
    expect(v.movimientos[0].meta).toBe('')
    expect(v.conteos[0].subtitle).not.toContain('esperado')
    expect(turno.tiles(blind).map((t) => t.key)).toEqual(['ventas', 'efectivo'])
  })

  it('links the other half and the turns on either side of a handover', () => {
    const data = closedTurn({
      handovers: {
        from: { shift: 'POSA-OS-706', cashier: 'tere@x', state: 'Completed' },
        to: null,
      },
      people: { 'jenni@x': 'Jennifer Corona', 'tere@x': 'Teresa' },
    })
    const fromOpening = turno.links(data, turno.OPENING)
    expect(fromOpening.map((l) => [l.title, l.to.path])).toEqual([
      ['Corte de caja', '/documentos/tipo/POS%20Closing%20Shift/POSA-CS-707'],
      [
        'Recibió el turno de Teresa',
        '/documentos/tipo/POS%20Opening%20Shift/POSA-OS-706',
      ],
    ])
    expect(turno.links(data, turno.CLOSING)[0].to.path).toBe(
      '/documentos/tipo/POS%20Opening%20Shift/POSA-OS-707',
    )
  })
})

describe('the shift profile', () => {
  const record = (doctype, docstatus, status) => ({
    doctype,
    name: 'POSA-OS-707',
    label: doctype,
    submittable: true,
    header: { docstatus, status, title: '', number: 'POSA-OS-707' },
    fields: [
      {
        fieldname: 'user',
        fieldtype: 'Link',
        value: 'jeydici01@x',
        title: 'Jennifer Corona',
      },
    ],
  })

  it('names the cashier in the bar, the kind and its state', () => {
    const view = profile.header(record('POS Opening Shift', 1, 'Open'))
    expect([view.title, view.kind, view.statusLabel, view.tone]).toEqual([
      'Jennifer Corona',
      'Turno de caja',
      'Abierto',
      'info',
    ])
    const corte = profile.header(record('POS Closing Shift', 1, null))
    expect([corte.kind, corte.statusLabel, corte.amount]).toEqual([
      'Corte de caja',
      'Cerrado',
      '',
    ])
    expect(cashierName({ fields: [], doc: { user: 'karla@x' } })).toBe('karla')
  })

  it('the turn is the page: no step, its panel under the bar, no Datos', async () => {
    expect(profile.nextStep()).toBeNull()
    expect(profile.sections).toEqual(['conexiones', 'actividad', 'archivos'])
    expect(profile.panels.map((p) => [p.key, p.at])).toEqual([
      ['turno', 'hero'],
    ])
    const merged = await loadProfile({ doctype: 'POS Closing Shift' })
    expect(merged.panels[0].key).toBe('turno')
    // Their lists stay on the generic floor.
    expect(hasCuratedProfile('POS Opening Shift')).toBe(false)
    expect(hasCuratedProfile('POS Invoice')).toBe(true)
  })
})
