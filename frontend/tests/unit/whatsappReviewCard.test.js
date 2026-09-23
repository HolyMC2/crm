import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
const session = vi.hoisted(() => ({ manager: true }))
vi.mock('frappe-ui', () => ({
  Avatar: defineComponent({
    props: ['label', 'size'],
    setup: (p) => () => h('span', { 'data-avatar': p.label }),
  }),
  FeatherIcon: defineComponent({
    props: ['name'],
    setup: (p) => () => h('i', { 'data-icon': p.name }),
  }),
  call: (...args) => {
    api.calls.push(args)
    return api.behavior(...args)
  },
  toast: { success() {}, error() {} },
}))
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: ['to'],
    setup:
      (p, { slots }) =>
      () =>
        h('a', { 'data-route': JSON.stringify(p.to) }, slots.default?.()),
  }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => session.manager }),
}))
import WhatsAppReviewCard from '@/components/doco/WhatsAppReviewCard.vue'

const mounted = []
function mount(props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(WhatsAppReviewCard, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  mounted.push({ app, el })
  return el
}
afterEach(() => {
  mounted.splice(0).forEach(({ app, el }) => {
    app.unmount()
    el.remove()
  })
})
beforeEach(() => {
  api.calls = []
  session.manager = true
})

const dealRow = (extra = {}) => ({
  name: 'hh59vh33oi',
  status: 'Pendiente',
  to: '5215555550000',
  template: 'equipo_listo-',
  template_label: 'equipo_listo',
  auto: 0,
  source: 'taller.tracker_notify:Listo para Entregar',
  reference_doctype: 'CRM Deal',
  reference_name: 'CRM-DEAL-2026-00968',
  preview: '¡Buenas noticias, Test! Tu celular ya está listo.',
  creation: '2026-09-08 12:00:00',
  context: {
    kind: 'CRM Deal',
    customer_name: 'Test Orders',
    customer_phone: '+5215555550000',
    device: 'Realme C63',
    repair_type: 'Quitar Virus',
    title: 'Realme C63 — Test Orders',
    status: 'Aprobado',
    owner_name: 'Ana Vendedora',
    repair_order: 'RO-00838',
    repair_status: 'Listo para Entregar',
  },
  ...extra,
})

describe('WhatsAppReviewCard', () => {
  it('leads with who the message is for and what it is about, linked to the deal', () => {
    const el = mount({ row: dealRow() })
    const text = el.textContent
    expect(el.querySelector('[data-avatar]').dataset.avatar).toBe('Test Orders')
    const nameLink = [...el.querySelectorAll('a[data-route]')].find(
      (a) => a.textContent.trim() === 'Test Orders',
    )
    expect(JSON.parse(nameLink.dataset.route)).toEqual({
      name: 'Deal 360',
      params: { dealId: 'CRM-DEAL-2026-00968' },
    })
    expect(text).toContain('+521 555 555 0000')
    expect(text).toContain('Quitar Virus · Realme C63')
    const ro = el.querySelector('a[href="/app/repair-order/RO-00838"]')
    expect(ro.textContent).toContain('Listo para Entregar')
    expect(text).toContain('Trato CRM-DEAL-2026-00968 · Aprobado')
    expect(text).toContain('Ana Vendedora')
    expect(text).toContain('equipo_listo')
    expect(text).toContain('Pendiente')
    expect(text).toContain('Abrir trato')
    expect(
      [...el.querySelectorAll('button')].map((b) => b.textContent.trim()),
    ).toEqual(
      expect.arrayContaining(['Editar variables', 'Enviar', 'Cancelar']),
    )
  })

  it('hides the identity header inside a conversation but keeps status, age and actions', () => {
    const el = mount({ row: dealRow(), showContext: false })
    expect(el.querySelector('[data-avatar]')).toBeNull()
    expect(el.textContent).not.toContain('Abrir trato')
    expect(el.textContent).toContain('Pendiente')
    expect(el.querySelector('a[href="/app/repair-order/RO-00838"]')).toBeNull()
    expect(
      [...el.querySelectorAll('button')].map((b) => b.textContent.trim()),
    ).toContain('Enviar')
  })

  it('shows no customer-facing actions to a non-manager', () => {
    session.manager = false
    const el = mount({ row: dealRow() })
    expect(el.querySelectorAll('button').length).toBe(0)
    expect(el.textContent).toContain('Test Orders')
  })

  it('renders an order-referenced row without a deal chip or SPA link', () => {
    const el = mount({
      row: dealRow({
        reference_doctype: 'Repair Order',
        reference_name: 'RO-01041',
        context: {
          kind: 'Repair Order',
          customer_name: 'Test Warranty',
          repair_order: 'RO-01041',
          repair_status: 'Entregado',
          device: 'TWIP DEV',
        },
      }),
    })
    expect(el.querySelector('a[data-route]')).toBeNull()
    expect(
      el.querySelector('a[href="/app/repair-order/RO-01041"]').textContent,
    ).toContain('Entregado')
    expect(el.textContent).not.toContain('Trato ')
    expect(el.textContent).toContain('TWIP DEV')
  })

  it('names the contact behind the number when the reference is gone, without linking the dead reference', () => {
    const el = mount({
      row: dealRow({
        reference_doctype: 'Repair Order',
        reference_name: 'RO-09999',
        context: {
          kind: 'Repair Order',
          customer_name: 'Pablo Hernández',
          customer_phone: '6951131449',
          contact: 'Pablo Hernández',
        },
      }),
    })
    const nameLink = [...el.querySelectorAll('a[data-route]')].find(
      (a) => a.textContent.trim() === 'Pablo Hernández',
    )
    expect(JSON.parse(nameLink.dataset.route)).toEqual({
      name: 'Contact',
      params: { contactId: 'Pablo Hernández' },
    })
    expect(el.textContent).toContain('695 113 1449')
    expect(el.textContent).toContain('Abrir contacto')
    expect(el.querySelector('a[href*="/app/repair-order/"]')).toBeNull()
  })

  it('falls back to the raw recipient and a placeholder when nothing resolved', () => {
    const el = mount({
      row: dealRow({ context: { kind: 'CRM Deal' }, template_label: null }),
    })
    expect(el.textContent).toContain('Sin nombre')
    expect(el.textContent).toContain('+521 555 555 0000')
    expect(el.textContent).toContain('equipo_listo-')
  })

  it('sends the edited variables with the approval and emits changed', async () => {
    api.behavior = async (method) => {
      if (method.endsWith('get_row_template_vars')) {
        return {
          variables: [
            { index: 1, placeholder: '{{1}}', value: 'Test', field: '' },
          ],
          reference_doctype: 'CRM Deal',
          reference_name: 'CRM-DEAL-2026-00968',
        }
      }
      if (method.endsWith('get_template_field_options')) return []
      return {}
    }
    const el = mount({ row: dealRow() })
    const buttons = () => [...el.querySelectorAll('button')]
    buttons()
      .find((b) => b.textContent.trim() === 'Editar variables')
      .click()
    await Promise.resolve()
    await nextTick()
    await Promise.resolve()
    await nextTick()
    const field = el.querySelector('input[type="text"]')
    field.value = 'Pablo'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    buttons()
      .find((b) => b.textContent.trim() === 'Enviar')
      .click()
    await Promise.resolve()
    await nextTick()
    await Promise.resolve()
    const approve = api.calls.find(([m]) => m.endsWith('.approve'))
    expect(approve[1]).toEqual({
      name: 'hh59vh33oi',
      body_param: { 1: 'Pablo' },
    })
  })
})
