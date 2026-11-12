// The assistant's buy plan on its page (CompraPlan): which lines a filter
// shows, what a −/+ sends, and what the worker reads on a line.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  changesOf,
  filterCounts,
  movedText,
  planScope,
  priceSourceText,
  removals,
  shownLines,
  stockState,
  yearChips,
} from '@/utils/surtidoPlan'

const LINES = [
  { line: 'm:a58', model: 'OPPO A58 4G', stock: 7, moved: 6, qty: 6 },
  { line: 'm:a05', model: 'SM A05 ORI', stock: 2, moved: 4, qty: 4 },
  { line: 'm:edge', model: 'Moto Edge 50 Fusion', stock: 0, moved: 2, qty: 2 },
]

describe('surtidoPlan helpers', () => {
  it('sorts a line by what is left against what the period used', () => {
    expect(LINES.map(stockState)).toEqual(['alcanzan', 'pocas', 'agotadas'])
    expect(filterCounts(LINES)).toEqual({
      todas: 3,
      agotadas: 1,
      pocas: 1,
      alcanzan: 1,
    })
    expect(shownLines(LINES, 'agotadas').map((l) => l.line)).toEqual(['m:edge'])
    expect(shownLines(LINES, 'todas')).toHaveLength(3)
  })

  it('sends pieces per line, a line at 0 removed, in batches the server takes', () => {
    expect(changesOf({ 'm:a58': 2, 'm:a05': 0 })).toEqual([
      [
        { op: 'qty', line: 'm:a58', qty: 2 },
        { op: 'remove', line: 'm:a05' },
      ],
    ])
    const many = Object.fromEntries(
      Array.from({ length: 45 }, (_, i) => [`m:${i}`, 0]),
    )
    expect(changesOf(many).map((b) => b.length)).toEqual([40, 5])
    expect(removals(LINES.slice(0, 1))).toEqual({ 'm:a58': 0 })
  })

  it('offers every year, then the last six, four and two', () => {
    expect(yearChips(new Date(2026, 10, 12))).toEqual([0, 2020, 2022, 2024])
  })

  it('says installed for a repairs plan and where the price came from', () => {
    expect(movedText({ moved: 6, moved_kind: 'installed' })).toBe('Used 6')
    expect(movedText({ moved: 6, moved_kind: 'sold' })).toBe('Sold 6')
    expect(priceSourceText({ price_source: 'compra' })).toBe('last purchase')
    expect(priceSourceText({ price_source: '' })).toBe('')
    expect(
      planScope({
        supplier: 'Perfeccel',
        installed: { from: '2026-08-15', to: '2026-11-12' },
      }),
    ).toBe('Perfeccel, installed in repairs 2026-08-15 to 2026-11-12')
  })
})

const state = vi.hoisted(() => ({ calls: [], plan: null }))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    comprasApi: vi.fn(async (method, args) => {
      state.calls.push([method, args])
      if (method.endsWith('.plan_change'))
        return {
          ...state.plan,
          id: 'sp-2',
          lines: [{ ...state.plan.lines[0], qty: 7 }],
        }
      return state.plan
    }),
  }
})

import CompraPlan from '@/pages/CompraPlan.vue'

let app, root, router
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/compras/surtido',
        name: 'CompraSurtido',
        component: { render: () => null },
      },
      {
        path: '/compras/surtido/plan/:id',
        name: 'CompraPlan',
        component: CompraPlan,
        props: true,
      },
    ],
  })
  router.push('/compras/surtido/plan/sp-1')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(CompraPlan, { id: 'sp-1' })
  app.config.globalProperties.__ = (text, args) =>
    String(text).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
  app.use(router)
  app.mount(root)
  await settle()
}
afterEach(() => {
  vi.useRealTimers()
  app?.unmount()
  root?.remove()
  state.calls.length = 0
})

describe('Buy plan page', () => {
  it('shows each line with its year, stock and reasons, and a + corrects the plan', async () => {
    window.__ = (text, args) =>
      String(text).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
    state.plan = {
      id: 'sp-1',
      source: 'tienda',
      supplier: 'Perfeccel',
      installed: { from: '2026-08-15', to: '2026-11-12' },
      total: 712.44,
      currency: 'MXN',
      owner: true,
      lines: [
        {
          line: 'm:a58',
          model: 'OPPO A58 4G',
          year: 2023,
          stock: 7,
          moved: 6,
          moved_kind: 'installed',
          qty: 6,
          after: 13,
          price: 118.74,
          price_source: 'compra',
          reasons: ['instalada en reparaciones 6', 'quedan 7'],
          history: [
            { date: '2026-11-02', rate: 118.74, supplier: 'Perfeccel' },
          ],
        },
      ],
      left_out: [{ name: 'Honor X7A', why: 'límite de 60 líneas por plan' }],
      notes: [],
      warehouses: [],
    }
    await mount()
    expect(state.calls[0]).toEqual([
      'doco.workspaces.surtido_plan.plan_page',
      { plan: 'sp-1' },
    ])
    const row = root.querySelector('[data-testid="plan-linea-m:a58"]')
    expect(row.textContent).toContain('OPPO A58 4G')
    expect(row.textContent).toContain('2023')
    expect(row.textContent).toContain('7 on hand, 13 after')
    expect(row.textContent).toContain('instalada en reparaciones 6; quedan 7')
    expect(row.textContent).toContain('Bought before')
    expect(root.textContent).toContain('Honor X7A')

    vi.useFakeTimers()
    row.querySelector('button[aria-label="One more"]').click()
    await nextTick()
    expect(row.textContent).toContain('14 after')
    await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    await settle()
    const sent = state.calls.find(([m]) => m.endsWith('.plan_change'))
    expect(sent[1]).toEqual({
      plan: 'sp-1',
      changes: JSON.stringify([{ op: 'qty', line: 'm:a58', qty: 7 }]),
    })
    expect(router.currentRoute.value.params.id).toBe('sp-2')
  })
})
