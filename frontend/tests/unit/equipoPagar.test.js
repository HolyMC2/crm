// «Pagar lo que falta» on Prenómina (wave 2 lane 8, crm half). The button and
// each row's «Pagar» show only when doco's pagar_preview answers on, the shop
// has Muelle calculate and there is a suggested line. Without a saved pay setup
// the preview is never asked and Prenómina renders as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const state = vi.hoisted(() => ({ api: vi.fn(), phone: null }))
vi.mock('@/composables/breakpoint', async (importOriginal) => {
  const { ref } = await import('vue')
  state.phone = ref(true)
  return { ...(await importOriginal()), isMobile: state.phone }
})
vi.mock('@/composables/useEquipo', async (importOriginal) => ({
  ...(await importOriginal()),
  equipoApi: (...args) => state.api(...args),
}))

import EquipoPrenomina from '@/pages/EquipoPrenomina.vue'
import {
  PAGAR_APPLY,
  PAGAR_PREVIEW,
  pagarButtonLabel,
  pagarDraft,
  pagarMonto,
  pagarOrigenLabel,
  pagarPersonaShown,
  pagarPlan,
  pagarReceipt,
  pagarRemove,
  pagarResumen,
  pagarShown,
  pagarSplit,
  pagarStale,
} from '@/composables/useEquipo'

const fmt = (value) => `$${value}`

function row(employee, extra = {}) {
  return {
    employee,
    employee_name: `Persona ${employee}`,
    designation: null,
    days_present: 6,
    days_from_checkins: 0,
    hours: null,
    days_absent: 0,
    leave_days: 0,
    advances: [],
    faltantes: [],
    ...extra,
  }
}
const PRENOMINA = {
  period: {
    kind: 'week',
    start: '2026-11-08',
    end: '2026-11-14',
    previous: '2026-11-01',
    next: '2026-11-15',
  },
  periods: [{ value: 'week', label: 'Semana' }],
  stamping: { enabled: true, message: null },
  hr: true,
  hr_reason: null,
  rows: [row('E1'), row('E2')],
  totals: {
    people: 2,
    with_faltantes: 0,
    days_present: 12,
    leave_days: 0,
    hours_worked: 0,
    advances: [],
  },
  guard: null,
  bonuses: false,
}
// The same period once doco counts what was given and what is owed.
const PAID = {
  ...PRENOMINA,
  rows: [
    row('E1', { pagado: 800, pagos: [], le_toca: 2400, le_falta: 1600 }),
    row('E2', { pagado: 0, pagos: [], le_toca: 1000, le_falta: 1000 }),
  ],
  totals: { ...PRENOMINA.totals, pagado: 800 },
}

const ORIGENES = [
  { value: 'Caja', label: 'Caja', available: true, modo: 'por_entregar' },
  {
    value: 'Caja fuerte',
    label: 'Caja fuerte',
    available: true,
    modo: 'asiento',
    cuenta: 'Caja fuerte - E',
  },
  {
    value: 'Lo pongo yo',
    label: 'Lo pongo yo',
    available: false,
    modo: null,
    motivo: 'Falta la cuenta de aportaciones del dueño.',
    action: 'crear_aportacion',
  },
  {
    value: 'Transferencia',
    label: 'Transferencia',
    available: true,
    modo: 'asiento',
    cuenta: 'Banco A - E',
  },
]
function fila(employee, extra = {}) {
  return {
    employee,
    employee_name: `Persona ${employee}`,
    le_toca: 2400,
    ya_se_le_dio: 800,
    pagado: 800,
    por_entregar: 0,
    le_falta: 1600,
    sugerido: 1600,
    lineas_le_toca: [],
    faltantes: [],
    origen: 'Caja fuerte',
    pagos: [],
    ...extra,
  }
}
function preview(extra = {}) {
  return {
    company: 'Empresa',
    configured: true,
    on: true,
    calcular: true,
    periodo: {
      inicio: '2026-11-08',
      fin: '2026-11-14',
      label: 'Semana del 8 al 14 nov',
    },
    quien_entrega: 'Los dos',
    concepto: 'Sueldo',
    conceptos: [
      { value: 'Sueldo', label: 'Sueldo' },
      { value: 'A cuenta', label: 'A cuenta' },
      { value: 'Bono o comisión', label: 'Bono o comisión' },
    ],
    origenes: ORIGENES,
    filas: [
      fila('E1'),
      fila('E2', {
        le_toca: 1000,
        ya_se_le_dio: 0,
        pagado: 0,
        le_falta: 1000,
        sugerido: 1000,
      }),
    ],
    lineas: [
      {
        employee: 'E1',
        monto: 1600,
        origen: 'Caja fuerte',
        concepto: 'Sueldo',
      },
      {
        employee: 'E2',
        monto: 1000,
        origen: 'Caja fuerte',
        concepto: 'Sueldo',
      },
    ],
    totales: { personas: 2, con_saldo: 2, sugerido: 2600 },
    warnings: [],
    token: 'tok-1',
    ...extra,
  }
}
const OWNER = {
  available: true,
  configured: true,
  can_edit: true,
  company: 'Empresa',
}

describe('when Prenómina offers to pay', () => {
  it('shows the button only for a shop that calculates with something to pay', () => {
    expect(pagarShown(null)).toBe(false)
    expect(pagarShown({ on: false, message: 'Primero contesta…' })).toBe(false)
    expect(pagarShown(preview({ calcular: false }))).toBe(false)
    expect(pagarShown(preview({ lineas: [] }))).toBe(false)
    expect(pagarShown(preview())).toBe(true)
  })
  it('offers a row its own «Pagar» only when doco suggests a line for it', () => {
    const one = preview({ lineas: preview().lineas.slice(0, 1) })
    expect(pagarPersonaShown(one, 'E1')).toBe(true)
    expect(pagarPersonaShown(one, 'E2')).toBe(false)
    expect(pagarPersonaShown(preview({ calcular: false }), 'E1')).toBe(false)
  })
  it('shows nothing when the preview pays another period than the one on screen', () => {
    const week = { start: '2026-11-08', end: '2026-11-14' }
    const quincena = preview({
      periodo: { inicio: '2026-11-01', fin: '2026-11-15', label: 'Quincena' },
    })
    expect(pagarShown(preview(), week)).toBe(true)
    expect(pagarPersonaShown(preview(), 'E1', week)).toBe(true)
    expect(pagarShown(quincena, week)).toBe(false)
    expect(pagarPersonaShown(quincena, 'E1', week)).toBe(false)
    // A weekly payer on a month view: doco answers the first week only.
    const month = { start: '2026-11-01', end: '2026-11-30' }
    const firstWeek = preview({
      periodo: { inicio: '2026-11-01', fin: '2026-11-07', label: 'Semana' },
    })
    expect(pagarShown(firstWeek, month)).toBe(false)
  })
  it('says the total and the people on the button', () => {
    expect(pagarButtonLabel(preview(), fmt)).toBe(
      'Pagar lo que falta · $2600 · 2 personas',
    )
    const one = preview({ lineas: preview().lineas.slice(0, 1) })
    expect(pagarButtonLabel(one, fmt)).toBe(
      'Pagar lo que falta · $1600 · 1 persona',
    )
  })
  it('calls «Caja» «Dejar para la caja» while paying', () => {
    expect(pagarOrigenLabel('Caja')).toBe('Dejar para la caja')
    expect(pagarOrigenLabel(ORIGENES[1])).toBe('Caja fuerte')
    expect(pagarOrigenLabel({ value: 'Otro', label: 'Otro origen' })).toBe(
      'Otro origen',
    )
  })
})

describe('the lines of the sheet', () => {
  it('reads amounts as the owner types them', () => {
    expect(pagarMonto('1,600')).toBe(1600)
    expect(pagarMonto('$ 250.5')).toBe(250.5)
    expect(pagarMonto('0')).toBeNull()
    expect(pagarMonto('12.345')).toBeNull()
    expect(pagarMonto('abc')).toBeNull()
    expect(pagarMonto('')).toBeNull()
  })
  it('starts from the suggested lines, for the team or one person', () => {
    const all = pagarDraft(preview())
    expect(all.map((l) => [l.employee, l.monto, l.origen, l.concepto])).toEqual(
      [
        ['E1', '1600', 'Caja fuerte', 'Sueldo'],
        ['E2', '1000', 'Caja fuerte', 'Sueldo'],
      ],
    )
    expect(pagarDraft(preview(), 'E2').map((l) => l.employee)).toEqual(['E2'])
  })
  it('splits a person over two origins and never drops their last line', () => {
    const p = preview()
    let lines = pagarDraft(p)
    lines = pagarSplit(lines, lines[0].key, p)
    expect(lines.map((l) => [l.employee, l.origen, l.monto])).toEqual([
      ['E1', 'Caja fuerte', '1600'],
      ['E1', 'Caja', ''],
      ['E2', 'Caja fuerte', '1000'],
    ])
    lines = pagarRemove(lines, lines[1].key)
    expect(lines).toHaveLength(2)
    expect(pagarRemove(lines, lines[0].key)).toHaveLength(2)
  })
  it('sends doco only the included lines, and says what is missing', () => {
    const p = preview()
    const lines = pagarDraft(p)
    lines[1].incluir = false
    expect(pagarPlan(lines, p)).toEqual({
      lineas: [
        {
          employee: 'E1',
          monto: 1600,
          origen: 'Caja fuerte',
          concepto: 'Sueldo',
        },
      ],
      problemas: [],
    })
    lines[0].monto = ''
    expect(pagarPlan(lines, p).problemas).toEqual([
      'Escribe cuánto le das a Persona E1.',
    ])
    lines[0].monto = '100'
    lines[0].origen = 'Lo pongo yo'
    expect(pagarPlan(lines, p).problemas).toEqual([
      'Elige de dónde sale el pago de Persona E1.',
    ])
    lines[0].incluir = false
    expect(pagarPlan(lines, p).problemas).toEqual(['Elige a quién le pagas.'])
  })
  it('names the bank only for a transfer', () => {
    const p = preview()
    const lines = pagarDraft(p, 'E1')
    lines[0].origen = 'Transferencia'
    lines[0].cuenta = 'Banco B - E'
    expect(pagarPlan(lines, p).lineas[0].cuenta).toBe('Banco B - E')
    lines[0].origen = 'Caja fuerte'
    expect(pagarPlan(lines, p).lineas[0].cuenta).toBeUndefined()
  })
  it('sums per origin and warns about paying past what is missing', () => {
    const p = preview()
    const resumen = pagarResumen(
      [
        {
          employee: 'E1',
          monto: 1000,
          origen: 'Caja fuerte',
          concepto: 'Sueldo',
        },
        { employee: 'E1', monto: 800, origen: 'Caja', concepto: 'Sueldo' },
        { employee: 'E2', monto: 300, origen: 'Caja', concepto: 'Aguinaldo' },
      ],
      p,
    )
    expect(resumen.total).toBe(2100)
    expect(resumen.personas).toBe(2)
    expect(resumen.porOrigen).toEqual([
      { origen: 'Caja', label: 'Dejar para la caja', monto: 1100 },
      { origen: 'Caja fuerte', label: 'Caja fuerte', monto: 1000 },
    ])
    // E1 gets 1,800 of pay against 1,600 missing; E2's aguinaldo is not pay.
    expect(resumen.deMas).toEqual([
      { employee: 'E1', nombre: 'Persona E1', monto: 200 },
    ])
  })
})

describe('the answer of apply', () => {
  it('a stale answer is no receipt', () => {
    const stale = { applied: false, stale: true, message: 'Algo cambió.' }
    expect(pagarStale(stale)).toBe(true)
    expect(pagarReceipt(stale)).toBeNull()
  })
  it('lists what was booked and what was left for the register', () => {
    const receipt = pagarReceipt(
      {
        applied: true,
        stale: false,
        filas: [
          { name: 'P1', employee: 'E1', estado: 'Pagado', monto: 1600 },
          { name: 'P2', employee: 'E2', estado: 'Por entregar', monto: 1000 },
        ],
        pagado: 1600,
        por_entregar: 1000,
        message: '',
      },
      fmt,
    )
    expect(receipt.pagados.map((f) => f.name)).toEqual(['P1'])
    expect(receipt.porEntregar.map((f) => f.name)).toEqual(['P2'])
    expect(receipt.message).toBe(
      'Pagaste $1600. Quedan $1000 por entregar en la caja.',
    )
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount({
  ajustes = OWNER,
  pagar = preview(),
  prenomina = PAID,
  apply,
} = {}) {
  state.api.mockImplementation(async (method, args) => {
    if (method.endsWith('ajustes_get')) {
      if (ajustes instanceof Error) throw ajustes
      return ajustes
    }
    if (method === PAGAR_PREVIEW) {
      if (pagar instanceof Error) throw pagar
      return typeof pagar === 'function' ? pagar(args) : pagar
    }
    if (method === PAGAR_APPLY) return apply?.(args)
    if (method.endsWith('aguinaldo_preview')) return null
    if (method === 'frappe.client.get_list') return []
    return prenomina
  })
  const page = { render: () => h('p', 'page') }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/equipo/prenomina', component: EquipoPrenomina },
      { path: '/equipo/bonos', name: 'EquipoBonos', component: page },
      { path: '/equipo/como-pago', name: 'EquipoComoPago', component: page },
      { path: '/equipo/:employee', name: 'EquipoPersona', component: page },
    ],
  })
  router.push('/equipo/prenomina')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  app.mount(root)
  await flush()
}
const q = (id) => document.querySelector(`[data-testid="${id}"]`)
const all = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)]
const calls = (method) =>
  state.api.mock.calls.filter(([name]) => name === method)
async function openSheet(id = 'prenomina-pagar') {
  q(id).click()
  await vi.waitFor(() => expect(q('pagar-hoja')).not.toBeNull(), {
    timeout: 5000,
  })
  await flush()
}
async function click(id) {
  q(id).click()
  await flush()
}

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.api.mockReset()
  state.phone.value = true
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
})

describe('Prenómina without «Pagar lo que falta» (dark)', () => {
  it('a company without a saved setup is never asked and shows no button', async () => {
    await mount({
      ajustes: { ...OWNER, configured: false },
      prenomina: PRENOMINA,
    })
    expect(calls(PAGAR_PREVIEW)).toHaveLength(0)
    expect(q('prenomina-pagar')).toBeNull()
    expect(q('prenomina-pagar-persona')).toBeNull()
    expect(all('prenomina-fila')).toHaveLength(2)
  })
  it('a site without doco.nomina shows the page as before', async () => {
    await mount({ ajustes: new Error('not found'), prenomina: PRENOMINA })
    expect(calls(PAGAR_PREVIEW)).toHaveLength(0)
    expect(root.textContent).not.toContain('Pagar')
    expect(all('prenomina-fila')).toHaveLength(2)
  })
  it('someone who may not pay, or a shop that only notes, gets no button', async () => {
    const refused = Object.assign(new Error('no'), { status: 403 })
    await mount({ pagar: refused })
    expect(calls(PAGAR_PREVIEW)).toHaveLength(1)
    expect(q('prenomina-pagar')).toBeNull()
    expect(q('prenomina-pagar-persona')).toBeNull()
    app.unmount()
    root.remove()
    await mount({ pagar: preview({ calcular: false }) })
    expect(q('prenomina-pagar')).toBeNull()
  })
})

describe('Prenómina on another period than the pay calendar', () => {
  it('a fortnight payer on the default week view gets no «Pagar»', async () => {
    await mount({
      pagar: preview({
        periodo: {
          inicio: '2026-11-01',
          fin: '2026-11-15',
          label: 'Quincena del 1 al 15 nov',
        },
      }),
    })
    expect(calls(PAGAR_PREVIEW)).toHaveLength(1)
    expect(q('prenomina-pagar')).toBeNull()
    expect(q('prenomina-pagar-persona')).toBeNull()
    // The week's rows still say what is owed.
    expect(all('prenomina-le-falta').length).toBeGreaterThan(0)
  })
})

describe('Prenómina, paying the week', () => {
  it('asks for the period on screen and offers the team and each person', async () => {
    await mount()
    expect(calls(PAGAR_PREVIEW)[0][1]).toEqual({
      company: 'Empresa',
      period: '2026-11-08',
    })
    expect(q('prenomina-pagar').textContent).toMatch(
      /Pagar lo que falta · \$ ?2,600(\.00)? · 2 personas/,
    )
    expect(all('prenomina-pagar-persona')).toHaveLength(2)
  })
  it('reviews, then pays once, and shows the receipt', async () => {
    const apply = vi.fn(async () => ({
      applied: true,
      stale: false,
      replay: false,
      filas: [
        {
          name: 'P1',
          employee: 'E1',
          employee_name: 'Persona E1',
          monto: 1600,
          concepto: 'Sueldo',
          origen: 'Caja fuerte',
          estado: 'Pagado',
        },
        {
          name: 'P2',
          employee: 'E2',
          employee_name: 'Persona E2',
          monto: 1000,
          concepto: 'Sueldo',
          origen: 'Caja',
          estado: 'Por entregar',
        },
      ],
      pagado: 1600,
      por_entregar: 1000,
      message: 'Pagaste $1,600.00 a 1 persona(s): $1,600.00 de la caja fuerte.',
    }))
    await mount({ apply })
    await openSheet()
    expect(all('pagar-linea').map((li) => li.dataset.employee)).toEqual([
      'E1',
      'E2',
    ])
    // E2 is left for the register.
    const e2 = all('pagar-linea')[1]
    e2.querySelector('[data-origen="Caja"]').click()
    await flush()
    await click('pagar-revisar')
    expect(all('pagar-revision-linea')).toHaveLength(2)
    expect(all('pagar-por-origen').map((d) => d.textContent)).toEqual([
      expect.stringContaining('Dejar para la caja'),
      expect.stringContaining('Caja fuerte'),
    ])
    await click('pagar-confirmar')
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0][0]).toMatchObject({
      company: 'Empresa',
      token: 'tok-1',
      period: '2026-11-08',
      lineas: [
        {
          employee: 'E1',
          monto: 1600,
          origen: 'Caja fuerte',
          concepto: 'Sueldo',
        },
        { employee: 'E2', monto: 1000, origen: 'Caja', concepto: 'Sueldo' },
      ],
    })
    expect(q('pagar-recibo').textContent).toContain('Pagaste')
    expect(q('pagar-recibo-pagados').textContent).toContain('Persona E1')
    expect(q('pagar-recibo-caja').textContent).toContain('Persona E2')
  })
  it('a greyed origin says why instead of being picked', async () => {
    await mount()
    await openSheet()
    const line = all('pagar-linea')[0]
    line.querySelector('[data-origen="Lo pongo yo"]').click()
    await flush()
    expect(q('pagar-origen-motivo').textContent).toContain(
      'Falta la cuenta de aportaciones del dueño.',
    )
    await click('pagar-revisar')
    expect(all('pagar-revision-linea')[0].textContent).toContain('Caja fuerte')
  })
  it('a row’s «Pagar» opens the sheet for that person only', async () => {
    await mount()
    all('prenomina-pagar-persona')[1].click()
    await vi.waitFor(() => expect(q('pagar-hoja')).not.toBeNull(), {
      timeout: 5000,
    })
    await flush()
    expect(all('pagar-linea').map((li) => li.dataset.employee)).toEqual(['E2'])
  })
  it('a stale review shows the notice and the fresh lines, not a receipt', async () => {
    const fresh = preview({
      token: 'tok-2',
      lineas: [
        {
          employee: 'E1',
          monto: 900,
          origen: 'Caja fuerte',
          concepto: 'Sueldo',
        },
      ],
    })
    const apply = vi
      .fn()
      .mockResolvedValueOnce({
        applied: false,
        stale: true,
        message: 'Algo cambió desde la revisión. Revisa los pagos otra vez.',
        preview: fresh,
      })
      .mockResolvedValueOnce({
        applied: true,
        stale: false,
        filas: [],
        pagado: 900,
        message: 'Pagaste $900.00.',
      })
    await mount({ apply })
    await openSheet()
    await click('pagar-revisar')
    await click('pagar-confirmar')
    expect(q('pagar-recibo')).toBeNull()
    expect(q('pagar-aviso').textContent).toContain('Algo cambió')
    expect(all('pagar-linea').map((li) => li.dataset.employee)).toEqual(['E1'])
    expect(all('pagar-monto')[0].value).toBe('900')
    // The page keeps its button with the fresh preview.
    expect(q('prenomina-pagar').textContent).toMatch(
      /\$ ?900(\.00)? · 1 persona/,
    )
    await click('pagar-revisar')
    await click('pagar-confirmar')
    expect(apply.mock.calls[1][0].token).toBe('tok-2')
    expect(apply.mock.calls[1][0].request_id).not.toBe(
      apply.mock.calls[0][0].request_id,
    )
    expect(q('pagar-recibo').textContent).toContain('Pagaste')
  })
  it('a lost answer keeps the request id, so the retry cannot pay twice', async () => {
    const lost = Object.assign(new Error('gateway'), { status: 504 })
    const apply = vi.fn().mockRejectedValueOnce(lost).mockResolvedValueOnce({
      applied: true,
      stale: false,
      replay: true,
      filas: [],
      message: 'Pagaste $2,600.00.',
    })
    await mount({ apply })
    await openSheet()
    await click('pagar-revisar')
    await click('pagar-confirmar')
    expect(q('pagar-problema').textContent).toContain('no se duplica')
    await click('pagar-confirmar')
    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply.mock.calls[1][0].request_id).toBe(
      apply.mock.calls[0][0].request_id,
    )
    expect(q('pagar-recibo')).not.toBeNull()
  })
})
