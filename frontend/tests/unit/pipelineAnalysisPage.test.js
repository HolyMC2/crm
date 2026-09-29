import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({
  call: null,
  route: null,
  push: null,
  replace: null,
  pipelines: null,
}))
vi.mock('frappe-ui', async () => {
  const { reactive } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    createResource: () => reactive({ ...state.pipelines }),
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ push: state.push, replace: state.replace }),
}))
vi.mock('@/utils', () => ({ formatDate: (d) => d }))

import PipelineAnalysis from '@/pages/PipelineAnalysis.vue'

const FUNNEL = {
  stages: [
    { stage: 'Nuevo', status: 'Nuevo', type: 'Open', position: 1, count: 6 },
    {
      stage: 'Propuesta',
      status: 'Propuesta',
      type: 'Ongoing',
      position: 2,
      count: 2,
    },
    { stage: 'Cierre', status: 'Cierre', type: 'Won', position: 3, count: 2 },
    { stage: 'Baja', status: 'Baja', type: 'Lost', position: 4, count: 3 },
  ],
  historical_stages: [],
  unclassified_stages: [],
  total: 13,
}
const PIPELINES = [
  { name: 'P-OLD', pipeline_name: 'Viejo', archived: 1, is_default: 0 },
  { name: 'P-1', pipeline_name: 'Ventas', archived: 0, is_default: 1 },
]

let app, root
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount({ query = {}, call, pipelines = PIPELINES } = {}) {
  state.route = reactive({ path: '/pipeline-analysis', query })
  state.push = vi.fn()
  state.replace = vi.fn((to) => (state.route.query = to.query))
  state.pipelines = { data: pipelines, fetched: true }
  state.call = vi.fn(
    call ||
      ((method) =>
        Promise.resolve(
          method === 'crm.api.doc.aggregate_deal_metrics'
            ? {
                currency: 'EUR',
                stages: [{ status: 'Cierre', commercial_value: 500 }],
              }
            : FUNNEL,
        )),
  )
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(PipelineAnalysis) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await flush()
}

describe('Embudo page', () => {
  it('pins the default pipeline in the URL and loads current + previous period', async () => {
    await mount({
      query: { period: 'custom', from: '2026-03-01', to: '2026-03-10' },
    })
    expect(state.replace).toHaveBeenCalledWith({
      path: '/pipeline-analysis',
      query: {
        pipeline: 'P-1',
        period: 'custom',
        from: '2026-03-01',
        to: '2026-03-10',
      },
    })
    const funnels = state.call.mock.calls.filter(
      ([m]) => m === 'crm.api.dashboard.get_pipeline_funnel',
    )
    expect(funnels.map(([, p]) => p)).toEqual([
      {
        from_date: '2026-03-01',
        to_date: '2026-03-10',
        filters: { pipeline: 'P-1' },
      },
      {
        from_date: '2026-02-19',
        to_date: '2026-02-28',
        filters: { pipeline: 'P-1' },
      },
    ])
    const metrics = state.call.mock.calls.find(
      ([m]) => m === 'crm.api.doc.aggregate_deal_metrics',
    )[1]
    expect(metrics.filters).toEqual([
      ['creation', '>=', '2026-03-01'],
      ['creation', '<', '2026-03-11'],
      ['pipeline', '=', 'P-1'],
    ])
  })

  it('renders the ladder, marks one biggest drop and drills into Deals with the cohort', async () => {
    await mount({
      query: {
        pipeline: 'P-1',
        period: 'custom',
        from: '2026-03-01',
        to: '2026-03-10',
      },
    })
    const stages = [...root.querySelectorAll('[data-drill="stage"]')]
    expect(stages.map((b) => b.dataset.status)).toEqual(['Nuevo', 'Propuesta'])
    const biggest = root.querySelectorAll('[data-biggest]')
    expect(biggest).toHaveLength(1)
    // Nuevo: 4 of 10 move on (40 %) · Propuesta: 2 of 4 (50 %)
    expect(biggest[0].dataset.status).toBe('Nuevo')
    root.querySelector('[data-drill="drop"][data-status="Propuesta"]').click()
    expect(state.push).toHaveBeenLastCalledWith({
      path: '/deals',
      query: {
        report: 'pipeline',
        status: 'Propuesta',
        pipeline: 'P-1',
        created_from: '2026-03-01',
        created_to: '2026-03-10',
      },
    })
    root.querySelector('[data-drill="lost"][data-status="Baja"]').click()
    expect(state.push.mock.lastCall[0].query.status).toBe('Baja')
  })

  it('keeps period changes in the URL so Back restores them', async () => {
    await mount({ query: { pipeline: 'P-1', period: '90d' } })
    root.querySelector('[data-period="month"]').click()
    expect(state.push).toHaveBeenLastCalledWith({
      path: '/pipeline-analysis',
      query: { pipeline: 'P-1', period: 'month' },
    })
  })

  it('shows a skeleton while loading, then an empty state for a pipeline without deals', async () => {
    const pending = []
    await mount({
      query: { pipeline: 'P-1' },
      call: (method) =>
        method === 'crm.api.dashboard.get_pipeline_funnel'
          ? new Promise((r) => pending.push(r))
          : Promise.resolve(null),
    })
    expect(root.querySelector('[data-testid="funnel-skeleton"]')).not.toBeNull()
    pending.forEach((r) => r({ stages: [], total: 0 }))
    await flush()
    expect(root.querySelector('[data-testid="funnel-empty"]')).not.toBeNull()
  })

  it('shows an error with retry and stays count-only when amounts are denied', async () => {
    await mount({
      query: { pipeline: 'P-1' },
      call: () => Promise.reject(new Error('denied')),
    })
    expect(root.querySelector('[role="alert"]')).not.toBeNull()

    await mount({
      query: { pipeline: 'P-1' },
      call: (method) =>
        method === 'crm.api.doc.aggregate_deal_metrics'
          ? Promise.reject(new Error('amounts'))
          : Promise.resolve(FUNNEL),
    })
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.textContent).toContain('Valores no disponibles')
    expect(root.textContent).not.toContain('Valor ganado')
  })
})
