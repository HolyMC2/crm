import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  open: vi.fn(),
  snooze: vi.fn(),
  changed: null,
  resources: [],
  reload: vi.fn(),
  hasTaller: { value: false },
}))
vi.mock('frappe-ui', () => ({
  call: mocks.call,
  createResource: () => mocks.resources.shift(),
  toast: { success: vi.fn() },
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ getUser: () => ({ full_name: 'Ana' }) }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({ getDealStatus: () => ({ type: 'Open' }) }),
}))
vi.mock('@/composables/useNextStep', async () => {
  const { shallowRef } = await import('vue')
  return {
    nextStepChanged: (mocks.changed = shallowRef(null)),
    openNextStep: mocks.open,
    snoozeNextStep: mocks.snooze,
  }
})
vi.mock('@/composables/inbox', () => ({
  hasTaller: mocks.hasTaller,
  salesDocsEnabled: { value: false },
  reloadQueue: mocks.reload,
}))
vi.mock('@/composables/salesDocs', () => ({ reloadSalesSummary: vi.fn() }))
vi.mock('@/components/doco/NextActivityChip.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/doco/inbox/DealConversations.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@/components/ventas/DealCommercialDocs.vue', () => ({
  default: { template: '<div />' },
}))
import DealOverview from '@/components/doco/inbox/DealOverview.vue'

const cleanup = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
})
async function mount(doc = {}, repairs = [], amounts = null) {
  const record = reactive({
    data: { deal_owner: 'ana@example.invalid', ...doc },
    fetch: vi.fn(),
    loading: false,
  })
  mocks.resources = [
    record,
    reactive({ data: repairs, fetch: vi.fn() }),
    // crm.pipeline.api.get_deal_amounts (metric contract v2)
    reactive({ data: amounts, fetch: vi.fn() }),
  ]
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(DealOverview, { name: 'DEAL-42' })
  app.config.globalProperties.__ = (s) => s
  app.mount(el)
  cleanup.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  return {
    el,
    record,
    button: (label) =>
      [...el.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === label,
      ),
  }
}
describe('deal overview value (metric contract v2)', () => {
  it('shows the contract value and its weighted forecast, not the raw field', async () => {
    const ui = await mount({ expected_deal_value: 0, currency: 'MXN' }, [], {
      deals: {
        'DEAL-42': {
          currency: 'MXN',
          commercial_value: 1800,
          weighted_forecast: 900,
          open: true,
          outlier: false,
        },
      },
    })
    expect(ui.el.textContent).toContain('1,800')
    expect(ui.el.textContent).toContain('Pronóstico ponderado')
    expect(ui.el.textContent).not.toContain('Sin estimar')
  })
  it('marks an outlier instead of passing it off as a normal value', async () => {
    const ui = await mount({ expected_deal_value: 100000000 }, [], {
      deals: {
        'DEAL-42': {
          currency: 'MXN',
          commercial_value: null,
          size: 100000000,
          open: true,
          outlier: true,
        },
      },
    })
    expect(ui.el.textContent).toContain('⚠')
    expect(ui.el.textContent).not.toContain('Pronóstico ponderado')
  })
})
describe('deal overview follow-up workflow', () => {
  const press = (ui, label) =>
    [...ui.el.querySelectorAll('button')]
      .find((b) => b.textContent.trim().startsWith(label))
      .click()

  it('schedules through the next-step dialog, keys shown on the buttons', async () => {
    const ui = await mount()
    expect(ui.el.textContent).toContain('Sin seguimiento programado')
    press(ui, 'Programar seguimiento')
    expect(mocks.open).toHaveBeenCalledWith({
      deal: 'DEAL-42',
      mode: 'schedule',
    })
    const keys = [...ui.el.querySelectorAll('[aria-keyshortcuts]')].map((b) =>
      b.getAttribute('aria-keyshortcuts'),
    )
    expect(keys).toEqual(['p', 'n'])
  })

  it('done asks for the next step; snooze runs once at a time', async () => {
    let finish
    mocks.snooze.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    const ui = await mount({
      next_activity_task: 'TASK-9',
      next_activity_title: 'Confirmar presupuesto',
    })
    press(ui, 'Marcar como hecha')
    expect(mocks.open).toHaveBeenCalledWith({
      deal: 'DEAL-42',
      mode: 'complete',
    })
    press(ui, 'Snooze one day')
    press(ui, 'Snooze one day')
    expect(mocks.snooze).toHaveBeenCalledTimes(1)
    expect(mocks.snooze).toHaveBeenCalledWith('DEAL-42')
    finish()
  })

  it('reloads the card and the queue when this deal’s step is saved anywhere', async () => {
    const ui = await mount()
    ui.record.fetch.mockClear()
    mocks.changed.value = { deal: 'OTHER', state: {} }
    await nextTick()
    expect(ui.record.fetch).not.toHaveBeenCalled()
    mocks.changed.value = { deal: 'DEAL-42', state: {} }
    await nextTick()
    expect(ui.record.fetch).toHaveBeenCalled()
    expect(mocks.reload).toHaveBeenCalled()
  })
})

describe('deal overview stage', () => {
  const identity = globalThis.__
  afterEach(() => {
    globalThis.__ = identity
    delete window.translated_doctypes
  })
  it('names a standard stage in Spanish and a tenant stage as written', async () => {
    window.translated_doctypes = ['CRM Deal Status']
    globalThis.__ = (text) =>
      ({ 'Proposal/Quotation': 'Propuesta/Cotización' })[text] || text
    let ui = await mount({ status: 'Proposal/Quotation' })
    expect(ui.el.textContent).toContain('Propuesta/Cotización')
    expect(ui.el.textContent).not.toContain('Proposal/Quotation')
    cleanup.splice(0).forEach((fn) => fn())
    ui = await mount({ status: 'Esperando Recepción' })
    expect(ui.el.textContent).toContain('Esperando Recepción')
  })
})

describe('deal overview repair links', () => {
  afterEach(() => {
    mocks.hasTaller.value = false
    window.history.replaceState(null, '', '/')
  })
  it('returns to the Deal on screen, not the one the inbox URL first named', async () => {
    mocks.hasTaller.value = true
    // Entered with ?deal=DEAL-1, then DEAL-42 was selected in memory.
    window.history.replaceState(
      null,
      '',
      '/crm/inbox?deal=DEAL-1&doctype=CRM%20Deal&stage=Abierto',
    )
    const ui = await mount({ deal_name: 'Ana' }, [
      { name: 'RO-7', status: 'Recibido' },
    ])
    const href = new URL(
      ui.el
        .querySelector('a[href^="/taller/orders/RO-7"]')
        .getAttribute('href'),
      'https://x.invalid',
    )
    const back = new URL(
      href.searchParams.get('crm_return_to'),
      'https://x.invalid',
    )
    expect(back.pathname).toBe('/crm/inbox')
    expect(back.searchParams.get('deal')).toBe('DEAL-42')
    expect(back.searchParams.get('stage')).toBe('Abierto')
    expect(href.searchParams.has('return_to')).toBe(false)
  })
})
