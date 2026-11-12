// Mi cuenta › Resumen's «Salud de tu sistema» (capability «health», Boat
// site_health through miplan.call): the status line, the 30-day availability
// («still measuring» with too few days), the speed range 95 of 100 pages open
// in, one bar per day, the failures in the site's clock with how long each
// lasted, storage, the next planned maintenance and the owner's findings, each
// with the button that opens its screen. Without the capability, or with Boat
// answering «disabled», nothing shows; a failed read is one quiet line with
// «Volver a intentar», never a toast. Nothing Boat may add reaches the screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  seam: vi.fn(),
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: state.toast,
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled || props.loading,
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
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                h('p', { 'data-testid': 'sheet-subtitle' }, props.subtitle),
                slots.default?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  read: (...args) => state.read(...args),
  seam: (...args) => state.seam(...args),
  exportStatus: async () => ({ export: null, can_request: true }),
}))

import {
  availabilityView,
  dayRows,
  daysSummary,
  durationWords,
  failureRows,
  findingRows,
  healthView,
  maintenanceText,
  percentText,
  quietFailuresText,
  shortDay,
  speedView,
  statusView,
  storageView,
  whenText,
} from '@/components/cuenta/salud'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'

// 2026-11-12 10:00 in a site at -05:00.
const NOW = new Date('2026-11-12T15:00:00Z')
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 14 + i))
  return d.toISOString().slice(0, 10)
})
function answer(over = {}) {
  return {
    ok: true,
    window_days: 30,
    status: { state: 'ok', title: null, since: null },
    availability: { pct: 99.8, sampled_days: 30, measuring: false },
    speed: { under_ms: 1000, over_ms: null, samples: 6000, measuring: false },
    days: DAYS.map((day) => ({
      day,
      state:
        day === '2026-11-09' ? 'down' : day === '2026-11-03' ? 'slow' : 'ok',
    })),
    incidents: {
      tracked: true,
      items: [
        {
          id: 'f00d',
          kind: 'outage',
          title: 'Tu sistema no abre',
          status: 'resolved',
          started_at: '2026-11-09T10:00:00-05:00',
          resolved_at: '2026-11-09T10:45:00-05:00',
          minutes: 45,
          cell: 'cell-9',
          alertname: 'TenantSiteDown',
        },
      ],
    },
    storage: { used_gb: 5, allowance_gb: 6, pct: 83 },
    maintenance: null,
    findings: [
      { kind: 'storage_high', act: 'plans', pct: 83 },
      { kind: 'overdue_invoice', act: 'pay', count: 1, amount_mxn: 499 },
      { kind: 'card_expiring', act: 'card', when: 'next_month', last4: '4242' },
    ],
    host: 'cell-9.internal',
    ...over,
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 400; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )

let app, root
beforeEach(() => {
  state.read.mockReset()
  state.seam.mockReset()
  state.call.mockReset()
  for (const fn of Object.values(state.toast)) fn.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.read.mockImplementation(async (fn) =>
    fn === 'payment_methods' ? { ok: true, cards: [] } : [],
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  shellBoot.value = null
})

describe('the words', () => {
  it('availability: Boat’s floored figure, or still measuring', () => {
    expect(percentText(99.9)).toBe('99.9\u00a0%')
    expect(percentText(100)).toBe('100\u00a0%')
    expect(
      availabilityView({ pct: 99.9, sampled_days: 30, measuring: false }),
    ).toEqual({
      measuring: false,
      text: 'Available 99.9\u00a0% in the last 30 days',
      sub: '',
    })
    expect(
      availabilityView({ pct: 97.5, sampled_days: 12, measuring: false }).sub,
    ).toBe('Counted on the 12 days we checked.')
    for (const a of [
      { pct: null, sampled_days: 2, measuring: true },
      { pct: 100, sampled_days: 2, measuring: true },
      null,
    ])
      expect(availabilityView(a).text).toBe(
        'We are still measuring your system',
      )
  })

  it('speed: the range bound in the owner’s words, never milliseconds', () => {
    expect(durationWords(50)).toBe('a tenth of a second')
    expect(durationWords(100)).toBe('a tenth of a second')
    expect(durationWords(250)).toBe('a quarter of a second')
    expect(durationWords(500)).toBe('half a second')
    expect(durationWords(1000)).toBe('1 second')
    expect(durationWords(2500)).toBe('2.5 seconds')
    expect(durationWords(5000)).toBe('5 seconds')
    expect(durationWords(null)).toBe('')
    const under = speedView({ under_ms: 1000, measuring: false })
    expect(under.text).toBe('Most pages open in under 1 second')
    expect(under.sub).toContain('95 of every 100 pages')
    expect(under.sub).toContain('measured in ranges')
    expect(speedView({ over_ms: 5000, measuring: false }).text).toBe(
      'Many pages take more than 5 seconds to open',
    )
    expect(speedView({ measuring: true, samples: 3 }).text).toBe(
      'Not enough visits yet to measure the speed',
    )
    expect(
      JSON.stringify(speedView({ under_ms: 250, measuring: false })),
    ).not.toMatch(/\bms\b|250/)
  })

  it('the strip: a bar per day, unknown states as no data, and its words', () => {
    const rows = dayRows([
      { day: '2026-11-09', state: 'down' },
      { day: '2026-11-10', state: 'weird' },
      { day: 'nope', state: 'ok' },
      { day: '2026-11-11', state: 'slow' },
      { day: '2026-11-12', state: 'ok' },
    ])
    expect(rows.map((r) => r.state)).toEqual(['down', 'none', 'slow', 'ok'])
    expect(rows[0].label).toBe('9 de noviembre: With a failure')
    expect(daysSummary(rows)).toBe(
      'Last 4 days: 1 day fine, 1 slow, 1 with a failure, 1 without data',
    )
    expect(shortDay('2026-10-14')).toMatch(/^14 oct/)
    expect(daysSummary([])).toBe('')
  })

  it('times in the site’s clock, whatever the browser’s', () => {
    expect(whenText('2026-11-09T10:00:00-05:00', NOW)).toBe(
      '9 de noviembre at 10:00',
    )
    expect(whenText('2026-11-12T09:20:00-05:00', NOW)).toBe('Today at 9:20')
    expect(whenText('2026-11-12T01:05:00-05:00', NOW)).toBe('Today at 1:05')
    // 03:00 UTC on the 12th is still the 11th at the site.
    const late = new Date('2026-11-12T03:00:00Z')
    expect(whenText('2026-11-11T21:00:00-05:00', late)).toBe('Today at 21:00')
    expect(whenText('', NOW)).toBe('')
  })

  it('the status line', () => {
    expect(statusView({ state: 'ok' }, NOW)).toEqual({
      state: 'ok',
      tone: 'ok',
      text: 'Working well',
      sub: '',
    })
    const down = statusView(
      {
        state: 'down',
        title: 'Tu sistema no abre',
        since: '2026-11-12T09:20:00-05:00',
      },
      NOW,
    )
    expect(down.text).toBe('Failing now')
    expect(down.sub).toBe('Tu sistema no abre. Since 9:20')
    expect(statusView({ state: 'down' }, NOW).sub).toBe(
      'Your system is not answering right now.',
    )
    expect(statusView({ state: 'slow' }, NOW)).toMatchObject({
      text: 'Slow today',
      tone: 'warn',
      sub: 'Some pages take longer than usual today.',
    })
    expect(statusView({ state: 'off' }, NOW)).toBeNull()
    expect(statusView(null, NOW)).toBeNull()
  })

  it('storage and the planned maintenance', () => {
    expect(storageView({ used_gb: 5, allowance_gb: 6, pct: 83 })).toEqual({
      text: '5 of 6 GB',
      pct: 83,
      warn: true,
    })
    expect(
      storageView({ used_gb: 12.4, allowance_gb: null, pct: null }),
    ).toEqual({ text: '12.4 GB, no limit', pct: null, warn: false })
    expect(storageView({ used_gb: 13.8, allowance_gb: 15, pct: 92 }).text).toBe(
      '13.8 of 15 GB',
    )
    expect(storageView(null)).toBeNull()
    expect(maintenanceText({ at: '2026-11-14T04:00:00-05:00' }, NOW)).toMatch(
      /^Scheduled maintenance: 14 de noviembre at 4:00\. /,
    )
    expect(maintenanceText(null, NOW)).toBe('')
  })

  it('findings: each with its sentence and step, the serious ones first', () => {
    const rows = findingRows(
      [
        { kind: 'storage_high', act: 'plans', pct: 83 },
        { kind: 'stamps_high', act: 'addons', used: 85, included: 100 },
        { kind: 'seats_full', act: 'seats', which: 'users', used: 3, cap: 3 },
        {
          kind: 'seats_full',
          act: 'seats',
          which: 'sucursales',
          used: 1,
          cap: 1,
        },
        {
          kind: 'card_expiring',
          act: 'card',
          when: 'this_month',
          last4: '004242',
        },
        {
          kind: 'wallet_short',
          act: 'topup',
          reason: 'stamps',
          balance_mxn: 2.5,
          need_mxn: 3.5,
        },
        {
          kind: 'wallet_short',
          act: 'topup',
          reason: 'airtime',
          balance_mxn: 80,
          days_left: 2,
        },
        { kind: 'overdue_invoice', act: 'pay', count: 2, amount_mxn: 998 },
        { kind: 'something_new', act: 'pay' },
      ],
      { capabilities: [] },
    )
    expect(rows.map((r) => [r.level, r.act, r.text])).toEqual([
      [
        'bad',
        'topup',
        'Your balance ($2.50) does not cover the next stamp beyond your package ($3.50).',
      ],
      [
        'bad',
        'topup',
        'At this pace your balance covers 2 more days of airtime.',
      ],
      ['bad', 'pay', '2 invoices are overdue, $998.00 in total.'],
      [
        'warn',
        'plans',
        'Your storage is at 83\u00a0% of what your plan includes.',
      ],
      [
        'warn',
        'addons',
        'You have used 85 of the 100 stamps in your package this month.',
      ],
      ['warn', 'plans', 'You use all 3 users of your plan.'],
      ['warn', 'plans', 'You use the one register of your plan.'],
      ['warn', 'card', 'Your card ending in 4242 expires this month.'],
    ])
    // With Boat's users and cajas on, the step lands on them.
    const seats = findingRows(
      [{ kind: 'seats_full', which: 'users', cap: 3 }],
      { capabilities: ['seats'] },
    )
    expect(seats[0]).toMatchObject({
      act: 'seats',
      cta: 'See users and registers',
    })
    expect(
      findingRows(
        [{ kind: 'card_expiring', when: 'expired', last4: '4242' }],
        {},
      )[0],
    ).toMatchObject({
      level: 'bad',
      text: 'Your card ending in 4242 has expired.',
    })
    expect(findingRows(null, {})).toEqual([])
  })

  it('the whole view reads nothing Boat may add', () => {
    const view = healthView(answer(), {}, NOW)
    expect(view.failures).toEqual([
      {
        id: 'f00d',
        open: false,
        tone: 'ok',
        title: 'Tu sistema no abre',
        when: '9 de noviembre at 10:00',
        lasted: 'It lasted about 45 minutes.',
      },
    ])
    expect(view.review).toBe('You have 3 things to review')
    expect(JSON.stringify(view)).not.toMatch(/cell-9|TenantSiteDown|internal/)
    expect(healthView({ ok: false, reason: 'disabled' }, {}, NOW)).toBeNull()
    expect(healthView(null, {}, NOW)).toBeNull()
  })

  it('an open failure reads like the status line: red failing, amber slow', () => {
    const open = (kind) => ({
      id: kind,
      kind,
      title: 'Aviso',
      status: 'open',
      started_at: '2026-11-12T09:05:00-05:00',
      resolved_at: null,
    })
    const rows = failureRows(
      { items: [open('outage'), open('degraded'), open('something_new')] },
      NOW,
    )
    expect(rows.map((r) => [r.open, r.tone, r.when, r.lasted])).toEqual([
      [true, 'bad', 'Today at 9:05', 'We are working on it.'],
      [true, 'warn', 'Today at 9:05', 'We are working on it.'],
      [true, 'bad', 'Today at 9:05', 'We are working on it.'],
    ])
  })

  it('red days no notice covered are said beside the failures', () => {
    expect(quietFailuresText(1)).toBe('Our checks found failures on 1 day.')
    expect(quietFailuresText(2)).toBe('Our checks found failures on 2 days.')
    expect(quietFailuresText(1, true)).toBe(
      'Our checks also found failures on 1 more day.',
    )
    expect(quietFailuresText(3, true)).toBe(
      'Our checks also found failures on 3 more days.',
    )
    for (const n of [0, -1, null, undefined, 'x', NaN])
      expect(quietFailuresText(n)).toBe('')
    const quiet = healthView(
      answer({
        incidents: { tracked: true, items: [], unannounced_down_days: 1 },
      }),
      {},
      NOW,
    )
    expect(quiet.failures).toEqual([])
    expect(quiet.quietFailures).toBe('Our checks found failures on 1 day.')
    expect(
      healthView(
        answer({
          incidents: { ...answer().incidents, unannounced_down_days: 2 },
        }),
        {},
        NOW,
      ).quietFailures,
    ).toBe('Our checks also found failures on 2 more days.')
    expect(healthView(answer(), {}, NOW).quietFailures).toBe('')
  })
})

function door(capabilities) {
  const pagos = createPagos({
    read: vi.fn(),
    mutate: vi.fn(),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    invoices: [],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
  }
  pagos.loading.value = false
  pagos.resolvePaymentState(pagos.boot.value.payment_state)
  return pagos
}
function mount(props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () =>
      h(CuentaResumen, {
        actions: [
          'activate',
          'pay',
          'topup',
          'support',
          'plans',
          'seats',
          'addons',
          'card',
        ],
        ...props,
        onAct: (key) => events.push(key),
      }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}
const block = () => root.querySelector('[data-testid="cuenta-salud"]')
const healthCalls = () =>
  state.seam.mock.calls.filter(([method]) => method === 'site_health').length

describe('Resumen’s «Salud de tu sistema»', () => {
  it('hides without the capability and asks Boat nothing', async () => {
    state.seam.mockResolvedValue(answer())
    mount({ door: door() })
    await flush()
    expect(healthCalls()).toBe(0)
    expect(block()).toBeNull()
  })

  it('hides when Boat has it off', async () => {
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'disabled',
      message: 'x',
    })
    mount({ door: door(['health']) })
    await flush()
    expect(healthCalls()).toBe(1)
    expect(block()).toBeNull()
  })

  it('shows the block and one tap opens the detail; a finding’s button opens its screen', async () => {
    state.seam.mockResolvedValue(answer())
    const events = mount({ door: door(['health']) })
    await flush()
    const section = block()
    expect(section.textContent).toContain('Your system’s health')
    expect(
      section.querySelector('[data-testid="salud-estado"]').textContent.trim(),
    ).toBe('Working well')
    expect(section.textContent).toContain(
      'Available 99.8\u00a0% in the last 30 days',
    )
    expect(section.textContent).toContain('Most pages open in under 1 second')
    const bars = section.querySelectorAll(
      '[data-testid="salud-dias"] [data-state]',
    )
    expect(bars.length).toBe(30)
    expect([...bars].filter((b) => b.dataset.state === 'down').length).toBe(1)
    expect(
      section
        .querySelector('[data-testid="salud-dias"]')
        .getAttribute('aria-label'),
    ).toBe('Last 30 days: 28 days fine, 1 slow, 1 with a failure')
    expect(section.textContent).toContain('You have 3 things to review')
    expect(section.textContent).not.toMatch(/cell-9|TenantSiteDown|internal/)

    section.querySelector('[data-testid="salud-abrir"]').click()
    const sheet = await find('[data-testid="salud-detalle"]')
    expect(sheet.textContent).toContain('9 de noviembre at 10:00')
    expect(sheet.textContent).toContain('It lasted about 45 minutes.')
    expect(sheet.textContent).toContain('5 of 6 GB')
    const findings = [
      ...sheet.querySelectorAll('[data-testid="salud-hallazgos"] li'),
    ].map((li) => li.dataset.act)
    expect(findings).toEqual(['pay', 'plans', 'card'])
    button('See cards', sheet).click()
    await flush()
    expect(events).toEqual(['card'])
    // The sheet closes for the screen it opened.
    expect(document.querySelector('[data-testid="salud-detalle"]')).toBeNull()
    expect(state.toast.error).not.toHaveBeenCalled()
  })

  it('the detail never says «no failures» under a red bar', async () => {
    // 11-09 is red in the strip; no notice was sent for it.
    state.seam.mockResolvedValue(
      answer({
        incidents: { tracked: true, items: [], unannounced_down_days: 1 },
      }),
    )
    mount({ door: door(['health']) })
    await flush()
    block().querySelector('[data-testid="salud-abrir"]').click()
    const sheet = await find('[data-testid="salud-detalle"]')
    expect(
      sheet.querySelector('[data-testid="salud-leyenda"]').textContent,
    ).toContain('With a failure')
    expect(
      sheet
        .querySelector('[data-testid="salud-fallas-sin-aviso"]')
        .textContent.trim(),
    ).toBe('Our checks found failures on 1 day.')
    expect(sheet.textContent).not.toContain('There were no failures.')
    expect(sheet.querySelector('[data-testid="salud-fallas"]')).toBeNull()
  })

  it('a month with no red bar and no notice says so', async () => {
    state.seam.mockResolvedValue(
      answer({
        days: DAYS.map((day) => ({ day, state: 'ok' })),
        incidents: { tracked: true, items: [], unannounced_down_days: 0 },
      }),
    )
    mount({ door: door(['health']) })
    await flush()
    block().querySelector('[data-testid="salud-abrir"]').click()
    const sheet = await find('[data-testid="salud-detalle"]')
    expect(sheet.textContent).toContain('There were no failures.')
    expect(
      sheet.querySelector('[data-testid="salud-fallas-sin-aviso"]'),
    ).toBeNull()
  })

  it('a new site reads «still measuring»; a site not in service has no status line', async () => {
    state.seam.mockResolvedValue(
      answer({
        status: { state: 'off' },
        availability: { pct: null, sampled_days: 1, measuring: true },
        speed: { measuring: true, samples: 4 },
        findings: [],
      }),
    )
    mount({ door: door(['health']) })
    await flush()
    const section = block()
    expect(
      section.querySelector('[data-testid="salud-estado"]').textContent.trim(),
    ).toBe('We are still measuring your system')
    expect(section.textContent).not.toContain('Working well')
    expect(section.textContent).toContain(
      'Not enough visits yet to measure the speed',
    )
    expect(section.querySelector('[data-testid="salud-revisar"]')).toBeNull()
  })

  it('a failed read is one quiet line with «Volver a intentar», never a toast', async () => {
    state.seam.mockRejectedValueOnce(new Error('platform down'))
    mount({ door: door(['health']) })
    await flush()
    const line = root.querySelector('[data-testid="salud-sin-lectura"]')
    expect(line.textContent).toContain(
      'We could not read your system’s health.',
    )
    expect(root.querySelector('[data-testid="salud-abrir"]')).toBeNull()
    expect(state.toast.error).not.toHaveBeenCalled()

    state.seam.mockResolvedValueOnce({ ok: false, reason: 'not_ready' })
    button('Try once more', line).click()
    await flush()
    expect(healthCalls()).toBe(2)
    expect(
      root.querySelector('[data-testid="salud-sin-lectura"]'),
    ).not.toBeNull()

    state.seam.mockResolvedValueOnce(answer())
    button('Try once more', root).click()
    await flush()
    expect(healthCalls()).toBe(3)
    expect(root.querySelector('[data-testid="salud-sin-lectura"]')).toBeNull()
    expect(root.querySelector('[data-testid="salud-abrir"]')).not.toBeNull()
    expect(state.toast.error).not.toHaveBeenCalled()
  })
})

describe('Mi cuenta opens a finding’s screen', () => {
  async function page(capabilities) {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    }
    state.call.mockResolvedValue(shellBoot.value)
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap'
        ? door(capabilities).boot.value
        : fn === 'payment_methods'
          ? { ok: true, cards: [] }
          : [],
    )
    state.seam.mockImplementation(async (method) =>
      method === 'site_health' ? answer() : { ok: false, reason: 'disabled' },
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cuenta', component: Cuenta }],
    })
    router.push('/cuenta')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cuenta) })
    app.use(router)
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    await flush()
    return router
  }

  for (const [cta, tab] of [
    ['See cards', 'facturacion'],
    ['See invoices', 'facturacion'],
    ['See plans', 'tienda'],
  ])
    it(`«${cta}» opens ${tab}`, async () => {
      const router = await page(['health'])
      ;(await find('[data-testid="salud-abrir"]')).click()
      const sheet = await find('[data-testid="salud-detalle"]')
      button(cta, sheet).click()
      await flush()
      expect(router.currentRoute.value.query.tab).toBe(tab)
    })
})
