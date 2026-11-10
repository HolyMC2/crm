// @muelle/ui (muelle/workspace/packages/ui) as the apps vendor it: the same
// behaviour as the crm's own components/ui, wired through configureUi instead
// of the crm's modules. Assertions are on roles, ARIA and events, not classes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

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

import { statusLabel, statusTone } from '@/utils/display'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  FilterChips,
  KpiTile,
  ListRow,
  PageHeader,
  SearchPanel,
  Segmented,
  StatusChip,
  configureUi,
  t,
} from '@/components/ui'

const state = { phone: ref(true), boot: ref(null) }
configureUi({
  statusLabel,
  statusTone,
  isMobile: state.phone,
  bell: { render: () => h('button', { 'data-bell': '' }, 'Avisos') },
  showBell: () => Boolean(state.boot.value?.avisos),
})

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
  for (const key of [
    'modelValue',
    'open',
    'scope',
    'search',
    'searchOpen',
    'query',
    'fullscreen',
  ])
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
// The on-screen keyboard as the visual viewport sees it: it shrinks when the
// keyboard shows and grows back when it goes (Android's back button keeps the
// field focused, so the viewport is the only sign).
function keyboard() {
  const viewport = Object.assign(new EventTarget(), { height: 900 })
  window.visualViewport = viewport
  const resize = (height) => {
    viewport.height = height
    viewport.dispatchEvent(new Event('resize'))
  }
  return { show: () => resize(540), hide: () => resize(900) }
}
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
  // F16-2: a drill-down record (stack false) keeps arrow and title on one row
  // while the title has room, and takes the title's own row before it would
  // collapse to «Ga…» beside four icons (SPEC §1.2).
  it.each([
    [true, 144, false],
    [false, 144, false],
    [false, 48, true],
  ])(
    'at 305px (stack %s, icons %ipx) the title stays beside the arrow: %s',
    async (stack, icons, beside) => {
      const width = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(305)
      const offset = vi
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(icons)
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
  it('back: true with no router entry goes back to the page it came from', async () => {
    Object.defineProperty(document, 'referrer', {
      value: `${location.origin}/desk`,
      configurable: true,
    })
    Object.defineProperty(window.history, 'length', {
      value: 3,
      configurable: true,
    })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await mount(AppBar, { title: 'Impresión', back: true })
    const push = vi.spyOn(router, 'push')
    root.querySelector('[data-appbar-back]').click()
    await flush()
    expect(back).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    back.mockRestore()
    delete document.referrer
    delete window.history.length
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
  it("a record's island follows the name from 768 px; other bars keep their actions at the edge", async () => {
    const actions = {
      actions: () => h('button', { 'data-reach': '' }, 'Llamar'),
    }
    await mount(
      AppBar,
      { title: 'Publico en General', back: true, island: true, bell: false },
      actions,
    )
    const title = root.querySelector('[data-appbar-title]').closest('.flex-1')
    const row = root.querySelector('[data-appbar-island]')
    // Sized to the name from md up, and the spare width after the icons.
    expect(title.classList).toContain('md:flex-initial')
    expect(row.classList).toContain('md:mr-auto')
    expect(row.querySelector('[data-reach]')).not.toBeNull()
    // The phone classes are the same as any bar's: the island stays at the edge there.
    expect(title.classList).toContain('flex-1')
    app.unmount()
    root.remove()
    await mount(AppBar, { title: 'Compras', back: true, bell: false }, actions)
    expect(root.querySelector('[data-appbar-island]')).toBeNull()
    expect(
      root.querySelector('[data-appbar-title]').closest('.flex-1').classList,
    ).not.toContain('md:flex-initial')
    expect(root.querySelector('.md\\:mr-auto')).toBeNull()
  })
})

describe('the search panel: typing, the keyboard, the list scrolling', () => {
  let now = 10_000
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete window.visualViewport
  })
  // A tap: the pointer lands before the click, as on a phone.
  const tap = (el) => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    el.click()
  }
  const type = (input, value) => {
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  // A list beside the bar; scroll events never bubble, the document's capture listener sees them.
  const list = () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let top = 0
    Object.defineProperty(el, 'scrollTop', {
      get: () => top,
      configurable: true,
    })
    return {
      el,
      to(y) {
        top = y
        el.dispatchEvent(new Event('scroll'))
      },
    }
  }
  const panel = () => root.querySelector('[data-appbar-search-panel]')
  const toggle = () => root.querySelector('[data-appbar-panel-toggle]')
  const activeChip = () => root.querySelector('[data-active-chip]')
  const slots = {
    'search-panel': () =>
      h('div', [h('button', { type: 'button', 'data-chip': '' }, 'Pagadas')]),
    active: () => h('span', { 'data-active-chip': '' }, 'Pagadas'),
  }

  it('ends an empty search when the keyboard goes away', async () => {
    const kb = keyboard()
    const { events } = await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true },
      slots,
    )
    expect(panel()).not.toBeNull()
    expect(toggle()).toBeNull()
    expect(document.activeElement).toBe(
      root.querySelector('[data-appbar-search]'),
    )
    kb.show()
    kb.hide()
    await flush()
    expect(events).toContainEqual(['update:searchOpen', false])
  })

  it('typing folds the panel so the results show live; the filters button unfolds it; an empty field shows it again', async () => {
    keyboard()
    const { bound } = await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true },
      slots,
    )
    const input = root.querySelector('[data-appbar-search]')
    type(input, 'c')
    await flush()
    expect(bound.search).toBe('c')
    expect(panel()).toBeNull()
    // What narrows the list stays in sight while the panel is folded.
    expect(activeChip()).not.toBeNull()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    tap(toggle())
    await flush()
    expect(panel()).not.toBeNull()
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).not.toBe(input)
    tap(toggle())
    await flush()
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(input)
    tap(root.querySelector('[aria-label="Clear search"]'))
    await flush()
    expect(bound.search).toBe('')
    expect(panel()).not.toBeNull()
    expect(toggle()).toBeNull()
  })

  it('opens folded over a query; the keyboard going away folds an unfolded one and keeps the query', async () => {
    const kb = keyboard()
    const { events } = await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true, search: 'cell' },
      slots,
    )
    expect(panel()).toBeNull()
    expect(activeChip()).not.toBeNull()
    tap(toggle())
    await flush()
    expect(panel()).not.toBeNull()
    const input = root.querySelector('[data-appbar-search]')
    input.focus()
    kb.show()
    kb.hide()
    await flush()
    expect(panel()).toBeNull()
    expect(input.value).toBe('cell')
    expect(events).not.toContainEqual(['update:searchOpen', false])
    expect(events).not.toContainEqual(['update:search', ''])
  })

  it('keeps the panel through a tap on a chip and folds it when the focus leaves the bar', async () => {
    keyboard()
    await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true, search: 'cell' },
      slots,
    )
    tap(toggle())
    await flush()
    const input = root.querySelector('[data-appbar-search]')
    input.focus()
    root
      .querySelector('[data-chip]')
      .dispatchEvent(new Event('pointerdown', { bubbles: true }))
    input.blur()
    await flush()
    expect(panel()).not.toBeNull()
    // Later, the field loses its focus to the list (iOS «Done», a tap outside).
    input.focus()
    now += 5_000
    input.blur()
    await flush()
    expect(panel()).toBeNull()
  })

  it('a bar without a panel keeps its search through the keyboard going', async () => {
    const kb = keyboard()
    const { events } = await mount(AppBar, {
      title: 'Compras',
      searchable: true,
      searchOpen: true,
    })
    kb.show()
    kb.hide()
    await flush()
    expect(events).not.toContainEqual(['update:searchOpen', false])
  })

  it('SearchPanel: typing folds it, the filters button unfolds it, the keyboard going folds it behind the button', async () => {
    const kb = keyboard()
    const { bound } = await mount(
      SearchPanel,
      { placeholder: 'Buscar contactos', open: false, query: '' },
      {
        default: () => h('button', { type: 'button' }, 'Clientes'),
        active: () => h('span', { 'data-active-chip': '' }, 'Clientes'),
      },
    )
    const input = root.querySelector('[data-list-search]')
    const sp = () => root.querySelector('[data-testid="search-panel"]')
    const spToggle = () =>
      root.querySelector('[data-testid="search-panel-toggle"]')
    input.focus()
    await flush()
    expect(bound.open).toBe(true)
    expect(sp()).not.toBeNull()
    expect(spToggle()).toBeNull()
    expect(
      root.querySelector('[data-testid="search-panel-done"]'),
    ).not.toBeNull()
    type(input, 'ana')
    await flush()
    expect(bound.query).toBe('ana')
    expect(sp()).toBeNull()
    expect(activeChip()).not.toBeNull()
    expect(spToggle().getAttribute('aria-pressed')).toBe('false')
    expect(root.querySelector('[data-testid="search-panel-done"]')).toBeNull()
    tap(spToggle())
    await flush()
    expect(sp()).not.toBeNull()
    input.focus()
    kb.show()
    kb.hide()
    await flush()
    expect(bound.open).toBe(true)
    expect(sp()).toBeNull()
    expect(spToggle().getAttribute('aria-pressed')).toBe('false')
    expect(bound.query).toBe('ana')
    expect(input.value).toBe('ana')
    // Nothing typed: the keyboard going closes it.
    type(input, '')
    await flush()
    expect(sp()).not.toBeNull()
    input.focus()
    kb.show()
    kb.hide()
    await flush()
    expect(bound.open).toBe(false)
  })

  it('scrolling the list folds the panel: an empty search ends, a query stays behind the filters button', async () => {
    keyboard()
    const { events } = await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true },
      slots,
    )
    const results = list()
    // The panel's own first moments never count, nor a nudge, nor the panel's own scroll.
    results.to(10)
    results.to(200)
    await flush()
    expect(panel()).not.toBeNull()
    now += 1_000
    results.to(200)
    results.to(210)
    await flush()
    expect(panel()).not.toBeNull()
    panel().dispatchEvent(new Event('scroll'))
    await flush()
    expect(panel()).not.toBeNull()
    results.to(260)
    await flush()
    expect(events).toContainEqual(['update:searchOpen', false])
  })

  it('scrolling under an unfolded query folds it and keeps the query', async () => {
    keyboard()
    const { events } = await mount(
      AppBar,
      { title: 'Compras', searchable: true, searchOpen: true, search: 'cell' },
      slots,
    )
    tap(toggle())
    await flush()
    expect(panel()).not.toBeNull()
    const results = list()
    now += 1_000
    results.to(0)
    results.to(40)
    await flush()
    expect(panel()).toBeNull()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    expect(root.querySelector('[data-appbar-search]').value).toBe('cell')
    expect(events).not.toContainEqual(['update:searchOpen', false])
    expect(events).not.toContainEqual(['update:search', ''])
    // Unfolded again, the next scroll folds it again.
    tap(toggle())
    await flush()
    now += 1_000
    results.to(40)
    results.to(100)
    await flush()
    expect(panel()).toBeNull()
  })

  it('SearchPanel: scrolling the list closes an empty one and folds one with a query', async () => {
    keyboard()
    const { bound } = await mount(
      SearchPanel,
      { placeholder: 'Buscar contactos', open: false, query: '' },
      {
        default: () => h('button', { type: 'button' }, 'Clientes'),
        active: () => h('span', { 'data-active-chip': '' }, 'Clientes'),
      },
    )
    const input = root.querySelector('[data-list-search]')
    const sp = () => root.querySelector('[data-testid="search-panel"]')
    const spToggle = () =>
      root.querySelector('[data-testid="search-panel-toggle"]')
    input.focus()
    await flush()
    expect(sp()).not.toBeNull()
    const results = list()
    now += 1_000
    results.to(0)
    results.to(60)
    await flush()
    expect(bound.open).toBe(false)
    expect(sp()).toBeNull()
    input.focus()
    type(input, 'ana')
    await flush()
    tap(spToggle())
    await flush()
    expect(sp()).not.toBeNull()
    now += 1_000
    results.to(60)
    results.to(120)
    await flush()
    expect(bound.open).toBe(true)
    expect(sp()).toBeNull()
    expect(spToggle().getAttribute('aria-pressed')).toBe('false')
    expect(bound.query).toBe('ana')
    expect(activeChip()).not.toBeNull()
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
    // No v-model:fullscreen, no full screen.
    expect(dialog.querySelector('[aria-label="Full screen"]')).toBeNull()
  })
  it('v-model:fullscreen: on a wide screen a button beside the close fills the screen and back', async () => {
    state.phone.value = false
    const { bound, events } = await mount(BottomSheet, {
      open: true,
      title: 'A',
      fullscreen: false,
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.hasAttribute('data-fullscreen')).toBe(false)
    dialog.querySelector('[aria-label="Full screen"]').click()
    await flush()
    expect(events).toContainEqual(['update:fullscreen', true])
    expect(dialog.hasAttribute('data-fullscreen')).toBe(true)
    dialog.querySelector('[aria-label="Exit full screen"]').click()
    await flush()
    expect(bound.fullscreen).toBe(false)
    expect(dialog.hasAttribute('data-fullscreen')).toBe(false)
  })
  it('v-model:fullscreen: on a phone the handle always offers it, even for short content', async () => {
    const { bound } = await mount(BottomSheet, {
      open: true,
      ariaLabel: 'Chat',
      fullscreen: false,
    })
    const dialog = document.querySelector('[role="dialog"]')
    const handle = dialog.querySelector('[data-ui-sheet-handle]')
    expect(handle.getAttribute('aria-label')).toBe('Full screen')
    handle.click()
    await flush()
    expect(bound.fullscreen).toBe(true)
    expect(dialog.hasAttribute('data-fullscreen')).toBe(true)
    expect(handle.getAttribute('aria-label')).toBe('Exit full screen')
    // The parent keeps the choice: the next open starts full screen.
    bound.open = false
    await flush()
    bound.open = true
    await flush()
    expect(
      document.querySelector('[role="dialog"]').hasAttribute('data-fullscreen'),
    ).toBe(true)
    expect(bound.fullscreen).toBe(true)
  })
  it('a phone sheet with short content and no v-model:fullscreen has no handle button', async () => {
    await mount(BottomSheet, { open: true, ariaLabel: 'Chat' })
    expect(document.querySelector('[data-ui-sheet-handle]')).toBeNull()
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

describe('@muelle/ui without a host translation', () => {
  it('speaks es-MX on a Spanish page and English elsewhere', () => {
    const saved = globalThis.__
    delete globalThis.__
    try {
      document.documentElement.lang = 'es-MX'
      expect(t('Search')).toBe('Buscar')
      expect(t('{0} selected', [3])).toBe('3 seleccionados')
      document.documentElement.lang = 'en'
      expect(t('{0} selected', [3])).toBe('3 selected')
    } finally {
      globalThis.__ = saved
      document.documentElement.lang = ''
    }
  })
})
