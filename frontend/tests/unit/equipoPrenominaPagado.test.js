// Prenómina «Ya se le dio» and «Le toca / Le falta» (wave 2 lane 7). doco adds
// `pagado` and `pagos` only for a company with a pay setup, and `le_toca` /
// `le_falta` only when that setup calculates. A payload without them renders the
// page exactly as before: the same subtitle, the same columns, no payments list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const state = vi.hoisted(() => ({ api: vi.fn(), phone: null }))
vi.mock('@/composables/breakpoint', async (importOriginal) => {
  const { ref } = await import('vue')
  state.phone = ref(false)
  return { ...(await importOriginal()), isMobile: state.phone }
})
vi.mock('@/composables/useEquipo', async (importOriginal) => ({
  ...(await importOriginal()),
  equipoApi: (...args) => state.api(...args),
}))

import EquipoPrenomina from '@/pages/EquipoPrenomina.vue'
import {
  faltaText,
  origenLabel,
  owedShown,
  pagoLine,
  paidShown,
  payDay,
  paidPagos,
  payTotals,
  paymentsTitle,
  periodPayments,
} from '@/composables/useEquipo'

const fmt = (value) => `$${value}`

function row(employee, extra = {}) {
  return {
    employee,
    employee_name: `Persona ${employee}`,
    designation: 'Técnico',
    days_present: 5,
    days_from_checkins: 0,
    hours: { worked: 40, tiers: [] },
    days_absent: 0,
    leave_days: 0,
    advances: [],
    faltantes: [],
    ...extra,
  }
}
const TOTALS = {
  people: 2,
  with_faltantes: 0,
  days_present: 10,
  leave_days: 0,
  hours_worked: 80,
  hours_overtime: 0,
  advances: [],
}
function payload(rows, totals = {}) {
  return {
    period: {
      kind: 'week',
      start: '2026-11-09',
      end: '2026-11-15',
      previous: '2026-11-02',
      next: '2026-11-16',
    },
    periods: [{ value: 'week', label: 'Semana' }],
    stamping: { enabled: true, message: null },
    hr: true,
    hr_reason: null,
    rows,
    totals: { ...TOTALS, ...totals },
    guard: null,
    bonuses: false,
  }
}
const pago = (name, fecha, monto, concepto = 'Sueldo', origen = 'Caja') => ({
  name,
  fecha,
  periodo_fin: '2026-11-15',
  concepto,
  origen,
  monto,
  documento_tipo: 'POS Cash Movement',
  documento: `MOV-${name}`,
})

const DARK = payload([row('E1'), row('E2')])
const SOLO = payload(
  [
    row('E1', {
      pagado: 800,
      pagos: [
        pago('P1', '2026-11-11', 500, 'A cuenta'),
        pago('P3', '2026-11-13', 300, 'Sueldo', 'Lo pongo yo'),
      ],
    }),
    row('E2', { pagado: 0, pagos: [] }),
  ],
  { pagado: 800 },
)
const CALCULA = payload(
  [
    row('E1', {
      pagado: 800,
      pagos: [pago('P1', '2026-11-11', 800, 'A cuenta')],
      le_toca: 2400,
      le_falta: 1600,
      porque: ['6 días × $300'],
    }),
    row('E2', {
      pagado: 1000,
      pagos: [pago('P2', '2026-11-10', 1000)],
      le_toca: 900,
      le_falta: -100,
    }),
  ],
  { pagado: 1800 },
)

const PRESTAMO = payload(
  [
    row('E1', {
      pagado: 500,
      pagos: [
        pago('P1', '2026-11-11', 500, 'A cuenta'),
        pago('P4', '2026-11-12', 2000, 'Préstamo'),
        pago('P5', '2026-11-13', 200, 'Descuento de préstamo'),
      ],
    }),
  ],
  { pagado: 500 },
)

describe('what the payload carries', () => {
  it('keeps a loan and its discount out of «Ya se le dio»', () => {
    expect(paidPagos(PRESTAMO.rows[0]).map((p) => p.name)).toEqual(['P1'])
    expect(paidPagos({})).toEqual([])
    expect(payTotals(PRESTAMO).pagos).toBe(1)
    expect(periodPayments(PRESTAMO.rows).map((p) => p.name)).toEqual([
      'P1',
      'P4',
      'P5',
    ])
  })
  it('shows «Ya se le dio» only when doco sends pagado', () => {
    expect(paidShown(null)).toBe(false)
    expect(paidShown(DARK)).toBe(false)
    expect(paidShown(SOLO)).toBe(true)
    expect(paidShown(payload([], { pagado: 0 }))).toBe(true)
  })
  it('shows «Le toca» only when a row carries an amount', () => {
    expect(owedShown(SOLO)).toBe(false)
    expect(owedShown(CALCULA)).toBe(true)
    expect(owedShown(payload([row('E1', { le_toca: null })]))).toBe(false)
  })
})

describe('money words', () => {
  it('reads «Le falta» as an amount, «Nada» or what was given beyond', () => {
    expect(faltaText(1600, fmt)).toEqual({ text: '$1600', tone: 'due' })
    expect(faltaText(0, fmt)).toEqual({ text: 'Nada', tone: 'done' })
    expect(faltaText(-100, fmt)).toEqual({
      text: 'Se le dio $100 de más',
      tone: 'over',
    })
    expect(faltaText(undefined, fmt)).toEqual({ text: '—', tone: null })
  })
  it('names the owner’s own money in their words and keeps unknown origins', () => {
    expect(origenLabel('Lo pongo yo')).toBe('Lo pusiste tú')
    expect(origenLabel('Caja fuerte')).toBe('Caja fuerte')
    expect(origenLabel('Vales')).toBe('Vales')
  })
  it('writes a payment as day, amount and origin', () => {
    expect(payDay('2026-11-11')).toMatch(/11/)
    expect(payDay('')).toBe('')
    expect(pagoLine(pago('P1', '2026-11-11', 500), fmt)).toMatch(
      /11.* · \$500 · Caja$/,
    )
  })
  it('titles the list by the period the server answered', () => {
    expect(paymentsTitle('week')).toBe('Pagos de la semana')
    expect(paymentsTitle('fortnight')).toBe('Pagos de la quincena')
    expect(paymentsTitle('month')).toBe('Pagos del mes')
  })
  it('lists every payment oldest first with the person', () => {
    expect(
      periodPayments(CALCULA.rows).map((p) => [p.name, p.employee]),
    ).toEqual([
      ['P2', 'E2'],
      ['P1', 'E1'],
    ])
  })
  it('totals «Le falta» without letting an overpayment cancel what others are owed', () => {
    expect(payTotals(CALCULA)).toEqual({
      pagado: 1800,
      pagos: 2,
      le_toca: 3300,
      le_falta: 1600,
    })
    expect(payTotals(SOLO).le_toca).toBeNull()
    expect(
      payTotals(payload(CALCULA.rows, { le_toca: 1, le_falta: 2 })),
    ).toMatchObject({ le_toca: 1, le_falta: 2 })
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(answer, { phone = false } = {}) {
  state.phone.value = phone
  state.api.mockImplementation(async (method) =>
    method.endsWith('ajustes_get') ? null : answer,
  )
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
const q = (id) => root.querySelector(`[data-testid="${id}"]`)
const all = (id) => [...root.querySelectorAll(`[data-testid="${id}"]`)]

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.api.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
})

describe('Prenómina without a pay setup (dark)', () => {
  for (const phone of [false, true]) {
    it(`renders the read-only table as before (${phone ? 'phone' : 'desktop'})`, async () => {
      await mount(DARK, { phone })
      expect(root.textContent).toContain('Nothing here changes payroll.')
      expect(q('prenomina-tabla')).not.toBeNull()
      expect(all('prenomina-fila')).toHaveLength(2)
      const heads = [...root.querySelectorAll('thead th')].map((th) =>
        th.textContent.trim(),
      )
      expect(heads).toEqual([
        'Person',
        'Days present',
        'Hours worked',
        'Absent days',
        'Vacation days',
        'Open advances',
        'Missing to pay',
      ])
      expect(root.querySelector('table').className).toContain('min-w-[50rem]')
      expect(root.querySelector('.max-w-5xl')).not.toBeNull()
      expect(root.querySelector('.max-w-7xl')).toBeNull()
      for (const id of [
        'prenomina-subtitulo',
        'prenomina-totales',
        'prenomina-personas',
        'prenomina-pagos',
        'prenomina-col-pagado',
        'prenomina-col-le-toca',
      ])
        expect(q(id)).toBeNull()
      expect(root.textContent).not.toContain('Ya se le dio')
    })
  }
})

describe('Prenómina, «Solo anoto»', () => {
  for (const phone of [false, true]) {
    it(`lists a loan only under the period's payments, with its concept (${phone ? 'phone' : 'desktop'})`, async () => {
      await mount(PRESTAMO, { phone })
      const paid = q('prenomina-pagado')
      const cell = phone ? paid.parentElement : paid
      expect(cell.textContent).toMatch(/A cuenta: /)
      expect(cell.textContent).not.toMatch(/Préstamo/)
      expect(q('prenomina-total-pagado').textContent).toMatch(/1 pago/)
      const items = all('prenomina-pago')
      expect(items).toHaveLength(3)
      expect(items[1].textContent).toMatch(/Préstamo, Caja/)
    })
  }

  it('adds «Ya se le dio» and the week’s payments, and drops the read-only line', async () => {
    await mount(SOLO)
    expect(root.textContent).not.toContain('Nothing here changes payroll.')
    expect(q('prenomina-subtitulo')).not.toBeNull()
    expect(q('prenomina-col-pagado').textContent.trim()).toBe('Ya se le dio')
    expect(q('prenomina-col-le-toca')).toBeNull()
    expect(q('prenomina-col-le-falta')).toBeNull()
    expect(
      [...root.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
    ).toContain('Por revisar')
    const paid = all('prenomina-pagado')
    expect(paid).toHaveLength(2)
    expect(paid[0].textContent).toMatch(/800/)
    expect(paid[0].textContent).toMatch(/Lo pusiste tú/)
    expect(q('prenomina-total-pagado').textContent).toMatch(/800/)
    expect(q('prenomina-total-pagado').textContent).toMatch(/2 pagos/)
    expect(q('prenomina-pagos').querySelector('h2').textContent.trim()).toBe(
      'Pagos de la semana',
    )
    const items = all('prenomina-pago')
    expect(items.map((li) => li.dataset.employee)).toEqual(['E1', 'E1'])
    expect(items[0].textContent).toMatch(/Persona E1/)
    expect(items[0].textContent).toMatch(/A cuenta, Caja/)
    expect(items[0].textContent).toMatch(/500/)
  })
  it('says where the list starts when nothing is paid yet', async () => {
    await mount(payload([row('E1', { pagado: 0, pagos: [] })], { pagado: 0 }))
    expect(q('prenomina-pagos-vacio').textContent).toMatch(
      /Lo que pagaste antes no se cuenta/,
    )
    expect(all('prenomina-pago')).toHaveLength(0)
  })
})

describe('Prenómina, «Muelle me dice cuánto le toca»', () => {
  it('adds «Le toca» and «Le falta» per person and in the totals', async () => {
    await mount(CALCULA)
    expect(q('prenomina-col-le-toca')).not.toBeNull()
    expect(q('prenomina-col-le-falta')).not.toBeNull()
    const toca = all('prenomina-le-toca')
    expect(toca[0].textContent).toMatch(/2,?400/)
    expect(toca[0].textContent).toMatch(/6 días × \$300/)
    const falta = all('prenomina-le-falta')
    expect(falta[0].textContent).toMatch(/1,?600/)
    expect(falta[1].textContent).toMatch(/Se le dio .*100 de más/)
    expect(q('prenomina-total-le-falta').textContent).toMatch(/1,?600/)
    expect(q('prenomina-total-le-toca').textContent).toMatch(/3,?300/)
  })
  it('on a phone each person is a row with the money first, no table', async () => {
    await mount(CALCULA, { phone: true })
    expect(q('prenomina-tabla')).toBeNull()
    const people = all('prenomina-persona')
    expect(people.map((li) => li.dataset.employee)).toEqual(['E1', 'E2'])
    expect(
      people[0].querySelector('[data-testid="prenomina-le-falta"]').textContent,
    ).toMatch(/1,?600/)
    expect(people[0].textContent).toMatch(/A cuenta:/)
    expect(people[0].textContent).toMatch(/5 días, 40 h/)
    expect(all('prenomina-pago')).toHaveLength(2)
  })
})
