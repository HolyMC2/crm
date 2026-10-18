// Garantías as a power app, mounted with the real page: the URL keeps list,
// attention chip and focus, the keyboard takes, assigns and reviews the focused
// case, several cases are assigned in one go, a case taken can be undone, each
// row says how old it is and its next step, live changes reload quietly, and a
// phone gets its own app bar with what needs attention in sight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  route: null,
  router: null,
  mobile: null,
  hub: null,
  toast: null,
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({
    name: 'Garantias',
    params: {},
    query: {},
    fullPath: '/garantias',
  })
  state.router = {
    push: vi.fn(),
    replace: vi.fn(({ query }) => {
      state.route.query = { ...query }
    }),
    back: vi.fn(),
    // The «Filtros» sheet (S1 BottomSheet) guards back navigation.
    beforeEach: vi.fn(() => () => {}),
    currentRoute: { value: state.route },
  }
  return { useRoute: () => state.route, useRouter: () => state.router }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.mobile = ref(false)
  return { isMobile: state.mobile }
})
vi.mock('@/composables/useHoy', () => ({
  hoyLive: () => {
    state.hub = {
      watches: [],
      watch(doctypes, refetch, options) {
        this.watches.push({ doctypes, refetch, options })
        return () => {}
      },
    }
    return state.hub
  },
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  const labelled = (tag) => ({
    props: ['label', 'theme', 'variant', 'loading', 'disabled'],
    setup: (props) => () => h(tag, props.label),
  })
  state.toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return {
    Badge: labelled('span'),
    Button: labelled('button'),
    BottomSheet: { render: () => null },
    Dialog: { render: () => null },
    FeatherIcon: { render: () => null },
    FormControl: { render: () => null },
    toast: state.toast,
  }
})
vi.mock('@/components/shell/ModuleLayout.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}))
function sheet(name) {
  return {
    default: {
      props: ['modelValue', 'name', 'rows', 'action'],
      setup: (props) => () =>
        props.modelValue
          ? h('div', {
              'data-sheet': name,
              'data-name': props.name || '',
              'data-rows': props.rows?.length ?? '',
              'data-action': props.action || '',
            })
          : null,
    },
  }
}
vi.mock('@/components/garantias/BulkAssignSheet.vue', () => sheet('bulk'))
vi.mock('@/components/garantias/AssignDialog.vue', () => ({
  default: {
    props: ['modelValue', 'claim'],
    setup: (props) => () =>
      props.modelValue
        ? h('div', { 'data-sheet': 'assign', 'data-name': props.claim })
        : null,
  },
}))
vi.mock('@/components/garantias/NewClaimDialog.vue', () => sheet('new'))
vi.mock('@/composables/useGarantias', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    garantiasApi: (...args) => state.api(...args),
    loadGarantiasBoot: async () =>
      (actual.garantiasBoot.value = {
        enabled: true,
        user: 'ana@example.test',
        capabilities: { read: true, create: true, repair: false },
      }),
  }
})

import {
  QUEUE_KEYS,
  RECORD_KEYS,
  ageLabel,
  bulkAssignPlan,
  caseStep,
  listMemoryKey,
  nextStepLabel,
  queueShortcuts,
  queueState,
  recordShortcuts,
} from '@/composables/useGarantias'
import { pageShortcuts } from '@/composables/shellKeyboard'
import { KEYMAP, RESERVED_COMBOS } from '@/vendor/muelle-shell/contracts'
import Garantias from '@/pages/Garantias.vue'

const claim = (name, extra = {}) => ({
  name,
  customer: `C-${name}`,
  customer_name: `Cliente ${name}`,
  state: 'Nueva',
  kind: 'Garantía',
  item_name: 'Cargador',
  complaint: 'No carga',
  assignees: [],
  due: null,
  age_days: 3,
  next: 'review',
  remedy: null,
  ...extra,
})
let QUEUE
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const press = (key, extra = {}, target = window) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  )
const calls = (method) =>
  state.api.mock.calls.filter(([m]) => m === method).map(([, args]) => args)

let app, root
function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Garantias) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
}
beforeEach(() => {
  QUEUE = {
    rows: [
      claim('GAR-1', { age_days: 15 }),
      claim('GAR-2', {
        state: 'En revisión',
        next: 'decide',
        assignees: [{ user: 'ana@example.test', full_name: 'Ana' }],
      }),
    ],
    has_more: false,
    counts: {
      'mis-casos': 1,
      nuevas: 1,
      'en-revision': 1,
      'con-proveedor': 0,
      cerradas: 4,
    },
    attention: { vencidas: 2, 'sin-asignar': 1 },
    sla: true,
    count_cap: 100,
  }
  state.api.mockReset()
  state.api.mockImplementation(async (method) =>
    method === 'queue' ? QUEUE : {},
  )
  state.router.push.mockReset()
  state.router.replace.mockClear()
  state.route.name = 'Garantias'
  state.route.query = {}
  state.mobile.value = false
  state.toast.success.mockReset()
  state.toast.error.mockReset()
  sessionStorage.clear()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Garantías list as a power app', () => {
  it('j/k move a focus the URL keeps; Enter opens the case with a return to the same row', async () => {
    mount()
    await flush()
    press('j')
    press('j')
    await flush()
    expect(state.route.query).toEqual({ foco: 'GAR-2' })
    press('Enter')
    await flush()
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'Garantia',
      params: { name: 'GAR-2' },
      query: { list: '/garantias?foco=GAR-2' },
    })
  })

  it('each row says how old it is, its next step and whether nobody has it', async () => {
    mount()
    await flush()
    const first = root.querySelector('[data-row-key="GAR-1"]')
    expect(first.querySelector('[data-age]').textContent).toBe('Open 15 days')
    expect(first.querySelector('[data-next-step]').textContent).toBe(
      'Next: start the review',
    )
    expect(first.textContent).toContain('Unassigned')
    const second = root.querySelector('[data-row-key="GAR-2"]')
    expect(second.querySelector('[data-next-step]').textContent).toContain(
      'decide',
    )
    expect(second.textContent).not.toContain('Unassigned')
  })

  it('t takes the focused case with «Deshacer»; undo gives it back', async () => {
    state.route.query = { foco: 'GAR-1' }
    mount()
    await flush()
    press('t')
    await flush()
    expect(calls('assign')[0]).toEqual({
      name: 'GAR-1',
      user: 'ana@example.test',
    })
    const [message, options] = state.toast.success.mock.calls.at(-1)
    expect(message).toBe('Case GAR-1 is yours')
    options.action.onClick()
    await flush()
    expect(calls('unassign')[0]).toEqual({
      name: 'GAR-1',
      user: 'ana@example.test',
    })
    expect(calls('queue').length).toBeGreaterThanOrEqual(3)
    // Already mine: says so, assigns nothing.
    state.route.query = { foco: 'GAR-2' }
    await flush()
    press('t')
    await flush()
    expect(calls('assign')).toHaveLength(1)
    expect(state.toast.success).toHaveBeenLastCalledWith(
      'This case is already yours.',
    )
  })

  it('a assigns the focused case; with a selection, a assigns them in one go', async () => {
    state.route.query = { foco: 'GAR-1' }
    mount()
    await flush()
    press('a')
    await flush()
    expect(root.querySelector('[data-sheet="assign"]').dataset.name).toBe(
      'GAR-1',
    )
    root.querySelector('[data-sheet="assign"]').remove()
    press('x')
    press('j')
    press('x')
    await flush()
    expect(root.querySelector('[data-power-bulkbar]')).toBeTruthy()
    press('a')
    await flush()
    expect(root.querySelector('[data-sheet="bulk"]').dataset.rows).toBe('2')
  })

  it('r starts the review of a new case; a case in progress says to open it', async () => {
    state.route.query = { foco: 'GAR-1' }
    mount()
    await flush()
    press('r')
    await flush()
    expect(calls('transition')[0]).toMatchObject({
      name: 'GAR-1',
      action: 'Revisar',
    })
    state.route.query = { foco: 'GAR-2' }
    await flush()
    press('r')
    await flush()
    expect(calls('transition')).toHaveLength(1)
    expect(state.toast.error).toHaveBeenLastCalledWith(
      'This case is already in progress. Open it for its next step.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open case' }),
      }),
    )
  })

  it('attention chips push a history entry and carry their counts; the list reloads from the URL', async () => {
    mount()
    await flush()
    const chip = [
      ...root.querySelectorAll('[data-garantias-chips] button'),
    ].find((b) => b.textContent.includes('Overdue'))
    expect(chip.textContent).toContain('2')
    chip.click()
    expect(state.router.push).toHaveBeenCalledWith({
      query: { chip: 'vencidas' },
    })
    state.route.query = { chip: 'vencidas' }
    await flush()
    expect(calls('queue').at(-1)).toMatchObject({ chip: 'vencidas', start: 0 })
  })

  it('reloads quietly on a live change, and a visit back restores the loaded rows', async () => {
    sessionStorage.setItem(
      listMemoryKey({}),
      JSON.stringify({ top: 0, count: 50 }),
    )
    mount()
    await flush()
    expect(calls('queue')[0]).toMatchObject({ page_length: 50 })
    const live = state.hub.watches.at(-1)
    expect(live.doctypes).toEqual(['Warranty Claim'])
    expect(live.options.minIntervalMs).toBeGreaterThanOrEqual(5000)
    live.refetch({ full: true, reason: 'change' })
    await flush()
    expect(calls('queue')).toHaveLength(2)
  })

  it('lists its keys in Alt+H; a phone gets its app bar with what needs attention', async () => {
    state.mobile.value = true
    mount()
    await flush()
    expect(pageShortcuts.value.extra.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'garantias.assign',
        'garantias.take',
        'garantias.review',
      ]),
    )
    expect(root.querySelector('[data-power-appbar]').textContent).toContain(
      'New',
    )
    // One filter row: no counts strip repeating the chips, and «Mine» is a
    // chip in that row instead of a checkbox.
    expect(root.querySelector('[data-power-summary]')).toBeNull()
    const chips = root.querySelector('[data-garantias-chips]').textContent
    expect(chips).toContain('Overdue')
    expect(chips).toContain('Unassigned')
    // The shared chip row (edge fade at 305px); «Mine» is one of its chips.
    expect(
      root.querySelector('[data-garantias-chips] [data-ui-filter-chips]'),
    ).not.toBeNull()
    // «Mine» sits on top of the chosen chip; another chip replaces it.
    const tap = async (value) => {
      root
        .querySelector(`[data-garantias-chips] [data-chip="${value}"]`)
        .click()
      state.route.query = { ...state.router.push.mock.calls.at(-1)[0].query }
      await flush()
    }
    await tap('mine')
    expect(state.route.query).toMatchObject({ mine: '1' })
    await tap('sin-asignar')
    expect(state.route.query).toMatchObject({ mine: '1', chip: 'sin-asignar' })
    await tap('sin-asignar')
    expect(state.route.query.chip || '').toBe('')
    expect(state.route.query).toMatchObject({ mine: '1' })
    // One filter mechanism: the kind is in the chip row's «Filtros» sheet.
    expect(root.querySelector('[aria-label="Kind"]')).toBeNull()
    root.querySelector('[data-garantias-chips] [data-ui-filters-chip]').click()
    await flush()
    const kinds = [...document.body.querySelectorAll('[data-garantias-kind]')]
    expect(kinds.length).toBeGreaterThan(1)
    kinds[1].click()
    state.route.query = { ...state.router.push.mock.calls.at(-1)[0].query }
    await flush()
    expect(state.route.query.kind).toBeTruthy()
  })
})

describe('Garantías helpdesk rules, pure parts', () => {
  it('reads the list from the URL; a closed list has no attention chip', () => {
    expect(
      queueState({ segment: 'mis-casos', chip: 'vencidas', foco: 'G' }),
    ).toMatchObject({ segment: 'mis-casos', chip: 'vencidas', foco: 'G' })
    expect(queueState({ segment: 'cerradas', chip: 'vencidas' }).chip).toBe('')
    expect(queueState({ chip: 'otra' }).chip).toBe('')
    expect(listMemoryKey({ foco: 'A' })).toBe(listMemoryKey({ foco: 'B' }))
  })

  it('says age and next step in words', () => {
    expect(ageLabel(0)).toBe('Opened today')
    expect(ageLabel(1)).toBe('Open 1 day')
    expect(ageLabel(9)).toBe('Open 9 days')
    expect(ageLabel(null)).toBe('')
    expect(nextStepLabel({ next: 'follow_remedy', remedy: 'Reparación' })).toBe(
      'Next: follow the repair in Taller',
    )
    expect(nextStepLabel({ next: 'follow_remedy', remedy: 'x' })).toBe(
      'Next: follow the remedy chosen',
    )
    expect(nextStepLabel({ next: null })).toBe('')
  })

  it('assigns only open cases and says why the rest are left out', () => {
    expect(caseStep(claim('A', { state: 'Resuelta' }), 'assign').kind).toBe(
      'closed',
    )
    const plan = bulkAssignPlan([
      claim('A'),
      claim('B', { state: 'Cancelada' }),
    ])
    expect(plan.ready.map((r) => r.name)).toEqual(['A'])
    expect(plan.skipped.map((s) => s.row.name)).toEqual(['B'])
  })

  it('never claims a reserved combo or a global key', () => {
    const globalKeys = new Set(
      KEYMAP.filter((s) => s.context === 'global').flatMap((s) => s.keys),
    )
    const listOnly = new Set(
      KEYMAP.filter((s) => s.context === 'list').flatMap((s) => s.keys),
    )
    for (const s of [...queueShortcuts(), ...recordShortcuts()].filter(
      (s) => s.id !== 'garantias.back',
    ))
      for (const combo of s.keys) {
        expect(RESERVED_COMBOS).not.toContain(combo)
        expect(globalKeys.has(combo)).toBe(false)
        expect(listOnly.has(combo)).toBe(false)
      }
    for (const s of queueShortcuts())
      for (const combo of s.keys) expect(QUEUE_KEYS[combo]).toBeTruthy()
    for (const s of recordShortcuts())
      for (const combo of s.keys) expect(RECORD_KEYS[combo]).toBeTruthy()
  })
})
