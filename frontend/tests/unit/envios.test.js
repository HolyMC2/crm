// Compras «Reglas de envío»: what the worker reads and what a save sends.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import CompraEnvio from '@/pages/CompraEnvio.vue'
import OrdenMasDatos from '@/components/compras/OrdenMasDatos.vue'
import {
  money,
  moreFrom,
  morePayload,
  moreValues,
} from '@/composables/useCompras'
import {
  addStep,
  blankRule,
  chargeSummary,
  normalizeState,
  pickHint,
  removeStep,
  ruleForm,
  ruleMissing,
  rulePayload,
  stateChip,
  stateTitle,
  stepLines,
} from '@/composables/useEnvios'

const LADDER = {
  name: 'Paquetería local',
  label: 'Paquetería local',
  state: 'activo',
  disabled: false,
  company: 'DC',
  currency: 'MXN',
  account: { name: 'Fletes - DC', label: 'Fletes y acarreos' },
  cost_center: null,
  based_on: 'net_total',
  amount: 0,
  steps: [
    { to: 1000, amount: 150 },
    { to: null, amount: 0 },
  ],
  ranges: [],
  extras: [],
  selling: false,
  desk_ranges: false,
  editable: true,
  modified: '2026-11-06 10:00:00',
}

describe('a shipping rule in words', () => {
  it('reads a fixed charge and a ladder of ranges', () => {
    expect(
      chargeSummary({ based_on: 'fixed', amount: 150, currency: 'MXN' }),
    ).toBe(`${money(150, 'MXN')} per purchase`)
    expect(stepLines(LADDER.steps, 'net_total', 'MXN')).toEqual([
      `Up to ${money(1000, 'MXN')}: ${money(150, 'MXN')}`,
      `More than ${money(1000, 'MXN')}: no charge`,
    ])
    expect(
      stepLines(
        [
          { to: 20, amount: 90 },
          { to: 50, amount: 140 },
          { to: null, amount: 200 },
        ],
        'net_weight',
        'MXN',
      )[1],
    ).toBe(`From 20 to 50: ${money(140, 'MXN')}`)
    expect(chargeSummary(LADDER)).toBe(
      `By the purchase amount: Up to ${money(1000, 'MXN')}: ${money(150, 'MXN')}; More than ${money(1000, 'MXN')}: no charge`,
    )
  })
  it('lists a rule for the purchase picker with what it charges', () => {
    expect(pickHint({ based_on: 'fixed', amount: 99, currency: 'MXN' })).toBe(
      `${money(99, 'MXN')} per purchase`,
    )
    expect(pickHint({ based_on: 'net_weight' })).toBe(
      'By the purchase’s net weight',
    )
  })
  it('titles each state', () => {
    expect(normalizeState('nope')).toBe('activo')
    expect(stateTitle('desactivado')).toBe('Turned-off shipping rules')
    expect(stateChip('activo').tone).toBe('success')
  })
})

describe('the editor form', () => {
  it('sends a fixed charge without ranges', () => {
    const form = blankRule({ company: 'DC' })
    Object.assign(form, {
      label: ' Flete ',
      account: 'Fletes - DC',
      amount: '120',
    })
    expect(rulePayload(form)).toEqual({
      label: 'Flete',
      disabled: false,
      company: 'DC',
      account: 'Fletes - DC',
      cost_center: null,
      based_on: 'fixed',
      amount: 120,
    })
  })
  it('sends a ladder whose last range has no limit', () => {
    const form = ruleForm(LADDER)
    form.steps = addStep(form.steps)
    expect(form.steps).toHaveLength(3)
    form.steps[1].to = '3000'
    form.steps[1].amount = '80'
    const sent = rulePayload(form)
    expect(sent.conditions).toEqual([
      { to: 1000, amount: 150 },
      { to: 3000, amount: 80 },
      { amount: 0 },
    ])
    expect(sent).toMatchObject({
      name: 'Paquetería local',
      modified: '2026-11-06 10:00:00',
    })
    // The open range at the end never goes.
    expect(removeStep(form.steps, 2)).toBe(form.steps)
    expect(removeStep(form.steps, 0).map((s) => s.to)).toEqual(['3000', null])
  })
  it('names what blocks a save', () => {
    expect(ruleMissing(blankRule())).toEqual([
      'the name',
      'the company',
      'the account it charges to',
      'what it charges',
    ])
    const form = ruleForm(LADDER)
    form.steps = addStep(form.steps)
    form.steps[1].to = '500'
    expect(ruleMissing(form)).toEqual([
      'where each range ends, from low to high',
      'what each range charges',
    ])
  })
})

describe('the purchase carries the rule', () => {
  const document = {
    taxes_and_charges: '',
    shipping_rule: 'Paquetería local',
    shipping_rule_label: 'Paquetería local',
    shipping_charge: 150,
  }
  it('sends the rule only when the worker changes it, and clears it', () => {
    const more = moreFrom(document)
    const form = { ...more, more_base: moreValues(more) }
    expect(morePayload(form)).toEqual({})
    form.shipping_rule = ''
    expect(morePayload(form)).toEqual({ shipping_rule: null })
  })
})

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

let app, root, calls
beforeEach(() => {
  calls = []
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

function answer(replies) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push({ method, args: JSON.parse(init?.body || '{}') })
      const message = replies[method] ?? []
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
}

async function open(name) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      {
        path: '/compras/envio/:name',
        name: 'CompraEnvio',
        component: CompraEnvio,
        props: true,
      },
      {
        path: '/compras/envios',
        name: 'CompraEnvios',
        component: { render: () => null },
      },
    ],
  })
  router.push(`/compras/envio/${encodeURIComponent(name)}`)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

describe('the shipping rule page', () => {
  it('draws a ladder, adds a range and saves it', async () => {
    answer({
      rule: { rule: LADDER, can_write: true, companies: [] },
      save_rule: { name: LADDER.name, modified: 'v2', drafts: 2 },
    })
    const router = await open(LADDER.name)
    const text = root.textContent
    expect(text).toContain(`From ${money(0, 'MXN')}`)
    expect(text).toContain(`More than ${money(1000, 'MXN')}`)
    expect(text).toContain('Fletes y acarreos')
    root.querySelector('[data-testid="envio-agregar-rango"]').click()
    await flush()
    const ranges = root.querySelectorAll('[data-testid="envio-rangos"] > li')
    expect(ranges).toHaveLength(3)
    const set = (selector, value) => {
      const input =
        root.querySelector(`${selector} input`) || root.querySelector(selector)
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    set('[data-envio-hasta="1"]', '3000')
    set('[data-envio-cobra="1"]', '80')
    await flush()
    root.querySelector('[data-testid="envio-guardar"]').click()
    await flush()
    const saved = calls.find((c) => c.method === 'save_rule')
    expect(saved.args.data.conditions).toEqual([
      { to: 1000, amount: 150 },
      { to: 3000, amount: 80 },
      { amount: 0 },
    ])
    expect(router.currentRoute.value.name).toBe('CompraEnvios')
  })
  it('reads a selling rule and sends the worker to the full form', async () => {
    answer({
      rule: {
        rule: { ...LADDER, selling: true, editable: false },
        can_write: true,
        companies: [],
      },
    })
    await open(LADDER.name)
    expect(
      root.querySelector('[data-testid="envio-solo-lectura"]').textContent,
    ).toContain('This shipping rule is for sales')
    expect(root.querySelector('[data-testid="envio-guardar"]')).toBeNull()
    expect(root.querySelector('a[href^="/app/shipping-rule/"]')).not.toBeNull()
  })
})

describe('«Más datos» on a purchase', () => {
  it('says what the saved rule charges, and when a new one is worked out', async () => {
    root = document.createElement('div')
    document.body.appendChild(root)
    const values = moreFrom({
      shipping_rule: 'Paquetería local',
      shipping_rule_label: 'Paquetería local',
      shipping_charge: 150,
    })
    app = createApp(OrdenMasDatos, {
      values,
      company: 'DC',
      canShip: true,
    })
    app.config.globalProperties.__ = window.__
    app.mount(root)
    root.querySelector('button[aria-expanded]').click()
    await flush()
    expect(root.textContent).toContain('shipping Paquetería local')
    expect(
      root.querySelector('[data-testid="compra-envio"]').textContent,
    ).toContain(`It charges ${money(150, 'MXN')} on this purchase.`)
    app.unmount()
    root.innerHTML = ''
    app = createApp(OrdenMasDatos, {
      values: { ...values, shipping_rule: 'Flete', shipping_label: 'Flete' },
      company: 'DC',
      canShip: true,
    })
    app.config.globalProperties.__ = window.__
    app.mount(root)
    root.querySelector('button[aria-expanded]').click()
    await flush()
    expect(
      root.querySelector('[data-testid="compra-envio"]').textContent,
    ).toContain('The charge is worked out when you save.')
  })
})
