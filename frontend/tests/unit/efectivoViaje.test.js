// Efectivo › the bank trip card (ViajeCard): leaving with the bags it proposes,
// the slip, and the trip that came back; one batch instruction each.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async () => ({
  call: (...args) => state.call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ViajeCard from '@/components/efectivo/ViajeCard.vue'
import {
  confirmDeposit,
  dispatchBags,
  returnFromBank,
} from '@/components/efectivo/steps'

const BATCH = 'posawesome.posawesome.api.cash_custody.batch.command'
const SAFE = {
  safe: 'CASH-SAFE-1',
  title: 'Caja fuerte centro',
  currency: 'MXN',
  pos_profile: 'Tienda',
}
const BAGS = [
  { name: 'B1', seal: 'ANA-221126-01', amount: 9000 },
  { name: 'B2', seal: 'ANA-221126-02', amount: 7000 },
  { name: 'B3', seal: 'LUIS-231126-01', amount: 2000 },
]
const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('the bank trip card', () => {
  let host, app, done
  beforeEach(() => {
    state.call.mockReset()
    state.call.mockResolvedValue({ action: 'dispatch', bags: [] })
    host = document.createElement('div')
    document.body.appendChild(host)
    done = vi.fn()
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = (props) => {
    app = createApp({
      render: () =>
        h(ViajeCard, {
          safe: SAFE,
          bags: BAGS,
          bank: 'Banorte',
          people: { 'ana@x.mx': 'Ana Ruiz', 'luis@x.mx': 'Luis Paz' },
          me: 'ana@x.mx',
          showsMoney: true,
          onDone: done,
          ...props,
        }),
    })
    app.mount(host)
  }
  const sent = () => {
    const [[method, args]] = state.call.mock.calls
    return [method, args.action, JSON.parse(args.payload)]
  }

  it('leaves with every bag checked; a tap leaves one behind and the figure follows', async () => {
    mount({ stage: 'salir', reason: { reason: 'age', days: 3 } })
    await flush()
    expect(host.querySelector('[data-viaje-monto]').textContent).toContain(
      '18,000',
    )
    expect(host.querySelector('[data-viaje-razon]').textContent).toContain(
      '3 días',
    )
    expect(host.querySelector('[data-viaje-ruta]').textContent).toContain(
      'Banorte',
    )
    host.querySelector('[data-viaje-bolsa="B3"]').click()
    await flush()
    expect(host.querySelector('[data-viaje-monto]').textContent).toContain(
      '16,000',
    )
    host.querySelector('[data-viaje-accion]').click()
    await flush()
    const [method, action, payload] = sent()
    expect(method).toBe(BATCH)
    expect(action).toBe('dispatch')
    expect(payload.bags).toEqual(['B1', 'B2'])
    expect(payload.carrier).toBeUndefined()
    expect(payload.request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(done.mock.calls[0][0].toast).toBe('2 bolsas en camino al banco')
  })

  it('the last checked bag cannot be left behind', async () => {
    mount({ stage: 'salir', bags: [BAGS[0]] })
    await flush()
    expect(host.querySelector('[data-viaje-bolsa="B1"]').disabled).toBe(true)
  })

  it('names who carries them when it is someone else', async () => {
    mount({ stage: 'salir' })
    await flush()
    expect(host.querySelector('[data-viaje-lleva]').textContent).toContain(
      'Lleva Ana',
    )
    host.querySelector('[data-viaje-lleva]').click()
    await flush()
    const field = host.querySelector('input[data-viaje-quien]')
    field.value = 'Karla'
    field.dispatchEvent(new Event('input'))
    await flush()
    host.querySelector('[data-viaje-accion]').click()
    await flush()
    expect(sent()[2].carrier).toBe('Karla')
  })

  it('without the shop money: how many bags, never an amount', async () => {
    mount({
      stage: 'salir',
      showsMoney: false,
      bags: BAGS.map((bag) => ({ name: bag.name, seal: bag.seal })),
    })
    await flush()
    expect(host.querySelector('[data-viaje-monto]').textContent).toContain(
      '3 bolsas',
    )
    expect(host.textContent).not.toContain('$')
  })

  it('the slip needs its folio; «Regresó sin depositar» swaps it for why', async () => {
    mount({ stage: 'ficha', by: 'luis@x.mx', at: '2026-11-23 10:15:00' })
    await flush()
    expect(host.querySelector('[data-viaje-ruta]').textContent).toContain(
      'Luis Paz',
    )
    const go = () => host.querySelector('[data-viaje-accion]')
    expect(go().disabled).toBe(true)
    const folio = host.querySelector('input[data-viaje-folio]')
    folio.value = 'FICHA-88123'
    folio.dispatchEvent(new Event('input'))
    await flush()
    expect(go().disabled).toBe(false)
    host.querySelector('[data-viaje-regreso]').click()
    await flush()
    expect(host.querySelector('input[data-viaje-folio]')).toBeNull()
    const why = host.querySelector('textarea[data-viaje-porque]')
    why.value = 'corto'
    why.dispatchEvent(new Event('input'))
    await flush()
    expect(go().disabled).toBe(true)
    why.value = 'El banco cerró antes de llegar'
    why.dispatchEvent(new Event('input'))
    await flush()
    go().click()
    await flush()
    const [, action, payload] = sent()
    expect(action).toBe('return_bank')
    expect(payload.note).toBe('El banco cerró antes de llegar')
  })

  it('a refusal shows the server’s sentence and the retry keeps the request ID', async () => {
    const refusal = Object.assign(new Error('x'), {
      status: 417,
      messages: [
        'ANA-221126-01: Only verified available bags can leave for the bank.',
      ],
    })
    state.call.mockRejectedValueOnce(refusal)
    mount({ stage: 'salir' })
    await flush()
    host.querySelector('[data-viaje-accion]').click()
    await flush()
    expect(host.querySelector('[data-viaje-problema]').textContent).toContain(
      'Only verified available bags',
    )
    expect(done).not.toHaveBeenCalled()
  })
})

describe('the bank steps are the trip card', () => {
  it('one bag or several, leaving, the slip and the return open the card', () => {
    const one = BAGS[0]
    expect(dispatchBags(BAGS, SAFE, {}, 'ana@x.mx')).toMatchObject({
      sheet: 'viaje',
      props: { stage: 'salir', showsMoney: true },
    })
    expect(
      confirmDeposit({ ...one, dispatched_by: 'luis@x.mx' }, SAFE, {}),
    ).toMatchObject({
      sheet: 'viaje',
      props: { stage: 'ficha', by: 'luis@x.mx' },
    })
    expect(returnFromBank(one, SAFE, {}).props.startReturning).toBe(true)
  })
})
