// Mi cuenta's self-service blocks in the owner's words, module by module: a
// block shows only when Boat names its capability; Boat's refusal is said with
// its next step; apps read their state and progress; users and cajas read
// Boat's quote (its numbers, never ours) and its effective dates; a plan
// change reads today's amount, the new price and when it applies; Datos
// fiscales filters the régimenes by the RFC's persona type and the usos by the
// régimen; «Agregar tarjeta» sends Muelle the SetupIntent id alone; «Tu
// suscripción» reads Boat's dates; a receipt downloads as «Comprobante».
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

import {
  capable,
  clientKey,
  longDate,
  nextStep,
  refusalView,
  seamOff,
} from '@/components/cuenta/autoservicio'
import {
  appProgress,
  appRows,
  installing,
  mergeApp,
  seedChoices,
  siteNotice,
} from '@/components/cuenta/aplicaciones'
import {
  changeTitle,
  quoteFor,
  readSeats,
  seatAction,
  seatQuoteView,
  seatRows,
} from '@/components/cuenta/usuarios'
import {
  planDoneText,
  planQuoteView,
  scheduledPlanView,
} from '@/components/cuenta/cambioPlan'
import {
  fiscalView,
  fitUso,
  formGap,
  regimenChoices,
  replacesRfc,
  rfcPersona,
  savePayload,
  usoChoices,
} from '@/components/cuenta/fiscal'
import {
  cancelGap,
  cancelQuoteView,
  retentionLine,
  subscriptionView,
} from '@/components/cuenta/suscripcion'
import {
  STRIPE_JS,
  loadStripe,
  setupIntentId,
  setupOutcome,
  setupReady,
  setupRefusal,
  whenGone,
  withTimeout,
} from '@/components/cuenta/tarjeta'
import { downloadReceipt, txnRows } from '@/components/cuenta/facturacion'
import { receiptPath, seam } from '@/components/cuenta/api'
import { call } from 'frappe-ui'

const NOW = new Date(2026, 10, 11, 10, 0)

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})

describe('capabilities and refusals', () => {
  it('a block shows only for a capability Boat names; an older Boat names none', () => {
    const data = { capabilities: ['apps', 'cancel'] }
    expect(capable(data, 'apps')).toBe(true)
    expect(capable(data, 'seats')).toBe(false)
    expect(capable({}, 'apps')).toBe(false)
    expect(capable({ capabilities: 'apps' }, 'apps')).toBe(false)
  })

  it('Boat’s refusal is its sentence and the step that resolves it', () => {
    expect(
      refusalView({
        ok: false,
        reason: 'overdue_invoice',
        message: 'Tienes un pago vencido. Págalo para cambiar tu plan.',
        next: 'pay_invoice',
      }),
    ).toEqual({
      reason: 'overdue_invoice',
      text: 'Tienes un pago vencido. Págalo para cambiar tu plan.',
      next: { act: 'pay', label: 'See invoices' },
    })
    expect(nextStep('activate_plan').act).toBe('activate')
    expect(nextStep('plan_change').act).toBe('plans')
    expect(nextStep('resume_subscription').act).toBe('resume')
    // «Desactiva 2»: no screen here turns a login or a caja off (Equipo
    // invites and sets puestos only), so the step is support, never Equipo.
    expect(nextStep('deactivate')).toEqual({
      act: 'support',
      label: 'Ask support for help',
    })
    expect(nextStep('toString')).toBe(null)
    expect(refusalView({ ok: true })).toBe(null)
    expect(refusalView({ ok: false }).text).toBe(
      'The platform did not accept the change. Try again in a moment.',
    )
    expect(seamOff({ ok: false, reason: 'disabled' })).toBe(true)
  })

  it('dates read in words; each confirm gets its own key', () => {
    expect(longDate('2026-11-30', NOW)).toBe('30 de noviembre')
    expect(longDate('2027-01-15', NOW)).toBe('15 de enero de 2027')
    expect(longDate('', NOW)).toBe('')
    expect(clientKey({ randomUUID: () => 'k-1' })).toBe('k-1')
    expect(clientKey({})).not.toBe(clientKey({}))
  })

  it('a seam travels through miplan.call; the password beside the payload', () => {
    seam('cancel_subscription', { reason: 'closing' }, { password: 'pw' })
    expect(call).toHaveBeenLastCalledWith('doco.docoutils.miplan.call', {
      method: 'cancel_subscription',
      payload: { reason: 'closing' },
      password: 'pw',
    })
    seam('my_apps')
    expect(call).toHaveBeenLastCalledWith('doco.docoutils.miplan.call', {
      method: 'my_apps',
      payload: {},
    })
  })
})

const MY_APPS = {
  ok: true,
  site: 'shop.example',
  unavailable_reason: null,
  apps: [
    {
      app: 'crm_inmobiliaria',
      title_es: 'Inmobiliaria',
      status: 'unavailable',
      reason_es: 'Esta aplicación aún no llega a tu servidor.',
    },
    {
      app: 'taller',
      title_es: 'Taller',
      blurb_es: 'Órdenes de reparación',
      status: 'available',
      seed_options: ['clean', 'sample'],
      can_deactivate: false,
      deactivate_note: 'Se quita del menú del Escritorio.',
    },
    {
      app: 'escaner',
      title_es: 'Escáner',
      status: 'installing',
      progress: {
        phase: 'installing',
        label_es: 'Instalando Escáner',
        step: 2,
        steps: 4,
      },
    },
    {
      app: 'hrms',
      title_es: 'RRHH',
      status: 'active',
      can_deactivate: true,
      deactivate_note: 'Se quita del menú del Escritorio. Tus datos se quedan.',
      manual_url: 'https://wiki.muelle.test/rrhh',
    },
  ],
}

describe('Aplicaciones', () => {
  it('each app with its state; the unavailable ones last with Boat’s reason; no price', () => {
    const rows = appRows(MY_APPS)
    expect(rows.map((r) => [r.app, r.status, r.chip])).toEqual([
      ['taller', 'available', ''],
      ['escaner', 'installing', 'Installing'],
      ['hrms', 'active', 'Active app'],
      ['crm_inmobiliaria', 'unavailable', 'Not available'],
    ])
    expect(rows[3].reason).toBe('Esta aplicación aún no llega a tu servidor.')
    expect([rows[0].canActivate, rows[2].canDeactivate]).toEqual([true, true])
    expect(rows[2].manualUrl).toBe('https://wiki.muelle.test/rrhh')
    expect(JSON.stringify(rows)).not.toMatch(/\$|price/i)
    expect(installing(rows)).toBe(true)
    expect(rows[1].progress).toEqual({
      label: 'Instalando Escáner',
      pct: 50,
      step: 'Step 2 of 4',
    })
    expect(appProgress(null)).toBe(null)
  })

  it('«con datos de ejemplo» only when the app ships them', () => {
    expect(
      seedChoices({ seed_options: ['clean'] }).map((c) => c.value),
    ).toEqual(['clean'])
    expect(
      seedChoices({ seed_options: ['clean', 'sample'] }).map((c) => c.label),
    ).toEqual(['Empty', 'With sample data'])
  })

  it('a site that cannot turn apps on says so once, not on every row', () => {
    const own = 'En este sistema las aplicaciones las activa soporte.'
    const answer = {
      unavailable_reason: own,
      apps: [{ app: 'taller', status: 'unavailable', reason_es: own }],
    }
    expect(siteNotice(answer)).toBe(own)
    expect(appRows(answer)[0].reason).toBe('')
  })

  it('Boat’s answer to a toggle replaces that row', () => {
    const merged = mergeApp(MY_APPS, {
      ok: true,
      app: 'taller',
      status: 'installing',
    })
    expect(merged.apps.find((a) => a.app === 'taller').status).toBe(
      'installing',
    )
    expect(mergeApp(MY_APPS, { ok: false, app: { app: 'taller' } })).toBe(
      MY_APPS,
    )
  })
})

function seatsQuote(overrides = {}) {
  return {
    ok: true,
    changed: false,
    users: {
      included: 2,
      extra: 1,
      extra_target: 1,
      cap: 3,
      cap_target: 3,
      unit_price_mxn: 99,
      max_total: 5,
      scheduled_extra: null,
    },
    sucursales: {
      included: 1,
      extra: 0,
      extra_target: 0,
      cap: 1,
      cap_target: 1,
      unit_price_mxn: 149,
      max_total: 3,
      scheduled_extra: null,
    },
    pending: null,
    message: 'No hay cambios: ya tienes esa cantidad de usuarios y cajas.',
    ...overrides,
  }
}

describe('Usuarios y cajas', () => {
  it('reads Boat’s counts with a quote for no extra users', async () => {
    const quote = seatsQuote({ changed: true })
    const ask = vi.fn(async () => quote)
    expect(await readSeats(ask, {})).toEqual({ quote })
    expect(ask).toHaveBeenCalledWith('seats_quote', { extra_users: 0 })
  })

  it('while more users are active than included, Boat’s count confirms the extras', async () => {
    const refusal = {
      ok: false,
      reason: 'seats_in_use',
      message: 'Tienes 3 usuarios activos. Desactiva 1 para bajar a 2.',
      next: 'deactivate',
      deactivate: { users: 1 },
      active: 3,
    }
    const quote = seatsQuote()
    const ask = vi
      .fn()
      .mockResolvedValueOnce(refusal)
      .mockResolvedValueOnce(quote)
    const data = { meters: { seats: { max_users: 3 } } }
    expect(await readSeats(ask, data)).toEqual({ quote })
    expect(ask).toHaveBeenLastCalledWith('seats_quote', { extra_users: 1 })
    // Boat answering other extras than derived: its refusal stands.
    const wrong = vi
      .fn()
      .mockResolvedValueOnce(refusal)
      .mockResolvedValueOnce(
        seatsQuote({ users: { ...quote.users, extra: 2 } }),
      )
    expect(await readSeats(wrong, data)).toEqual({ refusal })
    const trial = {
      ok: false,
      reason: 'trial',
      message: 'Activa tu plan para agregar usuarios o cajas.',
      next: 'activate_plan',
    }
    expect(await readSeats(async () => trial, data)).toEqual({
      refusal: trial,
    })
  })

  it('a row per kind: included, extra, in use, Boat’s unit price; sin límite without a cap', () => {
    const data = { seats_local: { users_used: 3, sucursales_used: 1 } }
    const [users, cajas] = seatRows(seatsQuote(), data)
    expect([users.label, users.summary, users.used, users.price]).toEqual([
      'Users',
      'Your plan includes 2, plus 1 user extra',
      '3 in use',
      '$99.00 a month for each extra user, IVA included',
    ])
    expect([cajas.summary, cajas.planned, cajas.sold]).toEqual([
      'Your plan includes 1',
      0,
      true,
    ])
    const scheduled = seatsQuote({
      users: { ...seatsQuote().users, scheduled_extra: 0 },
      pending: { seats: { extra_users: 0, effective_date: '2026-12-01' } },
    })
    expect(seatRows(scheduled, data)[0].scheduled).toBe(
      'Goes down to 0 extra on 1 de diciembre',
    )
    const limitless = seatsQuote({
      sucursales: { ...seatsQuote().sucursales, included: 0 },
    })
    expect(seatRows(limitless, data)[1]).toMatchObject({
      limitless: true,
      summary: 'No limit on your plan',
    })
  })

  it('a quote reads Boat’s amount, its invoice and when it applies; fewer wait for the period’s end', () => {
    const up = seatQuoteView(
      {
        ok: true,
        changed: true,
        increase: ['users'],
        decrease: [],
        charge_now_mxn: 49.5,
        charge_on: 'next_invoice',
        monthly_delta_mxn: 99,
        message:
          'Agregas 1 usuario por $99.00 al mes, IVA incluido. Tu próxima factura suma $49.50 por los días que faltan de este mes.',
      },
      NOW,
    )
    expect([up.amount, up.per, up.when]).toEqual([
      '$49.50',
      'Added to your next invoice for the rest of this month, IVA included',
      ['The increase applies today.'],
    ])
    // Boat's sentence carries the monthly price; no figure of ours repeats it.
    expect(up.message).toContain('Agregas 1 usuario por $99.00 al mes')
    const down = seatQuoteView(
      {
        ok: true,
        changed: true,
        increase: [],
        decrease: ['sucursales'],
        charge_now_mxn: 0,
        monthly_delta_mxn: -149,
        decrease_effective_date: '2026-12-01',
      },
      NOW,
    )
    expect([down.amount, down.per, down.when]).toEqual([
      '$149.00',
      'less a month, IVA included',
      ['The decrease applies on 1 de diciembre, when the period ends.'],
    ])
    expect(
      seatQuoteView({ ok: true, changed: false, message: 'Igual.' }),
    ).toEqual({ changed: false, message: 'Igual.' })
    expect(changeTitle('users', 1, 2)).toBe('Add 1 user')
    expect(changeTitle('sucursales', 2, 0)).toBe('Remove 2 registers')
  })

  it('with a decrease scheduled, «+» changes that decrease; the title never says «add» for less', () => {
    // 3 extra today, down to 1 at the period's end: «+» asks for 2.
    expect(changeTitle('users', 3, 2, 1)).toBe('Go down to 2 users extra')
    expect(changeTitle('users', 3, 3, 1)).toBe('Cancel the scheduled decrease')
    expect(changeTitle('users', 3, 4, 1)).toBe('Add 1 user')
    expect(changeTitle('users', 3, 2, 3)).toBe('Remove 1 user')
    expect(changeTitle('users', 3, 3)).toBe('Users and registers')
  })

  it('the confirm says what Boat’s quote does, and its toast repeats the verb', () => {
    const users = (extra, target) => ({
      ...seatsQuote().users,
      extra,
      extra_target: target,
    })
    const up = seatsQuote({
      changed: true,
      users: users(1, 3),
      increase: ['users'],
      decrease: [],
    })
    expect(seatAction('users', up, NOW)).toEqual({
      label: 'Add 2 users',
      done: 'You added 2 users',
    })
    const later = seatsQuote({
      changed: true,
      users: users(3, 2),
      increase: [],
      decrease: ['users'],
      decrease_effective_date: '2026-12-01',
    })
    expect(seatAction('users', later, NOW)).toEqual({
      label: 'Schedule the decrease',
      done: 'Decrease scheduled',
    })
    const today = { ...later, decrease_effective_date: '2026-11-11' }
    expect(seatAction('users', today, NOW)).toEqual({
      label: 'Remove 1 user',
      done: 'You removed 1 user',
    })
    const undo = seatsQuote({
      changed: true,
      users: users(3, 3),
      increase: [],
      decrease: [],
    })
    expect(seatAction('users', undo, NOW)).toEqual({
      label: 'Cancel the scheduled decrease',
      done: 'Scheduled decrease cancelled',
    })
    expect(seatAction('users', seatsQuote(), NOW)).toBe(null)
    // A quote answers the target it was asked for, or it confirms nothing.
    expect(quoteFor(up, 'users', 3)).toBe(true)
    expect(quoteFor(up, 'users', 2)).toBe(false)
    expect(quoteFor(null, 'users', 3)).toBe(false)
  })
})

describe('Cambiar de plan', () => {
  const QUOTE = {
    ok: true,
    changed: true,
    action: 'change',
    current: { plan: 'pro', plan_name: 'Pro', cycle: 'Mensual' },
    target: { plan: 'premium', plan_name: 'Premium', cycle: 'Mensual' },
    direction: 'upgrade',
    applies: 'now',
    effective_date: '2026-11-11',
    plan_effective_date: '2026-11-11',
    cycle_effective_date: null,
    charge_now_mxn: 266.67,
    charge_on: 'next_invoice',
    new_price_mxn: 899,
    new_cycle: 'Mensual',
    installs: [],
    message:
      'Cambias a Premium desde hoy. Precio: $899.00 al mes, IVA incluido.',
  }

  it('an upgrade: today’s amount on the next invoice, the new price, today', () => {
    const view = planQuoteView(QUOTE, NOW)
    expect([view.amount, view.per, view.price, view.when, view.verb]).toEqual([
      '$266.67',
      'Added to your next invoice for the rest of the period, IVA included',
      'Then $899.00 a month, IVA included',
      ['Your plan changes today.'],
      'Change plan',
    ])
    // Boat's sentence repeats the figures and the date: one fact in one place.
    expect([view.message, view.notes]).toEqual(['', []])
  })

  it('a downgrade later says which plan stays until then; a plan with apps says it installs them', () => {
    const view = planQuoteView(
      {
        ...QUOTE,
        target: { plan: 'basico', plan_name: 'Básico', cycle: 'Mensual' },
        direction: 'downgrade',
        applies: 'scheduled',
        plan_effective_date: '2026-12-01',
        charge_now_mxn: 0,
        new_price_mxn: 299,
        installs: ['hrms'],
      },
      NOW,
    )
    expect([view.when, view.notes]).toEqual([
      ['Your plan changes on 1 de diciembre.'],
      [
        'Until then you keep Pro.',
        'We install the plan’s apps; it takes a few minutes.',
      ],
    ])
  })

  it('a cheaper plan or a cycle switch waits, charges nothing today and says from when', () => {
    const view = planQuoteView(
      {
        ...QUOTE,
        direction: 'cycle',
        applies: 'scheduled',
        plan_effective_date: null,
        cycle_effective_date: '2027-01-01',
        charge_now_mxn: 0,
        new_price_mxn: 4990,
        new_cycle: 'Anual',
      },
      NOW,
    )
    expect([
      view.amount,
      view.nothingToday,
      view.price,
      view.when,
      view.verb,
    ]).toEqual([
      '',
      true,
      'Then $4,990.00 a year, IVA included',
      ['Your billing cycle changes on 1 de enero de 2027.'],
      'Schedule the change',
    ])
    expect(
      planQuoteView({ ok: true, changed: false, message: 'Ya.' }).verb,
    ).toBe('')
    const cancel = planQuoteView({
      ...QUOTE,
      action: 'cancel',
      message: 'Cancelas el cambio programado; tu plan sigue igual.',
    })
    expect([cancel.verb, cancel.message]).toEqual([
      'Cancel the scheduled change',
      'Cancelas el cambio programado; tu plan sigue igual.',
    ])
    expect(planDoneText({ applies: 'scheduled' })).toBe('Plan change scheduled')
    expect(planDoneText({ installing: true })).toBe(
      'We are installing your new plan’s apps.',
    )
  })
})

const OPTIONS = {
  regimenes: [
    {
      code: '601',
      label: 'General de Ley Personas Morales',
      personas: ['moral'],
    },
    {
      code: '612',
      label: 'Personas Físicas con Actividades Empresariales',
      personas: ['fisica'],
    },
    {
      code: '626',
      label: 'Régimen Simplificado de Confianza',
      personas: ['fisica', 'moral'],
    },
  ],
  usos: [
    {
      code: 'G01',
      label: 'Adquisición de mercancías',
      regimenes: ['601', '612'],
    },
    {
      code: 'G03',
      label: 'Gastos en general',
      regimenes: ['601', '612', '626'],
    },
    { code: 'S01', label: 'Sin efectos fiscales', regimenes: ['626'] },
  ],
}

describe('a plan change Boat scheduled', () => {
  const PLANS = [
    { name: 'basico', display: 'Básico' },
    { name: 'pro', display: 'Pro', current: true },
  ]
  // Boat's quote for today's plan and cycle while something is scheduled.
  const undo = (item) => ({
    ok: true,
    changed: true,
    action: 'cancel',
    current: { plan: 'pro', plan_name: 'Pro', cycle: 'Mensual' },
    target: { plan: 'pro', plan_name: 'Pro', cycle: 'Mensual' },
    pending: { plan: { effective_date: '2026-12-01', ...item } },
    message: 'Cancelas el cambio programado; tu plan sigue igual.',
  })

  it('names the plan, the cycle and the day, from Boat’s pending change', () => {
    expect(
      scheduledPlanView(undo({ plan: 'basico', cycle: null }), PLANS, NOW),
    ).toMatchObject({
      text: 'You switch to Básico on 1 de diciembre.',
      plan: 'basico',
      cycle: '',
      on: '1 de diciembre',
    })
    expect(
      scheduledPlanView(undo({ plan: null, cycle: 'Anual' }), PLANS, NOW).text,
    ).toBe('You pay yearly from 1 de diciembre.')
    expect(
      scheduledPlanView(undo({ plan: 'basico', cycle: 'Anual' }), PLANS, NOW)
        .text,
    ).toBe('You switch to Básico and pay yearly from 1 de diciembre.')
    // A plan no longer in the store: no key on screen.
    expect(
      scheduledPlanView(undo({ plan: 'viejo', cycle: null }), PLANS, NOW).text,
    ).toBe('Your plan changes on 1 de diciembre.')
    const waits = undo({
      plan: 'basico',
      blocked: {
        reason: 'seats_in_use',
        message: 'Esperamos a que dejes 3 usuarios activos.',
      },
    })
    expect(scheduledPlanView(waits, PLANS, NOW).waits).toBe(
      'Esperamos a que dejes 3 usuarios activos.',
    )
  })

  it('nothing scheduled, a refusal or a plain quote: no line', () => {
    expect(
      scheduledPlanView(
        { ok: false, reason: 'same_plan', message: 'Ya tienes ese plan.' },
        PLANS,
      ),
    ).toBe(null)
    expect(scheduledPlanView({ ...undo({}), action: 'change' }, PLANS)).toBe(
      null,
    )
    expect(scheduledPlanView({ ...undo({}), pending: null }, PLANS)).toBe(null)
    expect(scheduledPlanView(undo({ plan: null, cycle: null }), PLANS)).toBe(
      null,
    )
    // Boat's cancel answer: its verb and the title that goes with it.
    expect(planQuoteView(undo({ plan: 'basico' }))).toMatchObject({
      cancel: true,
      verb: 'Cancel the scheduled change',
    })
  })
})

describe('Datos fiscales', () => {
  it('the RFC’s length names the persona; the régimenes follow it, the usos the régimen', () => {
    expect(rfcPersona('GODE561231GR8')).toBe('fisica')
    expect(rfcPersona('ABC 010101-AB1')).toBe('moral')
    expect(rfcPersona('ABC')).toBe('')
    expect(
      regimenChoices(OPTIONS, 'GODE561231GR8').map((r) => r.value),
    ).toEqual(['612', '626'])
    expect(regimenChoices(OPTIONS, '').map((r) => r.value)).toEqual([
      '601',
      '612',
      '626',
    ])
    expect(usoChoices(OPTIONS, '626').map((u) => u.value)).toEqual([
      'G03',
      'S01',
    ])
    expect(fitUso(OPTIONS, '626', 'G01')).toBe('G03')
    expect(fitUso(OPTIONS, '612', 'G01')).toBe('G01')
  })

  it('«Listo para facturar» from Boat, else what is missing in words', () => {
    const ready = fiscalView({
      ok: true,
      fiscal_ready: true,
      can_save: true,
      profile: {
        rfc: 'GODE561231GR8',
        razon_social: 'Dulces Godínez',
        regimen: '612',
        cp: '82000',
        uso_cfdi: 'G03',
      },
      options: OPTIONS,
    })
    expect(ready.status).toEqual({ ready: true, text: 'Ready to invoice' })
    expect(ready.rows.map((r) => r.value)).toEqual([
      'GODE561231GR8',
      'Dulces Godínez',
      'Personas Físicas con Actividades Empresariales',
      '82000',
      'Gastos en general',
    ])
    const partial = fiscalView({
      ok: true,
      fiscal_ready: false,
      profile: {
        rfc: 'GODE561231GR8',
        razon_social: 'Dulces',
        regimen: '',
        cp: '',
        uso_cfdi: 'G03',
      },
      options: OPTIONS,
    })
    expect(partial.status.text).toBe('Missing: tax regime, postal code.')
    const empty = fiscalView({
      ok: true,
      fiscal_ready: false,
      profile: {},
      options: OPTIONS,
    })
    expect([empty.empty, empty.status.text]).toEqual([
      true,
      'Add your tax details so we can issue your CFDI.',
    ])
    expect(fiscalView({ ok: true, can_save: false, profile: {} }).canSave).toBe(
      false,
    )
  })

  it('the form says what it lacks; replacing an RFC on file asks for the password', () => {
    expect(
      formGap({
        rfc: '',
        razon_social: '',
        regimen: '',
        cp: '',
        uso_cfdi: 'G03',
      }),
    ).toBe('Fill in RFC, business name, tax regime, postal code.')
    expect(
      formGap({
        rfc: 'ABC',
        razon_social: 'X',
        regimen: '601',
        cp: '82000',
        uso_cfdi: 'G03',
      }),
    ).toBe('The RFC has 13 characters for a person or 12 for a company.')
    expect(
      formGap({
        rfc: 'GODE561231GR8',
        razon_social: 'X',
        regimen: '612',
        cp: '820',
        uso_cfdi: 'G03',
      }),
    ).toBe('The postal code has five digits.')
    expect(replacesRfc('', 'GODE561231GR8')).toBe(false)
    expect(replacesRfc('GODE561231GR8', 'gode-561231-gr8')).toBe(false)
    expect(replacesRfc('GODE561231GR8', 'XAXX010101000')).toBe(true)
    expect(
      savePayload({
        rfc: ' gode 561231gr8 ',
        razon_social: ' Dulces ',
        regimen: '612',
        cp: '82000 ',
        uso_cfdi: 'G03',
      }),
    ).toEqual({
      rfc: 'GODE561231GR8',
      razon_social: 'Dulces',
      regimen: '612',
      cp: '82000',
      uso_cfdi: 'G03',
    })
  })
})

describe('Tu suscripción', () => {
  const ON = { capabilities: ['cancel'], site: { is_trial: 0 } }

  it('only with the capability and never on a trial', () => {
    expect(subscriptionView({ site: { is_trial: 0 } })).toBe(null)
    expect(
      subscriptionView({
        capabilities: ['cancel'],
        meters: { billing: { is_trial: true } },
      }),
    ).toBe(null)
    expect(subscriptionView(ON, NOW)).toMatchObject({
      state: 'active',
      title: 'Your subscription',
      canCancel: true,
    })
  })

  it('a recorded cancel says when it ends and offers «Reanudar» while Boat allows it', () => {
    const view = subscriptionView(
      {
        ...ON,
        cancel: {
          state: 'scheduled',
          cancel_at: '2026-11-30',
          service_until: '2026-11-30',
          export_until: '2026-12-30',
          can_resume: true,
        },
      },
      NOW,
    )
    expect([view.title, view.lines, view.canResume]).toEqual([
      'Your subscription ends on 30 de noviembre',
      [
        'Until then everything keeps working, and nothing is charged afterwards.',
        'You can ask for a copy of your data until 30 de diciembre.',
      ],
      true,
    ])
    const ended = subscriptionView(
      { ...ON, cancel: { state: 'ended', service_until: '2026-10-31' } },
      NOW,
    )
    expect([ended.title, ended.canResume, ended.canCancel]).toEqual([
      'Your subscription ended on 31 de octubre',
      false,
      false,
    ])
  })

  it('the quote’s dates, what stays owed and Boat’s reasons', () => {
    const view = cancelQuoteView(
      {
        ok: true,
        state: 'active',
        service_until: '2026-11-30',
        export_until: '2026-12-30',
        archive_on: '2026-12-31',
        delete_after: '2027-12-31',
        ends_now: false,
        unpaid_invoice: { amount_mxn: 499, count: 1 },
        pending: { seats: { extra_users: 0 } },
        reasons: [
          { value: 'expensive', label: 'Es muy caro' },
          { value: 'closing', label: 'Cierro o vendo el negocio' },
        ],
      },
      NOW,
    )
    expect(view.rows.map((r) => [r.key, r.value])).toEqual([
      ['service', '30 de noviembre'],
      ['export', '30 de diciembre'],
      ['archive', '31 de diciembre'],
      // Archiving deletes nothing: how long Boat keeps the data, in its words.
      ['keep', '31 de diciembre de 2027'],
    ])
    expect(view.rows.at(-1).label).toBe('We keep your information until')
    expect(view.lines).toEqual([
      'You have $499.00 to pay; it stays owed even if you cancel.',
      'The changes you had scheduled to your plan are cancelled too.',
    ])
    expect(view.reasons.map((r) => r.label)).toEqual([
      'Es muy caro',
      'Cierro o vendo el negocio',
    ])
    expect(
      cancelQuoteView({ ok: true, state: 'scheduled', message: 'Ya.' }),
    ).toEqual({ recorded: true, message: 'Ya.' })
    expect(cancelQuoteView({ ok: false, reason: 'trial' })).toBe(null)
  })

  it('a retention line never blocks; the button says what is missing', () => {
    expect(retentionLine('expensive', { planChange: true })).toMatchObject({
      act: 'plans',
    })
    expect(retentionLine('expensive')).toBe(null)
    expect(retentionLine('missing_feature').act).toBe('')
    expect(retentionLine('closing')).toBe(null)
    expect(cancelGap({ reason: '', password: '' })).toBe(
      'Choose a reason and type your password to confirm.',
    )
    expect(cancelGap({ reason: 'closing', password: '' })).toBe(
      'Type your password to confirm.',
    )
    expect(cancelGap({ reason: 'closing', password: 'x' })).toBe('')
  })
})

describe('Agregar tarjeta', () => {
  it('the field opens only with Boat’s client secret and publishable key', () => {
    expect(
      setupReady({
        ok: true,
        mode: 'stripe',
        client_secret: 'seti_1_secret_2',
        publishable_key: 'pk_test_1',
      }),
    ).toBe(true)
    expect(setupReady({ ok: true, client_secret: 'seti_1_secret_2' })).toBe(
      false,
    )
    expect(
      setupRefusal({
        ok: false,
        reason: 'rail_unsupported',
        message: 'Por ahora no puedes agregar tu tarjeta desde el panel.',
      }),
    ).toBe('Por ahora no puedes agregar tu tarjeta desde el panel.')
    expect(setupRefusal({})).toMatch(/not available right now/)
  })

  it('a bank’s check, a late confirm and a timeout each read as what they are', async () => {
    const intent = (status) => ({ id: 'seti_ABC123', status })
    expect(setupOutcome({ setupIntent: intent('succeeded') })).toEqual({
      kind: 'confirmed',
      id: 'seti_ABC123',
    })
    // 3-D Secure: handleActions false hands it back instead of opening it.
    expect(setupOutcome({ setupIntent: intent('requires_action') })).toEqual({
      kind: 'challenge',
    })
    expect(
      setupOutcome({ error: { message: 'Tu tarjeta fue rechazada.' } }),
    ).toEqual({ kind: 'error', message: 'Tu tarjeta fue rechazada.' })
    // Confirmed by an earlier answer that came late: Stripe says so in an error.
    expect(
      setupOutcome({
        error: {
          code: 'setup_intent_unexpected_state',
          setup_intent: intent('succeeded'),
        },
      }),
    ).toEqual({ kind: 'confirmed', id: 'seti_ABC123' })
    expect(
      setupOutcome({ setupIntent: intent('requires_payment_method') }),
    ).toEqual({ kind: 'unconfirmed' })
    expect(setupOutcome({ timedOut: true })).toEqual({ kind: 'timeout' })
    const timers = []
    const never = withTimeout(new Promise(() => {}), 45000, {
      set: (fn, ms) => timers.push([fn, ms]),
      clear: () => {},
    })
    expect(timers[0][1]).toBe(45000)
    timers[0][0]()
    expect(await never).toEqual({ timedOut: true })
    expect(await withTimeout(Promise.resolve('listo'), 10)).toBe('listo')
    // The bank's window opens only once the sheet has left the page.
    const sheet = document.createElement('div')
    document.body.appendChild(sheet)
    let left = false
    const gone = whenGone(sheet, 1000, 5).then(() => (left = true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(left).toBe(false)
    sheet.remove()
    await gone
    expect(left).toBe(true)
  })

  it('Muelle receives the SetupIntent id, never its secret', () => {
    expect(setupIntentId({ setupIntent: { id: 'seti_123' } })).toBe('seti_123')
    expect(setupIntentId({ setupIntent: { id: 'seti_1_secret_2' } })).toBe('')
    expect(setupIntentId({})).toBe('')
  })

  it('Stripe.js loads from js.stripe.com once, on demand', async () => {
    const appended = []
    const win = {}
    const doc = {
      createElement: () => {
        const listeners = {}
        return {
          addEventListener: (type, fn) => (listeners[type] = fn),
          remove: vi.fn(),
          fire: (type) => listeners[type](),
        }
      },
      head: { appendChild: (el) => appended.push(el) },
    }
    const first = loadStripe({ doc, win })
    const again = loadStripe({ doc, win })
    expect(again).toBe(first)
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toBe(STRIPE_JS)
    win.Stripe = function Stripe() {}
    appended[0].fire('load')
    await expect(first).resolves.toBe(win.Stripe)
    // Already on the page: nothing is injected.
    await expect(loadStripe({ doc, win })).resolves.toBe(win.Stripe)
    expect(appended).toHaveLength(1)
  })
})

describe('Comprobante', () => {
  it('a paid top-up offers its receipt; a debit does not', () => {
    const rows = txnRows([
      { name: 'TX1', txn_type: 'Top-up', amount_mxn: 500 },
      { name: 'TX2', txn_type: 'Debit', amount_mxn: -3 },
    ])
    expect(rows.map((r) => r.paidTopup)).toEqual([true, false])
  })

  it('downloads the PDF as «Comprobante», never «factura»; a refusal says Boat’s words', async () => {
    const save = vi.fn()
    const fetcher = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/pdf' },
      blob: async () => new Blob(['%PDF']),
    }))
    expect(
      await downloadReceipt(
        { type: 'invoice', name: 'INV-09' },
        { fetcher, save },
      ),
    ).toBe('')
    expect(fetcher.mock.calls[0][0]).toBe(receiptPath('invoice', 'INV-09'))
    expect(receiptPath('topup', 'TX 1')).toBe(
      '/api/method/doco.docoutils.miplan.download_receipt?txn=TX+1',
    )
    expect(save.mock.calls[0][1]).toBe('Comprobante-INV-09.pdf')
    const refused = vi.fn(async () => ({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({
        _server_messages: JSON.stringify([
          JSON.stringify({
            message: 'Comprobante no encontrado para este sitio.',
          }),
        ]),
      }),
    }))
    expect(
      await downloadReceipt(
        { type: 'topup', name: 'TX1' },
        { fetcher: refused, save },
      ),
    ).toBe('Comprobante no encontrado para este sitio.')
  })
})
