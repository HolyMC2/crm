// Mi cuenta › Tienda as the owner sees it: the plans with the current one
// marked and their price per cycle (IVA included, never «+ IVA»), a plan change
// that is a request Muelle confirms, and add-ons whose switch opens a confirm
// sheet naming the price, the cycle and when the charge starts; an add-on Boat
// cannot deliver keeps its switch off with Boat's reason beside it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  toast: vi.fn(),
  support: [],
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
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

import {
  addonConfirm,
  addonRows,
  keptUntil,
  planConfirm,
  planRows,
  price,
  requestedName,
} from '@/components/cuenta/tienda'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaTienda from '@/components/cuenta/CuentaTienda.vue'

const STORE = {
  current_plan: 'pro',
  requested_plan: null,
  topup_min: 50,
  topup_max: 10000,
  plans: [
    { name: 'basico', plan_name: 'Básico', monthly_price_mxn: 299 },
    { name: 'pro', plan_name: 'Pro', monthly_price_mxn: 499 },
    { name: 'premium', plan_name: 'Premium', monthly_price_mxn: 899 },
  ],
  addons: [
    {
      service_key: 'cfdi_timbres',
      service_name: 'Timbres CFDI',
      unit_price_mxn: 1.5,
      pricing_mode: 'per_unit',
      meter_unit: 'stamp',
      active: false,
      status: 'disponible',
      unavailable_reason: null,
      packages: [{ qty: 50, price: 99 }],
    },
    {
      service_key: 'webshop_storefront',
      service_name: 'Tienda en línea',
      unit_price_mxn: 199,
      pricing_mode: 'flat',
      meter_unit: 'month',
      active: false,
      status: 'disponible',
    },
    {
      service_key: 'whatsapp_waba',
      service_name: 'WhatsApp Business',
      unit_price_mxn: 0.5,
      pricing_mode: 'per_unit',
      meter_unit: 'message',
      active: false,
      status: 'no_disponible',
      unavailable_reason: 'WhatsApp todavía no se entrega en tu región.',
    },
    {
      service_key: 'extra_storage',
      service_name: 'Almacenamiento extra',
      unit_price_mxn: 49,
      pricing_mode: 'flat',
      meter_unit: 'month',
      active: true,
      status: 'disponible',
    },
  ],
}

describe('the plans in the owner’s words', () => {
  it('marks the current plan and prices each cycle IVA included', () => {
    const monthly = planRows(STORE)
    expect(
      monthly.map((p) => [p.display, p.price, p.current, p.popular]),
    ).toEqual([
      ['Básico', '$299', false, false],
      ['Pro', '$499', true, false],
      ['Premium', '$899', false, false],
    ])
    expect(monthly[0].per).toBe('a month, IVA included')
    expect(monthly[0].note).toBe('or $2,990 a year, 2 months free')
    // The current plan offers its yearly cycle once, beside the way to ask.
    expect([monthly[1].note, monthly[1].yearly]).toEqual([
      '',
      'Switch to the yearly cycle: {0} a year, 2 months free.'.replace(
        '{0}',
        '$4,990',
      ),
    ])
    expect(monthly[0].yearly).toBe('')
    expect(monthly[0].features[0]).toBe('1 register and 2 users')
    const yearly = planRows(STORE, { annual: true })
    expect([yearly[2].price, yearly[2].per, yearly[2].note]).toEqual([
      '$8,990',
      'a year, IVA included',
      'You pay 10 months and get 12.',
    ])
    expect(JSON.stringify([monthly, yearly])).not.toContain('+ IVA')
    expect(price(12.5)).toBe('$12.50')
  })

  it('a plan with its own yearly price shows it without promising free months', () => {
    const [row] = planRows({
      plans: [
        {
          name: 'x',
          plan_name: 'Plus',
          monthly_price_mxn: 100,
          yearly_price_mxn: 900,
        },
      ],
    })
    expect(row.note).toBe('or $900 a year')
  })

  it('a change is a request Muelle confirms, in the cycle the site pays', () => {
    const [basico] = planRows(STORE)
    const monthly = planConfirm(basico)
    expect([monthly.title, monthly.amount, monthly.per, monthly.verb]).toEqual([
      'Change to Básico',
      '$299',
      'a month, IVA included',
      'Request the change',
    ])
    expect(monthly.lines).toEqual([
      'Muelle confirms the change and lets you know; until then you keep your plan. Nothing is charged now.',
    ])
    const [yearlyBasico] = planRows(STORE, { annual: true })
    const yearly = planConfirm(yearlyBasico)
    expect([yearly.amount, yearly.per, yearly.lines.length]).toEqual([
      '$2,990',
      'a year, IVA included',
      1,
    ])
    expect(requestedName({ ...STORE, requested_plan: 'premium' })).toBe(
      'Premium',
    )
  })
})

describe('the add-ons in the owner’s words', () => {
  it('each with how it is charged and its price; what Boat cannot deliver says why', () => {
    const rows = addonRows(STORE)
    expect(rows.map((r) => [r.name, r.meter, r.price, r.available])).toEqual([
      ['Timbres CFDI', 'Measured per stamp', 'from $99 a month', true],
      // A monthly fee is its price; nothing more to say how it is charged.
      ['Tienda en línea', '', '$199 a month', true],
      // Not deliverable yet: the price still reads, the reason says when.
      [
        'WhatsApp Business',
        'Measured per message',
        'from $0.50 per message',
        false,
      ],
      ['Almacenamiento extra', '', 'Active', true],
    ])
    expect(rows[2].reason).toBe('WhatsApp todavía no se entrega en tu región.')
    expect(rows[3].switchLabel).toBe('Turn off Almacenamiento extra')
  })

  it('a paid activation names the price, the cycle and when the charge starts', () => {
    const flat = addonConfirm(STORE.addons[1])
    expect([flat.title, flat.amount, flat.per, flat.verb, flat.danger]).toEqual(
      [
        'Turn on Tienda en línea',
        '$199',
        'a month, IVA included',
        'Turn on',
        false,
      ],
    )
    expect(flat.lines).toEqual([
      'It is charged from the moment it is ready, prorated for the days left in the month.',
    ])
    const stamps = addonConfirm(STORE.addons[0])
    expect([stamps.amount, stamps.per]).toEqual([
      '$99',
      'a month, IVA included',
    ])
    expect(stamps.lines).toEqual([
      'Includes 50 stamps a month.',
      'What you use is charged from the moment it is ready.',
    ])
    expect(addonConfirm(STORE.addons[1], { isTrial: true }).lines).toEqual([
      'It is added to your plan when you activate it.',
    ])
    const off = addonConfirm(STORE.addons[3])
    expect([off.action, off.verb, off.danger]).toEqual([
      'cancel',
      'Turn off',
      true,
    ])
    expect(off.lines[0]).toMatch(/not refunded/)
    // A trial's turn-off ends that night where Boat keeps the paid month
    // («addon_keeps_cycle»); without it the sheet reads as before.
    expect(
      addonConfirm(STORE.addons[3], { isTrial: true, keepsCycle: true }).lines,
    ).toEqual(['It turns off today; nothing is charged during your trial.'])
    expect(addonConfirm(STORE.addons[3], { isTrial: true }).lines).toEqual(
      off.lines,
    )
    expect(addonConfirm(STORE.addons[3], { keepsCycle: true }).lines).toEqual(
      off.lines,
    )
  })
})

// CFDI turned off on the 16th: Boat keeps it through the month it paid.
const KEPT = {
  ...STORE,
  addons: STORE.addons.map((addon) =>
    addon.service_key === 'cfdi_timbres'
      ? {
          ...addon,
          active: false,
          service_until: '2026-11-30',
          can_resume: true,
          monthly_price_mxn: 149,
        }
      : addon,
  ),
}

describe('an add-on turned off that still runs (addon_keeps_cycle)', () => {
  it('says when it turns off and offers «Reanudar» instead of its switch', () => {
    const [cfdi, ...rest] = addonRows(KEPT, { resume: true })
    expect([cfdi.price, cfdi.endsOn, cfdi.resumeLabel, cfdi.reason]).toEqual([
      'Turns off on 30 nov',
      '30 nov',
      'Resume Timbres CFDI',
      '',
    ])
    expect(rest.map((row) => row.endsOn)).toEqual(['', '', ''])
    // Without the capability the row reads as it always did.
    expect(addonRows(KEPT)[0]).toMatchObject({
      price: 'from $99 a month',
      endsOn: '',
      resumeLabel: '',
    })
  })

  it('«Reanudar» reads back Boat’s monthly price and charges nothing now', () => {
    const resume = addonConfirm(KEPT.addons[0], { resume: true })
    expect([
      resume.action,
      resume.title,
      resume.amount,
      resume.per,
      resume.verb,
      resume.danger,
    ]).toEqual([
      'resume',
      'Resume Timbres CFDI',
      '$149',
      'a month, IVA included',
      'Resume',
      false,
    ])
    expect(resume.lines).toEqual([
      'It keeps working after 30 nov and your next invoice charges it as always. Nothing is charged now.',
    ])
    // Without the capability it is a new activation, as before.
    expect(addonConfirm(KEPT.addons[0]).action).toBe('activate')
  })

  it('reads the calendar day as sent, whatever the browser’s zone', () => {
    const kept = (day) => ({
      active: false,
      can_resume: true,
      service_until: day,
    })
    const zone = process.env.TZ
    try {
      // Node re-reads TZ on assignment: a zone behind UTC and one 14 h ahead.
      for (const tz of ['America/Mazatlan', 'Pacific/Kiritimati']) {
        process.env.TZ = tz
        expect(new Date(2026, 10, 30).getTimezoneOffset()).not.toBe(0)
        expect(keptUntil(kept('2026-11-30'))).toBe('30 nov')
        expect(keptUntil(kept('2026-12-01'))).toBe('1 dic')
      }
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
    expect(keptUntil(kept(''))).toBe('')
    expect(keptUntil(kept('30/11/2026'))).toBe('')
    expect(keptUntil({ ...kept('2026-11-30'), can_resume: false })).toBe('')
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
// The confirm sheet is an async chunk: its first import takes longer than a tick.
async function sheet() {
  for (let i = 0; i < 100; i++) {
    const found = document.querySelector('[data-testid="cuenta-confirmar"]')
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const button = (text) =>
  [...document.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.toast.mockReset()
  state.support.length = 0
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

function boot(store = STORE, overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    invoices: [],
    store,
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...overrides,
  }
}
function readyDoor(data = boot()) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: (text) => state.support.push(text) > 0,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mount(pagos) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(CuentaTienda, { door: pagos }) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}

describe('CuentaTienda', () => {
  it('the current plan is marked; «Cambiar» opens a confirm with price and cycle, then requests', async () => {
    state.mutate.mockResolvedValue({
      requested_plan: 'premium',
      note: 'Recibimos tu solicitud.',
    })
    state.read.mockResolvedValue(boot({ ...STORE, requested_plan: 'premium' }))
    mount(readyDoor())
    await flush()
    const plans = root.querySelector('[data-testid="cuenta-planes"]')
    const current = plans.querySelector('[data-current="true"]')
    expect(current.textContent).toContain('Pro')
    expect(current.textContent).toContain('Your plan')
    expect(current.querySelector('[data-testid="plan-cambiar"]')).toBeNull()
    const [, premium] = plans.querySelectorAll('[data-testid="plan-cambiar"]')
    premium.click()
    const confirm = await sheet()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Change to Premium',
    )
    expect(
      confirm
        .querySelector('[data-testid="confirmar-monto"]')
        .textContent.trim(),
    ).toBe('$899')
    expect(confirm.textContent).toContain('a month, IVA included')
    expect(confirm.textContent).toContain('Muelle confirms the change')
    expect(state.mutate).not.toHaveBeenCalled()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('request_plan', {
      target_plan: 'premium',
    })
    expect(state.toast).toHaveBeenCalledWith('Recibimos tu solicitud.')
    // The account is read again: the request shows and every change waits for it.
    expect(
      root.querySelector('[data-testid="plan-solicitado"]').textContent,
    ).toContain('You asked for Premium. It applies when Muelle confirms it.')
    expect(
      [...root.querySelectorAll('[data-testid="plan-cambiar"]')].every(
        (b) => b.disabled,
      ),
    ).toBe(true)
  })

  it('a monthly plan asks for the yearly cycle in one tap, through support', async () => {
    mount(readyDoor())
    await flush()
    // No cycle switch: a plan request cannot carry one.
    expect(button('Yearly')).toBeUndefined()
    const plans = root.querySelector('[data-testid="cuenta-planes"]')
    expect(plans.textContent).toContain('$899')
    expect(plans.textContent).toContain('or $8,990 a year, 2 months free')
    const current = plans.querySelector('[data-current="true"]')
    expect(current.textContent).toContain(
      'Switch to the yearly cycle: $4,990 a year, 2 months free.',
    )
    // Said once: the current plan has no second yearly note.
    expect(current.textContent).not.toContain('or $4,990 a year')
    const yearly = plans.querySelectorAll('[data-testid="plan-anual"]')
    expect(yearly).toHaveLength(1)
    expect(current.contains(yearly[0])).toBe(true)
    yearly[0].click()
    expect(state.support).toEqual([
      'I want to switch my plan Pro to the yearly cycle.',
    ])
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('a site on the yearly cycle reads every plan for the year and is not asked to switch', async () => {
    const data = boot()
    data.meters.billing = {
      is_trial: false,
      billing_cycle: 'Anual',
      monthly_price_mxn: 499,
      annual_price_mxn: 4990,
    }
    mount(readyDoor(data))
    await flush()
    const plans = root.querySelector('[data-testid="cuenta-planes"]')
    expect(plans.textContent).toContain('$8,990')
    expect(plans.textContent).toContain('a year, IVA included')
    expect(root.textContent).not.toContain('Switch to the yearly cycle')
    expect(root.querySelector('[data-testid="plan-anual"]')).toBeNull()
    const [, premium] = plans.querySelectorAll('[data-testid="plan-cambiar"]')
    premium.click()
    const confirm = await sheet()
    expect(confirm.textContent).toContain('$8,990')
    expect(confirm.textContent).toContain('a year, IVA included')
  })

  it('an add-on’s switch asks first, naming price and cycle, then toggles through the relay', async () => {
    state.mutate.mockResolvedValue({
      status: 'Active',
      note: 'Solicitado. Se cobrará cuando esté listo.',
    })
    state.read.mockResolvedValue(boot())
    mount(readyDoor())
    await flush()
    root.querySelector('[data-testid="complemento-webshop_storefront"]').click()
    const confirm = await sheet()
    expect(
      confirm
        .querySelector('[data-testid="confirmar-monto"]')
        .textContent.trim(),
    ).toBe('$199')
    expect(confirm.textContent).toContain('a month, IVA included')
    expect(confirm.textContent).toContain(
      'prorated for the days left in the month',
    )
    expect(state.mutate).not.toHaveBeenCalled()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('toggle_addon', {
      service_key: 'webshop_storefront',
      action: 'activate',
    })
    expect(state.toast).toHaveBeenCalledWith(
      'Solicitado. Se cobrará cuando esté listo.',
    )
  })

  it('an add-on Boat cannot deliver keeps its switch off with the reason beside it', async () => {
    mount(readyDoor())
    await flush()
    const off = root.querySelector('[data-testid="complemento-whatsapp_waba"]')
    expect(off.disabled).toBe(true)
    expect(off.getAttribute('aria-checked')).toBe('false')
    const reason = root.querySelector(
      `#${off.getAttribute('aria-describedby')}`,
    )
    expect(reason.textContent).toContain(
      'WhatsApp todavía no se entrega en tu región.',
    )
  })

  it('a refusal stays in the sheet in Boat’s words', async () => {
    state.mutate.mockRejectedValue(
      Object.assign(
        new Error('doco.docoutils.miplan.toggle_addon ValidationError'),
        {
          exc_type: 'ValidationError',
          messages: [
            'Este sitio no usa la tienda ni facturación de la plataforma.',
          ],
        },
      ),
    )
    mount(readyDoor())
    await flush()
    root.querySelector('[data-testid="complemento-extra_storage"]').click()
    await sheet()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Turn off Almacenamiento extra',
    )
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('toggle_addon', {
      service_key: 'extra_storage',
      action: 'cancel',
    })
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      'Este sitio no usa la tienda ni facturación de la plataforma.',
    )
    expect(state.toast).not.toHaveBeenCalled()
  })

  it('«Reanudar» asks first, then resumes through Boat’s seam and reads the account again', async () => {
    const { call } = await import('frappe-ui')
    call.mockReset()
    call.mockResolvedValue({
      ok: true,
      changed: true,
      message: 'Listo: Timbres CFDI sigue activo.',
    })
    state.read.mockResolvedValue(boot(STORE))
    mount(readyDoor(boot(KEPT, { capabilities: ['addon_keeps_cycle'] })))
    await flush()
    expect(
      root
        .querySelector('[data-testid="complemento-se-apaga-cfdi_timbres"]')
        .textContent.trim(),
    ).toBe('Turns off on 30 nov')
    expect(
      root.querySelector('[data-testid="complemento-cfdi_timbres"]'),
    ).toBeNull()
    root
      .querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]')
      .click()
    const confirm = await sheet()
    expect(
      confirm
        .querySelector('[data-testid="confirmar-monto"]')
        .textContent.trim(),
    ).toBe('$149')
    expect(call).not.toHaveBeenCalled()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(call).toHaveBeenCalledWith('doco.docoutils.miplan.call', {
      method: 'resume_addon',
      payload: { service_key: 'cfdi_timbres' },
    })
    expect(state.mutate).not.toHaveBeenCalled()
    expect(state.read).toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith(
      'Listo: Timbres CFDI sigue activo.',
    )
  })

  it('a refused «Reanudar» stays in the sheet in Boat’s words', async () => {
    const { call } = await import('frappe-ui')
    call.mockReset()
    call.mockResolvedValue({
      ok: false,
      reason: 'ended',
      message: 'Este complemento ya se apagó. Actívalo de nuevo en Tienda.',
    })
    mount(readyDoor(boot(KEPT, { capabilities: ['addon_keeps_cycle'] })))
    await flush()
    root
      .querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]')
      .click()
    await sheet()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      'Este complemento ya se apagó.',
    )
    expect(state.toast).not.toHaveBeenCalled()
  })

  it('a refused «Reanudar» reads the account again: one that ended gets its switch back', async () => {
    const { call } = await import('frappe-ui')
    call.mockReset()
    call.mockResolvedValue({
      ok: false,
      reason: 'ended',
      message: 'Este complemento ya se apagó. Actívalo de nuevo en Tienda.',
    })
    // Boat no longer reports it as kept.
    state.read.mockResolvedValue(
      boot(STORE, { capabilities: ['addon_keeps_cycle'] }),
    )
    mount(readyDoor(boot(KEPT, { capabilities: ['addon_keeps_cycle'] })))
    await flush()
    root
      .querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]')
      .click()
    await sheet()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      'Este complemento ya se apagó.',
    )
    expect(
      root.querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]'),
    ).toBeNull()
    expect(
      root.querySelector('[data-testid="complemento-cfdi_timbres"]'),
    ).not.toBeNull()
    // The sheet no longer offers a «Reanudar» that can only fail again: it is
    // the add-on's «Activar», its price read back, under Boat's words.
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Turn on Timbres CFDI',
    )
    expect(
      document
        .querySelector('[data-testid="confirmar-monto"]')
        .textContent.trim(),
    ).toBe('$99')
    expect(
      document.querySelector('[data-testid="confirmar-hacer"]').textContent,
    ).toContain('Turn on')
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      'Actívalo de nuevo en Tienda.',
    )
    expect(call).toHaveBeenCalledTimes(1)
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('a «Reanudar» refused while it still runs keeps the sheet to try again', async () => {
    const { call } = await import('frappe-ui')
    call.mockReset()
    call.mockResolvedValue({
      ok: false,
      reason: 'invoice_run',
      message:
        'Estamos generando las facturas del mes. Intenta de nuevo en un rato.',
    })
    state.read.mockResolvedValue(
      boot(KEPT, { capabilities: ['addon_keeps_cycle'] }),
    )
    mount(readyDoor(boot(KEPT, { capabilities: ['addon_keeps_cycle'] })))
    await flush()
    root
      .querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]')
      .click()
    await sheet()
    document.querySelector('[data-testid="confirmar-hacer"]').click()
    await flush()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Resume Timbres CFDI',
    )
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      'Estamos generando las facturas del mes.',
    )
  })

  it('without the capability a kept add-on keeps its switch', async () => {
    mount(readyDoor(boot(KEPT)))
    await flush()
    expect(
      root.querySelector('[data-testid="complemento-reanudar-cfdi_timbres"]'),
    ).toBeNull()
    expect(
      root.querySelector('[data-testid="complemento-cfdi_timbres"]'),
    ).not.toBeNull()
  })

  it('without a store the page says so and offers «Revisar estado»', async () => {
    mount(readyDoor(boot(null)))
    await flush()
    expect(root.textContent).toContain('The store is not available right now.')
    expect(button('Check status')).toBeDefined()
  })
})
