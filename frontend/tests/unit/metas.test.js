// Equipo › Metas: the pure helpers, and the page with a mocked doco.metas.api
// (each person's score and bars, team goals, the empty state for an owner).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

import EquipoMetas from '@/pages/EquipoMetas.vue'
import {
  barWidth,
  blankGoal,
  groupedIndicators,
  lineText,
  metText,
  periodFromQuery,
  periodQuery,
} from '@/composables/useMetas'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const line = (extra = {}) => ({
  goal: 'g1',
  label: 'Primera respuesta a tiempo',
  value_text: '80 %',
  target_text: '90 %',
  progress: 0.889,
  reached: false,
  gap: 'faltan 10 puntos',
  detail: '12 conversaciones',
  ...extra,
})
const period = (extra = {}) => ({
  goals: [
    {
      name: 'g1',
      label: 'Primera respuesta a tiempo',
      target_text: '90 %',
      better: 'higher',
      period: 'Semana',
      scope: 'Cada quien lo suyo',
      puestos: [],
      weight: 2,
    },
  ],
  team: [],
  people: [
    {
      key: 'ana@example.invalid',
      name: 'Ana',
      designation: 'Cajera',
      score: 89,
      color: 'amber',
      met: 0,
      goals: [line()],
    },
  ],
  unavailable: [],
  period: {
    kind: 'week',
    start: '2026-11-10',
    end: '2026-11-16',
    previous: '2026-11-03',
    next: '2026-11-17',
  },
  periods: [{ value: 'week', label: 'Semana' }],
  can_edit: true,
  ...extra,
})

describe('useMetas helpers', () => {
  it('draws bars, words and counts from the server figures', () => {
    expect(barWidth(line())).toBe('89%')
    expect(barWidth(line({ progress: 1.4 }))).toBe('100%')
    expect(barWidth(line({ progress: null }))).toBe('0%')
    expect(lineText(line())).toBe('80 % of 90 % · faltan 10 puntos')
    expect(lineText(line({ reached: true }))).toBe('80 % of 90 % · Met ✓')
    expect(metText({ met: 1, goals: [line(), line()] })).toBe(
      '1 of 2 goals met',
    )
  })

  it('groups measures and starts a goal on the first one', () => {
    const rows = [
      { key: 'a', group: 'Ventas', unit: 'money' },
      { key: 'b', group: 'Atención', unit: 'percent' },
      { key: 'c', group: 'Ventas', unit: 'count' },
    ]
    expect(groupedIndicators(rows).map((g) => g.group)).toEqual([
      'Ventas',
      'Atención',
    ])
    expect(blankGoal([rows[1]]).target).toBe(90)
    expect(blankGoal(rows).indicator).toBe('a')
  })

  it('keeps the period in the address', () => {
    expect(periodQuery('week', null)).toEqual({})
    expect(periodQuery('month', '2026-11-01')).toEqual({
      periodo: 'mes',
      desde: '2026-11-01',
    })
    expect(periodFromQuery({ periodo: 'quincena', desde: 'x' })).toEqual({
      period: 'fortnight',
      start: null,
    })
  })
})

let app
let root
let answer
beforeEach(() => {
  answer = period()
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ message: answer }),
  }))
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/equipo/metas', name: 'EquipoMetas', component: EquipoMetas },
      {
        path: '/equipo',
        component: defineComponent({ render: () => h('p', 'equipo') }),
      },
    ],
  })
  router.push('/equipo/metas')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = window.__ || globalThis.__
  app.mount(root)
  await flush()
}

describe('EquipoMetas', () => {
  it('lists each person with their score and opens their goals', async () => {
    await mount()
    const row = document.querySelector('[data-person="ana@example.invalid"]')
    expect(row.textContent).toContain('Ana')
    expect(
      row.querySelector('[data-testid="metas-score"]').textContent.trim(),
    ).toBe('89')
    row.querySelector('button').click()
    await flush()
    expect(row.querySelector('[data-goal="g1"]').textContent).toContain(
      'faltan 10 puntos',
    )
    // The owner sees the goals to edit them.
    expect(document.querySelector('[data-edit="g1"]')).not.toBeNull()
  })

  it('offers the suggested goals when the shop has none', async () => {
    answer = period({ goals: [], people: [] })
    await mount()
    expect(document.querySelector('[data-testid="metas-empty"]')).not.toBeNull()
    expect(
      document.querySelector('[data-testid="metas-sugeridas"]'),
    ).not.toBeNull()
  })

  it('a manager who cannot edit sees no goal buttons', async () => {
    answer = period({ can_edit: false })
    await mount()
    expect(document.querySelector('[data-testid="metas-agregar"]')).toBeNull()
    expect(document.querySelector('[data-edit="g1"]')).toBeNull()
  })
})
