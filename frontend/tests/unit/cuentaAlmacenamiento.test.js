// Mi cuenta › Tienda › Almacenamiento (Boat capability «storage_blocks»): the
// card reads Boat's space, its block and price; «Agregar 10 GB» is two taps
// (the button, then «Confirmar» over Boat's quote for the count on screen);
// «Comprar más espacio» under Resumen's meter (or in «Salud de tu sistema»)
// opens that same sheet on one more block, so buying is that tap and
// «Confirmar», once (a later visit to Tienda opens nothing), and only where
// Boat can sell a block (else «Ver planes»); a price Boat does not sell says so
// and offers nothing more, while space already bought can still be lowered; a
// reduction says the day it lands and costs nothing today. Without the
// capability Tienda shows no storage block and asks Boat nothing new.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(async () => ({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })),
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
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
}))

import { createMemoryHistory, createRouter } from 'vue-router'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaTienda from '@/components/cuenta/CuentaTienda.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'
import {
  storageAction,
  storageCard,
  storageQuoteView,
  storageTitle,
} from '@/components/cuenta/almacenamiento'
import { findingRows } from '@/components/cuenta/salud'

const NOW = new Date(2026, 10, 16, 10, 0)
// Boat's answer: its catalog's block and price, never figures of ours.
const SPACE = {
  ok: true,
  changed: false,
  used_gb: 4.6,
  allowance_gb: 5,
  included_gb: 5,
  extra_gb: 0,
  blocks: 0,
  monthly_mxn: 0,
  offer: { available: true, block_gb: 10, block_price_mxn: 49, max_blocks: 10 },
  scheduled: null,
  message: 'Tienes 4.6 de 5 GB.',
}
const QUOTE = {
  ...SPACE,
  changed: true,
  direction: 'increase',
  blocks_target: 1,
  extra_target_gb: 10,
  allowance_target_gb: 15,
  monthly_target_mxn: 49,
  monthly_delta_mxn: 49,
  charge_now_mxn: 24.5,
  charge_on: 'next_invoice',
  effective_date: '2026-11-16',
  decrease_effective_date: null,
  keeps_until: null,
}
// 20 GB extra, a reduction to 10 GB extra on 1 December.
const LATER = {
  ...SPACE,
  allowance_gb: 25,
  extra_gb: 20,
  blocks: 2,
  scheduled: {
    extra_gb: 10,
    effective_date: '2026-12-01',
    keeps_until: '2026-11-30',
    lands_now: false,
    waits: null,
  },
}
const STORE = {
  current_plan: 'pro',
  requested_plan: null,
  plans: [{ name: 'pro', plan_name: 'Pro', monthly_price_mxn: 499 }],
  addons: [],
}

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 600; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}

beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.toast.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

// Boat's bootstrap: with «storage_blocks» it says whether a block can be bought.
function boot(capabilities, overrides = {}) {
  return {
    ...(capabilities?.includes('storage_blocks')
      ? { storage_blocks: { can_add: true } }
      : {}),
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      storage: { used: 4.6, allowance: 5, unit: 'GB', db_gb: 1, disk_gb: 3.6 },
    },
    invoices: [],
    store: STORE,
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
    ...overrides,
  }
}
function readyDoor(data) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mountTienda(pagos, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(CuentaTienda, { door: pagos, debounceMs: 0, ...props }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}
function seams({ space = SPACE, quote = QUOTE, done = null } = {}) {
  state.seam.mockImplementation(async (method, payload) => {
    if (method === 'storage_quote' && payload.blocks === undefined) return space
    if (method === 'storage_quote')
      return typeof quote === 'function' ? quote(payload) : quote
    if (method === 'set_storage')
      return done || { ...quote, ok: true, consent: 'PC-1', applied: true }
    return null
  })
}

describe('the card and the sheet in the owner’s words', () => {
  it('«Tienes 4.6 de 5 GB» and Boat’s block and price, IVA included', () => {
    const card = storageCard(SPACE, NOW)
    expect(card.text).toBe('You have 4.6 of 5 GB')
    expect(card.detail).toBe('Your plan includes 5 GB')
    expect(card.offer).toBe('+10 GB for $49.00 a month, IVA included')
    expect(card.warn).toBe(true)
    expect([card.canAdd, card.canRemove, card.canUndo]).toEqual([
      true,
      false,
      false,
    ])
    const later = storageCard(LATER, NOW)
    expect(later.detail).toBe('Your plan includes 5 GB, plus 20 GB extra')
    // The day it lands, as the sheet and Historial say it («desde el 1 de diciembre»).
    expect(later.scheduled).toBe('Goes down to 15 GB on 1 de diciembre')
    expect([later.planned, later.canUndo]).toEqual([1, true])
  })

  it('the card reads the date against the clock it is given', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2027, 0, 5, 10, 0))
      expect(storageCard(LATER, NOW).scheduled).toBe(
        'Goes down to 15 GB on 1 de diciembre',
      )
      expect(storageCard(LATER).scheduled).toBe(
        'Goes down to 15 GB on 1 de diciembre de 2026',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('a price Boat does not sell offers nothing and says so', () => {
    const card = storageCard({
      ...SPACE,
      blocks: undefined,
      offer: {
        available: false,
        message: 'Más espacio aún no está disponible.',
      },
    })
    expect(card.offer).toBe('')
    expect(card.unavailable).toContain('aún no está disponible')
    expect([card.canAdd, card.canRemove]).toEqual([false, false])
    // A bigger plan is the way to more space meanwhile.
    expect(card.seePlans).toBe(true)
    expect(storageCard(SPACE).seePlans).toBe(false)
    // Without Boat's sentence the card says it in its own words, no promise.
    expect(
      storageCard({ ...SPACE, offer: { available: false } }).unavailable,
    ).toBe('More space is not available yet.')
    // Space already bought can still be lowered or kept while nothing is sold.
    const held = storageCard(
      {
        ...SPACE,
        allowance_gb: 25,
        extra_gb: 20,
        blocks: 2,
        block_gb: 10,
        offer: { available: false, message: 'x' },
        scheduled: LATER.scheduled,
      },
      NOW,
    )
    expect([held.canAdd, held.canRemove, held.canUndo]).toEqual([
      false,
      true,
      true,
    ])
    expect([held.blockGb, held.maxBlocks, held.planned]).toEqual([10, 2, 1])
    // A zero price is not an offer either.
    expect(
      storageCard({ ...SPACE, offer: { ...SPACE.offer, block_price_mxn: 0 } })
        .canAdd,
    ).toBe(false)
  })

  it('titles, verbs and the quote: today’s charge, from then, the consent', () => {
    expect(storageTitle(10, 0, 2)).toBe('Add 20 GB')
    expect(storageTitle(10, 2, 1)).toBe('Remove 10 GB')
    expect(storageTitle(10, 2, 0, 1)).toBe('Go down to 0 GB extra')
    expect(storageTitle(10, 2, 2, 1)).toBe('Cancel the scheduled reduction')
    expect(storageAction(QUOTE, NOW)).toEqual({
      label: 'Add 10 GB',
      done: 'You added 10 GB',
    })
    const view = storageQuoteView(QUOTE, NOW)
    expect([view.amount, view.per]).toEqual([
      '$24.50',
      'Added to your next invoice for the rest of this month, IVA included',
    ])
    expect(view.lines).toEqual([
      'More space applies today: 15 GB in total.',
      'Your extra space: $49.00 a month, IVA included',
    ])
    expect(view.consent).toContain('you agree to pay $49.00 a month')
    const down = {
      ...QUOTE,
      allowance_gb: 25,
      extra_gb: 20,
      direction: 'decrease',
      blocks_target: 1,
      extra_target_gb: 10,
      allowance_target_gb: 15,
      monthly_target_mxn: 49,
      monthly_delta_mxn: -49,
      charge_now_mxn: 0,
      charge_on: null,
      decrease_effective_date: '2026-12-01',
      keeps_until: '2026-11-30',
    }
    expect(storageAction(down, NOW)).toEqual({
      label: 'Schedule the reduction',
      done: 'Reduction scheduled',
    })
    const downView = storageQuoteView(down, NOW)
    expect(downView.nothingToday).toBe(true)
    expect(downView.lines).toEqual([
      'You keep 25 GB until 30 de noviembre; from 1 de diciembre you have 15 GB.',
      'You save $49.00 a month, IVA included',
    ])
    expect(downView.consent).toBe('')
  })

  it('«Salud de tu sistema» at 80 % buys space where Boat sells a block', () => {
    const finding = [{ kind: 'storage_high', act: 'plans', pct: 83 }]
    const rows = (data) => findingRows(finding, data).map((r) => [r.act, r.cta])
    expect(rows({ capabilities: [] })).toEqual([['plans', 'See plans']])
    // Nothing on sale (an unpriced ladder) or already the most blocks: plans.
    expect(
      rows({
        capabilities: ['storage_blocks'],
        storage_blocks: { can_add: false },
      }),
    ).toEqual([['plans', 'See plans']])
    expect(rows({ capabilities: ['storage_blocks'] })).toEqual([
      ['plans', 'See plans'],
    ])
    expect(
      rows({
        capabilities: ['storage_blocks'],
        storage_blocks: { can_add: true },
      }),
    ).toEqual([['storage', 'Get more space']])
  })
})

describe('Tienda › Almacenamiento', () => {
  it('is not there without the capability, and Boat is not asked', async () => {
    // The block is an async chunk: load it first, so its absence is the gate's
    // doing and not a chunk still on its way (the same wait shows it with the
    // capability).
    await import('@/components/cuenta/Almacenamiento.vue')
    seams()
    state.read.mockResolvedValue(boot(['storage_blocks']))
    mountTienda(readyDoor(boot(['storage_blocks'])))
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-almacenamiento"]'),
    ).not.toBeNull()
    expect(state.seam).toHaveBeenCalledWith('storage_quote', {})
    app.unmount()
    root.remove()
    state.seam.mockClear()
    mountTienda(readyDoor(boot([])))
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-almacenamiento"]'),
    ).toBeNull()
    expect(state.seam).not.toHaveBeenCalled()
  })

  it('a request where no block can be bought shows the plans instead', async () => {
    seams({ space: { ...SPACE, extra_gb: 100, blocks: 10, allowance_gb: 105 } })
    state.read.mockResolvedValue(boot(['storage_blocks']))
    const acts = []
    const handled = vi.fn()
    mountTienda(readyDoor(boot(['storage_blocks'])), {
      openStorage: 1,
      onAct: (key) => acts.push(key),
      onStorageHandled: handled,
    })
    await find('[data-testid="almacenamiento-uso"]')
    await flush()
    expect(acts).toEqual(['plans'])
    expect(handled).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector('[data-testid="almacenamiento-cambio"]'),
    ).toBeNull()
    expect(state.seam.mock.calls.some(([, p]) => p.blocks !== undefined)).toBe(
      false,
    )
  })

  it('«Agregar 10 GB» then «Agregar 10 GB» in the sheet buys one block once', async () => {
    seams()
    state.read.mockResolvedValue(boot(['storage_blocks']))
    mountTienda(readyDoor(boot(['storage_blocks'])))
    const card = await find('[data-testid="almacenamiento-uso"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('storage_quote', {})
    expect(card.textContent).toContain('You have 4.6 of 5 GB')
    expect(root.textContent).toContain(
      '+10 GB for $49.00 a month, IVA included',
    )
    root.querySelector('[data-testid="almacenamiento-agregar"]').click()
    const sheet = await find('[data-testid="almacenamiento-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('storage_quote', { blocks: 1 })
    expect(sheet.textContent).toContain('$24.50')
    expect(sheet.textContent).toContain('15 GB in total')
    expect(
      document.querySelector('[data-testid="almacenamiento-consentimiento"]')
        .textContent,
    ).toContain('$49.00 a month, IVA included')
    const confirm = document.querySelector(
      '[data-testid="almacenamiento-confirmar"]',
    )
    expect(confirm.textContent).toBe('Add 10 GB')
    confirm.click()
    await flush()
    const sets = state.seam.mock.calls.filter(([m]) => m === 'set_storage')
    expect(sets).toHaveLength(1)
    expect(sets[0][1].blocks).toBe(1)
    expect(typeof sets[0][1].idempotency_key).toBe('string')
    expect(sets[0][1].idempotency_key.length).toBeGreaterThan(8)
    expect(state.toast).toHaveBeenCalledWith('You added 10 GB')
  })

  it('a quote for an older tap never confirms the count on screen', async () => {
    seams({
      quote: (payload) => ({ ...QUOTE, blocks_target: payload.blocks - 1 }),
    })
    state.read.mockResolvedValue(boot(['storage_blocks']))
    mountTienda(readyDoor(boot(['storage_blocks'])))
    await find('[data-testid="almacenamiento-agregar"]')
    await flush()
    root.querySelector('[data-testid="almacenamiento-agregar"]').click()
    await find('[data-testid="almacenamiento-cambio"]')
    await flush()
    expect(
      document.querySelector('[data-testid="almacenamiento-confirmar"]')
        .disabled,
    ).toBe(true)
  })

  it('Boat’s refusal of a reduction says why and changes nothing', async () => {
    seams({
      space: { ...SPACE, allowance_gb: 25, extra_gb: 20, blocks: 2 },
      quote: {
        ok: false,
        reason: 'storage_in_use',
        message:
          'Usas 18 GB y tu espacio bajaría a 15 GB. Libera 3 GB o quita menos espacio.',
        next: null,
      },
    })
    state.read.mockResolvedValue(boot(['storage_blocks']))
    mountTienda(readyDoor(boot(['storage_blocks'])))
    await find('[data-testid="almacenamiento-quitar"]')
    await flush()
    root.querySelector('[data-testid="almacenamiento-quitar"]').click()
    const refused = await find('[data-testid="almacenamiento-cambio-negado"]')
    await flush()
    expect(refused.textContent).toContain('Libera 3 GB')
    expect(
      document.querySelector('[data-testid="almacenamiento-confirmar"]')
        .disabled,
    ).toBe(true)
    expect(state.seam.mock.calls.some(([m]) => m === 'set_storage')).toBe(false)
  })

  it('a price Boat does not sell shows its sentence and «Ver planes»', async () => {
    seams({
      space: {
        ...SPACE,
        offer: {
          available: false,
          message: 'Más espacio aún no está disponible.',
        },
      },
    })
    state.read.mockResolvedValue(boot(['storage_blocks']))
    const acts = []
    mountTienda(readyDoor(boot(['storage_blocks'])), {
      onAct: (key) => acts.push(key),
    })
    const unavailable = await find(
      '[data-testid="almacenamiento-no-disponible"]',
    )
    await flush()
    expect(unavailable.textContent).toContain('aún no está disponible')
    expect(
      root.querySelector('[data-testid="almacenamiento-agregar"]'),
    ).toBeNull()
    root.querySelector('[data-testid="almacenamiento-planes"]').click()
    await flush()
    expect(acts).toEqual(['plans'])
    expect(state.seam.mock.calls.some(([m]) => m === 'set_storage')).toBe(false)
  })

  it('Boat’s seam switched off hides the block', async () => {
    seams({ space: { ok: false, reason: 'disabled', message: 'x' } })
    state.read.mockResolvedValue(boot(['storage_blocks']))
    mountTienda(readyDoor(boot(['storage_blocks'])))
    await flush()
    await flush()
    expect(
      root.querySelector('[data-testid="cuenta-almacenamiento"]'),
    ).toBeNull()
  })
})

describe('the Cuenta page', () => {
  it('«Comprar más espacio» under Resumen’s meter opens the sheet on one more block: two taps', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot(['storage_blocks']) : null,
    )
    seams()
    Element.prototype.scrollIntoView = function () {}
    try {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } },
        ],
      })
      await router.push('/cuenta')
      await router.isReady()
      root = document.createElement('div')
      document.body.appendChild(root)
      app = createApp({ render: () => h(Cuenta) })
      app.config.globalProperties.__ = (...args) => window.__(...args)
      app.use(router)
      app.mount(root)
      const more = await find('[data-testid="cuenta-uso-espacio"]')
      await flush()
      expect(more.textContent).toBe('Get more space')
      more.click()
      const confirm = await find('[data-testid="almacenamiento-confirmar"]')
      for (let i = 0; i < 40 && confirm.disabled; i++) await flush()
      expect(router.currentRoute.value.query.tab).toBe('tienda')
      expect(state.seam).toHaveBeenCalledWith('storage_quote', { blocks: 1 })
      expect(confirm.textContent).toBe('Add 10 GB')
      confirm.click()
      await flush()
      expect(
        state.seam.mock.calls.filter(([m]) => m === 'set_storage'),
      ).toHaveLength(1)
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('the sheet opens once: back in Tienda later it stays closed', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot(['storage_blocks']) : null,
    )
    seams()
    Element.prototype.scrollIntoView = function () {}
    try {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } },
        ],
      })
      await router.push('/cuenta')
      await router.isReady()
      root = document.createElement('div')
      document.body.appendChild(root)
      app = createApp({ render: () => h(Cuenta) })
      app.config.globalProperties.__ = (...args) => window.__(...args)
      app.use(router)
      app.mount(root)
      const asks = () =>
        state.seam.mock.calls.filter(
          ([m, p]) => m === 'storage_quote' && p.blocks === 1,
        ).length
      ;(await find('[data-testid="cuenta-uso-espacio"]')).click()
      await find('[data-testid="almacenamiento-cambio"]')
      await flush()
      expect(asks()).toBe(1)
      const cancel = [...document.querySelectorAll('button')].find(
        (b) => b.textContent === 'Cancel',
      )
      cancel.click()
      await flush()
      expect(
        document.querySelector('[data-testid="almacenamiento-cambio"]'),
      ).toBeNull()
      await router.replace({ query: { tab: 'resumen' } })
      await find('[data-testid="cuenta-uso-espacio"]')
      await flush()
      await router.replace({ query: { tab: 'tienda' } })
      await find('[data-testid="almacenamiento-uso"]')
      await flush()
      await flush()
      expect(
        document.querySelector('[data-testid="almacenamiento-cambio"]'),
      ).toBeNull()
      expect(asks()).toBe(1)
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('Resumen offers no purchase where Boat sells no block', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap'
        ? boot(['storage_blocks'], { storage_blocks: { can_add: false } })
        : null,
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } }],
    })
    await router.push('/cuenta')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cuenta) })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.use(router)
    app.mount(root)
    await find('[data-testid="cuenta-uso"]')
    await flush()
    expect(root.querySelector('[data-testid="cuenta-uso-espacio"]')).toBeNull()
  })

  it('without the capability Resumen offers no storage step', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot([]) : null,
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } }],
    })
    await router.push('/cuenta')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cuenta) })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.use(router)
    app.mount(root)
    await find('[data-testid="cuenta-uso"]')
    await flush()
    expect(root.querySelector('[data-testid="cuenta-uso-espacio"]')).toBeNull()
  })
})
