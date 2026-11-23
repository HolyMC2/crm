// Efectivo › a safe's settings sheet (posawesome safe_settings_api): the bags at
// closing and the bank trip, one «Guardar».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  const { chipClass } = await import('@/components/ui/chipClass')
  return {
    // the kit's own controls, the sheet as a plain box
    Button: (await import('@/components/ui/Button.vue')).default,
    Field: (await import('@/components/ui/Field.vue')).default,
    Switch: (await import('@/components/ui/Switch.vue')).default,
    chipClass,
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, [
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})

import CajaFuerteSheet from '@/components/efectivo/CajaFuerteSheet.vue'

const API = 'posawesome.posawesome.api.cash_custody.safe_settings_api'
const view = (plan = {}, trip = {}) => ({
  safe: 'CASH-SAFE-1',
  title: 'Caja fuerte centro',
  currency: 'MXN',
  can_configure: true,
  bag_plan: {
    on: false,
    faces: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5],
    float_mix: [
      { value: 100, quantity: 5 },
      { value: 50, quantity: 6 },
      { value: 20, quantity: 5 },
    ],
    float_target: 900,
    change_target: 1350,
    bank_from: 200,
    can_configure: true,
    ...plan,
  },
  bank_trip: { on: false, amount: null, days: null, ...trip },
})

const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('Caja fuerte: bolsas al cerrar y viaje al banco', () => {
  let host, app, events
  beforeEach(() => {
    state.call.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    events = { saved: vi.fn(), open: vi.fn() }
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = () => {
    app = createApp({
      render: () =>
        h(CajaFuerteSheet, {
          open: true,
          safe: {
            safe: 'CASH-SAFE-1',
            title: 'Caja fuerte centro',
            currency: 'MXN',
          },
          onSaved: events.saved,
          'onUpdate:open': events.open,
        }),
    })
    app.mount(host)
  }
  const saved = () =>
    state.call.mock.calls.filter(([method]) => method === `${API}.save`)

  it('reads both blocks; the plan shows every face once it is on', async () => {
    state.call.mockResolvedValue(view({ on: true }))
    mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith(`${API}.view`, {
      safe: 'CASH-SAFE-1',
    })
    expect(host.querySelector('[data-sheet]').dataset.sheet).toBe(
      'Caja fuerte centro',
    )
    expect(host.querySelector('[data-bolsas-fondo]').textContent).toContain(
      '900',
    )
    const faces = [...host.querySelectorAll('[data-face]')].map((li) =>
      Number(li.dataset.face),
    )
    // every face in one grid, the big bills too: nothing behind a second tap
    expect(faces).toEqual([
      100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
    ])
    expect(
      host
        .querySelector('[data-bank-face="20000"]')
        .getAttribute('aria-checked'),
    ).toBe('true')
    // no hint lines: a label and its state
    expect(host.querySelectorAll('p:not([role])')).toHaveLength(0)
  })

  it('off, the plan keeps only its switch', async () => {
    state.call.mockResolvedValue(view())
    mount()
    await flush()
    expect(
      host.querySelector('[data-bolsas-on]').getAttribute('aria-checked'),
    ).toBe('false')
    expect(host.querySelector('[data-face]')).toBeNull()
  })

  it('turns the plan on and sends the pieces, the change and the bank bill in one save', async () => {
    state.call.mockImplementation(async (method) => view())
    mount()
    await flush()
    host.querySelector('[data-bolsas-on]').click()
    await flush()
    host.querySelector('[aria-label="Una pieza más de $20"]').click()
    await flush()
    host.querySelector('[data-bolsas-guardar]').click()
    await flush()
    const [[, args]] = saved()
    const plan = JSON.parse(args.bag_plan)
    expect(plan.on).toBe(1)
    expect(plan.float_mix).toEqual([
      { value: 100, quantity: 5 },
      { value: 50, quantity: 6 },
      { value: 20, quantity: 6 },
    ])
    expect(plan.change_target).toBe('1350')
    expect(plan.bank_from).toBe(200)
    expect(JSON.parse(args.bank_trip)).toEqual({ on: 0, amount: 0, days: 0 })
    expect(events.saved).toHaveBeenCalled()
    expect(events.open).toHaveBeenCalledWith(false)
  })

  it('asks for a float before the plan can be on', async () => {
    state.call.mockResolvedValue(view({ float_mix: [] }))
    mount()
    await flush()
    host.querySelector('[data-bolsas-on]').click()
    await flush()
    expect(host.querySelector('[data-bolsas-guardar]').disabled).toBe(true)
    expect(host.textContent).toContain(
      'Pon al menos un billete o moneda en el fondo.',
    )
  })

  it('the first switch-on of the bank trip proposes three days, the amount blank', async () => {
    state.call.mockResolvedValue(view())
    mount()
    await flush()
    host.querySelector('[data-viaje-on]').click()
    await flush()
    expect(host.querySelector('[data-viaje-dias]').textContent).toContain(
      '3 días',
    )
    expect(host.querySelector('input[data-viaje-importe]').value).toBe('')
    host.querySelector('[data-bolsas-guardar]').click()
    await flush()
    const [[, args]] = saved()
    expect(JSON.parse(args.bank_trip)).toEqual({ on: 1, amount: 0, days: 3 })
  })

  it('the bank trip needs an amount or days', async () => {
    state.call.mockResolvedValue(view({}, { on: true, amount: null, days: 1 }))
    mount()
    await flush()
    host.querySelector('[data-viaje-dias] [aria-label="Un día menos"]').click()
    await flush()
    expect(host.querySelector('[data-bolsas-guardar]').disabled).toBe(true)
    expect(host.querySelector('[data-bolsas-falta]').textContent).toContain(
      'un importe, unos días o los dos',
    )
    const amount = host.querySelector('input[data-viaje-importe]')
    amount.value = '15000'
    amount.dispatchEvent(new Event('input'))
    await flush()
    expect(host.querySelector('[data-bolsas-guardar]').disabled).toBe(false)
  })
})
