// The shared phone primitives in components/ui (Shell program S1.1), mounted
// with their real logic. Assertions are on roles, ARIA and events (SPEC D7),
// not on Tailwind classes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ boot: null, phone: null }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label', 'variant', 'size'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { type: 'button', onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.phone = ref(true)
  return { isMobile: state.phone }
})
vi.mock('@/composables/muelleShell', async () => {
  const { ref } = await import('vue')
  state.boot = ref(null)
  return { shellBoot: state.boot }
})
vi.mock('@/vendor/muelle-shell/contracts', () => ({
  moduleEnabled: (boot, key) => Boolean(boot?.[key]),
}))
vi.mock('@/components/avisos/AvisosBell.vue', () => ({
  __esModule: true,
  default: { render: () => h('button', { 'data-bell': '' }, 'Avisos') },
}))

import AppBar from '@/components/ui/AppBar.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Fab from '@/components/ui/Fab.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import KpiTile from '@/components/ui/KpiTile.vue'
import ListRow from '@/components/ui/ListRow.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import StatusChip from '@/components/ui/StatusChip.vue'

let app, root, router
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
// Mount `component` with reactive props; v-model updates write back. Returns
// the props and the emitted events.
async function mount(component, props = {}, slots = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ ...props })
  const events = []
  const listeners = {}
  for (const key of ['modelValue', 'open', 'scope', 'search', 'searchOpen'])
    listeners[`onUpdate:${key}`] = (value) => {
      bound[key] = value
      events.push([`update:${key}`, value])
    }
  for (const name of [
    'back',
    'action',
    'apply-filters',
    'clear-filters',
    'start-select',
    'select-all',
    'clear-selection',
  ])
    listeners[`on${name.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase())}`] =
      (value) => events.push([name, value])
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/:any(.*)', component: { render: () => null } },
    ],
  })
  router.push('/')
  await router.isReady()
  app = createApp({
    render: () => h(component, { ...bound, ...listeners }, slots),
  })
  app.use(router)
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await flush()
  return { bound, events }
}
const all = (selector) => [...document.querySelectorAll(selector)]
const byText = (selector, text) =>
  all(selector).find((el) => el.textContent.trim().includes(text))

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.phone.value = true
  state.boot.value = null
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('AppBar', () => {
  it('shows the title with its count and context, and the bell', async () => {
    state.boot.value = { avisos: true }
    await mount(AppBar, { title: 'Vencido', count: 9, context: 'Cobranza' })
    const title = root.querySelector('[data-appbar-title]')
    expect(title.textContent).toContain('Vencido')
    expect(title.textContent).toContain('(9)')
    expect(root.textContent).toContain('Cobranza')
    expect(root.querySelector('[data-bell]')).not.toBeNull()
  })
  it('leaves the bell out when Avisos is off or the bar opts out', async () => {
    await mount(AppBar, { title: 'Compras' })
    expect(root.querySelector('[data-bell]')).toBeNull()
    app.unmount()
    state.boot.value = { avisos: true }
    await mount(AppBar, { title: 'Compras', bell: false })
    expect(root.querySelector('[data-bell]')).toBeNull()
  })
  it('goes up to the parent list', async () => {
    await mount(AppBar, { title: 'CellCity', back: '/compras' })
    const back = root.querySelector('[data-appbar-back]')
    expect(back.tagName).toBe('A')
    expect(back.getAttribute('href')).toBe('/compras')
    expect(back.getAttribute('aria-label')).toBe('Back')
  })
  it.each([
    [true, false],
    [false, true],
  ])(
    'at 305px a long title takes its own row (stack %s → beside the arrow: %s)',
    async (stack, beside) => {
      const width = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(305)
      const offset = vi
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(144)
      await mount(AppBar, {
        title: 'Samsung Galaxy A54 de prueba',
        back: '/productos',
        stack,
      })
      await flush()
      const title = root.querySelector('[data-appbar-title]')
      const row = root.querySelector('[data-appbar-back]').parentElement
      const sameRow = row.contains(title)
      expect(Boolean(sameRow)).toBe(beside)
      width.mockRestore()
      offset.mockRestore()
    },
  )
  it('back: true walks history, or goes home without one', async () => {
    const { events } = await mount(AppBar, { title: 'Pendiente', back: true })
    root.querySelector('[data-appbar-back]').click()
    await flush()
    expect(events.map((e) => e[0])).toContain('back')
    expect(router.currentRoute.value.path).toBe('/')
  })
  it('a title with scopes opens the list sheet and switches list', async () => {
    const { events, bound } = await mount(AppBar, {
      title: 'Vencido',
      scope: 'vencido',
      scopes: [
        { value: 'vencido', label: 'Vencido', count: 9 },
        { value: 'semana', label: 'Esta semana', count: 4 },
      ],
    })
    const picker = root.querySelector('[aria-haspopup="dialog"]')
    expect(picker.getAttribute('aria-expanded')).toBe('false')
    picker.click()
    await flush()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Choose a list')
    expect(
      byText('[role="dialog"] button', 'Vencido').getAttribute('aria-current'),
    ).toBe('true')
    byText('[role="dialog"] button', 'Esta semana').click()
    await flush()
    expect(events).toContainEqual(['update:scope', 'semana'])
    expect(bound.scope).toBe('semana')
  })
  it('search opens in the bar, types and closes clearing it', async () => {
    const { events, bound } = await mount(AppBar, {
      title: 'Compras',
      searchable: true,
      searchLabel: 'Buscar compras',
    })
    root.querySelector('[data-appbar-search-open]').click()
    await flush()
    const input = root.querySelector('[data-appbar-search]')
    expect(input.getAttribute('aria-label')).toBe('Buscar compras')
    input.value = 'cell'
    input.dispatchEvent(new Event('input'))
    await flush()
    expect(bound.search).toBe('cell')
    root.querySelector('[aria-label="Close search"]').click()
    await flush()
    expect(events).toContainEqual(['update:searchOpen', false])
    expect(bound.search).toBe('')
  })
  it('selection mode counts and offers clear and select-all', async () => {
    const { events } = await mount(AppBar, {
      title: 'Compras',
      selecting: true,
      selectedCount: 3,
    })
    expect(root.textContent).toContain('3 selected')
    root.querySelector('[aria-label="Select the visible page"]').click()
    root.querySelector('[aria-label="Clear selection"]').click()
    expect(events.map((e) => e[0])).toEqual(['select-all', 'clear-selection'])
  })
})

describe('BottomSheet', () => {
  it('opens as a titled dialog with its actions', async () => {
    await mount(
      BottomSheet,
      { open: true, title: 'Registrar pago', subtitle: 'Vence hoy' },
      {
        default: () => h('p', 'Monto'),
        actions: () => h('button', 'Guardar'),
      },
    )
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Registrar pago')
    expect(dialog.textContent).toContain('Vence hoy')
    expect(
      dialog.querySelector('[data-ui-sheet-actions]').textContent,
    ).toContain('Guardar')
  })
  it('Escape closes it unless it is not dismissible', async () => {
    const { events } = await mount(BottomSheet, { open: true, title: 'A' })
    document
      .querySelector('[role="dialog"]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    await flush()
    expect(events).toContainEqual(['update:open', false])
    app.unmount()
    document.body.innerHTML = ''
    const guarded = await mount(BottomSheet, {
      open: true,
      title: 'B',
      dismissible: false,
    })
    document
      .querySelector('[role="dialog"]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    await flush()
    expect(guarded.events).toEqual([])
  })
  it('the phone back button closes it; closing in the UI drops its entry', async () => {
    const { bound, events } = await mount(BottomSheet, {
      open: true,
      title: 'A',
    })
    expect(window.history.state?.uiSheet).toMatch(/^ui-sheet-/)
    // Back: the browser leaves the sheet's entry, then fires popstate.
    window.history.replaceState({}, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    await flush()
    expect(events).toContainEqual(['update:open', false])
    expect(bound.open).toBe(false)

    bound.open = true
    await flush()
    expect(window.history.state?.uiSheet).toMatch(/^ui-sheet-/)
    const back = vi.spyOn(window.history, 'back')
    bound.open = false
    await flush()
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })
  it('is a centred dialog with a close button on wide screens', async () => {
    state.phone.value = false
    await mount(BottomSheet, { open: true, title: 'A' })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.querySelector('[aria-label="Close"]')).not.toBeNull()
    // Back closes it on a tablet or a phone in landscape too.
    expect(window.history.state?.uiSheet).toMatch(/^ui-sheet-/)
  })
})

describe('Segmented', () => {
  const options = [
    { value: 'lista', label: 'Lista' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mes' },
  ]
  it('is a radio group with one checked segment', async () => {
    const { bound } = await mount(Segmented, {
      modelValue: 'lista',
      options,
      label: 'Vista',
    })
    const tabs = all('[role="radio"]')
    expect(
      root.querySelector('[role="radiogroup"]').getAttribute('aria-label'),
    ).toBe('Vista')
    expect(tabs.map((t) => t.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ])
    tabs[2].click()
    await flush()
    expect(bound.modelValue).toBe('mes')
    root
      .querySelector('[role="radiogroup"]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    await flush()
    expect(bound.modelValue).toBe('lista')
  })
})

describe('FilterChips', () => {
  const chips = [
    { value: 'todas', label: 'Todas', count: 31 },
    { value: '31-60', label: '31–60 días', count: 2 },
  ]
  it('single choice: pressed state, choose and clear again', async () => {
    const { bound } = await mount(FilterChips, { modelValue: 'todas', chips })
    const chip = (v) => root.querySelector(`[data-chip="${v}"]`)
    expect(chip('todas').getAttribute('aria-pressed')).toBe('true')
    expect(chip('31-60').textContent).toContain('2')
    chip('31-60').click()
    await flush()
    expect(bound.modelValue).toBe('31-60')
    chip('31-60').click()
    await flush()
    expect(bound.modelValue).toBe('')
  })
  it('multiple choice toggles values', async () => {
    const { bound } = await mount(FilterChips, {
      modelValue: [],
      chips,
      multiple: true,
    })
    root.querySelector('[data-chip="todas"]').click()
    await flush()
    root.querySelector('[data-chip="31-60"]').click()
    await flush()
    expect(bound.modelValue).toEqual(['todas', '31-60'])
    root.querySelector('[data-chip="todas"]').click()
    await flush()
    expect(bound.modelValue).toEqual(['31-60'])
  })
  it('the «Filtros» chip counts and opens the sheet', async () => {
    const { events } = await mount(
      FilterChips,
      { modelValue: 'todas', chips, filtersCount: 2 },
      { filters: () => h('p', 'Responsable') },
    )
    const filters = root.querySelector('[data-ui-filters-chip]')
    expect(filters.getAttribute('aria-label')).toBe('2 filters on')
    filters.click()
    await flush()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Responsable')
    byText('[role="dialog"] button', 'Clear filters').click()
    byText('[role="dialog"] button', 'Show results').click()
    await flush()
    expect(events.map((e) => e[0])).toEqual(['clear-filters', 'apply-filters'])
  })
  it('the chip that is on scrolls into the row, past the end fade (PM, S1.3 shots)', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.getAttribute('role') === 'group')
          return { left: 0, right: 300 }
        if (this.dataset?.chip === '31-60') return { left: 320, right: 420 }
        return { left: 0, right: 0 }
      })
    await mount(FilterChips, { modelValue: '31-60', chips })
    await flush()
    expect(root.querySelector('[role="group"]').scrollLeft).toBe(160)
    rect.mockRestore()
  })
  it('no «Filtros» chip without a filters slot', async () => {
    await mount(FilterChips, { modelValue: '', chips })
    expect(root.querySelector('[data-ui-filters-chip]')).toBeNull()
  })
})

describe('ListRow', () => {
  it('is a link with `to`, a button with a click, plain otherwise', async () => {
    await mount(ListRow, { title: 'XMovil', to: '/gastos/x' })
    expect(root.querySelector('[data-ui-list-row]').tagName).toBe('A')
    app.unmount()
    const clicked = vi.fn()
    await mount(ListRow, { title: 'XMovil', onClick: clicked })
    const row = root.querySelector('[data-ui-list-row]')
    expect(row.tagName).toBe('BUTTON')
    row.click()
    expect(clicked).toHaveBeenCalledTimes(1)
    app.unmount()
    await mount(ListRow, { title: 'XMovil' })
    expect(root.querySelector('[data-ui-list-row]').tagName).toBe('DIV')
  })
  it('shows initials, the secondary line and trailing meta', async () => {
    await mount(ListRow, {
      title: 'Karla Martínez',
      subtitle: '+52 667 323 8069',
      meta: 'hace 17 min',
      avatar: 'Karla Martínez',
    })
    expect(root.textContent).toContain('KM')
    expect(root.textContent).toContain('+52 667 323 8069')
    expect(root.textContent).toContain('hace 17 min')
  })
})

describe('the rest', () => {
  it('EmptyState offers its action', async () => {
    const { events } = await mount(EmptyState, {
      title: 'No tienes pendientes',
      action: 'Nuevo pendiente',
    })
    expect(root.querySelector('[data-pane-state="empty"]')).not.toBeNull()
    byText('button', 'Nuevo pendiente').click()
    expect(events).toContainEqual(['action', undefined])
  })
  it('Fab is a labelled button or link', async () => {
    await mount(Fab, { label: 'Nuevo pendiente' })
    const fab = root.querySelector('[data-ui-fab]')
    expect(fab.tagName).toBe('BUTTON')
    expect(fab.getAttribute('aria-label')).toBe('Nuevo pendiente')
    app.unmount()
    await mount(Fab, { label: 'Nueva compra', to: '/compras/nueva' })
    expect(root.querySelector('[data-ui-fab]').getAttribute('href')).toBe(
      '/compras/nueva',
    )
  })
  it('KpiTile: label over value; the whole tile links', async () => {
    await mount(KpiTile, {
      label: 'Por cobrar',
      value: '$1,400.00',
      to: '/cobranza',
    })
    const tile = root.querySelector('[data-ui-kpi]')
    expect(tile.tagName).toBe('A')
    expect(tile.textContent).toMatch(/Por cobrar\s*\$1,400\.00/)
  })
  it('StatusChip speaks es-MX and carries its tone', async () => {
    await mount(StatusChip, { status: 'No Answer', kind: 'call' })
    const chip = root.querySelector('[data-ui-status]')
    expect(chip.textContent.trim()).toBe('Sin respuesta')
    expect(chip.dataset.tone).toBe('warning')
  })
  it('PageHeader: a heading, its subtitle and actions', async () => {
    await mount(
      PageHeader,
      { title: 'Productos', subtitle: 'Por surtir', count: 24 },
      { actions: () => h('button', 'Dar de alta') },
    )
    expect(root.querySelector('h2').textContent).toContain('Productos')
    expect(root.textContent).toContain('Por surtir')
    expect(root.querySelector('[data-ui-page-actions]').textContent).toContain(
      'Dar de alta',
    )
  })
})

describe('BottomSheet without a visible title', () => {
  it('still names the dialog for screen readers', async () => {
    await mount(BottomSheet, { open: true, ariaLabel: 'Pregúntale a Muelle' })
    const dialog = document.querySelector('[role="dialog"]')
    const id = dialog.getAttribute('aria-labelledby')
    expect(document.getElementById(id).textContent.trim()).toBe(
      'Pregúntale a Muelle',
    )
  })
})
