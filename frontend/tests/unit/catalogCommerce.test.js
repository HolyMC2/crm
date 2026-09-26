import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))
vi.mock('@/components/Controls/Link.vue', () => ({
  __esModule: true,
  default: {
    props: ['modelValue', 'doctype', 'label', 'disabled', 'filters'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('label', [
          props.label,
          h('input', {
            value: props.modelValue,
            disabled: props.disabled,
            'data-doctype': props.doctype,
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
        ])
    },
  },
}))
import Commerce from '@/components/Inbox/CatalogCommerce.vue'
import Picker from '@/components/Inbox/CatalogProductPicker.vue'
import Review from '@/components/Inbox/CatalogCartReview.vue'
const actor = 'seller@example.test'
const conversation = () => ({
  name: 'conv-1',
  provider: 'WhatsApp',
  generation: 3,
  control_state: 'Human',
  human_owner: actor,
  send_available: true,
})
const context = () => ({
  available: true,
  catalog_id: 'catalog-1',
  account_name: 'Sucursal A',
  company: 'Empresa A',
  warehouse: 'Almacén A',
  capabilities: { catalog_message: true, product: true, product_list: true },
  carts: [],
})
const cart = () => ({
  name: 'cart-1',
  catalog_id: 'catalog-1',
  buyer_note: '<b>Nota original</b>',
  creation: '2026-09-26',
  lines: [
    {
      index: 0,
      item_code: 'ITEM-A',
      requested_quantity: '2',
      requested_price: '10.00',
      requested_currency: 'MXN',
    },
  ],
  line_count: 1,
})
const reviewed = () => ({
  review_token: 'review-1',
  currency: 'MXN',
  price_list: 'Venta',
  total: 24,
  can_create: true,
  issues: [],
  lines: [
    {
      index: 0,
      item_code: 'ITEM-A',
      item_name: 'Artículo A',
      requested_quantity: '2',
      requested_price: '10.00',
      requested_currency: 'MXN',
      quantity: 2,
      rate: 12,
      available_qty: 8,
      issues: ['price_changed'],
    },
  ],
})
const cleanups = []
beforeEach(() => {
  api.call.mockReset()
})
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function flush() {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component, values) {
  const props = reactive(values),
    el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, props }
}
async function input(el, value) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function submit(el) {
  const form = el.querySelector('form')
  if (form)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  else button(el, 'Revisar precios').click()
  await flush()
}

function button(el, text) {
  return [...el.querySelectorAll('button')].find((b) =>
    b.textContent.includes(text),
  )
}
function calls(method) {
  return api.call.mock.calls.filter(([m]) => m.endsWith(method))
}

describe('catalog context and conversation authority', () => {
  it('explains a missing optional adapter without offering send or order creation', async () => {
    api.call.mockResolvedValue({
      available: false,
      reason_code: 'adapter_unavailable',
      capabilities: {},
      carts: [],
    })
    const { el } = await mount(Commerce, {
      conversation: conversation(),
      actor,
    })
    expect(el.textContent).toContain('no está instalado o no está disponible')
    expect(button(el, 'Compartir catálogo')).toBeUndefined()
    expect(el.querySelector('form')).toBeNull()
  })
  it('shows received carts before opening one and keeps Facebook capabilities separate', async () => {
    api.call.mockResolvedValue({
      ...context(),
      carts: [{ name: 'cart-1', line_count: 2, state: 'Pending' }],
    })
    const { el } = await mount(Commerce, {
      conversation: conversation(),
      actor,
    })
    expect(el.textContent).toContain('Carritos recibidos')
    expect(el.textContent).toContain('cart-1 · 2 líneas')
    expect(el.textContent).toContain(
      'Facebook Shop y Marketplace tienen capacidades independientes',
    )
    expect(calls('get_cart')).toHaveLength(0)
  })
  it('ignores a late context response after switching conversation', async () => {
    let old
    api.call.mockImplementation((method, args) =>
      args.conversation === 'conv-1'
        ? new Promise((resolve) => {
            old = resolve
          })
        : Promise.resolve({ ...context(), account_name: 'Sucursal B' }),
    )
    const { el, props } = await mount(Commerce, {
      conversation: conversation(),
      actor,
    })
    props.conversation = { ...conversation(), name: 'conv-2' }
    await flush()
    old({ ...context(), account_name: 'Sucursal A' })
    await flush()
    expect(el.textContent).toContain('Sucursal B')
    expect(el.textContent).not.toContain('Sucursal A')
  })
  it('does not describe a failed context request as an empty cart list and supports retry', async () => {
    api.call
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(context())
    const { el } = await mount(Commerce, {
      conversation: conversation(),
      actor,
    })
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    expect(el.textContent).not.toContain('Todavía no hay carritos')
    button(el, 'Actualizar catálogo').click()
    await flush()
    expect(el.textContent).toContain('Todavía no hay carritos')
  })
  it('keeps a catalog draft when closing and reopening the selector', async () => {
    api.call.mockResolvedValue(context())
    const { el } = await mount(Commerce, {
      conversation: conversation(),
      actor,
    })
    button(el, 'Compartir catálogo').click()
    await flush()
    await input(el.querySelector('textarea'), 'Conservar este borrador')
    button(el, 'Cerrar selector').click()
    await flush()
    button(el, 'Compartir catálogo').click()
    await flush()
    expect(el.querySelector('textarea').value).toBe('Conservar este borrador')
  })
})

describe('catalog native send', () => {
  it('keeps the frozen UUID, generation and text across ambiguous responses', async () => {
    api.call
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ name: 'intent-1', state: 'Queued' })
    const pending = vi.fn(),
      queued = vi.fn()
    const { el, props } = await mount(Picker, {
      conversation: conversation(),
      context: context(),
      eligible: true,
      onPending: pending,
      onQueued: queued,
    })
    await input(el.querySelector('textarea'), 'Mira nuestro catálogo')
    await submit(el)
    const original = structuredClone(calls('queue_catalog')[0][1])
    expect(original).toMatchObject({
      conversation: 'conv-1',
      expected_generation: 3,
      kind: 'catalog_message',
      products: [],
      body: 'Mira nuestro catálogo',
    })
    expect(pending).toHaveBeenLastCalledWith(true)
    expect(el.querySelector('textarea').disabled).toBe(true)
    props.conversation.generation = 4
    props.eligible = false
    await submit(el)
    expect(button(el, 'Comprobar solicitud')).toBeDefined()
    await submit(el)
    expect(calls('queue_catalog').map(([, args]) => args)).toEqual([
      original,
      original,
      original,
    ])
    expect(queued).toHaveBeenCalledWith({ name: 'intent-1', state: 'Queued' })
    expect(pending).toHaveBeenLastCalledWith(false)
    expect(
      api.call.mock.calls.every(
        ([method]) => method === 'crm.api.catalog_commerce.queue_catalog',
      ),
    ).toBe(true)
  })
  it('uses selected canonical item codes and requires one item for product messages', async () => {
    api.call.mockImplementation(async (method) =>
      method.endsWith('get_products')
        ? {
            items: [
              {
                item_code: 'ITEM CON ESPACIOS',
                item_name: 'Artículo A',
                rate: 12,
                currency: 'MXN',
                stock: 5,
              },
            ],
            has_more: false,
          }
        : { name: 'intent-1', state: 'Queued' },
    )
    const ctx = { ...context(), capabilities: { product: true } }
    const { el } = await mount(Picker, {
      conversation: conversation(),
      context: ctx,
      eligible: true,
    })
    expect(el.querySelector('button[type="submit"]').disabled).toBe(true)
    await input(el.querySelector('textarea'), 'Producto solicitado')
    el.querySelector('input[type="checkbox"]').click()
    await nextTick()
    await submit(el)
    expect(calls('queue_catalog')[0][1]).toMatchObject({
      kind: 'product',
      products: ['ITEM CON ESPACIOS'],
    })
  })
  it('requires list header and respects codepoint body and footer limits', async () => {
    api.call.mockResolvedValue({ items: [{ item_code: 'A' }], has_more: false })
    const { el } = await mount(Picker, {
      conversation: conversation(),
      context: { ...context(), capabilities: { product_list: true } },
      eligible: true,
    })
    el.querySelector('input[type="checkbox"]').click()
    const [header, footer] = el.querySelectorAll('input:not([type])')
    await input(el.querySelector('textarea'), '🙂'.repeat(1024))
    await submit(el)
    expect(calls('queue_catalog')).toHaveLength(0)
    expect(el.textContent).toContain('Escribe un título')
    await input(header, 'A'.repeat(61))
    expect(el.textContent).toContain('título admite hasta 60')
    await input(header, 'Selección')
    await input(footer, 'A'.repeat(61))
    expect(el.textContent).toContain('pie de mensaje admite hasta 60')
    await input(footer, '')
    expect(el.querySelector('button[type="submit"]').disabled).toBe(false)
    await input(el.querySelector('textarea'), '🙂'.repeat(1025))
    expect(el.querySelector('button[type="submit"]').disabled).toBe(true)
    await submit(el)
    expect(calls('queue_catalog')).toHaveLength(0)
  })
  it('cannot send without current human control even through a submitted form', async () => {
    const { el } = await mount(Picker, {
      conversation: conversation(),
      context: context(),
      eligible: false,
    })
    await input(el.querySelector('textarea'), 'Una respuesta válida')
    await submit(el)
    expect(calls('queue_catalog')).toHaveLength(0)
  })
  it('retains the draft but requires a fresh review after a definite denial', async () => {
    api.call.mockRejectedValue({ exc_type: 'PermissionError' })
    const refresh = vi.fn()
    const { el } = await mount(Picker, {
      conversation: conversation(),
      context: context(),
      eligible: true,
      onRefresh: refresh,
    })
    await input(el.querySelector('textarea'), 'Texto que se conserva')
    await submit(el)
    expect(el.querySelector('textarea').value).toBe('Texto que se conserva')
    expect(el.querySelector('textarea').disabled).toBe(false)
    expect(refresh).toHaveBeenCalled()
  })
})

describe('received cart review and draft order', () => {
  async function mountReview(review = reviewed()) {
    api.call.mockImplementation(async (method) => {
      if (method.endsWith('get_cart')) return cart()
      if (method.endsWith('review_cart')) return review
      throw new Error('unexpected method ' + method)
    })
    const mounted = await mount(Review, { name: 'cart-1', context: context() })
    await input(
      mounted.el.querySelector('[data-doctype="Customer"]'),
      'Cliente A',
    )
    return mounted
  }
  it('shows the original request and every blocked line without making a partial order', async () => {
    const source = cart()
    source.lines.push({
      index: 1,
      item_code: 'UNKNOWN',
      requested_quantity: '1',
      requested_price: '999',
      requested_currency: 'USD',
    })
    source.line_count = 2
    const r = reviewed()
    r.can_create = false
    r.lines.push({
      index: 1,
      item_code: 'UNKNOWN',
      quantity: 1,
      issues: ['unknown_item', 'currency_mismatch'],
    })
    api.call.mockImplementation(async (method) =>
      method.endsWith('get_cart') ? source : r,
    )
    const { el } = await mount(Review, { name: 'cart-1', context: context() })
    await input(el.querySelector('[data-doctype="Customer"]'), 'Cliente A')
    await submit(el)
    expect(
      el.querySelectorAll('[aria-label="Todas las líneas solicitadas"] > li'),
    ).toHaveLength(2)
    expect(el.textContent).toContain('2 × 10.00 MXN')
    expect(el.textContent).toContain('1 × 999 USD')
    expect(el.textContent).toContain('no está identificado')
    expect(el.textContent).toContain('No se creará un pedido parcial')
    expect(button(el, 'Crear pedido borrador').disabled).toBe(true)
    expect(calls('create_order')).toHaveLength(0)
    expect(el.querySelector('b')).toBeNull()
    expect(el.textContent).toContain('<b>Nota original</b>')
  })
  it('requires an explicit customer and invalidates a review when commercial scope changes', async () => {
    const { el } = await mountReview()
    expect(el.querySelector('[data-doctype="CRM Deal"]').value).toBe('')
    await submit(el)
    expect(calls('review_cart')[0][1]).toEqual({
      name: 'cart-1',
      customer: 'Cliente A',
      company: 'Empresa A',
      warehouse: 'Almacén A',
      deal: null,
    })
    expect(button(el, 'Crear pedido borrador').disabled).toBe(false)
    await input(el.querySelector('[data-doctype="Company"]'), 'Empresa B')
    await flush()
    expect(el.querySelector('[data-doctype="Warehouse"]').value).toBe('')
    expect(button(el, 'Crear pedido borrador')).toBeUndefined()
    expect(button(el, 'Revisar precios').disabled).toBe(true)
  })
  it('rejects an incomplete review response even if can_create is true', async () => {
    const { el } = await mountReview({ ...reviewed(), lines: [] })
    await submit(el)
    expect(el.textContent).toContain('no incluye todas las líneas originales')
    expect(button(el, 'Crear pedido borrador').disabled).toBe(true)
  })
  it('shows received lines but blocks review when the cart line count is incomplete', async () => {
    api.call.mockResolvedValue({ ...cart(), line_count: 2 })
    const { el } = await mount(Review, { name: 'cart-1', context: context() })
    await input(el.querySelector('[data-doctype="Customer"]'), 'Cliente A')
    expect(el.textContent).toContain('2 × 10.00 MXN')
    expect(el.textContent).toContain('No se pudo confirmar que llegaron todas')
    expect(button(el, 'Revisar precios').disabled).toBe(true)
    await submit(el)
    expect(calls('review_cart')).toHaveLength(0)
  })
  it('reconciles an uncertain order with the same review token and request id', async () => {
    const { el } = await mountReview()
    await submit(el)
    api.call
      .mockRejectedValueOnce(new TypeError('Lost order response'))
      .mockResolvedValueOnce({
        sales_order: 'SO-001',
        sales_order_url: '/app/sales-order/SO-001',
        replayed: true,
      })
    button(el, 'Crear pedido borrador').click()
    await flush()
    const original = structuredClone(calls('create_order')[0][1])
    expect(el.querySelector('[data-doctype="Customer"]').disabled).toBe(true)
    button(el, 'Comprobar creación').click()
    await flush()
    expect(calls('create_order').map(([, args]) => args)).toEqual([
      original,
      original,
    ])
    expect(original.review_token).toBe('review-1')
    expect(el.textContent).toContain('Pedido borrador creado: SO-001')
    expect(el.textContent).toContain('no acredita un pago')
    expect(el.querySelector('a').getAttribute('href')).toBe(
      '/app/sales-order/SO-001',
    )
  })
  it('requires a new review after the server refuses a stale token', async () => {
    const { el } = await mountReview()
    await submit(el)
    api.call.mockRejectedValueOnce({
      exc_type: 'ValidationError',
      messages: ['stale_review'],
    })
    button(el, 'Crear pedido borrador').click()
    await flush()
    expect(el.textContent).toContain('La revisión cambió o ya no es válida')
    expect(button(el, 'Crear pedido borrador')).toBeUndefined()
    expect(
      el.querySelectorAll('[aria-label="Todas las líneas solicitadas"] > li'),
    ).toHaveLength(1)
    expect(el.querySelector('[data-doctype="Customer"]').value).toBe(
      'Cliente A',
    )
  })
})
