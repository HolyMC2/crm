import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  Button: defineComponent({
    props: ['disabled', 'loading', 'icon'],
    setup:
      (p, { slots }) =>
      () =>
        h(
          'button',
          { disabled: p.disabled || p.loading },
          p.icon ? null : slots.default?.(),
        ),
  }),
  Dialog: defineComponent({
    props: ['modelValue'],
    setup:
      (p, { slots }) =>
      () =>
        p.modelValue
          ? h('div', { role: 'dialog' }, slots['body-content']?.())
          : null,
  }),
}))
vi.mock('@/composables/salesDocs', () => ({ reloadSalesSummary: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/inbox?deal=D1&doctype=CRM+Deal' }),
}))
vi.mock('@/components/doco/inbox/WorkspaceItemPicker.vue', () => ({
  default: defineComponent({ render: () => null }),
}))

import { call } from 'frappe-ui'
import { reloadSalesSummary } from '@/composables/salesDocs'
import ItemWorkspace from '@/components/doco/inbox/ItemWorkspace.vue'

let app, root
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const doc = (type, name, extra = {}) => ({
  doctype: type,
  name,
  docstatus: 0,
  date: '2026-09-09 10:30:00',
  currency: 'MXN',
  grand_total: 200,
  ...extra,
})
const workspace = (documents = []) => ({
  documents,
  customers: ['C1'],
  customer_totals: [],
  totals: [],
  can_write: true,
  can_invoice: true,
})
function mount(props = {}) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ItemWorkspace, {
    deal: 'D1',
    doctype: 'CRM Deal',
    enabled: true,
    hasTaller: false,
    ...props,
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
}
const button = (text) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text))
beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

describe('Inbox item workspace', () => {
  it('opens a repair in the same tab and other records in a new one', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('get_workspace')
        ? workspace([doc('Repair Order', 'RO-7'), doc('Payment Entry', 'PE-1')])
        : null,
    )
    mount()
    await settle()
    const link = (name) =>
      [...root.querySelectorAll('a')].find((a) => a.textContent.includes(name))
    expect(link('RO-7').getAttribute('href')).toMatch(/^\/taller\/orders\/RO-7/)
    expect(link('RO-7').hasAttribute('target')).toBe(false)
    expect(link('PE-1').getAttribute('target')).toBe('_blank')
  })

  it('shows persisted ERP lines, not a chat search grid', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('get_workspace')
        ? workspace([doc('Quotation', 'Q1')])
        : {
            name: 'Q1',
            doctype: 'Quotation',
            docstatus: 0,
            currency: 'MXN',
            total: 200,
            lines: [
              {
                name: 'L1',
                item_name: 'Batería iPhone',
                item_code: 'BAT1',
                qty: 2,
                rate: 100,
                amount: 200,
              },
            ],
          },
    )
    mount()
    await settle()
    expect(root.textContent).toContain('Batería iPhone')
    expect(root.querySelector('table')).not.toBeNull()
    expect(button('Crear orden de venta')).toBeDefined()
    expect(button('Agregar artículos')).toBeDefined()
    expect(button('Vincular documento')).toBeDefined()
    expect(root.textContent).not.toContain('Nueva reparación')
    expect(call.mock.calls.some(([method]) => method.includes('catalog'))).toBe(
      false,
    )
  })

  it('requires explicit confirmation before accepting a quotation', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('get_workspace')
        ? workspace([doc('Quotation', 'Q1')])
        : {
            name: 'Q1',
            doctype: 'Quotation',
            docstatus: 0,
            currency: 'MXN',
            total: 200,
            lines: [{ name: 'L1', item_code: 'ITEM', qty: 2, amount: 200 }],
          },
    )
    mount()
    await settle()
    button('Crear orden de venta').click()
    await settle()
    expect(root.querySelector('[role=dialog]').textContent).toContain(
      'dejará de ser editable',
    )
    expect(call.mock.calls.some(([m]) => m.endsWith('accept_quotation'))).toBe(
      false,
    )
    button('Cancelar').click()
    await settle()
    expect(root.querySelector('[role=dialog]')).toBeNull()
  })

  it('confirms a draft sales order here before it can be invoiced', async () => {
    const modified = '2026-10-05 09:00:00.000001'
    call.mockImplementation(async (method) =>
      method.endsWith('get_workspace')
        ? workspace([doc('Sales Order', 'SO1', { modified })])
        : method.endsWith('confirm_sales_order')
          ? { sales_order: 'SO1', already: false }
          : { lines: [], name: 'SO1', doctype: 'Sales Order', docstatus: 0 },
    )
    mount()
    await settle()
    expect(button('Crear factura').disabled).toBe(true)
    // no hand-off to Desk: the next step is right here
    expect(root.textContent).not.toContain('ERP')
    button('Confirm order').click()
    await settle()
    expect(call).toHaveBeenCalledWith(
      'doco_marketing.api.sales_docs.confirm_sales_order',
      expect.objectContaining({ deal: 'D1', sales_order: 'SO1', modified }),
    )
  })

  it('keeps financial APIs out of leads and disabled tenants', async () => {
    mount({ doctype: 'CRM Lead' })
    await settle()
    expect(call).not.toHaveBeenCalled()
    expect(root.textContent).toContain('Convierte este prospecto')
    app.unmount()
    root.remove()
    app = null
    mount({ enabled: false })
    await settle()
    expect(call).not.toHaveBeenCalled()
  })

  it('hands repair intake to taller only on repair tenants that can write', async () => {
    call.mockResolvedValue(workspace())
    mount({ hasTaller: true })
    await settle()
    const link = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Nueva reparación'),
    )
    const url = new URL(link.href)
    expect(url.pathname).toBe('/taller/intake')
    expect(url.searchParams.get('deal')).toBe('D1')
    expect(url.searchParams.get('return')).toMatch(/^\/crm\/inbox\?/)
    expect(
      new URL(url.searchParams.get('return'), url).searchParams.get('deal'),
    ).toBe('D1')
    expect(root.querySelector('[role="dialog"]')).toBeNull()
    app.unmount()
    root.remove()
    call.mockResolvedValue({ ...workspace(), can_write: false })
    mount({ hasTaller: true })
    await settle()
    expect(root.textContent).not.toContain('Nueva reparación')
  })

  it('reloads the workspace when the operator returns from taller', async () => {
    call.mockResolvedValue(workspace())
    mount({ hasTaller: true })
    await settle()
    const reads = () =>
      call.mock.calls.filter(([m]) => m.endsWith('get_workspace')).length
    expect(reads()).toBe(1)
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(reads()).toBe(2)
    app.unmount()
    root.remove()
    call.mockClear()
    mount({ hasTaller: false })
    await settle()
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(reads()).toBe(1)
  })

  it('does not let a late response paint a newly selected conversation', async () => {
    let resolveOld
    call.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    mount()
    await settle()
    app.unmount()
    root.remove()
    app = null
    call.mockResolvedValue(workspace())
    mount({ deal: 'D2' })
    await settle()
    resolveOld(workspace([doc('Quotation', 'OLD-PRIVATE-QUOTE')]))
    await settle()
    expect(root.textContent).not.toContain('OLD-PRIVATE-QUOTE')
    expect(reloadSalesSummary).not.toHaveBeenCalled()
  })

  it('rejects invalid quantities without calling the mutation endpoint', async () => {
    call.mockImplementation(async (method) =>
      method.endsWith('get_workspace')
        ? workspace([doc('Quotation', 'Q1')])
        : {
            name: 'Q1',
            doctype: 'Quotation',
            docstatus: 0,
            currency: 'MXN',
            total: 200,
            lines: [{ name: 'L1', item_name: 'Item', qty: 2 }],
          },
    )
    mount()
    await settle()
    const input = root.querySelector('input[type=number]')
    input.value = '-1'
    input.dispatchEvent(new Event('change'))
    await settle()
    expect(input.value).toBe('2')
    expect(
      call.mock.calls.some(([m]) => m.endsWith('update_quotation_line')),
    ).toBe(false)
  })
})
