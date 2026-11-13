// Mi cuenta (/crm/cuenta) as the owner sees it: the plan and its verdict, the
// trial strip and «Activar», notices with their next step, the meters and the
// site's health; the activation sheet's amount (Boat's quote, IVA included, or
// the plan price), the shell's doors and its one notice, and Hoy's trial card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  call: vi.fn(),
  // «Una copia de tus datos» reads doco's export status with Resumen.
  exportStatus: vi.fn(async () => ({ export: null, can_request: true })),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
// The kit's sheet is reka's dialog; here it renders its slots while open.
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/components/cuenta/api', () => ({
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: vi.fn(),
  exportStatus: (...args) => state.exportStatus(...args),
  requestExport: vi.fn(),
  exportDownloadPath: (name) => `/zip/${name}`,
}))

import {
  accountAlerts,
  activationView,
  healthRows,
  planView,
  siteStatus,
  trialTitle,
  usageRows,
  verdict,
} from '@/components/cuenta/cuenta'
import {
  accountNotice,
  cuentaLine,
  dismissNotice,
  shellNotice,
} from '@/components/shell/cuentaDoor'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'
import ActivarSheet from '@/components/cuenta/ActivarSheet.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'
import { TRIAL_SOURCE, continuarCards, trialCard } from '@/composables/useHoy'

const READY = {
  status: 'ready',
  next_action: 'activate',
  authoritative: true,
  site_status: 'Active',
  is_trial: true,
  invoices: {},
}
function trialBoot(overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 1 },
    meters: {
      billing: {
        is_trial: true,
        trial_days_left: 5,
        trial_end_date: '2026-11-16',
        monthly_price_mxn: 499,
        next_charge_date: '2026-11-16',
      },
      storage: {
        used: 2.4,
        allowance: 15,
        unit: 'GB-month',
        db_gb: 0.5,
        disk_gb: 1.9,
      },
      cfdi: { used: 90, monthly_cap: 100, remaining: 10 },
      seats: { max_users: 5, max_sucursales: 3 },
      emails_sent: 12,
      whatsapp_msgs: 1400,
      health: {
        last_backup_at: '2026-11-11 03:00:00',
        ssl_days_left: 40,
        last_health_check: '2026-11-11 09:30:00',
      },
    },
    seats_local: {
      users_used: 3,
      users_cap: 5,
      sucursales_used: 1,
      sucursales_cap: 3,
    },
    invoices: [],
    payment_state: READY,
    ...overrides,
  }
}
const NOW = new Date(2026, 10, 11, 10, 0)

describe('the Resumen in the owner’s words', () => {
  it('names the plan, the trial and what IVA includes', () => {
    const plan = planView(trialBoot())
    expect(plan.title).toBe('Plan {0}'.replace('{0}', 'Pro'))
    expect(plan.isTrial).toBe(true)
    expect(plan.daysLeft).toBe(5)
    const paid = planView(
      trialBoot({
        site: { status: 'Active', plan: 'basico', is_trial: 0 },
        meters: {
          billing: {
            is_trial: false,
            monthly_price_mxn: 299,
            next_charge_date: '2026-12-01',
          },
        },
      }),
    )
    expect(paid.title).toBe('Plan Básico')
    expect(paid.next).toMatch(/\$299\.00 IVA included/)
    expect(paid.next).not.toMatch(/\+ IVA/)
  })

  it('puts what interrupts selling first, each with its next step', () => {
    const alerts = accountAlerts(
      trialBoot({
        site: { status: 'Degraded', plan: 'pro' },
        invoices: [
          { name: 'A', status: 'Overdue' },
          { name: 'B', status: 'Sent' },
        ],
        meters: {
          ...trialBoot().meters,
          saldo: { balance_mxn: 0, status: 'empty' },
        },
      }),
    )
    // The overdue invoice and the one to pay are one notice that opens Facturación.
    expect(alerts.map((a) => [a.level, a.act])).toEqual([
      ['bad', 'support'],
      ['bad', 'pay'],
      ['bad', 'topup'],
    ])
    expect(alerts[0].text).toBe(
      'The site has technical faults. If something does not work for you, write to us.',
    )
    expect([alerts[1].text, alerts[1].cta]).toEqual([
      'You have 2 invoices to pay, 1 overdue.',
      'See invoices',
    ])
    expect(verdict(alerts)).toEqual({ tone: 'bad', text: 'Needs action today' })
    expect(verdict([])).toEqual({ tone: 'ok', text: 'All in order' })
  })

  it('a trial three days from its end asks for «Activar»', () => {
    const boot = trialBoot()
    boot.meters.billing.trial_days_left = 2
    expect(accountAlerts(boot).map((a) => a.act)).toEqual(['activate'])
  })

  it('one notice for the invoices: overdue alone, to pay alone, or both counted', () => {
    const notice = (invoices) =>
      accountAlerts(trialBoot({ invoices })).filter((a) => a.act === 'pay')
    expect(
      notice([
        { name: 'A', status: 'Overdue' },
        { name: 'B', status: 'Failed' },
      ]).map((a) => [a.level, a.text, a.cta]),
    ).toEqual([
      [
        'bad',
        'You have 2 overdue invoices. Pay them so you keep the service.',
        'See invoices',
      ],
    ])
    expect(
      notice([{ name: 'B', status: 'Sent' }]).map((a) => [a.level, a.text]),
    ).toEqual([['warn', 'You have an invoice to pay.']])
    expect(
      notice([
        { name: 'A', status: 'Overdue' },
        { name: 'B', status: 'Overdue' },
        { name: 'C', status: 'Unpaid' },
      ]).map((a) => a.text),
    ).toEqual(['You have 3 invoices to pay, 2 overdue.'])
  })

  it('a trial past its end, before the suspension, has ended: not «ends today»', () => {
    const boot = trialBoot()
    boot.meters.billing.trial_days_left = 0
    boot.meters.billing.trial_end_date = '2026-11-10'
    const plan = planView(boot, NOW)
    expect(plan.trialOver).toBe(true)
    // The trial strip says it; the plan line says what activating costs.
    expect(plan.next).toBe(
      'Once activated: {0} a month, IVA included'.replace('{0}', '$499.00'),
    )
    expect(trialTitle(plan.daysLeft, plan.trialOver)).toBe('Your trial ended')
    boot.meters.billing.trial_end_date = '2026-11-11'
    expect(planView(boot, NOW).trialOver).toBe(false)
    expect(trialTitle(0)).toBe('Your trial ends today')
  })

  it('an active site and a calm verdict are grey; colour is for what needs doing', () => {
    expect(siteStatus('Active')).toEqual({ label: 'Active', tone: 'neutral' })
    expect(siteStatus('Suspended').tone).toBe('danger')
  })

  it('reads the meters the way Mi plan does', () => {
    const rows = usageRows(trialBoot())
    expect(rows.map((r) => [r.label, r.value, r.pct, r.warn])).toEqual([
      ['Storage', '2.4 / 15 GB', 16, false],
      ['CFDI stamps', '90 / 100', 90, true],
      ['Active users', '3 / 5', 60, false],
      ['Registers and branches', '1 / 3', 33, false],
      ['System emails', '12', null, false],
      ['WhatsApp messages', '1,400', null, false],
    ])
    expect(rows[0].sub).toBe('Database 0.5 GB, files 1.9 GB')
    expect(rows[1].sub).toBe('{0} left this month'.replace('{0}', '10'))
  })

  it('says when the last backup and check ran, and warns on an old one', () => {
    const rows = healthRows(trialBoot(), NOW)
    expect(rows.map((r) => [r.label, r.value, r.warn])).toEqual([
      ['Last backup', 'hoy', false],
      ['Security certificate', 'Renews in 40 days', false],
      ['Last check', 'hoy 09:30', false],
    ])
    const old = trialBoot()
    old.meters.health.last_backup_at = '2026-11-05 03:00:00'
    expect(healthRows(old, NOW)[0].warn).toBe(true)
    old.meters.health.ssl_days_left = 1
    expect(healthRows(old, NOW)[1].value).toBe('Renews in 1 day')
    expect(accountAlerts(old).map((a) => a.text)).toContain(
      'The security certificate renews by itself; it expires in 1 day.',
    )
  })

  it('charges Boat’s quote, or the plan price when there is none', () => {
    const quote = {
      ok: true,
      amount_mxn: 579.84,
      lines: [
        { label: 'Plan Pro', amount_mxn: 499 },
        { label: 'IVA', amount_mxn: 80.84 },
      ],
    }
    const exact = activationView(quote, planView(trialBoot()))
    expect(exact.amount).toBe('$579.84')
    expect(exact.lines.map((l) => [l.label, l.amount])).toEqual([
      ['Plan Pro', '$499.00'],
      ['IVA', '$80.84'],
    ])
    expect(exact.note).toBe('IVA included')
    const fallback = activationView(null, planView(trialBoot()))
    expect([fallback.amount, fallback.lines, fallback.note]).toEqual([
      '$499.00',
      [],
      'a month, IVA included',
    ])
  })

  it('a suspension for debt asks for the payment once; a trial’s for activating', () => {
    const debt = trialBoot({
      site: { status: 'Suspended', plan: 'pro', is_trial: 0 },
      invoices: [{ name: 'A', status: 'Overdue', amount_mxn: 499 }],
    })
    debt.meters.billing = { is_trial: false }
    expect(accountAlerts(debt).map((a) => [a.act, a.text])).toEqual([
      [
        'pay',
        'The site is suspended for an overdue invoice. Pay it to reactivate it.',
      ],
    ])
    const trial = trialBoot({ site: { status: 'Suspended', plan: 'pro' } })
    expect(accountAlerts(trial)[0]).toMatchObject({
      act: '',
      text: 'Your trial ended and the site is suspended. Activate your plan to use it again.',
    })
  })

  it('an empty wallet speaks up only for what it pays', () => {
    const idle = trialBoot()
    delete idle.meters.cfdi
    idle.meters.saldo = { balance_mxn: 0, status: 'empty' }
    expect(accountAlerts(idle).some((a) => a.act === 'topup')).toBe(false)
    const airtime = trialBoot()
    airtime.meters.saldo = {
      balance_mxn: 0,
      status: 'empty',
      recarga_count_month: 4,
    }
    expect(accountAlerts(airtime).find((a) => a.act === 'topup').text).toBe(
      'The wallet is at zero and it pays for the stamps beyond your package and the airtime you sell. Top it up so they do not stop.',
    )
  })

  it('an Anual plan charges its annual fee; a month without it is the next invoice', () => {
    const boot = trialBoot({
      site: { status: 'Active', plan: 'pro', is_trial: 0 },
    })
    boot.meters.billing = {
      is_trial: false,
      billing_cycle: 'Anual',
      monthly_price_mxn: 499,
      annual_price_mxn: 4990,
      next_plan_fee_mxn: 4990,
      next_charge_date: '2027-01-01',
    }
    expect(planView(boot).next).toMatch(/annual fee \$4,990\.00 IVA included/)
    boot.meters.billing.next_plan_fee_mxn = 0
    expect(planView(boot).next).toMatch(/^Next invoice /)
    const plan = planView(boot)
    expect(activationView(null, plan).amount).toBe('$4,990.00')
    expect(activationView(null, plan).note).toBe('a year, IVA included')
  })

  it('the quote says what it covers, and a zero quote charges nothing', () => {
    const plan = planView(trialBoot())
    const monthly = activationView(
      {
        ok: true,
        amount_mxn: 499,
        lines: [{ label: 'Plan Pro', amount_mxn: 499, kind: 'base_fee' }],
        period: { start: '2026-11-01', end: '2026-11-30' },
      },
      plan,
    )
    expect(monthly.covers).toMatch(/^Covers 1.+30 de noviembre\.$/)
    const annual = activationView(
      {
        ok: true,
        amount_mxn: 4990,
        billing_cycle: 'Anual',
        lines: [
          { label: 'Plan Pro — anualidad', amount_mxn: 4990, kind: 'base_fee' },
        ],
        period: { start: '2026-11-01', end: '2026-11-30' },
      },
      plan,
    )
    expect(annual.covers).toBe('The annual fee covers 12 months.')
    const free = activationView({ ok: true, amount_mxn: 0, lines: [] }, plan)
    expect(free.free).toBe(true)
    // A malformed line is no quote: the plan price shows instead.
    const broken = activationView(
      { ok: true, amount_mxn: 10, lines: [{ label: 1, amount_mxn: 2 }] },
      plan,
    )
    expect(broken.exact).toBe(false)
  })
})

describe('the shell’s doors and notice', () => {
  const owner = (plan) => ({ cuenta: true, plan })
  beforeEach(() => sessionStorage.clear())

  it('a line under «Mi cuenta» for the trial or what is overdue', () => {
    expect(cuentaLine(owner({ is_trial: true, trial_days_left: 5 }))).toBe(
      'Trial: {0} days left'.replace('{0}', '5'),
    )
    expect(cuentaLine(owner({ overdue_count: 2 }))).toBe(
      '{0} invoices are overdue'.replace('{0}', '2'),
    )
    expect(cuentaLine({ cuenta: false, plan: { overdue_count: 2 } })).toBe('')
    // One day is one day; past its end the trial has ended.
    expect(cuentaLine(owner({ is_trial: true, trial_days_left: 1 }))).toBe(
      'Trial: 1 day left',
    )
    expect(
      cuentaLine(
        owner({ is_trial: true, trial_days_left: 0, trial_over: true }),
      ),
    ).toBe('Your trial ended')
  })

  it('speaks up for an overdue invoice or a suspension within days', () => {
    expect(
      accountNotice(owner({ overdue_count: 1, overdue_amount: 499 })),
    ).toEqual({
      key: 'overdue:1:499',
      kind: 'overdue',
      text: 'You have an overdue invoice. Pay it so you keep the service.',
      to: '/cuenta?tab=facturacion',
      cta: 'See invoices',
    })
    const trial = accountNotice(
      owner({
        is_trial: true,
        trial_days_left: 2,
        suspend_days_left: 3,
        suspend_at: 'x',
      }),
    )
    // Straight to the activation sheet, one tap.
    expect([trial.kind, trial.text, trial.to, trial.cta]).toEqual([
      'trial',
      'Your trial ends in 2 days. Activate your plan so you keep the service.',
      '/cuenta?activar=1',
      'Activate',
    ])
    expect(
      accountNotice(
        owner({
          is_trial: true,
          trial_days_left: 0,
          trial_over: true,
          suspend_days_left: 0,
          suspend_at: 'x',
        }),
      ).text,
    ).toBe('Your trial ended. Activate your plan so you keep the service.')
    expect(
      accountNotice(owner({ suspend_days_left: 1, suspend_at: 'z' })).text,
    ).toBe('Your site is suspended tomorrow. Check your account to avoid it.')
    expect(
      accountNotice(owner({ suspend_days_left: 1, suspend_at: 'z' })).cta,
    ).toBe('See my account')
    expect(
      accountNotice(owner({ suspend_days_left: 0, suspend_at: 'y' })).text,
    ).toBe('Your site is suspended today. Check your account to avoid it.')
    expect(
      accountNotice(
        owner({ is_trial: true, trial_days_left: 9, suspend_days_left: 10 }),
      ),
    ).toBeNull()
    expect(accountNotice({ cuenta: false, plan: null })).toBeNull()
  })

  it('a dismissed notice stays hidden this session until a new one arrives', () => {
    shellBoot.value = {
      account: owner({ overdue_count: 1, overdue_amount: 499 }),
    }
    expect(shellNotice.value?.key).toBe('overdue:1:499')
    dismissNotice()
    expect(shellNotice.value).toBeNull()
    shellBoot.value = {
      account: owner({ overdue_count: 2, overdue_amount: 998 }),
    }
    expect(shellNotice.value?.key).toBe('overdue:2:998')
    shellBoot.value = null
  })
})

describe('Hoy’s trial card', () => {
  const continuar = {
    available: true,
    items: [],
    sources: [
      {
        key: TRIAL_SOURCE,
        label: 'Tu prueba termina en 5 días',
        detail: 'Activa tu plan para seguir vendiendo sin interrupciones.',
        count: 1,
        url: '/crm/cuenta?activar=1',
        rows: [],
      },
    ],
  }
  it('takes its own place above the day and opens the activation sheet', () => {
    const card = trialCard(continuar)
    expect(card.title).toBe('Tu prueba termina en 5 días')
    expect(card.to).toMatch(/^\/cuenta\?activar=1&return_to=/)
    expect(continuarCards(continuar)).toEqual([])
    expect(trialCard({ sources: [] })).toBeNull()
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
function mount(component, props = {}, router) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () => h(component, { ...props, onAct: (key) => events.push(key) }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  if (router) app.use(router)
  app.mount(root)
  return events
}
const button = (text) =>
  [...document.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.call.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  shellBoot.value = null
})

function readyDoor(boot = trialBoot()) {
  const door = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
  })
  door.boot.value = boot
  door.loading.value = false
  door.resolvePaymentState(boot.payment_state)
  return door
}

describe('CuentaResumen', () => {
  it('shows the plan, the trial strip and the meters; «Activar» asks for the sheet', async () => {
    const door = readyDoor()
    const events = mount(CuentaResumen, { door, actions: ['activate', 'pay'] })
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-plan"]').textContent,
    ).toContain('Plan Pro')
    expect(
      root.querySelector('[data-testid="cuenta-prueba"]').textContent,
    ).toContain('Your trial ends in 5 days')
    // Five days of trial with nothing overdue: nothing interrupts selling yet.
    expect(
      root.querySelector('[data-testid="cuenta-verdict"]').textContent,
    ).toContain('All in order')
    const uso = root.querySelector('[data-testid="cuenta-uso"]').textContent
    expect(uso).toContain('CFDI stamps')
    expect(uso).toContain('90 / 100')
    expect(
      root.querySelector('[data-testid="cuenta-sitio"]').textContent,
    ).toContain('Last backup')
    button('Activate').click()
    expect(events).toEqual(['activate'])
  })

  it('an overdue invoice is a notice whose «Ver facturas» asks for Facturación; no wallet, no wallet row', async () => {
    const boot = trialBoot({
      site: { status: 'Active', plan: 'pro', is_trial: 0 },
      invoices: [{ name: 'INV-1', status: 'Overdue', amount_mxn: 499 }],
    })
    boot.meters.billing = { is_trial: false, monthly_price_mxn: 499 }
    const events = mount(CuentaResumen, {
      door: readyDoor(boot),
      actions: ['pay'],
    })
    await flush()
    expect(root.querySelector('[data-testid="cuenta-prueba"]')).toBeNull()
    expect(root.querySelector('[data-testid="cuenta-monedero"]')).toBeNull()
    const avisos = root.querySelector('[data-testid="cuenta-avisos"]')
    expect(avisos.textContent).toContain('You have an overdue invoice.')
    button('See invoices').click()
    expect(events).toEqual(['pay'])
  })

  it('a payment hold locks «Recargar», never the way to the invoices', async () => {
    const boot = trialBoot({
      site: { status: 'Active', plan: 'pro', is_trial: 0 },
      invoices: [{ name: 'INV-1', status: 'Overdue', amount_mxn: 499 }],
      payment_state: { ...READY, reason: 'invalid_payment_state' },
    })
    boot.meters.billing = { is_trial: false, monthly_price_mxn: 499 }
    boot.meters.saldo = { balance_mxn: 1250.5, status: 'healthy' }
    const door = readyDoor(boot)
    expect(door.paymentActionsBlocked()).toBe(true)
    const events = mount(CuentaResumen, { door, actions: ['pay', 'topup'] })
    await flush()
    expect(button('See invoices').disabled).toBe(false)
    expect(button('Top up').disabled).toBe(true)
    button('See invoices').click()
    expect(events).toEqual(['pay'])
  })

  it('an empty wallet says why with one «Recargar», not a second one on its row', async () => {
    const boot = trialBoot()
    boot.meters.saldo = {
      balance_mxn: 0,
      status: 'empty',
      recarga_last_at: '2026-11-10 17:00:00',
    }
    const events = mount(CuentaResumen, {
      door: readyDoor(boot),
      actions: ['topup'],
    })
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-avisos"]').textContent,
    ).toContain('The wallet is at zero')
    const topups = [...root.querySelectorAll('button')].filter(
      (b) => b.textContent.trim() === 'Top up',
    )
    expect(topups).toHaveLength(1)
    expect(
      root.querySelector('[data-testid="cuenta-monedero"] button'),
    ).toBeNull()
    topups[0].click()
    expect(events).toEqual(['topup'])
  })

  it('a next step the page cannot open yet keeps its sentence without a button', async () => {
    const boot = trialBoot()
    boot.meters.cfdi = { used: 100, monthly_cap: 100, remaining: 0 }
    mount(CuentaResumen, { door: readyDoor(boot), actions: ['activate'] })
    await flush()
    expect(root.textContent).toContain('You reached this month’s stamp limit.')
    expect(button('See plans')).toBeUndefined()
  })
})

describe('ActivarSheet', () => {
  it('reads back Boat’s quote and «Pagar» activates, returning to Mi cuenta', async () => {
    state.read.mockImplementation(async (fn) =>
      fn === 'activation_quote'
        ? {
            ok: true,
            amount_mxn: 579.84,
            lines: [{ label: 'Plan Pro', amount_mxn: 579.84 }],
          }
        : { ok: true, cards: [{ brand: 'Visa', last4: '4242' }] },
    )
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/c' })
    const door = readyDoor()
    await door.openActivation()
    mount(ActivarSheet, { door, open: true })
    await flush()
    const sheet = root.querySelector('[data-testid="cuenta-activacion"]')
    expect(root.querySelector('h2').textContent).toBe('Activate plan Pro')
    expect(
      sheet.querySelector('[data-testid="activar-monto"]').textContent,
    ).toBe('$579.84')
    expect(sheet.textContent).toContain('IVA included')
    expect(sheet.textContent).toContain('Visa ···· 4242')
    expect(sheet.textContent).not.toContain('+ IVA')
    // A saved card makes a choice: the card or the processor's page.
    expect(sheet.querySelectorAll('input[type="radio"]')).toHaveLength(2)
    root.querySelector('[data-testid="activar-pagar"]').click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('activate_plan', {
      use_saved_card: 0,
      panel: 'cuenta',
    })
  })

  it('without a quote the plan price shows, IVA included, and no lines', async () => {
    state.read.mockImplementation(async (fn) =>
      fn === 'activation_quote'
        ? { ok: false, reason: 'unavailable' }
        : { cards: [] },
    )
    const door = readyDoor()
    await door.openActivation()
    mount(ActivarSheet, { door, open: true })
    await flush()
    expect(
      root.querySelector('[data-testid="activar-monto"]').textContent,
    ).toBe('$499.00')
    expect(root.textContent).toContain('a month, IVA included')
    expect(root.querySelector('[data-testid="activar-lineas"]')).toBeNull()
    // No saved card: nothing to choose, one line says how the payment goes.
    expect(root.querySelector('input[type="radio"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="activar-como"]').textContent,
    ).toContain('You pay on the payment processor’s secure page')
  })

  it('an open session offers only its continuation and says why', async () => {
    state.read.mockResolvedValue({ cards: [] })
    const door = readyDoor()
    door.resolvePaymentState({
      ...READY,
      status: 'checkout',
      next_action: 'continue_checkout',
      checkout_url: 'https://pay.test/open',
      checkout_session: {
        status: 'open',
        payment_status: 'unpaid',
        capture_safe: true,
      },
    })
    door.activationOpen.value = true
    mount(ActivarSheet, { door, open: true })
    await flush()
    expect(root.querySelector('[data-testid="activar-pagar"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="activar-continuar"]'),
    ).not.toBeNull()
    expect(root.textContent).toContain('Continue the same payment')
    expect(button('Check status')).toBeDefined()
  })
})

describe('the Cuenta page', () => {
  async function page(path, account) {
    shellBoot.value = { user: { name: 'owner@example.test' }, account }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } },
        { path: '/hoy', component: { render: () => null } },
      ],
    })
    await router.push(path)
    await router.isReady()
    mount({ render: () => h(Cuenta) }, {}, router)
    await flush()
    return router
  }

  it('a person without the permission reads who to ask, and no plan is read', async () => {
    await page('/cuenta', { cuenta: false, available: true, plan: null })
    expect(root.textContent).toContain('The shop’s plan is for the owner')
    expect(button('Ask for access')).toBeDefined()
    expect(state.read).not.toHaveBeenCalled()
  })

  it('a site without an account says so', async () => {
    await page('/cuenta', undefined)
    expect(root.textContent).toContain(
      'My account is not available on this site',
    )
  })

  it('a site without a platform link says it has no plan, not that the owner lacks it', async () => {
    await page('/cuenta', { cuenta: false, available: false, plan: null })
    expect(root.textContent).toContain(
      'My account is not available on this site',
    )
    expect(root.textContent).not.toContain('Ask for access')
    expect(state.read).not.toHaveBeenCalled()
  })

  it('Hoy’s «Activar» opens the activation sheet once the plan is read', async () => {
    state.call.mockResolvedValue({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap'
        ? trialBoot()
        : fn === 'activation_quote'
          ? { ok: false }
          : { cards: [] },
    )
    const router = await page('/cuenta?activar=1', { cuenta: true, plan: null })
    await flush()
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
    const sheet = document.querySelector('[data-testid="cuenta-activacion"]')
    expect(sheet).not.toBeNull()
    expect(
      document.querySelector('h2[id="cuenta-plan"]').textContent,
    ).toContain('Plan Pro')
    // The plan was read: the shell's boot follows the fresh summary.
    expect(state.call).toHaveBeenCalledWith('crm.api.shell.boot')
    button('Cancel').click()
    await flush()
    expect(router.currentRoute.value.query.activar).toBeUndefined()
  })

  it('Hoy’s «Activar» on a plan already paid opens nothing and drops the link', async () => {
    state.call.mockResolvedValue({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })
    const paid = trialBoot({
      site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
      payment_state: { ...READY, is_trial: false, next_action: null },
    })
    paid.meters.billing = { is_trial: false, monthly_price_mxn: 499 }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? paid : { ok: false, cards: [] },
    )
    const router = await page('/cuenta?activar=1', { cuenta: true, plan: null })
    await flush()
    expect(
      document.querySelector('[data-testid="cuenta-activacion"]'),
    ).toBeNull()
    expect(state.read).not.toHaveBeenCalledWith(
      'activation_quote',
      expect.anything(),
    )
    expect(router.currentRoute.value.query.activar).toBeUndefined()
    expect(
      root.querySelector('[data-testid="cuenta-plan"]').textContent,
    ).toContain('Plan Pro')
  })

  async function until(selector) {
    for (let i = 0; i < 100; i++) {
      const found = document.querySelector(selector)
      if (found) return found
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return null
  }
  function answers(boot) {
    state.call.mockResolvedValue({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap'
        ? boot
        : fn === 'wallet_txns'
          ? []
          : fn === 'activation_quote'
            ? { ok: false }
            : { ok: true, cards: [] },
    )
  }

  it('three sections; ?tab=facturacion opens the invoices', async () => {
    answers(
      trialBoot({
        site: { status: 'Active', plan: 'pro', is_trial: 0 },
        invoices: [
          {
            name: 'INV-1',
            status: 'Overdue',
            amount_mxn: 499,
            period_start: '2026-10-01',
          },
        ],
      }),
    )
    await page('/cuenta?tab=facturacion', { cuenta: true, plan: null })
    const tabs = [...root.querySelectorAll('[role="radio"]')].map((b) =>
      b.textContent.trim(),
    )
    expect(tabs).toEqual(['Summary', 'Billing', 'Store'])
    const due = await until('[data-testid="cuenta-por-pagar"]')
    expect(due.textContent).toContain('Octubre 2026')
    expect(root.querySelector('[data-testid="cuenta-plan"]')).toBeNull()
  })

  it('an overdue notice’s «Pagar» opens Facturación, where the invoice’s «Pagar» waits', async () => {
    answers(
      trialBoot({
        site: { status: 'Active', plan: 'pro', is_trial: 0 },
        invoices: [
          {
            name: 'INV-1',
            status: 'Overdue',
            amount_mxn: 499,
            period_start: '2026-10-01',
          },
        ],
      }),
    )
    const router = await page('/cuenta', { cuenta: true, plan: null })
    root.querySelector('[data-testid="cuenta-avisos"] button').click()
    await flush()
    expect(router.currentRoute.value.query.tab).toBe('facturacion')
    expect((await until('[data-testid="factura-pagar"]')).textContent).toBe(
      'Pay $499.00',
    )
  })

  it('Boat’s top-up link (?recargar=1) opens «Recargar» once the plan is read', async () => {
    const boot = trialBoot()
    boot.meters.saldo = { balance_mxn: 80, status: 'low' }
    answers(boot)
    const router = await page('/cuenta?recargar=1', {
      cuenta: true,
      plan: null,
    })
    const sheet = await until('[data-testid="cuenta-recarga"]')
    expect(sheet).not.toBeNull()
    button('Cancel').click()
    await flush()
    expect(router.currentRoute.value.query.recargar).toBeUndefined()
  })

  it('Diseño del sitio’s «Elegir mi dirección» (?seccion=direccion) opens Tienda on the store’s address', async () => {
    answers(trialBoot())
    const ids = vi.spyOn(document, 'getElementById')
    const router = await page('/cuenta?tab=tienda&seccion=direccion', {
      cuenta: true,
      plan: null,
    })
    await flush()
    expect(router.currentRoute.value.query.tab).toBe('tienda')
    expect(router.currentRoute.value.query.seccion).toBeUndefined()
    expect(ids).toHaveBeenCalledWith('cuenta-direccion')
    ids.mockRestore()
  })

  it('a plan the platform cannot answer offers «Revisar estado» and help', async () => {
    state.read.mockRejectedValue(new Error('down'))
    await page('/cuenta', { cuenta: true, plan: null })
    expect(
      root.querySelector('[data-testid="cuenta-sin-conexion"]'),
    ).not.toBeNull()
    expect(button('Check status')).toBeDefined()
    expect(button('Ask support for help')).toBeDefined()
  })
})
