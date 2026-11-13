// Prospectos (lane ventas-parejo): the one leads list. On a desk it reads as
// the shell's list (title with its count, kinds as tabs, a table with one
// header), every lead opens the prospect record, a failed read keeps the rows,
// and several leads convert one reviewed form after another.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const state = vi.hoisted(() => ({
  call: vi.fn(),
  toast: null,
  phone: null,
  wide: null,
  addon: false,
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  state.toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return {
    Button: {
      props: ['label'],
      setup:
        (props, { attrs }) =>
        () =>
          h('button', attrs, props.label),
    },
    Dropdown: {
      setup:
        (_, { slots }) =>
        () =>
          slots.default?.(),
    },
    call: (...args) => state.call(...args),
    toast: state.toast,
  }
})
vi.mock('@/composables/breakpoint', async (importOriginal) => {
  const { ref } = await import('vue')
  state.phone = ref(false)
  return { ...(await importOriginal()), isMobile: state.phone }
})
vi.mock('@/composables/useTableWidth', async () => {
  const { ref } = await import('vue')
  state.wide = ref(true)
  return { useTableWidth: () => state.wide }
})
vi.mock('@/composables/liveList', () => ({
  useLiveList: () => ({ fresh: { value: new Set() }, mark: () => {} }),
}))
vi.mock('@/utils/crmCapabilities', () => ({
  ADDON_APP: 'doco_marketing',
  hasApp: () => state.addon,
}))
vi.mock('@/components/Modals/LeadModal.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))
vi.mock('@/components/doco/ScoreExplainPopover.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: {
      props: ['score', 'grade'],
      setup:
        (props, { slots }) =>
        () =>
          h('button', { 'data-testid': 'score' }, slots.trigger?.()),
    },
  }
})
vi.mock('@/components/Modals/ConvertToDealModal.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: {
      props: ['lead', 'modelValue'],
      emits: ['converted', 'update:modelValue', 'pending', 'failed'],
      setup:
        (props, { emit }) =>
        () =>
          props.modelValue
            ? h(
                'div',
                { 'data-testid': 'convert-form', 'data-lead': props.lead.name },
                [
                  h('button', {
                    'data-testid': 'convert-ok',
                    onClick: () => emit('converted', `DEAL-${props.lead.name}`),
                  }),
                  h('button', {
                    'data-testid': 'convert-refused',
                    onClick: () => emit('failed', 'Falta el embudo'),
                  }),
                ],
              )
            : null,
    },
  }
})

import Prospectos from '@/pages/Prospectos.vue'

const ROWS = [
  {
    kind: 'lead',
    name: 'CRM-LEAD-1',
    title: 'Karla Martínez',
    phone: '5550001234',
    source: 'web',
    source_label: 'Sitio web',
    source_raw: 'Website',
    status: 'New',
    next_action_at: null,
    modified: '2026-11-13 09:00:00',
  },
  {
    // the server's fallback to the id is no name
    kind: 'lead',
    name: 'CRM-LEAD-2',
    title: 'CRM-LEAD-2',
    phone: '6694421311',
    source: 'otro',
    source_label: 'Otro',
    source_raw: null,
    status: 'Contacted',
    modified: '2026-11-12 09:00:00',
  },
  {
    kind: 'inquiry',
    name: 'inq-1',
    title: 'Pregunta por fundas',
    source: 'facebook',
    source_label: 'Facebook',
    status: 'In Progress',
    modified: '2026-11-11 09:00:00',
  },
]
const PAGE = {
  rows: ROWS,
  has_more: true,
  counts: { lead: 2, inquiry: 1 },
  sources: [
    { key: 'web', label: 'Sitio web', count: 1 },
    { key: 'facebook', label: 'Facebook', count: 1 },
  ],
  inquiries_enabled: true,
}

let app, root, router
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount() {
  const page = { render: () => h('p', 'page') }
  router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/prospectos', name: 'Prospectos', component: Prospectos },
      { path: '/prospectos/:leadId', name: 'Prospecto', component: page },
      { path: '/inquiries', name: 'Inquiries', component: page },
    ],
  })
  router.push('/prospectos')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  globalThis.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await flush()
}
const $ = (sel) => root.querySelector(sel)
const $$ = (sel) => [...root.querySelectorAll(sel)]

afterEach(() => {
  app?.unmount()
  root?.remove()
  state.call.mockReset()
  state.toast.success.mockReset()
  state.phone.value = false
  state.wide.value = true
  state.addon = false
})

describe('Prospectos on a desk', () => {
  it('reads as the shell list: the count, the kinds as tabs, one header', async () => {
    state.call.mockResolvedValue(PAGE)
    await mount()
    expect($('h1').textContent).toContain('Prospectos')
    expect($('[data-testid=prospects-total]').textContent).toBe('3')
    const tabs = $$('[data-testid=prospects-kind] [role=radio]').map((b) =>
      b.textContent.replace(/\s+/g, ''),
    )
    expect(tabs).toEqual(['Todos3', 'Prospectos2', 'Consultas1'])
    expect($('[data-testid=prospects-columns]').textContent).toMatch(
      /Nombre.*Origen.*Estado.*Seguimiento.*Esperando/,
    )
    expect($('[data-testid=prospects-new-inquiry]')).toBeTruthy()
  })

  it('names every row in words and opens a lead on its record', async () => {
    state.call.mockResolvedValue(PAGE)
    await mount()
    const rows = $$('[data-testid=prospect-row]')
    expect(rows.map((r) => r.querySelector('span span').textContent)).toEqual([
      'Karla Martínez',
      '+52 669 442 1311',
      'Pregunta por fundas',
    ])
    // the name already is the phone: the second line does not repeat it,
    // and a lead with no source says nothing instead of «Otro»
    expect(rows[1].textContent).not.toContain('Otro')
    expect(rows[1].textContent).toContain('Contactado')
    // an inquiry reads the Consultas words
    expect(rows[2].textContent).toContain('En seguimiento')
    expect(rows[0].getAttribute('href')).toBe('/crm/prospectos/CRM-LEAD-1')
    expect(rows[2].getAttribute('href')).toContain('/crm/inquiries?name=inq-1')
    expect(root.textContent).not.toContain('CRM-LEAD-2')
  })

  it('keeps the rows when «Cargar más» fails, and retries the same page', async () => {
    state.call.mockResolvedValueOnce(PAGE)
    await mount()
    state.call.mockRejectedValueOnce(new Error('Network'))
    $('[data-testid=prospects-load-more]').click()
    await flush()
    expect($('[data-testid=prospects-error]')).toBeTruthy()
    expect($$('[data-testid=prospect-row]')).toHaveLength(3)
    state.call.mockResolvedValueOnce({
      ...PAGE,
      rows: [{ ...ROWS[0], name: 'CRM-LEAD-9', title: 'Ana' }],
      has_more: false,
    })
    $('[data-testid=prospects-error] button').click()
    await flush()
    expect(state.call.mock.calls.at(-1)[1]).toMatchObject({ start: 30 })
    expect($$('[data-testid=prospect-row]')).toHaveLength(4)
    expect($('[data-testid=prospects-error]')).toBeNull()
  })

  it('converts several leads one reviewed form after another', async () => {
    state.call.mockResolvedValue(PAGE)
    await mount()
    for (const box of $$('li input[type=checkbox]')) box.click()
    await flush()
    // an inquiry has no checkbox: it converts in Consultas
    expect($$('li input[type=checkbox]')).toHaveLength(2)
    $('[data-testid=prospects-convert]').click()
    await flush()
    expect($('[data-testid=convert-form]').dataset.lead).toBe('CRM-LEAD-1')
    $('[data-testid=convert-ok]').click()
    await flush()
    expect($('[data-testid=convert-form]').dataset.lead).toBe('CRM-LEAD-2')
    $('[data-testid=convert-ok]').click()
    await flush()
    expect($('[data-testid=convert-form]')).toBeNull()
    expect(state.toast.success).toHaveBeenCalledWith('Se crearon 2 tratos.')
  })

  it('keeps a refused form open, with its reason and what was filled in', async () => {
    state.call.mockResolvedValue(PAGE)
    await mount()
    $$('li input[type=checkbox]')[0].click()
    await flush()
    $('[data-testid=prospects-convert]').click()
    await flush()
    $('[data-testid=convert-refused]').click()
    await flush()
    expect($('[data-testid=convert-form]').dataset.lead).toBe('CRM-LEAD-1')
    expect(state.toast.success).not.toHaveBeenCalled()
  })

  it('shows the score where the shop scores its leads', async () => {
    state.addon = true
    state.call.mockImplementation(async (method) =>
      method === 'frappe.client.get_list'
        ? [{ name: 'CRM-LEAD-1', lead_score: 82, score_grade: 'A' }]
        : PAGE,
    )
    await mount()
    expect($('[data-testid=prospects-columns]').textContent).toContain(
      'Puntaje',
    )
    expect($$('[data-testid=prospect-row]')[0].textContent).toContain('82')
  })
})

describe('Prospectos on a phone', () => {
  it('keeps the rows and opens the same record', async () => {
    state.phone.value = true
    state.call.mockResolvedValue(PAGE)
    await mount()
    const rows = $$('[data-testid=prospect-row]')
    expect(rows).toHaveLength(3)
    expect(rows[0].getAttribute('href')).toBe('/crm/prospectos/CRM-LEAD-1')
    expect($('[data-testid=prospects-columns]')).toBeNull()
  })
})
