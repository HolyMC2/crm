// «Agregar 1 usuario» from an alta the plan's cap refused (Equipo): what the
// refusal offers comes from who asks and what Boat sells. The owner on a Boat
// with «seats» buys one in place: Boat's unit price on the button, Mi cuenta's
// quote sheet preset to one more, «Agregar 1 usuario» calls set_seats and the
// alta that asked goes again. Without the capability the way is Mi cuenta ›
// Tienda (or Boat's own next step); anyone else is told to ask the owner.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ toast: vi.fn(), seam: null }))
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
            { disabled: props.disabled, onClick: () => emit('click') },
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

// Mi cuenta's quote sheet asks Boat through the relay module itself.
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  seam: (...args) => state.seam(...args),
}))

import { createPagos } from '@/components/cuenta/pagos'
import {
  createSeatStep,
  cuentaRoute,
  seatOffer,
  seatsOnTheWay,
} from '@/components/cuenta/seatStep'
import { changeTitle } from '@/components/cuenta/usuarios'
import SeatStepSheet from '@/components/cuenta/SeatStepSheet.vue'
import { lazySeatStep } from '@/composables/useEquipo'

const QUOTE = {
  ok: true,
  changed: false,
  users: {
    included: 2,
    extra: 1,
    extra_target: 1,
    unit_price_mxn: 99,
    max_total: 5,
    scheduled_extra: null,
  },
  sucursales: {
    included: 1,
    extra: 0,
    extra_target: 0,
    unit_price_mxn: 149,
    max_total: 3,
    scheduled_extra: null,
  },
  pending: null,
}
const boot = (capabilities = ['seats'], local = {}) => ({
  site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
  meters: { seats: { max_users: 3, max_sucursales: 1 } },
  seats_local: { users_used: 3, sucursales_used: 1, ...local },
  invoices: [],
  payment_state: { status: 'ready', authoritative: true, invoices: {} },
  capabilities,
})

describe('what a refusal at the cap offers', () => {
  it('someone who cannot open Mi cuenta is told to ask the owner, with no money', () => {
    expect(seatOffer({ allowed: false, key: 'users' })).toEqual({
      mode: 'ask',
      label: 'Ask the owner to add a user.',
    })
    expect(seatOffer({ allowed: false, key: 'sucursales' }).label).toBe(
      'Ask the owner to add a register.',
    )
  })

  it('without the capability, or without a readable plan, the way is Mi cuenta › Tienda', () => {
    const store = {
      mode: 'link',
      label: 'See plans in My account',
      act: 'plans',
      text: '',
    }
    expect(
      seatOffer({ allowed: true, data: boot([]), seats: null, key: 'users' }),
    ).toEqual(store)
    expect(seatOffer({ allowed: true, data: null, key: 'users' })).toEqual(
      store,
    )
    expect(
      seatOffer({
        allowed: true,
        data: boot(),
        seats: { refusal: { ok: false, reason: 'disabled' } },
        key: 'users',
      }),
    ).toEqual(store)
    expect(cuentaRoute('plans')).toEqual({
      path: '/cuenta',
      query: { tab: 'tienda' },
    })
  })

  it('a refusal from Boat says Boat’s sentence with its own next step', () => {
    const offer = seatOffer({
      allowed: true,
      data: boot(),
      seats: {
        refusal: {
          ok: false,
          reason: 'trial',
          message: 'Activa tu plan para agregar usuarios o cajas.',
          next: 'activate_plan',
        },
      },
      key: 'users',
    })
    expect(offer).toMatchObject({
      mode: 'link',
      text: 'Activa tu plan para agregar usuarios o cajas.',
      label: 'Activate your plan',
      act: 'activate',
    })
    expect(cuentaRoute(offer.act)).toEqual({
      path: '/cuenta',
      query: { activar: '1' },
    })
  })

  it('a plan that sells no extra users points to the plans', () => {
    const quote = {
      ...QUOTE,
      users: { ...QUOTE.users, unit_price_mxn: 0 },
    }
    expect(
      seatOffer({
        allowed: true,
        data: boot(),
        seats: { quote },
        key: 'users',
      }),
    ).toMatchObject({
      mode: 'link',
      act: 'plans',
      text: 'Your plan does not sell extra ones; another plan may include more.',
    })
  })

  it('the owner on a Boat that sells seats buys one at Boat’s price, IVA included', () => {
    const offer = seatOffer({
      allowed: true,
      data: boot(),
      seats: { quote: QUOTE },
      key: 'users',
    })
    expect(offer).toEqual({
      mode: 'buy',
      label: 'Add 1 user for $99.00 a month, IVA included',
      change: { key: 'users', extra: 1, planned: 1, target: 2 },
    })
  })

  it('with a decrease scheduled, one more is one more than today, never a smaller decrease', () => {
    const quote = {
      ...QUOTE,
      users: { ...QUOTE.users, extra: 2, extra_target: 2, scheduled_extra: 0 },
    }
    const offer = seatOffer({
      allowed: true,
      data: boot(['seats'], { users_cap: 4 }),
      seats: { quote },
      key: 'users',
    })
    expect(offer.mode).toBe('buy')
    expect(offer.change).toEqual({
      key: 'users',
      extra: 2,
      planned: 0,
      target: 3,
    })
    const { extra, planned, target } = offer.change
    expect(changeTitle('users', extra, target, planned)).toBe('Add 1 user')
  })

  it('a seat Boat has that has not reached the site offers to check again, not to buy', () => {
    // Boat: 2 included + 2 extra; the site still caps at 3.
    const quote = { ...QUOTE, users: { ...QUOTE.users, extra: 2 } }
    const waiting = boot(['seats'], { users_cap: 3 })
    expect(seatsOnTheWay(quote, waiting, 'users')).toBe(1)
    expect(
      seatOffer({
        allowed: true,
        data: waiting,
        seats: { quote },
        key: 'users',
      }),
    ).toEqual({
      mode: 'wait',
      label:
        'Your plan already has one more user; it takes a moment to reach this system.',
    })
    // The cap arrived and the plan is full again: one more is a new purchase.
    const arrived = boot(['seats'], { users_cap: 4 })
    expect(seatsOnTheWay(quote, arrived, 'users')).toBe(0)
    expect(
      seatOffer({
        allowed: true,
        data: arrived,
        seats: { quote },
        key: 'users',
      }).mode,
    ).toBe('buy')
    // No limit on the site, or no figure from it: nothing to compare.
    expect(
      seatsOnTheWay(quote, boot(['seats'], { users_cap: 0 }), 'users'),
    ).toBe(0)
    expect(seatsOnTheWay(quote, boot(), 'users')).toBeNull()
  })

  it('without the site’s cap, a purchase from this page a moment ago still waits', () => {
    const args = { allowed: true, data: boot(), seats: { quote: QUOTE } }
    expect(seatOffer({ ...args, key: 'users', bought: true })).toEqual({
      mode: 'wait',
      label:
        'Your plan already has one more user; it takes a moment to reach this system.',
    })
    expect(seatOffer({ ...args, key: 'users', bought: false }).mode).toBe('buy')
    // With the site's cap, the comparison decides.
    expect(
      seatOffer({
        ...args,
        data: boot(['seats'], { users_cap: 3 }),
        key: 'users',
        bought: true,
      }).mode,
    ).toBe('buy')
  })
})

describe('the page’s seat step', () => {
  function io(seamAnswer = async () => QUOTE) {
    return {
      read: vi.fn(async (fn) => (fn === 'bootstrap' ? boot() : null)),
      mutate: vi.fn(),
      seam: vi.fn(seamAnswer),
    }
  }
  const pagos = async () => ({
    createPagos: (options) =>
      createPagos({ ...options, timers: { set: () => 0, clear: () => {} } }),
  })

  it('reads Boat once a minute and opens the quote sheet preset to one more', async () => {
    let clock = 0
    const fake = io()
    const step = createSeatStep({
      allowed: () => true,
      navigate: vi.fn(),
      pagos,
      io: fake,
      now: () => clock,
    })
    const offer = await step.offer('users')
    expect(offer.mode).toBe('buy')
    expect(offer.label).toBe('Add 1 user for $99.00 a month, IVA included')
    expect(fake.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
    expect(fake.seam).toHaveBeenCalledWith('seats_quote', { extra_users: 0 })
    await step.offer('users')
    expect(fake.read).toHaveBeenCalledTimes(1)
    clock = 61_000
    await step.offer('users')
    expect(fake.read).toHaveBeenCalledTimes(2)

    const answers = []
    offer.run((result) => answers.push(result))
    expect(step.open.value).toBe(true)
    expect(step.change.value).toEqual({
      key: 'users',
      extra: 1,
      planned: 1,
      target: 2,
    })
    step.done()
    expect(step.open.value).toBe(false)
    expect(answers).toEqual([true])
    step.dispose()
  })

  it('closing settles «no change», a way out settles «left» and goes there', async () => {
    const navigate = vi.fn()
    const step = createSeatStep({
      allowed: () => true,
      navigate,
      pagos,
      io: io(),
    })
    const offer = await step.offer('users')
    const answers = []
    offer.run((result) => answers.push(result))
    step.close()
    offer.run((result) => answers.push(result))
    step.act('pay')
    expect(answers).toEqual([false, 'left'])
    expect(navigate).toHaveBeenCalledWith({
      path: '/cuenta',
      query: { tab: 'facturacion' },
    })
  })

  it('reopened after a purchase, the alta offers no second buy until the cap arrives', async () => {
    let clock = 0
    let cap = 3
    let extra = 1
    const fake = {
      read: vi.fn(async (fn) =>
        fn === 'bootstrap' ? boot(['seats'], { users_cap: cap }) : null,
      ),
      mutate: vi.fn(),
      seam: vi.fn(async () => ({
        ...QUOTE,
        users: { ...QUOTE.users, extra, extra_target: extra },
      })),
    }
    const step = createSeatStep({
      allowed: () => true,
      navigate: vi.fn(),
      pagos,
      io: fake,
      now: () => clock,
    })
    const first = await step.offer('users')
    expect(first.mode).toBe('buy')
    const answers = []
    first.run((result) => answers.push(result))
    // Boat applies the seat at once; the site's cap follows later.
    extra = 2
    step.done({ ok: true, applied: ['users'], scheduled: [] })
    expect(answers).toEqual([true])
    // A new alta sheet a moment later: the seat is on its way, nothing to buy.
    clock = 10_000
    const again = await step.offer('users')
    expect(again).toEqual({
      mode: 'wait',
      label:
        'Your plan already has one more user; it takes a moment to reach this system.',
    })
    expect(again.run).toBeUndefined()
    // A wait is read again each time; once the cap is here and full, one more is a sale.
    cap = 4
    clock = 20_000
    const later = await step.offer('users')
    expect(later.mode).toBe('buy')
    later.run(() => {})
    expect(step.change.value.target).toBe(3)
    step.dispose()
  })

  it('without the site’s cap, the page remembers its purchase for a few minutes', async () => {
    let clock = 0
    const fake = io()
    const step = createSeatStep({
      allowed: () => true,
      navigate: vi.fn(),
      pagos,
      io: fake,
      now: () => clock,
    })
    ;(await step.offer('users')).run(() => {})
    step.done({ ok: true, applied: ['users'] })
    clock = 60_000
    expect((await step.offer('users')).mode).toBe('wait')
    clock = 6 * 60_000
    expect((await step.offer('users')).mode).toBe('buy')
    step.dispose()
  })

  it('a change that adds none of this seat brings the alta back as it was', async () => {
    let clock = 0
    const step = createSeatStep({
      allowed: () => true,
      navigate: vi.fn(),
      pagos,
      io: io(),
      now: () => clock,
    })
    const answers = []
    ;(await step.offer('users')).run((result) => answers.push(result))
    step.done({ ok: true, applied: [], scheduled: ['users'] })
    expect(answers).toEqual([false])
    clock = 1_000
    expect((await step.offer('users')).mode).toBe('buy')
    step.dispose()
  })

  it('someone without Mi cuenta never reads the plan', async () => {
    const fake = io()
    const step = createSeatStep({
      allowed: () => false,
      navigate: vi.fn(),
      pagos,
      io: fake,
    })
    expect(await step.offer('users')).toEqual({
      mode: 'ask',
      label: 'Ask the owner to add a user.',
    })
    expect(fake.read).not.toHaveBeenCalled()
    expect(fake.seam).not.toHaveBeenCalled()
  })

  it('Equipo loads the step with the first refusal that asks for it', async () => {
    const lazy = lazySeatStep({ allowed: () => false, navigate: vi.fn() })
    expect(lazy.step.value).toBeNull()
    expect((await lazy.offer('users')).mode).toBe('ask')
    expect(typeof lazy.step.value.offer).toBe('function')
  })
})

describe('«Agregar 1 usuario» in the quote sheet', () => {
  let app, root
  beforeEach(() => {
    state.toast.mockReset()
    window.__ = (text, values) =>
      String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  })
  afterEach(() => {
    app?.unmount()
    root?.remove()
  })
  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
    }
  }

  it('quotes one more, applies it with set_seats and lets the alta go again', async () => {
    const fake = {
      read: vi.fn(async (fn) => (fn === 'bootstrap' ? boot() : null)),
      mutate: vi.fn(),
      seam: vi.fn(async (method, payload) => {
        if (method === 'seats_quote' && payload.extra_users === 2)
          return {
            ...QUOTE,
            users: { ...QUOTE.users, extra_target: 2 },
            changed: true,
            increase: ['users'],
            decrease: [],
            charge_now_mxn: 66,
            charge_on: 'next_invoice',
            monthly_delta_mxn: 99,
          }
        if (method === 'seats_quote') return QUOTE
        if (method === 'set_seats')
          return { ok: true, changed: true, applied: ['users'], scheduled: [] }
        return null
      }),
    }
    state.seam = fake.seam
    const step = createSeatStep({
      allowed: () => true,
      navigate: vi.fn(),
      pagos: async () => ({
        createPagos: (options) =>
          createPagos({
            ...options,
            timers: { set: () => 0, clear: () => {} },
          }),
      }),
      io: fake,
    })
    const offer = await step.offer('users')
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(SeatStepSheet, { step }) })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    const answers = []
    offer.run((result) => answers.push(result))
    await flush()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Add 1 user',
    )
    const confirm = document.querySelector('[data-testid="cambio-confirmar"]')
    expect(confirm.textContent).toBe('Add 1 user')
    confirm.click()
    await flush()
    const [, payload] = fake.seam.mock.calls.find(([m]) => m === 'set_seats')
    expect(payload.extra_users).toBe(2)
    expect(payload.idempotency_key).toBeTruthy()
    expect(state.toast).toHaveBeenCalledWith('You added 1 user')
    expect(answers).toEqual([true])
  })
})
