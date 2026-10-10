import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ resources: [], calls: [] }))
vi.mock('frappe-ui', async () => {
  const { h, reactive } = await import('vue')
  return {
    createResource: (options) => {
      const resource = reactive({
        options,
        data: state.next,
        loading: false,
        error: null,
        reload: vi.fn(async () => {}),
      })
      state.resources.push(resource)
      return resource
    },
    call: vi.fn(async (method, args) => {
      state.calls.push([method, args])
      if (state.fail) throw { messages: [state.fail] }
      return {}
    }),
    Button: {
      props: ['label'],
      emits: ['click'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h('button', { ...attrs, onClick: () => emit('click') }, p.label),
    },
  }
})

import ContactLoyaltyTab from '@/components/doco/contact/ContactLoyaltyTab.vue'

let app, root
async function mount(data) {
  state.next = data
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(ContactLoyaltyTab, { docname: 'CONT-1' }) })
  app.config.globalProperties.__ = (text, args) =>
    args ? text.replace(/\{(\d+)\}/g, (_, i) => args[i]) : text
  globalThis.__ = app.config.globalProperties.__
  app.mount(root)
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.resources = []
  state.calls = []
  state.fail = null
})

const program = {
  name: 'P',
  label: 'Puntos Doco',
  conversion_factor: 0.1,
  collection_factor: 10,
  expiry_days: 365,
}
const base = {
  customer: 'Ana',
  customer_name: 'Ana Pérez',
  company: 'Doco',
  currency: 'MXN',
  program,
  points: 0,
  points_value: 0,
  movements: [],
  gift_cards_used: [],
  blocked: null,
  monedero: { balance: 0, sources: 0 },
  actions: {
    enroll: false,
    sell: true,
    deposit: true,
    adjust: false,
    create_program: false,
  },
}
const payload = (row) => ({
  availability: { available: true },
  customers: [{ ...base, ...row }],
})

describe('Puntos y saldo tab', () => {
  it('reads the contact fresh, never from a cache', async () => {
    await mount(payload({ state: 'member' }))
    expect(state.resources[0].options.url).toBe(
      'doco_marketing.api.contact360.get_contact_loyalty',
    )
    expect(state.resources[0].options.cache).toBeUndefined()
  })

  it('enrolls a non-member through the one enrolment action and reloads', async () => {
    await mount(
      payload({
        state: 'not_member',
        actions: { ...base.actions, enroll: true },
      }),
    )
    root.querySelector('[data-testid="loyalty-enroll"]').click()
    await nextTick()
    await nextTick()
    expect(state.calls[0]).toEqual([
      'doco.clientes_frecuentes.api.enroll_customer',
      { customer: 'Ana', company: 'Doco' },
    ])
    expect(state.resources[0].reload).toHaveBeenCalled()
  })

  it('says who can enroll when the reader may not', async () => {
    await mount(payload({ state: 'not_member' }))
    expect(root.querySelector('[data-testid="loyalty-enroll"]')).toBeNull()
    expect(root.textContent).toContain('Ask a manager to enroll this customer.')
  })

  it('shows the server refusal verbatim', async () => {
    state.fail = 'Ana already has cashback program X.'
    await mount(
      payload({
        state: 'not_member',
        actions: { ...base.actions, enroll: true },
      }),
    )
    root.querySelector('[data-testid="loyalty-enroll"]').click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'Ana already has cashback program X.',
    )
  })

  it('without a program, offers «Create program» only to whoever may create it', async () => {
    await mount(payload({ state: 'no_program', program: null }))
    expect(root.textContent).toContain('There is no points program in Doco.')
    expect(
      root.querySelector('[data-testid="loyalty-create-program"]'),
    ).toBeNull()
    app.unmount()
    root.remove()
    await mount(
      payload({
        state: 'no_program',
        program: null,
        actions: { ...base.actions, create_program: true },
      }),
    )
    expect(
      root.querySelector('[data-testid="loyalty-create-program"]'),
    ).not.toBeNull()
  })

  it('hands the sale and the deposit to the register with the way back to this tab', async () => {
    await mount(payload({ state: 'member', points: 120, points_value: 12 }))
    const sell = root
      .querySelector('[data-testid="loyalty-sell"]')
      .getAttribute('href')
    const deposit = root
      .querySelector('[data-testid="loyalty-deposit"]')
      .getAttribute('href')
    expect(sell).toBe(
      '/posapp/pos?customer=Ana&return_to=%2Fcrm%2Fcontactos%2FCONT-1%3Ftab%3Dcontact_loyalty&return_label=Contactos',
    )
    expect(deposit).toContain('intent=deposit')
  })

  it('a manager adjusts points with a reason and one request id per press', async () => {
    await mount(
      payload({
        state: 'member',
        points: 50,
        actions: { ...base.actions, adjust: true },
      }),
    )
    root.querySelector('[data-testid="loyalty-adjust"]').click()
    await nextTick()
    const form = root.querySelector('[data-testid="loyalty-adjust-form"]')
    const [points, reason] = form.querySelectorAll('input')
    points.value = '-10'
    points.dispatchEvent(new Event('input'))
    reason.value = 'Cortesía por demora'
    reason.dispatchEvent(new Event('input'))
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await new Promise((r) => setTimeout(r, 0))
    const [method, args] = state.calls[0]
    expect(method).toBe('doco.clientes_frecuentes.api.adjust_points')
    expect(args).toMatchObject({
      customer: 'Ana',
      points: -10,
      reason: 'Cortesía por demora',
    })
    expect(args.request_id).toBeTruthy()
  })

  it('keeps points and monedero apart', async () => {
    await mount(
      payload({
        state: 'member',
        points: 120,
        points_value: 12,
        monedero: { balance: 300, sources: 1 },
      }),
    )
    const text = root.textContent
    expect(text).toContain('Points')
    expect(text).toContain('Monedero')
    expect(text).not.toContain('312')
  })
})
