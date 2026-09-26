import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), leave: null, update: null }))
vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (fn) => {
    api.leave = fn
  },
  onBeforeRouteUpdate: (fn) => {
    api.update = fn
  },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
import Workspace from '@/components/Offers/OfferWorkspace.vue'
import { useOfferState } from '@/components/Offers/offerState'
const draftOffer = (extra = {}) => ({
  name: 'OFFER-1',
  deal: 'DEAL-1',
  root_offer: 'OFFER-1',
  revision: 1,
  title: 'Proposal A',
  currency: 'USD',
  valid_until: '2026-10-26',
  modified: 'v1',
  status: 'Draft',
  effective_status: 'Draft',
  is_current: true,
  products: [
    {
      name: 'CHILD-1',
      product_code: 'CRM A',
      product_name: 'Service A',
      qty: 2,
      rate: 10,
      discount_percentage: 0,
      amount: 20,
      net_amount: 20,
    },
  ],
  total: 20,
  net_total: 20,
  terms: 'Original terms',
  capabilities: { can_edit: true, can_issue: true, can_export: true },
  ...extra,
})
const deal = () => ({
  name: 'DEAL-1',
  deal_name: 'Client A',
  currency: 'USD',
  products: draftOffer().products,
})
const cleanups = []
const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm')
beforeEach(() => {
  api.call.mockReset()
  // happy-dom omits browser dialogs; supply only this explicit interaction seam.
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  })
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm)
  else delete window.confirm
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(offer = draftOffer(), behavior) {
  api.call.mockImplementation((method, args) => {
    if (behavior) {
      const result = behavior(method, args)
      if (result !== undefined) return result
    }
    if (method.endsWith('get_offers'))
      return Promise.resolve({
        offers: offer ? [offer] : [],
        can_create: true,
        total: offer ? 1 : 0,
        has_more: false,
        erp_available: false,
      })
    if (method.endsWith('get_offer')) return Promise.resolve(offer)
    return Promise.resolve(offer)
  })
  const el = document.createElement('div')
  document.body.append(el)
  const shown = ref(true),
    props = reactive({ deal: deal() })
  let state
  const app = createApp({
    setup() {
      state = useOfferState()
      return () => (shown.value ? h(Workspace, { ...props, state }) : null)
    },
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, state, shown, props }
}
function button(el, label) {
  return [...el.querySelectorAll('button')].find((node) =>
    node.textContent.includes(label),
  )
}
async function click(el, label) {
  const node = button(el, label)
  expect(node, label).toBeTruthy()
  node.click()
  await flush()
}
const calls = (method) =>
  api.call.mock.calls.filter(([name]) => name.endsWith(method))
async function edit(el, value) {
  const input = el.querySelector('[data-field="title"]')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

describe('native offer lifecycle', () => {
  it('separates failed loading from a real empty list and retries', async () => {
    let failed = true
    const { el } = await mount(null, (method) =>
      method.endsWith('get_offers') && failed
        ? Promise.reject({ exc_type: 'PermissionError' })
        : undefined,
    )
    expect(el.textContent).toContain('do not have permission')
    expect(el.textContent).not.toContain('No offers yet')
    expect(button(el, 'New offer')).toBeUndefined()
    failed = false
    await click(el, 'Retry loading offers')
    expect(el.textContent).toContain('No offers yet')
    expect(button(el, 'New offer')).toBeTruthy()
  })
  it('snapshots native deal rows without child ids or computed totals and freezes uncertain save retries', async () => {
    let fail = true
    const { el, state } = await mount(null, (method) =>
      method.endsWith('save_draft')
        ? fail
          ? Promise.reject(new Error('Network unavailable'))
          : Promise.resolve(draftOffer())
        : undefined,
    )
    await click(el, 'New offer')
    state.draft.valid_until = '2026-10-26'
    await nextTick()
    await click(el, 'Save draft')
    expect(calls('save_draft')).toHaveLength(1)
    const first = JSON.parse(JSON.stringify(calls('save_draft')[0][1]))
    expect(first.values.products[0]).toEqual({
      product_code: 'CRM A',
      product_name: 'Service A',
      qty: 2,
      rate: 10,
      discount_percentage: 0,
    })
    expect(first.request_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(state.pending).toBeTruthy()
    expect(
      button(el, 'Save draft').disabled ||
        button(el, 'Save draft').closest('fieldset').disabled,
    ).toBe(true)
    expect(api.leave()).toBe(false)
    fail = false
    await click(el, 'Retry same action')
    expect(calls('save_draft')[1][1]).toEqual(first)
    expect(state.pending).toBeNull()
    expect(el.textContent).toContain('OFFER-1')
  })
  it('requires saved terms before issue and retains draft across tab unmounts', async () => {
    const { el, state, shown } = await mount()
    await click(el, 'Proposal A')
    await edit(el, 'Changed proposal')
    expect(button(el, 'Issue saved offer').disabled).toBe(true)
    shown.value = false
    await flush()
    shown.value = true
    await flush()
    expect(el.querySelector('[data-field="title"]').value).toBe(
      'Changed proposal',
    )
    expect(state.draft.title).toBe('Changed proposal')
    expect(calls('get_offers')).toHaveLength(1)
    expect(api.leave()).toBe(true)
    expect(window.confirm).toHaveBeenCalledWith(
      'Leave this unsaved offer draft?',
    )
    window.confirm.mockReturnValue(false)
    expect(api.leave()).toBe(false)
    expect(state.draft.title).toBe('Changed proposal')
  })
  it('retains stale edits and requires refresh before another save', async () => {
    let stale = true
    const { el, state } = await mount(draftOffer(), (method) =>
      method.endsWith('save_draft') && stale
        ? Promise.reject({
            exc_type: 'TimestampMismatchError',
            message: 'Changed elsewhere',
          })
        : undefined,
    )
    await click(el, 'Proposal A')
    await edit(el, 'My retained edit')
    await click(el, 'Save draft')
    expect(state.draft.title).toBe('My retained edit')
    expect(state.reviewRequired).toBe(true)
    expect(state.pending).toBeNull()
    stale = false
    await click(el, 'Refresh saved version')
    expect(state.reviewRequired).toBe(false)
    expect(state.draft.title).toBe('My retained edit')
    expect(button(el, 'Issue saved offer').disabled).toBe(true)
  })
  it('renders an accepted revision as immutable and creates an undecided revision', async () => {
    const accepted = draftOffer({
      status: 'Accepted',
      effective_status: 'Accepted',
      decision_by: 'seller@example.test',
      decision_at: '2026-09-26',
      decision_channel: 'Email',
      decision_evidence: '<script>literal evidence</script>',
      capabilities: { can_revise: true, can_export: true },
    })
    const revised = draftOffer({ name: 'OFFER-2', revision: 2 })
    const { el } = await mount(accepted, (method) =>
      method.endsWith('revise') ? Promise.resolve(revised) : undefined,
    )
    await click(el, 'Proposal A')
    expect(el.querySelector('form')).toBeNull()
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('<script>literal evidence</script>')
    await click(el, 'Create new revision')
    expect(calls('revise')[0][1]).toEqual({
      name: 'OFFER-1',
      request_id: expect.any(String),
    })
    expect(el.querySelector('[data-field="title"]')).toBeTruthy()
    expect(el.textContent).not.toContain('Decision recorded by')
  })
  it('records exact revision/channel/evidence and replays the same uncertain decision', async () => {
    const issued = draftOffer({
      status: 'Issued',
      effective_status: 'Issued',
      capabilities: { can_decide: true },
    })
    let fail = true
    const { el, state } = await mount(issued, (method) =>
      method.endsWith('record_decision')
        ? fail
          ? Promise.reject(new Error('Offline'))
          : Promise.resolve({ ...issued, status: 'Accepted', capabilities: {} })
        : undefined,
    )
    await click(el, 'Proposal A')
    await click(el, 'Record acceptance')
    expect(button(el, 'Save customer decision').disabled).toBe(true)
    state.evidence = 'Customer confirmed this revision by email'
    await nextTick()
    await click(el, 'Save customer decision')
    const first = JSON.parse(JSON.stringify(calls('record_decision')[0][1]))
    expect(first).toEqual({
      name: 'OFFER-1',
      modified: 'v1',
      decision: 'Accepted',
      channel: 'Email',
      evidence: state.evidence,
    })
    fail = false
    await click(el, 'Retry same action')
    expect(calls('record_decision')[1][1]).toEqual(first)
  })
  it('isolates the permissioned print preview from scripts', async () => {
    const { el } = await mount(draftOffer(), (method) =>
      method.endsWith('.preview')
        ? Promise.resolve({ html: '<h1>Proposal</h1>' })
        : undefined,
    )
    await click(el, 'Proposal A')
    await click(el, 'Preview / export')
    expect(calls('.preview')[0][1]).toEqual({ name: 'OFFER-1' })
    expect(el.querySelector('iframe').getAttribute('sandbox')).toBe(
      'allow-same-origin allow-modals',
    )
    expect(el.querySelector('iframe').getAttribute('srcdoc')).toBe(
      '<h1>Proposal</h1>',
    )
  })
  it('requires explicit ERP drift review and links only the resulting draft quotation', async () => {
    const accepted = draftOffer({
      status: 'Accepted',
      capabilities: { can_erp: true },
    })
    const { el, state } = await mount(accepted, (method) => {
      if (method.endsWith('preview_erp'))
        return Promise.resolve({
          available: true,
          review_hash: 'hash-1',
          currency: 'USD',
          financial_drift: true,
          grand_total: 24.04,
          net_total: 20,
          taxes: 4.04,
          rounded_total: 24,
          rounding_applied: true,
          payable_total: 24,
          total_difference: 4,
          offer_total: 20,
          items: [],
        })
      if (method.endsWith('create_erp_quotation'))
        return Promise.resolve({
          quotation: 'QUOT-1',
          offer: { ...accepted, erp_quotation: 'QUOT-1' },
        })
    })
    await click(el, 'Proposal A')
    await click(el, 'Review ERP quotation')
    expect(button(el, 'Create draft ERP quotation').disabled).toBe(true)
    expect(el.querySelector('[data-erp-payable]').textContent).toBe('USD 24.00')
    expect(el.querySelector('[data-erp-difference]').textContent).toBe(
      'USD 4.00',
    )
    expect(el.textContent).toContain('ERP taxes and charges')
    expect(el.textContent).toContain('USD 4.04')
    state.reviewNote = 'Tax difference reviewed'
    await nextTick()
    await click(el, 'Create draft ERP quotation')
    expect(calls('create_erp_quotation')[0][1]).toEqual({
      name: 'OFFER-1',
      review_hash: 'hash-1',
      review_note: 'Tax difference reviewed',
    })
    expect(el.querySelector('a[href="/app/quotation/QUOT-1"]')).toBeTruthy()
  })
  it('preserves a legitimate rounded zero and never inherits customer acceptance onto ERP terms', async () => {
    const accepted = draftOffer({
      status: 'Accepted',
      capabilities: { can_erp: true },
    })
    const { el } = await mount(accepted, (method) =>
      method.endsWith('preview_erp')
        ? Promise.resolve({
            available: true,
            review_hash: 'zero-rounded',
            currency: 'USD',
            offer_total: 0.4,
            net_total: 0.4,
            grand_total: 0.4,
            taxes: 0,
            rounded_total: 0,
            payable_total: 0,
            rounding_applied: true,
            total_difference: -0.4,
            financial_drift: true,
            items: [],
          })
        : undefined,
    )
    await click(el, 'Proposal A')
    await click(el, 'Review ERP quotation')
    expect(el.querySelector('[data-erp-payable]').textContent).toBe('USD 0.00')
    expect(el.querySelector('[data-erp-difference]').textContent).toBe(
      'USD -0.40',
    )
    expect(button(el, 'Create draft ERP quotation').disabled).toBe(true)
    expect(el.textContent).toContain(
      'ERP quotation needs its own customer approval if terms differ',
    )
  })
  it('blocks an incomplete payable preview rather than guessing its total', async () => {
    const { el } = await mount(
      draftOffer({ status: 'Accepted', capabilities: { can_erp: true } }),
      (method) =>
        method.endsWith('preview_erp')
          ? Promise.resolve({
              available: true,
              grand_total: 20,
              review_hash: 'incomplete',
            })
          : undefined,
    )
    await click(el, 'Proposal A')
    await click(el, 'Review ERP quotation')
    expect(el.textContent).toContain('ERP preview is incomplete')
    expect(button(el, 'Create draft ERP quotation')).toBeUndefined()
  })
  it('blocks a second mutation while the first request is in flight', async () => {
    let resolve
    const { el, state } = await mount(null, (method) =>
      method.endsWith('save_draft')
        ? new Promise((done) => {
            resolve = done
          })
        : undefined,
    )
    await click(el, 'New offer')
    state.draft.valid_until = '2026-10-26'
    await nextTick()
    button(el, 'Save draft').click()
    button(el, 'Save draft').click()
    await flush()
    expect(calls('save_draft')).toHaveLength(1)
    resolve(draftOffer())
    await flush()
  })
})
