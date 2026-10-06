import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, isRef, nextTick, ref } from 'vue'

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('frappe-ui', () => ({
  toast: mocks.toast,
  Badge: {
    props: ['label'],
    render() {
      return h('span', this.label)
    },
  },
  Button: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    render() {
      return h(
        'button',
        { disabled: this.disabled, onClick: () => this.$emit('click') },
        this.label,
      )
    },
  },
  Dialog: { render: () => null },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/ventas/deal/D-1?tab=overview' }),
}))
import CommercialDocsPanel from '@/components/ventas/CommercialDocsPanel.vue'
import { normalizeCommercialDocs } from '@/utils/ventasDocs'

const CAPS = {
  can_write: true,
  can_confirm_order: true,
  can_invoice: false,
  can_issue_invoice: true,
  has_pos: true,
}
const payload = (caps = CAPS) => ({
  quotations: [],
  sales_orders: [
    {
      name: 'SO-1',
      docstatus: 0,
      status: 'Draft',
      grand_total: 300,
      currency: 'MXN',
      modified: '2026-10-05 09:00:00.000001',
    },
    {
      name: 'SO-2',
      docstatus: 1,
      status: 'To Deliver and Bill',
      grand_total: 100,
      currency: 'MXN',
      per_billed: 0,
    },
  ],
  invoices: [],
  payments: [],
  rollup: { invoiced: 0, paid: 0, outstanding: 0, currency: 'MXN' },
  capabilities: caps,
})

const cleanup = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
})
async function mount(source, model = normalizeCommercialDocs(payload())) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const current = isRef(model) ? model : ref(model)
  // a wrapper keeps the model reactive, as the real hosts' computed is
  const app = createApp({
    render: () =>
      h(CommercialDocsPanel, {
        scope: 'deal',
        model: current.value,
        scopeLabel: 'D-1',
        source,
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanup.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  const button = (label) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label,
    )
  return { el, button }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('commercial docs panel', () => {
  it('shows smart counters and one primary step per document', async () => {
    const source = { reload: vi.fn(), act: vi.fn(), render: vi.fn() }
    const ui = await mount(source)
    expect(ui.el.textContent).toContain('Orders')
    expect(ui.button('Confirm order')).toBeTruthy()
    // the invoice step is visible but explains the missing right
    const invoice = ui.button('Create invoice')
    expect(invoice.disabled).toBe(true)
    expect(ui.el.textContent).toContain('Your role cannot create invoices.')
    expect(ui.button('Copy access request')).toBeTruthy()
  })

  it('confirms through the source with the version and a stable request id', async () => {
    const source = {
      reload: vi.fn(),
      act: vi
        .fn()
        .mockRejectedValueOnce({
          exc_type: 'ValidationError',
          messages: ['Falta la fecha de entrega'],
        })
        .mockResolvedValueOnce({ sales_order: 'SO-1', already: false }),
      render: vi.fn(),
    }
    const ui = await mount(source)
    ui.button('Confirm order').click()
    await flush()
    await nextTick()
    // native validation is shown with its own words and a way forward
    expect(ui.el.textContent).toContain('Falta la fecha de entrega')
    expect(ui.button('View document')).toBeTruthy()
    ui.button('Corrected: try again').click()
    await flush()
    await flush()
    const [first, second] = source.act.mock.calls
    expect(first[0]).toBe('confirm_sales_order')
    expect(first[1]).toMatchObject({
      name: 'SO-1',
      modified: '2026-10-05 09:00:00.000001',
    })
    // a retry replays the same request id, so the server cannot act twice
    expect(second[2]).toBe(first[2])
    expect(source.reload).toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalled()
  })

  it('turns a version conflict into «see current version»', async () => {
    const source = {
      reload: vi.fn(),
      act: vi.fn().mockRejectedValue({ exc_type: 'TimestampMismatchError' }),
      render: vi.fn(),
    }
    const ui = await mount(source)
    ui.button('Confirm order').click()
    await flush()
    await nextTick()
    ui.button('See current version').click()
    expect(source.reload).toHaveBeenCalled()
  })

  it('renders load errors with a retry, never a blank panel', async () => {
    const source = { reload: vi.fn(), act: vi.fn(), render: vi.fn() }
    const el = document.createElement('div')
    const app = createApp(CommercialDocsPanel, {
      scope: 'contact',
      model: null,
      error: 'Sin acceso',
      source,
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    cleanup.push(() => app.unmount())
    await nextTick()
    expect(el.textContent).toContain('Sin acceso')
    ;[...el.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Try loading again'))
      .click()
    expect(source.reload).toHaveBeenCalled()
  })

  it('a native guard links to the correction, then retries the current version', async () => {
    const fresh = payload()
    fresh.sales_orders[0].modified = '2026-10-05 10:00:00.000002'
    const model = ref(normalizeCommercialDocs(payload()))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    cleanup.push(() => open.mockRestore())
    const source = {
      reload: vi.fn(async () => {
        model.value = normalizeCommercialDocs(fresh)
      }),
      act: vi
        .fn()
        .mockRejectedValueOnce({
          exc_type: 'ValidationError',
          messages: ['Falta la fecha de entrega'],
        })
        .mockResolvedValueOnce({ sales_order: 'SO-1', already: false }),
      render: vi.fn(),
    }
    const ui = await mount(source, model)
    ui.button('Confirm order').click()
    await flush()
    await nextTick()
    // the guard names the requirement and opens the order to fix it
    expect(ui.el.textContent).toContain('Falta la fecha de entrega')
    ui.button('Correct the order').click()
    expect(open).toHaveBeenCalledWith(
      '/app/sales-order/SO-1',
      '_blank',
      'noopener',
    )
    expect(ui.button('Ask for the correction')).toBeTruthy()
    // after the fix: reload, then act on the CURRENT version
    ui.button('Corrected: try again').click()
    await flush()
    await flush()
    expect(source.reload).toHaveBeenCalled()
    expect(source.act.mock.calls[1][1].modified).toBe(
      '2026-10-05 10:00:00.000002',
    )
    expect(mocks.toast.success).toHaveBeenCalled()
  })

  it('resumes a held order with a reason, through the source', async () => {
    const held = payload()
    held.sales_orders[1].status = 'On Hold'
    const source = {
      reload: vi.fn(),
      act: vi.fn().mockResolvedValue({ sales_order: 'SO-2', already: false }),
      render: vi.fn(),
    }
    const ui = await mount(source, normalizeCommercialDocs(held))
    ui.button('Resume order').click()
    await nextTick()
    const input = ui.el.querySelector('[data-testid="action-reason"]')
    input.value = 'El cliente pagó'
    input.dispatchEvent(new Event('input'))
    ui.button('Resume').click()
    await flush()
    expect(source.act).toHaveBeenCalledWith(
      'reopen_sales_order',
      expect.objectContaining({ name: 'SO-2' }),
      expect.any(String),
      { reason: 'El cliente pagó' },
    )
    expect(source.reload).toHaveBeenCalled()
  })

  it('collection explains the register step and copies the folio before leaving', async () => {
    const unpaid = payload()
    unpaid.invoices = [
      {
        doctype: 'Sales Invoice',
        name: 'SI-7',
        docstatus: 1,
        status: 'Unpaid',
        grand_total: 50,
        outstanding_amount: 50,
        currency: 'MXN',
        customer: 'Ana',
      },
    ]
    const assign = vi.fn()
    const location = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...location, assign },
    })
    cleanup.push(() =>
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
      }),
    )
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const source = { reload: vi.fn(), act: vi.fn(), render: vi.fn() }
    const ui = await mount(source, normalizeCommercialDocs(unpaid))
    ui.button('Collect at the register').click()
    await nextTick()
    // nothing leaves the page before the worker reads which invoice to pick
    expect(assign).not.toHaveBeenCalled()
    expect(ui.el.textContent).toContain('SI-7')
    ui.button('Copy invoice number and open the register').click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('SI-7')
    expect(assign.mock.calls[0][0]).toContain('/posapp/payments?')
  })
})
