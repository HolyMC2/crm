import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('frappe-ui', () => ({
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/composables/useEquipo', async (importOriginal) => ({
  ...(await importOriginal()),
  equipoApi: vi.fn(),
}))
import { equipoApi } from '@/composables/useEquipo'
import EquipoOrganigrama from '@/pages/EquipoOrganigrama.vue'
import {
  bossOptions,
  buildTree,
  canDrop,
  chainOf,
  descendants,
  lensSet,
  roleLine,
  visibleFor,
  withMove,
} from '@/components/equipo/organigrama'

const person = (employee, full_name, extra = {}) => ({
  employee,
  full_name,
  user: `${employee}@example.invalid`,
  puesto: '',
  designation: null,
  reports_to: null,
  loose: !extra.reports_to,
  boss_gone: false,
  boss_hidden: false,
  capabilities: [],
  can_do: [],
  can_do_more: 0,
  editable: true,
  blocked: null,
  ...extra,
})

const TEAM = [
  person('E1', 'Diana Dueña', {
    puesto: 'Dueño',
    capabilities: ['cobrar', 'dinero'],
  }),
  person('E2', 'Teresa García', {
    puesto: 'Encargado',
    reports_to: 'E1',
    capabilities: ['cobrar', 'autorizar'],
    sees_reports: true,
    can_do: ['autorizar ventas, descuentos y clientes', 'cobrar en la caja'],
    can_do_more: 1,
  }),
  person('E3', 'Ana Cajera', {
    puesto: 'Cajero',
    reports_to: 'E2',
    capabilities: ['cobrar'],
  }),
  person('E4', 'Brandon López', {
    puesto: 'Técnico',
    designation: 'Técnico de celulares',
  }),
]

describe('organigrama tree', () => {
  it('nests people under whom they report to, the owner first', () => {
    const { roots, nodes } = buildTree(TEAM)
    expect(roots.map((r) => r.employee)).toEqual(['E1', 'E4'])
    expect(nodes.get('E1').children.map((c) => c.employee)).toEqual(['E2'])
    expect(nodes.get('E1').total).toBe(2)
    expect([...descendants(nodes.get('E1'))].sort()).toEqual(['E2', 'E3'])
    expect(chainOf('E3', nodes).map((n) => n.employee)).toEqual(['E1', 'E2'])
  })

  it('roots a loop and a hidden boss instead of losing the person', () => {
    const { roots, nodes } = buildTree([
      person('A', 'Ana', { reports_to: 'B' }),
      person('B', 'Beto', { reports_to: 'A' }),
      person('C', 'Carla', { reports_to: 'ZZ' }),
    ])
    expect(roots.map((r) => r.employee).sort()).toEqual(['B', 'C'])
    expect(nodes.get('B').children.map((c) => c.employee)).toEqual(['A'])
  })

  it('a search keeps the bosses above a match', () => {
    const { nodes } = buildTree(TEAM)
    expect([...visibleFor('ana', nodes)].sort()).toEqual(['E1', 'E2', 'E3'])
    expect([...visibleFor('celulares', nodes)]).toEqual(['E4'])
    expect(visibleFor('  ', nodes)).toBeNull()
  })

  it('offers every boss but the person’s own team, the current one first', () => {
    const { nodes } = buildTree(TEAM)
    const options = bossOptions('E2', nodes)
    expect(options[0]).toMatchObject({ employee: 'E1', current: true })
    expect(options.find((o) => o.employee === 'E3').under).toBe(true)
    expect(options.some((o) => o.employee === 'E2')).toBe(false)
  })

  it('never drops a person under their own team or where they already are', () => {
    const { nodes } = buildTree(TEAM)
    expect(canDrop(nodes.get('E2'), nodes.get('E3'))).toBe(false)
    expect(canDrop(nodes.get('E2'), nodes.get('E1'))).toBe(false)
    expect(canDrop(nodes.get('E3'), nodes.get('E4'))).toBe(true)
    expect(canDrop(nodes.get('E3'), null)).toBe(true)
    expect(canDrop(nodes.get('E4'), null)).toBe(false)
    expect(
      canDrop({ ...nodes.get('E3'), editable: false }, nodes.get('E4')),
    ).toBe(false)
  })

  it('the lens answers who can, and a move shows before the server', () => {
    expect([...lensSet('autorizar', TEAM)]).toEqual(['E2'])
    expect(lensSet('', TEAM)).toBeNull()
    const moved = withMove(TEAM, 'E4', 'E2')
    expect(moved.find((p) => p.employee === 'E4')).toMatchObject({
      reports_to: 'E2',
      loose: false,
    })
    expect(roleLine(TEAM[3])).toBe('Técnico, Técnico de celulares')
  })
})

// ── The page ──

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})
const originalWidth = window.innerWidth
function resize(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}
afterEach(() => resize(originalWidth))
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}
const text = (el) => el.textContent.replace(/\s+/g, ' ')

const CHART = (extra = {}) => ({
  hr: false,
  capabilities: [
    { key: 'cobrar', label: 'Charge at the register', count: 3 },
    { key: 'autorizar', label: 'Authorize discounts and sales', count: 1 },
  ],
  people: TEAM,
  without_record: [],
  suggestion: { boss: 'E1', boss_name: 'Diana Dueña', people: ['E4'] },
  companies: ['Grupo'],
  guard: null,
  ...extra,
})

function answer(map) {
  equipoApi.mockImplementation(async (method, args) => {
    const key = method.split('.').pop()
    const value = map[key]
    if (value instanceof Error) throw value
    return typeof value === 'function' ? value(args) : value
  })
}

async function mountPage(path = '/equipo/organigrama') {
  const page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/equipo', name: 'Equipo', component: page },
      {
        path: '/equipo/persona/:employee',
        name: 'EquipoPersona',
        component: page,
      },
      {
        path: '/equipo/organigrama',
        name: 'EquipoOrganigrama',
        component: page,
      },
    ],
  })
  await router.push(path)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(EquipoOrganigrama)
  app.config.globalProperties.__ = globalThis.__
  app.use(router).mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return { el, router }
}

const names = (el) =>
  [...el.querySelectorAll('[data-testid=org-name]')].map((n) =>
    n.textContent.trim(),
  )

describe('Organigrama page', () => {
  beforeEach(() => resize(1280))

  it('draws the tree with the owner on top and the loose person beside', async () => {
    answer({ get_chart: CHART() })
    const { el } = await mountPage()
    expect(names(el)).toEqual([
      'Diana Dueña',
      'Teresa García',
      'Ana Cajera',
      'Brandon López',
    ])
    expect(text(el.querySelector('[data-testid=org-summary]'))).toContain(
      '4 people',
    )
    expect(text(el.querySelector('[data-testid=org-suggestion]'))).toContain(
      'Brandon López reports to nobody.',
    )
    // The desk's pane: who can do what, before anyone is picked.
    expect(text(el.querySelector('[data-testid=org-pane]'))).toContain(
      'Charge at the register',
    )
  })

  it('a lens says who can and marks them on the tree', async () => {
    answer({ get_chart: CHART() })
    const { el, router } = await mountPage(
      '/equipo/organigrama?puede=autorizar',
    )
    expect(router.currentRoute.value.query.puede).toBe('autorizar')
    expect(text(el.querySelector('[data-testid=org-lens-line]'))).toContain(
      'Only Teresa García can: Authorize discounts and sales.',
    )
  })

  it('a tap opens the person beside the tree with their boss and team', async () => {
    answer({ get_chart: CHART() })
    const { el, router } = await mountPage()
    const rows = [...el.querySelectorAll('[data-testid=org-row]')]
    rows[1].click()
    await flush()
    expect(router.currentRoute.value.query.persona).toBe('E2')
    const pane = el.querySelector('[data-testid=org-pane]')
    expect(
      text(pane.querySelector('[data-testid=org-persona-boss]')).trim(),
    ).toBe('Diana Dueña')
    expect(
      text(pane.querySelector('[data-testid=org-persona-team]')),
    ).toContain('Ana Cajera')
    expect(text(pane)).toContain('Everything their roles allow (3)')
    // The tree is a permission: her user, limited to her own record, opens her team's.
    expect(pane.querySelector('[data-testid=org-persona-sees]')).not.toBeNull()
  })

  it('the suggestion moves the loose people in one request', async () => {
    const moved = vi.fn(() => ({
      ok: true,
      moved: ['E4'],
      message: 'Done: 1 people now report to Diana Dueña.',
    }))
    answer({ get_chart: CHART(), set_reports_to_many: moved })
    const { el } = await mountPage()
    el.querySelector('[data-testid=org-suggestion-apply]').click()
    await flush()
    expect(moved).toHaveBeenCalledWith({ employees: ['E4'], reports_to: 'E1' })
    expect(el.querySelector('[data-testid=org-suggestion]')).toBeNull()
    expect(text(el.querySelector('[data-testid=org-notice]'))).toContain('Done')
  })

  it('a refused move puts the tree back and says why', async () => {
    const error = new Error('refused')
    error.messages = ['Only the owner changes whom an owner reports to.']
    answer({ get_chart: CHART(), set_reports_to_many: error })
    const { el } = await mountPage()
    el.querySelector('[data-testid=org-suggestion-apply]').click()
    await flush()
    expect(el.querySelector('[data-testid=org-suggestion]')).not.toBeNull()
    expect(text(el.querySelector('[data-testid=org-notice]'))).toContain(
      'Only the owner',
    )
  })

  it('a guard explains and offers the way back to Equipo', async () => {
    answer({
      get_chart: CHART({
        people: [],
        guard: {
          code: 'no_employee_access',
          message: 'No access.',
          actions: [],
        },
      }),
    })
    const { el } = await mountPage()
    expect(text(el.querySelector('[data-testid=org-guard]'))).toContain(
      'No access.',
    )
    expect(el.querySelector('[data-testid=org-tree]')).toBeNull()
  })
})
