// Efectivo › «Bolsas al cerrar»: the safe's plan for the bags a closing drawer
// goes into (posawesome bag_plan_api), switched on and set from the shell.
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
  return {
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

import BolsasSheet from '@/components/efectivo/BolsasSheet.vue'

const PLAN = 'posawesome.posawesome.api.cash_custody.bag_plan_api'
const view = (over = {}) => ({
  safe: 'CASH-SAFE-1',
  title: 'Caja fuerte centro',
  currency: 'MXN',
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
  ...over,
})

const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('Bolsas al cerrar', () => {
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
        h(BolsasSheet, {
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

  it('reads the safe, shows the float in small pieces and keeps the big bills aside', async () => {
    state.call.mockResolvedValue(view())
    mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith(`${PLAN}.settings`, {
      safe: 'CASH-SAFE-1',
    })
    expect(
      host.querySelector('[data-bolsas-on]').getAttribute('aria-checked'),
    ).toBe('false')
    expect(host.querySelector('[data-bolsas-fondo]').textContent).toContain(
      '900',
    )
    const faces = [...host.querySelectorAll('[data-face]')].map((li) =>
      Number(li.dataset.face),
    )
    // $200 and up go to the bank, so they stay out of the float rows.
    expect(faces).toEqual([10000, 5000, 2000, 1000, 500, 200, 100, 50])
    expect(host.textContent).toContain('Agregar billetes grandes al fondo')
  })

  it('turns the plan on and sends the pieces, the change and the bank bill', async () => {
    state.call.mockImplementation(async (method) =>
      method.endsWith('.save_settings') ? view({ on: true }) : view(),
    )
    mount()
    await flush()
    host.querySelector('[data-bolsas-on]').click()
    host.querySelector('[aria-label="Una pieza más de $20"]').click()
    await flush()
    host.querySelector('[data-bolsas-guardar]').click()
    await flush()
    const [method, args] = state.call.mock.calls.at(-1)
    expect(method).toBe(`${PLAN}.save_settings`)
    expect(args.on).toBe(1)
    expect(JSON.parse(args.float_mix)).toEqual([
      { value: 100, quantity: 5 },
      { value: 50, quantity: 6 },
      { value: 20, quantity: 6 },
    ])
    expect(args.change_target).toBe('1350')
    expect(args.bank_from).toBe(200)
    expect(events.saved.mock.calls[0][0].toast).toBe(
      'Listo: el POS arma las bolsas al cerrar',
    )
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
})
