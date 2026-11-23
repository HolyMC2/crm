import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
import { call } from 'frappe-ui'
import {
  cleanTitle,
  recordOf,
  shownLabel,
  shownToast,
  titleProblem,
  uploadPicture,
  viewChange,
  whereLine,
} from '@/components/fidelidad/clientes'
import { pointsPreview } from '@/components/fidelidad/puntosExtra'
import ClientesVista from '@/components/fidelidad/ClientesVista.vue'
import OfertaSheet from '@/components/fidelidad/OfertaSheet.vue'
import PromoSheet from '@/components/fidelidad/PromoSheet.vue'
import PromosLista from '@/components/fidelidad/PromosLista.vue'

// «Mostrar a clientes» in Fidelidad: a promotion reaches the shop's customer
// app only when the owner switches it on, with its own title and picture there;
// a coupon promotion may let customers switch their coupon on. One line says
// where it shows. «Nueva promoción» also makes «Puntos extra».

const API = 'doco.fidelidad.api'
const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})
const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim()

const APP_ON = { promos: true, coupons: true, online: false }
const detail = (extra = {}, customers = {}) => ({
  name: 'Cupón de Facebook',
  title: 'Cupón de Facebook',
  state: 'live',
  ending_soon: false,
  ends_in: 8,
  target: { kind: 'ticket', name: null, label: null },
  discount: { kind: 'percent', value: 10 },
  min_amount: null,
  valid_from: '2026-11-12',
  valid_upto: '2026-11-30',
  coupon_based: true,
  auto: true,
  coupons: { issued: 1, used: 0 },
  coupon_list: [],
  can_edit: true,
  description: 'Cupón de Facebook',
  kind: 'Grand Total',
  customer_app: APP_ON,
  customers: {
    show: false,
    title: '',
    image: null,
    activatable: false,
    can_activate: true,
    where: 'store',
    ...customers,
  },
  ...extra,
})

function answer(map) {
  call.mockImplementation(async (method, args) => {
    const value = map[method.replace(`${API}.`, '')]
    if (value instanceof Error) throw value
    return typeof value === 'function' ? value(args) : value
  })
}

async function mountApp(component, props = {}) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/negocio/app-clientes', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(component, props)
  app.config.globalProperties.__ = globalThis.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}

describe('where a promotion shows', () => {
  it('says it in the owner words', () => {
    const offer = (show, extra = {}) => ({
      coupon_based: false,
      customers: { show, where: 'store' },
      ...extra,
    })
    expect(whereLine(offer(false), APP_ON)).toBe('Only your team sees it')
    expect(whereLine(offer(true), APP_ON)).toBe(
      'In the app and at the register',
    )
    expect(
      whereLine(
        offer(true, { customers: { show: true, where: 'both' } }),
        APP_ON,
      ),
    ).toBe('In the app, at the register and in the online store')
    expect(
      whereLine(offer(true, { coupon_based: true }), {
        ...APP_ON,
        online: true,
      }),
    ).toBe('In the app and at the register; its coupon also works online')
    expect(whereLine(offer(true), { promos: false })).toContain(
      'once «Promotions» is on',
    )
    expect(whereLine({ customers: null }, APP_ON)).toBe('')
    expect(shownLabel(offer(true))).toBe('In the app')
    expect(shownLabel(offer(false))).toBe('')
  })

  it('sends only what changed', () => {
    const view = { show: false, title: '', image: null, activatable: false }
    expect(viewChange(view, { show: true })).toEqual({ show: true })
    expect(viewChange(view, { show: false })).toEqual({})
    expect(viewChange(view, { title: '  Buen   Fin ' })).toEqual({
      title: 'Buen Fin',
    })
    expect(
      viewChange({ ...view, image: '/files/a.jpg' }, { image: '' }),
    ).toEqual({ image: '' })
    expect(viewChange(view, { activatable: true })).toEqual({
      activatable: true,
    })
    expect(cleanTitle(' a  b ')).toBe('a b')
    expect(titleProblem('x'.repeat(81))).toContain('80')
    expect(titleProblem('Buen Fin')).toBe('')
    expect(recordOf('rule:PRLE-0001')).toEqual({
      doctype: 'Pricing Rule',
      name: 'PRLE-0001',
    })
    expect(recordOf('Mes Patrio')).toEqual({
      doctype: 'POS Offer',
      name: 'Mes Patrio',
    })
  })

  it('files a picture as a public file of the promotion', async () => {
    const prepare = vi.fn(async (file) => file)
    const upload = vi.fn(async () => ({ file_url: '/files/promo.jpg' }))
    const file = new File(['x'], 'promo.jpg', { type: 'image/jpeg' })
    expect(await uploadPicture('rule:PRLE-9', file, { prepare, upload })).toBe(
      '/files/promo.jpg',
    )
    expect(upload).toHaveBeenCalledWith({
      doctype: 'Pricing Rule',
      name: 'PRLE-9',
      file,
      isPrivate: false,
    })
  })
})

describe('«Mostrar a clientes» in a promotion sheet', () => {
  it('a tap shows it to customers and the line says where', async () => {
    answer({
      set_customer_view: (args) =>
        detail({}, { ...JSON.parse(args.data), show: true }),
    })
    const onChanged = vi.fn()
    const el = await mountApp(ClientesVista, {
      offer: detail(),
      canEdit: true,
      onChanged,
    })
    expect(text(el.querySelector('[data-testid=clientes-donde]'))).toBe(
      'Only your team sees it',
    )
    expect(el.querySelector('[data-testid=clientes-titulo]')).toBeNull()
    el.querySelector('[data-testid=clientes-mostrar]').click()
    await flush()
    const [method, args] = call.mock.calls.at(-1)
    expect(method).toBe(`${API}.set_customer_view`)
    expect(args.name).toBe('Cupón de Facebook')
    expect(JSON.parse(args.data)).toEqual({ show: true })
    expect(onChanged).toHaveBeenCalled()
  })

  it('once shown: a title, a picture and «Los clientes pueden activarlo»', async () => {
    answer({
      set_customer_view: (args) =>
        detail({}, { show: true, ...JSON.parse(args.data) }),
    })
    const el = await mountApp(ClientesVista, {
      offer: detail({}, { show: true, image: '/files/fb.jpg' }),
      canEdit: true,
    })
    expect(text(el.querySelector('[data-testid=clientes-donde]'))).toBe(
      'In the app and at the register',
    )
    expect(
      el.querySelector('[data-testid=clientes-foto]').getAttribute('src'),
    ).toBe('/files/fb.jpg')
    const input = el.querySelector('[data-testid=clientes-titulo]')
    input.value = '10% en todo'
    input.dispatchEvent(new Event('input'))
    await flush(2)
    el.querySelector('[data-testid=clientes-titulo-guardar]').click()
    await flush()
    expect(JSON.parse(call.mock.calls.at(-1)[1].data)).toEqual({
      title: '10% en todo',
    })
    el.querySelector('[data-testid=clientes-activar]').click()
    await flush()
    expect(JSON.parse(call.mock.calls.at(-1)[1].data)).toEqual({
      activatable: true,
    })
    // removing the picture asks once more in place
    el.querySelector('[data-testid=clientes-foto-quitar]').click()
    await flush(2)
    expect(call.mock.calls.length).toBe(2)
    expect(text(el.querySelector('[data-testid=clientes-foto-quitar]'))).toBe(
      'Remove',
    )
    el.querySelector('[data-testid=clientes-foto-quitar]').click()
    await flush()
    expect(JSON.parse(call.mock.calls.at(-1)[1].data)).toEqual({ image: '' })
  })

  it('a refusal puts the switch back and says why', async () => {
    answer({
      set_customer_view: new Error('You do not have enough permissions'),
    })
    const el = await mountApp(ClientesVista, { offer: detail(), canEdit: true })
    el.querySelector('[data-testid=clientes-mostrar]').click()
    await flush()
    expect(
      el
        .querySelector('[data-testid=clientes-mostrar]')
        .getAttribute('aria-checked'),
    ).toBe('false')
    expect(el.querySelector('[role=alert]')).not.toBeNull()
  })

  it('no «activar» for a promotion without coupons, nothing to change without the right', async () => {
    const el = await mountApp(ClientesVista, {
      offer: detail(
        { coupon_based: false },
        { show: true, can_activate: false },
      ),
      canEdit: false,
    })
    expect(el.querySelector('[data-testid=clientes-activar]')).toBeNull()
    expect(el.querySelector('[data-testid=clientes-mostrar]').disabled).toBe(
      true,
    )
    expect(el.querySelector('[data-testid=clientes-foto-subir]')).toBeNull()
  })

  it('the offer sheet carries it under the promotion', async () => {
    answer({ get_offer: detail({}, { show: true }) })
    await mountApp(OfertaSheet, {
      open: true,
      offer: detail(),
      currency: 'MXN',
    })
    await flush()
    const sheet = document.querySelector('[data-testid=fidelidad-oferta-sheet]')
    expect(
      sheet.querySelector('[data-testid=fidelidad-clientes]'),
    ).not.toBeNull()
    expect(text(sheet.querySelector('[data-testid=clientes-donde]'))).toBe(
      'In the app and at the register',
    )
  })

  it('a site without the customer-app fields shows nothing about it', async () => {
    answer({ get_offer: { ...detail(), customers: null } })
    await mountApp(OfertaSheet, {
      open: true,
      offer: detail(),
      currency: 'MXN',
    })
    await flush()
    expect(
      document.querySelector('[data-testid=fidelidad-clientes]'),
    ).toBeNull()
  })

  it('the board marks a promotion customers see', async () => {
    const el = await mountApp(PromosLista, {
      offers: [
        detail({}, { show: true }),
        {
          ...detail({ name: 'Otra', title: 'Otra' }),
          customers: { show: false },
        },
      ],
      table: true,
    })
    const marks = el.querySelectorAll('[data-fidelidad-en-app]')
    expect(marks.length).toBe(1)
    expect(marks[0].getAttribute('aria-label')).toBe('In the app')
  })
})

describe('«Puntos extra» in Nueva promoción', () => {
  it('reads the sentence back', () => {
    expect(
      pointsPreview({
        value: 50,
        target: 'ticket',
        minimum: 0,
        until: 'none',
        how: 'auto',
      }),
    ).toBe('+50 points on any ticket, with no end date, at the register.')
    // no end chosen yet: the sentence does not pretend «no end date»
    expect(
      pointsPreview({
        value: 50,
        target: 'ticket',
        minimum: 0,
        until: '',
        how: 'auto',
      }),
    ).toBe('+50 points on any ticket, at the register.')
    expect(pointsPreview({ value: 0 })).toBe('')
  })

  it('creates a Loyalty Point promotion', async () => {
    answer({
      create_offer: (args) => ({
        name: 'P',
        title: 'P',
        state: 'live',
        request: args,
      }),
    })
    await mountApp(PromoSheet, { open: true, company: 'Tienda SA' })
    const sheet = document.querySelector('[data-testid=fidelidad-promo-sheet]')
    sheet.querySelector('[data-testid=promo-target-ticket]').click()
    await flush(2)
    const points = [...sheet.querySelectorAll('[role=radio]')].find(
      (b) => text(b) === 'Points',
    )
    points.click()
    await flush(2)
    expect(text(sheet)).toContain('How many bonus points?')
    sheet.querySelector('[data-testid=promo-valor-100]').click()
    const until = sheet.querySelectorAll('[data-testid^=promo-hasta-]')
    until[until.length - 1].click()
    await flush(2)
    expect(text(sheet.querySelector('[data-testid=promo-preview]'))).toBe(
      '+100 points on any ticket, with no end date, at the register.',
    )
    document.querySelector('[data-testid=promo-iniciar]').click()
    await flush()
    const [method, args] = call.mock.calls.at(-1)
    expect(method).toBe(`${API}.create_offer`)
    expect(JSON.parse(args.data)).toMatchObject({
      apply_on: 'Transaction',
      discount_type: 'Loyalty Point',
      value: 100,
      company: 'Tienda SA',
    })
  })
})

describe('the «Show to customers» toast', () => {
  it('promises customers see it only while the app shows promotions', () => {
    expect(shownToast(true, { promos: true })).toBe('Customers see it now')
    expect(shownToast(true, { promos: false })).toContain(
      'once «Promotions» is on',
    )
    expect(shownToast(true, null)).toContain('once «Promotions» is on')
    expect(shownToast(false, null)).toBe('Customers no longer see it')
  })
})
