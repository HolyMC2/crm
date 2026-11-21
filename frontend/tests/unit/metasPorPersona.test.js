// «Datos por persona» in Metas (doco.metas.api.coaching): each person's figure
// for the chosen facts, «—» where they were not judged, and the owner's choice
// of facts saved and read again.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const state = vi.hoisted(() => ({ calls: [], answers: [], phone: null }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label', 'disabled', 'loading', 'variant'],
      emits: ['click'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: p.disabled, onClick: () => emit('click') },
            p.label,
          ),
    },
    toast: { error: vi.fn() },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, slots.default?.())
            : null,
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.phone = ref(false)
  return { isMobile: state.phone }
})
vi.mock('@/composables/useEquipo', () => ({
  equipoApi: async (method, args) => {
    state.calls.push([method, args])
    const next = state.answers.shift()
    if (next instanceof Error) throw next
    return next
  },
  problemOf: (error) => ({ detail: error.message }),
}))
vi.mock('@/composables/useMetas', () => ({ METAS: 'doco.metas.api' }))

import PorPersona from '@/components/metas/PorPersona.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const ANSWER = {
  facts: [
    { key: 'tareas.vencidas', label: 'Tareas vencidas', unit: 'count' },
    {
      key: 'caja.diferencias',
      label: 'Diferencias en el corte',
      unit: 'money',
    },
  ],
  people: [
    {
      user: 'jenni@example.invalid',
      name: 'Jenni',
      designation: 'Cajera',
      facts: {
        'tareas.vencidas': { text: '3', n: 5 },
        'caja.diferencias': {
          text: '$120',
          n: 2,
          detail: '2 cortes · faltó $120 · sobró $0',
        },
      },
    },
    {
      user: 'tere@example.invalid',
      name: 'Tere',
      facts: { 'tareas.vencidas': { text: '0', n: 4 } },
    },
  ],
  catalog: [
    { key: 'tareas.vencidas', label: 'Tareas vencidas', group: 'Tareas' },
    {
      key: 'caja.diferencias',
      label: 'Diferencias en el corte',
      group: 'Caja',
    },
    { key: 'tratos.ganados', label: 'Tratos ganados', group: 'Ventas' },
  ],
  chosen: ['tareas.vencidas', 'caja.diferencias'],
}

let app
let host
const period = ref('week')
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(answer = ANSWER) {
  state.answers = [JSON.parse(JSON.stringify(answer))]
  state.calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(PorPersona, { period: period.value, start: null }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(host)
  await flush()
}
const $ = (sel) => host.querySelector(sel)

afterEach(() => {
  app?.unmount()
  host?.parentNode?.removeChild(host)
  state.phone.value = false
  period.value = 'week'
})

describe('Datos por persona', () => {
  it('shows each person’s facts, and «—» where they were not judged', async () => {
    await mount()
    expect(state.calls[0]).toEqual([
      'doco.metas.api.coaching',
      { period: 'week', start: null },
    ])
    const jenni = $('[data-persona="jenni@example.invalid"]')
    expect(jenni.textContent).toContain('Jenni')
    expect(jenni.textContent).toContain('$120')
    const tere = $('[data-persona="tere@example.invalid"]')
    expect(tere.textContent).toContain('—')
  })

  it('reads again when the period changes', async () => {
    await mount()
    state.answers = [JSON.parse(JSON.stringify(ANSWER))]
    period.value = 'month'
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'doco.metas.api.coaching',
      { period: 'month', start: null },
    ])
  })

  it('saves the facts the owner picks and shows them', async () => {
    await mount()
    $('[data-por-persona-elegir]').click()
    await flush()
    $('[data-dato="caja.diferencias"]').click()
    $('[data-dato="tratos.ganados"]').click()
    state.answers = [
      { chosen: ['tareas.vencidas', 'tratos.ganados'] },
      JSON.parse(JSON.stringify(ANSWER)),
    ]
    $('[data-por-persona-guardar]').click()
    await flush()
    expect(
      state.calls.find(([method]) => method.endsWith('save_coaching')),
    ).toEqual([
      'doco.metas.api.save_coaching',
      { keys: ['tareas.vencidas', 'tratos.ganados'] },
    ])
  })

  it('lists people as cards on a phone', async () => {
    state.phone.value = true
    await mount()
    expect($('[data-por-persona-lista]')).toBeTruthy()
    expect($('[data-por-persona-tabla]')).toBeNull()
  })

  it('says so when nobody has figures', async () => {
    await mount({ ...ANSWER, people: [] })
    expect($('[data-por-persona-vacio]')).toBeTruthy()
  })
})
