// Aguinaldo card and sheet on Prenómina (wave 2 lane 9, crm half). The card
// shows from 15 Nov to 20 Dec only when doco answers aguinaldo_preview: an offer
// for a Mexican company with the switch off (owner only), a summary when it is
// on. Outside the season nothing is asked; a site without doco.nomina, a
// refusal or a non-Mexican company renders Prenómina exactly as before.
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
  AGUINALDO_APPLY,
  AGUINALDO_PREVIEW,
  aguinaldoCanApply,
  aguinaldoCard,
  aguinaldoFaltante,
  aguinaldoReceipt,
  aguinaldoSeason,
} from '@/composables/useEquipo'

const fmt = (value) => `$${value}`
const day = (iso) => new Date(`${iso}T12:00:00`)

const PRENOMINA = {
  period: {
    kind: 'week',
    start: '2026-11-16',
    end: '2026-11-22',
    previous: '2026-11-09',
    next: '2026-11-23',
  },
  periods: [{ value: 'week', label: 'Semana' }],
  stamping: { enabled: true, message: null },
  hr: true,
  hr_reason: null,
  rows: [
    {
      employee: 'E1',
      employee_name: 'Persona E1',
      designation: 'Técnico',
      days_present: 5,
      days_from_checkins: 0,
      hours: { worked: 40, tiers: [] },
      days_absent: 0,
      leave_days: 0,
      advances: [],
      faltantes: [],
    },
  ],
  totals: {
    people: 1,
    with_faltantes: 0,
    days_present: 5,
    leave_days: 0,
    hours_worked: 40,
    hours_overtime: 0,
    advances: [],
  },
  guard: null,
  bonuses: false,
}

const OFF_MX = {
  company: 'Empresa',
  year: 2026,
  on: false,
  mexico: true,
  configured: true,
  message: 'El cálculo del aguinaldo está apagado.',
}
const OFF_OTHER = { ...OFF_MX, mexico: false }
function fila(employee, extra = {}) {
  return {
    employee,
    employee_name: `Persona ${employee}`,
    ingreso: '2026-07-01',
    baja: null,
    dias_trabajados: 184,
    dias: 7.5616,
    diario: 300,
    diario_fuente: 'pago',
    sugerido: false,
    diario_sugerido: null,
    importe: 2268.49,
    porque: ['7.56 días × $300.00 = $2,268.49'],
    faltantes: [],
    base: 'Fijo',
    ...extra,
  }
}
function on(
  pago = {
    available: false,
    message: 'Por ahora Muelle solo calcula el aguinaldo.',
  },
) {
  return {
    company: 'Empresa',
    year: 2026,
    on: true,
    mexico: true,
    configured: true,
    fecha_limite: '2026-12-20',
    dias_aguinaldo: 15,
    motor: 'doco',
    retenciones: false,
    warnings: [],
    filas: [
      fila('E1'),
      fila('E2', {
        dias_trabajados: 365,
        dias: 15,
        diario: null,
        importe: null,
        porque: ['Trabajó todo 2026: 15 días de aguinaldo'],
        faltantes: [
          { key: 'sin_sueldo', label: 'Escribe cuánto gana', detalle: null },
        ],
      }),
    ],
    totales: { personas: 2, con_monto: 1, faltan_datos: 1, importe: 2268.49 },
    pago,
  }
}
const OWNER = { available: true, configured: true, can_edit: true }
const MANAGER = { available: true, configured: true, can_edit: false }

describe('season', () => {
  it('opens on 15 Nov and closes after 20 Dec', () => {
    expect(aguinaldoSeason(day('2026-11-14'))).toBe(false)
    expect(aguinaldoSeason(day('2026-11-15'))).toBe(true)
    expect(aguinaldoSeason(day('2026-12-01'))).toBe(true)
    expect(aguinaldoSeason(day('2026-12-20'))).toBe(true)
    expect(aguinaldoSeason(day('2026-12-21'))).toBe(false)
    expect(aguinaldoSeason(day('2027-06-15'))).toBe(false)
  })
})

describe('what the card shows', () => {
  it('shows nothing without a preview answer, or for a payload it does not know', () => {
    expect(aguinaldoCard(null)).toBeNull()
    expect(aguinaldoCard(PRENOMINA, { canEdit: true })).toBeNull()
    expect(aguinaldoCard({ on: true }, { canEdit: true })).toBeNull()
  })
  it('offers the switch only to the owner of a Mexican company', () => {
    expect(aguinaldoCard(OFF_MX, { canEdit: true })).toEqual({ kind: 'offer' })
    expect(aguinaldoCard(OFF_MX, { canEdit: false })).toBeNull()
    expect(aguinaldoCard(OFF_OTHER, { canEdit: true })).toBeNull()
  })
  it('sums the year when the switch is on', () => {
    expect(aguinaldoCard(on(), { canEdit: false })).toEqual({
      kind: 'summary',
      year: 2026,
      personas: 2,
      conMonto: 1,
      faltanDatos: 1,
      importe: 2268.49,
      fechaLimite: '2026-12-20',
    })
  })
  it('names a faltante by the server label, else its key', () => {
    expect(aguinaldoFaltante({ key: 'sin_baja', label: 'Del servidor' })).toBe(
      'Del servidor',
    )
    expect(aguinaldoFaltante({ key: 'sin_baja' })).toBe(
      'Falta la fecha de baja',
    )
    expect(aguinaldoFaltante({ key: 'sin_ingreso' })).toBe(
      'Falta su fecha de ingreso',
    )
    expect(aguinaldoFaltante({ key: 'sin_sueldo' })).toBe('Escribe cuánto gana')
    expect(aguinaldoFaltante({ key: 'otro' })).toBe('Falta un dato')
  })
  it('lets only the owner apply, and only when doco can record the payment', () => {
    const ready = on({ available: true, message: null })
    expect(aguinaldoCanApply(ready, { canEdit: true })).toBe(true)
    expect(aguinaldoCanApply(ready, { canEdit: false })).toBe(false)
    expect(aguinaldoCanApply(on(), { canEdit: true })).toBe(false)
    expect(
      aguinaldoCanApply(
        { ...ready, totales: { ...ready.totales, con_monto: 0 } },
        { canEdit: true },
      ),
    ).toBe(false)
    expect(aguinaldoCanApply(OFF_MX, { canEdit: true })).toBe(false)
  })
  it('writes the receipt from doco or from the totals', () => {
    expect(aguinaldoReceipt({ message: 'Hecho.' }, on(), fmt)).toBe('Hecho.')
    expect(aguinaldoReceipt({}, on(), fmt)).toBe(
      'Quedó listo para pagar el aguinaldo de 1 persona por $2268.49.',
    )
    expect(aguinaldoReceipt({ personas: 3, importe: 900 }, on(), fmt)).toBe(
      'Quedó listo para pagar el aguinaldo de 3 personas por $900.',
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
async function mount({ today, preview, ajustes = OWNER, apply } = {}) {
  vi.setSystemTime(day(today))
  state.api.mockImplementation(async (method, args) => {
    if (method.endsWith('ajustes_get')) return ajustes
    if (method === AGUINALDO_PREVIEW) {
      if (preview instanceof Error) throw preview
      return preview
    }
    if (method === AGUINALDO_APPLY) return apply?.(args)
    return PRENOMINA
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
// The sheet is an async component: its first open waits on the chunk import.
async function openSheet() {
  q('aguinaldo-tarjeta').click()
  await vi.waitFor(() => expect(q('aguinaldo-hoja')).not.toBeNull(), {
    timeout: 5000,
  })
  await flush()
}
const calls = (method) =>
  state.api.mock.calls.filter(([name]) => name === method)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.api.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
  vi.useRealTimers()
})

describe('Prenómina without the aguinaldo (dark)', () => {
  it('outside the season asks nothing and shows no card', async () => {
    await mount({ today: '2026-11-14', preview: on() })
    expect(calls(AGUINALDO_PREVIEW)).toHaveLength(0)
    expect(q('aguinaldo-oferta')).toBeNull()
    expect(q('aguinaldo-tarjeta')).toBeNull()
    expect(all('prenomina-fila')).toHaveLength(1)
    expect(root.textContent).not.toContain('guinaldo')
  })
  it('in season shows nothing for a site without doco.nomina or a refusal', async () => {
    await mount({ today: '2026-11-20', preview: new Error('not found') })
    expect(calls(AGUINALDO_PREVIEW)).toHaveLength(1)
    expect(q('aguinaldo-oferta')).toBeNull()
    expect(q('aguinaldo-tarjeta')).toBeNull()
    expect(root.textContent).not.toContain('guinaldo')
  })
  it('in season shows nothing for a company outside Mexico', async () => {
    await mount({ today: '2026-11-20', preview: OFF_OTHER })
    expect(root.textContent).not.toContain('guinaldo')
  })
})

describe('Prenómina, aguinaldo switch off (Mexico)', () => {
  it('offers the owner one tap to the pay setup', async () => {
    await mount({ today: '2026-12-01', preview: OFF_MX })
    const card = q('aguinaldo-oferta')
    expect(card.textContent).toContain(
      '¿Quieres que Muelle calcule el aguinaldo?',
    )
    expect(card.getAttribute('href')).toMatch(/\/equipo\/como-pago/)
  })
  it('shows no offer to an encargado, who cannot turn it on', async () => {
    await mount({ today: '2026-12-01', preview: OFF_MX, ajustes: MANAGER })
    expect(q('aguinaldo-oferta')).toBeNull()
  })
})

describe('Prenómina, aguinaldo on', () => {
  it('sums the year on the card and lists each person in the sheet', async () => {
    await mount({ today: '2026-11-20', preview: on() })
    expect(q('aguinaldo-tarjeta').textContent).toContain('Aguinaldo 2026')
    expect(q('aguinaldo-tarjeta-resumen').textContent).toMatch(
      /2,?268.*para 1 persona; vence el/,
    )
    expect(q('aguinaldo-tarjeta-faltan').textContent).toBe(
      'A 1 persona le falta un dato',
    )
    await openSheet()
    const filas = all('aguinaldo-fila')
    expect(filas.map((li) => li.dataset.employee)).toEqual(['E1', 'E2'])
    expect(filas[0].textContent).toMatch(/184 días trabajados/)
    expect(filas[0].textContent).toMatch(/7\.56 días de aguinaldo/)
    expect(filas[0].textContent).toMatch(/300.* diario/)
    expect(filas[0].textContent).toMatch(/× \$300\.00/)
    expect(
      filas[1].querySelector('[data-testid="aguinaldo-importe"]').textContent,
    ).toBe('—')
    expect(all('aguinaldo-faltante')[0].textContent).toMatch(
      /Escribe cuánto gana/,
    )
    expect(q('aguinaldo-totales').textContent).toMatch(/1 \/ 2/)
  })
  it('without a payment index in doco shows the preview only', async () => {
    await mount({ today: '2026-11-20', preview: on() })
    await openSheet()
    expect(q('aguinaldo-aplicar')).toBeNull()
    expect(q('aguinaldo-solo-calculo').textContent).toMatch(
      /solo calcula el aguinaldo/,
    )
    expect(calls(AGUINALDO_APPLY)).toHaveLength(0)
  })
  it('an encargado sees the sheet but cannot leave it ready to pay', async () => {
    await mount({
      today: '2026-11-20',
      preview: on({ available: true, message: null }),
      ajustes: MANAGER,
    })
    await openSheet()
    expect(all('aguinaldo-fila')).toHaveLength(2)
    expect(q('aguinaldo-aplicar')).toBeNull()
  })
  it('the owner leaves it ready to pay and gets a receipt', async () => {
    const apply = vi.fn(() => ({ personas: 1, importe: 2268.49 }))
    await mount({
      today: '2026-11-20',
      preview: { ...on({ available: true, message: null }), token: 'tok' },
      apply,
    })
    await openSheet()
    q('aguinaldo-aplicar').click()
    await flush()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0][0]).toMatchObject({
      company: 'Empresa',
      year: 2026,
      token: 'tok',
    })
    expect(apply.mock.calls[0][0].request_id).toBeTruthy()
    expect(q('aguinaldo-recibo').textContent).toMatch(
      /Quedó listo para pagar el aguinaldo de 1 persona por/,
    )
    expect(q('aguinaldo-aplicar')).toBeNull()
    expect(calls(AGUINALDO_PREVIEW).length).toBeGreaterThan(1)
  })
})
