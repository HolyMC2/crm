// Gastos › Presupuesto: the month's plan per concept against what it used,
// the records behind one concept, the edit sheet's payload, the chip a
// record shows, and every string of these screens in es-MX.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  route: null,
  router: null,
  toast: null,
  boot: null,
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({ name: 'Presupuesto', params: {}, query: {} })
  state.router = {
    push: vi.fn(),
    replace: vi.fn((to) => Object.assign(state.route.query, to.query)),
    back: vi.fn(),
    // BottomSheet's history hook (sheetHistory.js) registers a guard.
    beforeEach: vi.fn(() => () => {}),
    currentRoute: { value: { fullPath: '/gastos/presupuesto' } },
  }
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (props, { slots }) =>
        () =>
          h(
            'a',
            { href: typeof props.to === 'string' ? props.to : props.to?.name },
            slots.default?.(),
          ),
    },
    useRoute: () => state.route,
    useRouter: () => state.router,
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})
vi.mock('@/composables/muelleShell', async () => {
  const { ref } = await import('vue')
  state.boot = ref(null)
  return { shellBoot: state.boot }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  state.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  return {
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'type'],
      emits: ['click'],
      setup:
        (props, { emit, slots }) =>
        () =>
          h(
            'button',
            {
              type: props.type || 'button',
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            props.label || slots.default?.(),
          ),
    },
    FormControl: {
      props: ['modelValue', 'label', 'type'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('label', {}, [
            props.label,
            h('input', {
              type: props.type || 'text',
              value: props.modelValue,
              onInput: (e) => emit('update:modelValue', e.target.value),
            }),
          ]),
    },
    toast: state.toast,
  }
})
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, comprasApi: (...args) => state.api(...args) }
})

import {
  barPct,
  boardTiles,
  chipParts,
  editRows,
  groupLines,
  historyColumns,
  lineHref,
  linesPayload,
  monthLabel,
  gastosDoor,
  queryMonth,
  remainingText,
  shiftMonth,
  stateLabel,
  stateTone,
} from '@/utils/presupuesto'
import Presupuesto from '@/pages/Presupuesto.vue'
import PresupuestoChip from '@/components/presupuesto/PresupuestoChip.vue'

const here = dirname(fileURLToPath(import.meta.url))

globalThis.__ = (text, values) =>
  String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
window.__ = globalThis.__

const line = (over = {}) => ({
  key: 'compras:Fundas',
  kind: 'Compras',
  item_group: 'Fundas',
  account: null,
  label: 'Fundas',
  note: '',
  amount: 1000,
  used: 850,
  pct: 85,
  remaining: 150,
  projected: 1700,
  state: 'warn',
  history: [],
  ...over,
})
const board = (over = {}) => ({
  company: 'Doco',
  month: '2026-11',
  label: 'noviembre 2026',
  desde: '2026-11-01',
  today: '2026-11-15',
  days: 30,
  elapsed: 15,
  name: 'PRE-1',
  inherited_from: null,
  lines: [
    line(),
    line({
      key: 'gastos:',
      kind: 'Gastos',
      item_group: null,
      label: 'Gastos de operación',
      amount: 5000,
      used: 5600,
      pct: 112,
      remaining: -600,
      state: 'over',
    }),
    line({
      key: 'ventas:',
      kind: 'Ventas',
      item_group: null,
      label: 'Meta de ventas',
      amount: 20000,
      used: 9000,
      pct: 45,
      remaining: 11000,
      state: 'behind',
    }),
  ],
  totals: {
    expense: {
      amount: 6000,
      used: 6450,
      pct: 108,
      remaining: -450,
      projected: 12900,
      state: 'over',
    },
    ventas: {
      amount: 20000,
      used: 9000,
      pct: 45,
      remaining: 11000,
      projected: 18000,
      state: 'behind',
    },
  },
  history: [
    {
      month: '2026-10',
      label: 'oct',
      expense: { amount: 6000, used: 4000 },
      ventas: { amount: 20000, used: 21000 },
    },
    {
      month: '2026-11',
      label: 'nov',
      expense: { amount: 6000, used: 6450 },
      ventas: { amount: 20000, used: 9000 },
    },
  ],
  flagged: 2,
  companies: ['Doco'],
  can_edit: true,
  ...over,
})

describe('Presupuesto helpers', () => {
  it('keeps the month in the URL shape and walks it', () => {
    expect(queryMonth('2026-11')).toBe('2026-11')
    expect(queryMonth('2026-13')).toBe('')
    expect(queryMonth('nov')).toBe('')
    expect(shiftMonth('2026-11', 1)).toBe('2026-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('', 1)).toBe('')
    expect(monthLabel('2026-11')).toMatch(/2026/)
  })

  it('a bar never overflows and colour follows the state', () => {
    expect(barPct({ pct: 85 })).toBe(85)
    expect(barPct({ pct: 140 })).toBe(100)
    expect(barPct({ pct: null })).toBe(0)
    expect(stateTone('over')).toBe('danger')
    expect(stateTone('warn')).toBe('warning')
    expect(stateTone('behind')).toBe('warning')
    expect(stateTone('met')).toBe('success')
    expect(stateTone('ok')).toBe('neutral')
    expect(stateLabel('over')).toBe('Over budget')
    expect(stateLabel('ok')).toBe('')
  })

  it('says what is left, what went over and how the goal goes', () => {
    expect(remainingText(line())).toMatch(/150.* left$/)
    expect(remainingText(line({ state: 'over', remaining: -600 }))).toMatch(
      /600.* over$/,
    )
    expect(remainingText(line({ amount: 0, state: 'over' }))).toMatch(/over/)
    expect(remainingText(line({ amount: 0, state: 'ok' }))).toBe(
      'No amount set',
    )
    expect(remainingText(line({ kind: 'Ventas', remaining: 11000 }))).toMatch(
      /11,000.* to the goal$/,
    )
    expect(
      remainingText(line({ kind: 'Ventas', state: 'met', remaining: -500 })),
    ).toMatch(/^Goal met: .*500.* over it$/)
  })

  it('groups the lines by kind in the order the page shows them', () => {
    const groups = groupLines(board().lines)
    expect(groups.map((g) => [g.kind, g.lines.length])).toEqual([
      ['Compras', 1],
      ['Gastos', 1],
      ['Ventas', 1],
    ])
    expect(groupLines([])).toEqual([])
  })

  it('tiles: spent, what is left or over, and the goal', () => {
    const tiles = boardTiles(board())
    expect(tiles.map((t) => [t.key, t.tone])).toEqual([
      ['spent', 'danger'],
      ['left', 'danger'],
      ['sales', 'warning'],
    ])
    expect(tiles[0].value).toMatch(/6,450/)
    expect(tiles[0].hint).toMatch(/^108 % of .*6,000/)
    expect(tiles[1].label).toBe('Over budget by')
    expect(tiles[1].value).toMatch(/450/)
    expect(tiles[2].label).toBe('Sales this month')
    expect(tiles[2].value).toMatch(/9,000/)
    expect(tiles[2].hint).toMatch(/^45 % of the .*20,000.* goal$/)
    // a past month projects nothing
    expect(boardTiles(board({ today: '2026-12-03' }))[1].hint).toBe('')
    const fine = boardTiles(
      board({
        totals: {
          expense: {
            amount: 6000,
            used: 1000,
            pct: 17,
            remaining: 5000,
            projected: 2000,
            state: 'ok',
          },
          ventas: null,
        },
      }),
    )
    expect(fine.map((t) => t.key)).toEqual(['spent', 'left'])
    expect(fine[1].label).toBe('Left this month')
    expect(fine[1].hint).toMatch(/2,000.* projected by month end/)
    expect(boardTiles(null)).toEqual([])
  })

  it('the Gastos door names the month and how much of its budget is used', () => {
    expect(gastosDoor(null)).toEqual({
      title: 'Budget',
      meta: '',
      tone: 'neutral',
    })
    expect(gastosDoor(board())).toEqual({
      title: 'Budget for noviembre 2026',
      meta: '108 % used',
      tone: 'danger',
    })
    expect(gastosDoor(board({ lines: [], can_edit: true }))).toEqual({
      title: 'No budget for noviembre 2026',
      meta: 'Set the budget',
      tone: 'neutral',
    })
    expect(gastosDoor(board({ lines: [], can_edit: false })).meta).toBe('')
  })

  it('draws the last months against the tallest one', () => {
    const cols = historyColumns(board().history)
    expect(cols.map((c) => [c.month, c.amountPct, c.usedPct, c.over])).toEqual([
      ['2026-10', 93, 62, false],
      ['2026-11', 93, 100, true],
    ])
    expect(historyColumns([])).toEqual([])
  })

  it('the sheet sends every row with a scope and an amount, no blanks', () => {
    const rows = editRows(board().lines)
    expect(rows.map((r) => r.kind)).toEqual(['Compras', 'Gastos', 'Ventas'])
    expect(
      linesPayload([
        ...rows,
        { kind: 'Compras', item_group: '', amount: 5 },
        { kind: 'Gastos', account: 'Renta - D', amount: '' },
        { kind: 'Gastos', account: 'Luz - D', amount: '-3' },
        { kind: 'Otro', amount: 3 },
      ]),
    ).toEqual([
      {
        kind: 'Compras',
        item_group: 'Fundas',
        account: '',
        amount: 1000,
        note: '',
      },
      { kind: 'Gastos', item_group: '', account: '', amount: 5000, note: '' },
      { kind: 'Ventas', item_group: '', account: '', amount: 20000, note: '' },
    ])
  })

  it('a record chip names the use and opens the line', () => {
    const l = {
      key: 'compras:Fundas',
      month: '2026-11',
      pct: 85,
      remaining: 150,
      kind: 'Compras',
      amount: 1000,
    }
    expect(chipParts(l)).toEqual([
      '85 % used',
      expect.stringMatching(/150.* left/),
    ])
    expect(lineHref(l)).toBe(
      '/gastos/presupuesto?mes=2026-11&linea=compras%3AFundas',
    )
    expect(lineHref({})).toBe('/gastos/presupuesto')
  })
})

let app = null
let root = null
async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}
async function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await flush()
  return root
}
function calls(method) {
  return state.api.mock.calls.filter(([m]) => m.endsWith(method))
}
function button(text) {
  return [...root.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
}

beforeEach(() => {
  state.api.mockReset()
  state.router.push.mockReset()
  state.router.replace.mockClear()
  state.toast.success.mockReset()
  state.toast.error.mockReset()
  for (const key of Object.keys(state.route.query))
    delete state.route.query[key]
  state.boot.value = null
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
})

describe('Gastos › Presupuesto', () => {
  it('shows the month, its tiles and every concept with its bar', async () => {
    state.api.mockResolvedValue(board())
    await mount(Presupuesto)
    expect(calls('.board')[0][1]).toEqual({ company: null, month: null })
    expect(
      root.querySelector('[data-testid="presupuesto-month"]').textContent,
    ).toContain('noviembre 2026')
    expect(state.route.query.mes).toBe('2026-11')
    const tiles = [...root.querySelectorAll('[data-tile]')].map(
      (t) => t.dataset.tile,
    )
    expect(tiles).toEqual(['spent', 'left', 'sales'])
    expect(root.textContent).toContain('Fundas')
    expect(root.textContent).toContain('Gastos de operación')
    expect(root.textContent).toContain('Meta de ventas')
    expect(root.textContent).toContain('Over budget')
    expect(root.textContent).toContain('Behind pace')
    const bars = [...root.querySelectorAll('[role="progressbar"]')].map((b) =>
      b.getAttribute('aria-valuenow'),
    )
    expect(bars).toEqual(['85', '100', '45'])
    expect(
      root.querySelector('[data-testid="presupuesto-history"]'),
    ).toBeTruthy()
    expect(root.querySelector('[data-testid="presupuesto-edit"]')).toBeTruthy()
  })

  it('an inherited plan says which month it came from; no plan invites to set one', async () => {
    state.api.mockResolvedValue(
      board({ inherited_from: '2026-10-01', name: 'PRE-0' }),
    )
    await mount(Presupuesto)
    expect(
      root.querySelector('[data-testid="presupuesto-inherited"]').textContent,
    ).toMatch(/Same plan as .*2026/)
    app.unmount()
    root.remove()
    state.api.mockResolvedValue(
      board({
        lines: [],
        totals: { expense: null, ventas: null },
        history: [],
        name: null,
      }),
    )
    await mount(Presupuesto)
    expect(
      root.querySelector('[data-testid="presupuesto-empty"]').textContent,
    ).toContain('No budget for noviembre 2026')
    expect(button('Set the budget')).toBeTruthy()
  })

  it('the arrows change the month through the URL', async () => {
    state.api.mockResolvedValue(board())
    await mount(Presupuesto)
    state.api.mockResolvedValue(
      board({ month: '2026-10', label: 'octubre 2026' }),
    )
    root.querySelector('[aria-label="Previous month"]').click()
    await flush()
    expect(state.route.query.mes).toBe('2026-10')
    expect(calls('.board').at(-1)[1]).toEqual({
      company: 'Doco',
      month: '2026-10',
    })
    expect(root.textContent).toContain('octubre 2026')
  })

  it('a concept opens the records that used it', async () => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('.board')
        ? board()
        : {
            rows: [
              {
                doctype: 'Purchase Invoice',
                name: 'PI-1',
                party: 'Accesorios SA',
                date: '2026-11-03',
                amount: 850,
                url: '/crm/gastos/factura/PI-1',
              },
            ],
          },
    )
    await mount(Presupuesto)
    root.querySelector('[data-linea="compras:Fundas"]').click()
    await flush()
    expect(calls('.documents')[0][1]).toEqual({
      company: 'Doco',
      month: '2026-11',
      key: 'compras:Fundas',
    })
    const docs = document.querySelector('[data-testid="presupuesto-docs"]')
    expect(docs.textContent).toContain('Accesorios SA')
    expect(docs.querySelector('a').getAttribute('href')).toBe(
      '/gastos/factura/PI-1',
    )
  })

  it('«Save the budget» sends the sheet’s lines and shows the new board', async () => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('.save')
        ? board({ saved: 'PRE-1', label: 'noviembre 2026 ✓' })
        : board(),
    )
    await mount(Presupuesto)
    root.querySelector('[data-testid="presupuesto-edit"]').click()
    await flush()
    const form = document.querySelector('[data-testid="presupuesto-form"]')
    expect(form).toBeTruthy()
    expect(form.textContent).toContain('Operating expenses (every account)')
    const ventas = form.querySelector(
      '[data-testid="presupuesto-ventas"] input',
    )
    ventas.value = '25000'
    ventas.dispatchEvent(new Event('input'))
    await flush()
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()
    const sent = calls('.save')[0][1]
    expect(sent.company).toBe('Doco')
    expect(sent.month).toBe('2026-11')
    expect(sent.lines).toEqual([
      {
        kind: 'Compras',
        item_group: 'Fundas',
        account: '',
        amount: 1000,
        note: '',
      },
      { kind: 'Gastos', item_group: '', account: '', amount: 5000, note: '' },
      { kind: 'Ventas', item_group: '', account: '', amount: 25000, note: '' },
    ])
    expect(state.toast.success).toHaveBeenCalledWith('Budget saved')
    expect(root.textContent).toContain('noviembre 2026 ✓')
  })

  it('a reader sees the plan without the pencil; a refusal says why', async () => {
    state.api.mockResolvedValue(board({ can_edit: false }))
    await mount(Presupuesto)
    expect(root.querySelector('[data-testid="presupuesto-edit"]')).toBeNull()
    app.unmount()
    root.remove()
    state.api.mockRejectedValue(
      Object.assign(
        new Error('Pide al encargado permiso para ver el presupuesto.'),
        {
          exc_type: 'PermissionError',
        },
      ),
    )
    state.api.mockClear()
    await mount(Presupuesto)
    expect(root.textContent).toContain('Pide al encargado permiso')
    expect(calls('.board').length).toBe(1)
  })
})

describe('the budget chip on a record', () => {
  it('names the line the record draws from and opens it', async () => {
    state.api.mockResolvedValue({
      lines: [
        {
          key: 'compras:Fundas',
          kind: 'Compras',
          label: 'Fundas',
          month: '2026-11',
          month_label: 'noviembre 2026',
          amount: 1000,
          used: 850,
          share: 300,
          pct: 85,
          remaining: 150,
          projected: 1700,
          state: 'warn',
          url: '/crm/gastos/presupuesto?linea=compras%3AFundas',
        },
      ],
    })
    await mount(PresupuestoChip, { doctype: 'Purchase Invoice', name: 'PI-1' })
    expect(calls('.documento')[0][1]).toEqual({
      doctype: 'Purchase Invoice',
      name: 'PI-1',
    })
    const chip = root.querySelector('[data-testid="presupuesto-chip"]')
    expect(chip.textContent).toContain('Fundas')
    expect(chip.textContent).toContain('85 % used')
    expect(chip.querySelector('a').getAttribute('href')).toBe(
      '/gastos/presupuesto?mes=2026-11&linea=compras%3AFundas',
    )
  })

  it('draws nothing without a plan or without the right', async () => {
    state.api.mockResolvedValue({ lines: [] })
    await mount(PresupuestoChip, { doctype: 'Purchase Invoice', name: 'PI-1' })
    expect(root.querySelector('[data-testid="presupuesto-chip"]')).toBeNull()
    app.unmount()
    root.remove()
    state.api.mockRejectedValue(new Error('no'))
    await mount(PresupuestoChip, { doctype: 'Purchase Order', name: 'PO-1' })
    expect(root.querySelector('[data-testid="presupuesto-chip"]')).toBeNull()
  })
})

describe('the budget’s strings (es-MX)', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const FILES = [
    'src/pages/Presupuesto.vue',
    'src/components/presupuesto/PresupuestoChip.vue',
    'src/utils/presupuesto.js',
  ]
  const CALL =
    /\b(?:__|tr)\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(?:null|undefined|\[[^\]]*\]|[\w.$]+)\s*,\s*(?:'(\w+)'|CTX)\s*,?\s*\)/g
  for (const file of FILES) {
    const source = readFileSync(resolve(here, '../..', file), 'utf8')
    // Literal contexts, or CTX (the helpers' own «Presupuesto»); other
    // contexts (the bar's «Gastos») belong to their own screens' tests.
    const calls = [...source.matchAll(CALL)].filter(
      (m) => (m[3] || 'Presupuesto') === 'Presupuesto',
    )
    it(`${file}: every msgid has its es-MX entry`, () => {
      expect(calls.length).toBeGreaterThan(0)
      for (const [, , msgid] of calls) {
        const key = `msgctxt "Presupuesto"\nmsgid "${msgid.replace(/\s*\n\s*/g, ' ').replace(/"/g, '\\"')}"`
        expect(po, msgid).toContain(key)
      }
    })
  }
})
