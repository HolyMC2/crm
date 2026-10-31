import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const state = vi.hoisted(() => ({ call: vi.fn(), mobile: null, toasts: [] }))
vi.mock('frappe-ui', async () => {
  const { h, ref } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: {
      success: (text) => state.toasts.push(['success', text]),
      error: (text) => state.toasts.push(['error', text]),
    },
    useColorScheme: () => ({
      colorScheme: ref('light'),
      setColorScheme: vi.fn(),
    }),
    Button: {
      props: ['label'],
      setup: (props) => () => h('button', props.label),
    },
    createResource: () => ({ data: null, fetch: vi.fn() }),
    // The assistant sheet (its own suite) still uses frappe-ui's sheet.
    BottomSheet: { render: () => null },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { computed, ref } = await import('vue')
  state.mobile = ref(false)
  return {
    isMobile: state.mobile,
    isNarrow: state.mobile,
    isWide: computed(() => !state.mobile.value),
  }
})
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ logout: { submit: vi.fn() } }),
}))
vi.mock('@/composables/ventasNav', async () => {
  const { ref } = await import('vue')
  const ventasCompact = ref(false)
  return {
    ventasCompact,
    toggleVentasCompact: () => (ventasCompact.value = !ventasCompact.value),
    useVentasNav: () => ({
      primary: ref([]),
      more: ref([]),
      settings: ref([]),
      secondary: ref([]),
      groupOf: () => '',
      badgeFor: () => 0,
      sectionBadge: () => 0,
      isOpen: () => false,
      canClose: () => true,
      toggle: () => {},
    }),
  }
})
vi.mock('@/components/Notifications.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))
// The list warm-up (utils/listWarmup.js) is recorded, not run.
const warmUp = vi.hoisted(() => ({ calls: [] }))
vi.mock('@/utils/listWarmup', () => ({
  warmListsAfterFirstRoute: (router, modules, current) =>
    warmUp.calls.push({ modules, current }),
}))

import '@/uiHost'
import MuelleShell from '@/components/shell/MuelleShell.vue'
import { mobileView } from '@/composables/mobileView'
import { resetAppStripForTests } from '@/composables/appStrip'
import {
  hostedModules,
  isNeutralModule,
  moduleKeyFor,
  navSlots,
  resetShellForTests,
  shellBoot,
} from '@/composables/muelleShell'
import {
  createShellProviders,
  dealItem,
  inmobiliariaItems,
  loadRecent,
  orderPaletteSections,
  resolveRecent,
  toRecentRef,
} from '@/utils/shellPalette'
import { linkOf } from '@/composables/useInmobiliaria'
import {
  TIPOS,
  deskTipo,
  fichaFromDesk,
  parseFicha,
} from '@/utils/inmobiliariaTipos'
import { recoveryModule } from '@/utils/shellRoutes'
import Inmobiliaria from '@/pages/Inmobiliaria.vue'
import InmobiliariaCola from '@/pages/InmobiliariaCola.vue'
import InmobiliariaDisponibilidad from '@/pages/InmobiliariaDisponibilidad.vue'
import InmobiliariaFicha from '@/pages/InmobiliariaFicha.vue'
import NotPermitted from '@/pages/NotPermitted.vue'
import { showSettings } from '@/composables/settings'
import {
  RAIL_SAVE_DELAY_MS,
  resetRailCountsForTests,
  resetRailForTests,
  scanPickHref,
  scanPickTarget,
} from '@/composables/shellRail'
import {
  closeShortcutSheet,
  keyLabel,
  pageShortcuts,
  registerPageKeys,
  registerPageShortcuts,
  searchEntryHint,
  shellCheatSheet,
  shellT,
  tabbables,
} from '@/composables/shellKeyboard'
import { agendaShortcuts } from '@/composables/useAgenda'
import { useRecordActions } from '@/composables/recordActions'
import { bootScope } from '@/vendor/muelle-shell/contracts'

function boot(overrides = {}) {
  return {
    user: {
      name: 'ana@example.test',
      full_name: 'Ana López',
      nav_role: 'vendedor',
    },
    modules: {
      contactos: {
        key: 'contactos',
        enabled: true,
        capabilities: { read: true, create: true },
      },
      ventas: { key: 'ventas', enabled: true, capabilities: { read: true } },
      avisos: {
        key: 'avisos',
        enabled: true,
        capabilities: { read: true },
        badge: { count: 3, capped: false },
      },
    },
    ...overrides,
  }
}

let app, root, router
const API = 'doco.docoutils.assistant.shell_api'
async function mount(path) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/contactos',
        component: { render: () => h('p', 'Contactos page') },
        meta: { app: 'contactos', title: 'Contactos' },
      },
      {
        path: '/compras',
        component: { render: () => h('p', 'Compras page') },
        meta: { app: 'compras', title: 'Compras' },
      },
      {
        path: '/cobranza/cliente/:customer',
        component: { render: () => h('p', 'Cobranza customer') },
        meta: {
          app: 'cobranza',
          title: 'Cobranza',
          listParent: 'Cobranza',
          ownPhoneHeader: true,
          ownBottomBar: true,
        },
      },
      {
        path: '/gastos',
        component: { render: () => h('p', 'Gastos page') },
        meta: { app: 'gastos', title: 'Gastos' },
      },
      {
        path: '/productos',
        component: { render: () => h('p', 'Productos page') },
        meta: { app: 'productos', title: 'Productos' },
      },
      {
        path: '/archivos',
        component: { render: () => h('p', 'Archivos page') },
        meta: { app: 'archivos', title: 'Archivos' },
      },
      {
        path: '/inmobiliaria/:rest(.*)*',
        component: { render: () => h('p', 'Inmobiliaria page') },
        meta: { app: 'inmobiliaria', title: 'Inmobiliaria' },
      },
      {
        path: '/agenda',
        component: { render: () => h('p', 'Agenda page') },
        meta: { app: 'agenda', title: 'Agenda', ownPhoneHeader: true },
      },
      { path: '/deals', component: { render: () => h('p', 'Deals page') } },
      {
        path: '/reports',
        component: { render: () => h('p', 'Reports page') },
        meta: { title: 'Reports' },
      },
      { path: '/ventas', component: { render: () => null } },
      {
        path: '/ventas/deal/:dealId',
        component: { render: () => h('p', 'Deal') },
      },
      {
        path: '/avisos',
        component: { render: () => h('p', 'Avisos page') },
        meta: { app: 'avisos', title: 'Avisos' },
      },
      {
        path: '/pendientes',
        component: { render: () => h('p', 'Pendientes page') },
        meta: { app: 'pendientes', title: 'Pendientes' },
      },
      {
        path: '/not-permitted',
        component: { render: () => h('p', 'Recovery page') },
        meta: { app: 'contactos', title: 'Permisos', recovery: true },
      },
    ],
  })
  await router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () => h(MuelleShell, null, { default: () => h('p', 'page') }),
  })
  // Contextual strings render as «text|context» so tests can see the context.
  app.config.globalProperties.__ = (text, args, context) => {
    const out = args
      ? text.replace(/{(\d+)}/g, (_, i) => args[i] ?? `{${i}}`)
      : text
    return context ? `${out}|${context}` : out
  }
  app.use(router)
  app.mount(root)
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  state.call.mockReset()
  state.call.mockImplementation(async (method) => {
    if (method === 'crm.api.shell.boot') return boot()
    throw new Error(`unexpected ${method}`)
  })
  shellBoot.value = null
  resetRailCountsForTests()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('module registry', () => {
  it('maps routes to their module: Contactos by its routes, every CRM page to Ventas', () => {
    expect(
      moduleKeyFor({
        path: '/contactos/contact/A',
        meta: { app: 'contactos' },
      }),
    ).toBe('contactos')
    expect(moduleKeyFor({ path: '/deals/view/list', meta: {} })).toBe('ventas')
    expect(moduleKeyFor({ path: '/ventas', meta: {} })).toBe('ventas')
    expect(moduleKeyFor({ path: '/avisos', meta: { app: 'avisos' } })).toBe(
      'avisos',
    )
    expect(
      moduleKeyFor({ path: '/pendientes', meta: { app: 'pendientes' } }),
    ).toBe('pendientes')
    expect(hostedModules.map((m) => m.key)).toEqual([
      'hoy',
      'pendientes',
      'agenda',
      'contactos',
      'ventas',
      'cobranza',
      'compras',
      'gastos',
      'resultados',
      'bancos',
      'efectivo',
      'productos',
      'garantias',
      'encuestas',
      'equipo',
      'archivos',
      'manual',
      'documentos',
      'inventario',
      'inmobiliaria',
      'avisos',
    ])
    expect(
      moduleKeyFor({
        path: '/inmobiliaria/venta/VTA-1',
        meta: { app: 'inmobiliaria' },
      }),
    ).toBe('inmobiliaria')
    expect(moduleKeyFor({ path: '/hoy', meta: { app: 'hoy' } })).toBe('hoy')
    expect(moduleKeyFor({ path: '/archivos', meta: { app: 'archivos' } })).toBe(
      'archivos',
    )
  })

  it('Cobranza is its own module and boots without the sales runtime', () => {
    expect(moduleKeyFor({ path: '/cobranza/cliente/Ana', meta: {} })).toBe(
      'cobranza',
    )
    expect(hostedModules.find((m) => m.key === 'cobranza')?.to).toBe(
      '/cobranza',
    )
    expect(isNeutralModule('cobranza')).toBe(true)
  })

  it('Compras is its own module and boots without the sales runtime', () => {
    expect(moduleKeyFor({ path: '/compras/orden/PO-1', meta: {} })).toBe(
      'compras',
    )
    expect(hostedModules.find((m) => m.key === 'compras')?.to).toBe('/compras')
    expect(isNeutralModule('compras')).toBe(true)
    expect(isNeutralModule('ventas')).toBe(false)
  })

  it('Agenda refused: the shell answers for the Agenda with its own reason', async () => {
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          agenda: {
            key: 'agenda',
            enabled: false,
            reason: 'Tu cuenta no puede abrir la Agenda.',
            capabilities: {},
          },
        },
      }),
    )
    await mount('/agenda')
    const alert = await until(() => document.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('We could not open Agenda')
    expect(alert.textContent).toContain('Tu cuenta no puede abrir la Agenda.')
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
    expect(document.body.textContent).not.toContain('Agenda page')
  })

  it('Archivos refused: the shell answers for Archivos with its own reason', async () => {
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          archivos: {
            key: 'archivos',
            enabled: false,
            reason: 'Tu puesto no tiene acceso a Archivos.',
            capabilities: {},
          },
        },
      }),
    )
    await mount('/archivos')
    const alert = await until(() => document.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('We could not open')
    expect(alert.textContent).toContain('Tu puesto no tiene acceso a Archivos.')
    // The reason never asks for Contactos; «Go to Contactos» is only where to keep working.
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
    expect(document.body.textContent).not.toContain('Archivos page')
  })

  function unavailable(key, overrides = {}) {
    return {
      key,
      state: 'unavailable',
      enabled: false,
      reason_code: 'error',
      reason:
        'No se pudo cargar Contactos. Vuelve a intentar; si sigue igual, avisa a soporte.',
      reason_text:
        'No se pudo cargar Contactos. Vuelve a intentar; si sigue igual, avisa a soporte.',
      resolve: null,
      retry: true,
      capabilities: {},
      ...overrides,
    }
  }

  it('Contactos unavailable: the rail keeps its tile with the reason, the page offers a retry that boots again', async () => {
    state.call.mockImplementation(async () =>
      boot({
        modules: { ...boot().modules, contactos: unavailable('contactos') },
      }),
    )
    await mount('/contactos')
    const tile = await until(() =>
      document.querySelector(
        '[data-module="contactos"][data-state="unavailable"]',
      ),
    )
    expect(tile.dataset.tip).toContain('No se pudo cargar Contactos')
    expect(tile.getAttribute('aria-label')).toContain('Contactos')
    expect(document.querySelector('[data-module="ventas"]')).toBeTruthy()
    const alert = await until(() => document.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('We could not open Contactos')
    expect(alert.textContent).toContain('No se pudo cargar Contactos')
    expect(document.body.textContent).not.toContain('Contactos page')
    const labels = [...alert.querySelectorAll('button')].map(
      (b) => b.textContent,
    )
    expect(labels).toContain('Retry')
    expect(labels).not.toContain('Retry permissions')
    expect(labels).not.toContain('Ask for access')
    const boots = () =>
      state.call.mock.calls.filter(
        ([method]) => method === 'crm.api.shell.boot',
      )
    expect(boots()).toHaveLength(1)
    ;[...alert.querySelectorAll('button')]
      .find((b) => b.textContent === 'Retry')
      .click()
    await until(() => boots().length === 2)
    expect(boots()).toHaveLength(2)
  })

  it('Contactos unavailable for a permission: the page still asks for access, and a module that cannot be retried hides Retry', async () => {
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          contactos: unavailable('contactos', {
            reason_code: 'permission',
            reason_text:
              'No tienes acceso a Contactos. Pídele acceso a Marco Pérez y vuelve a intentar.',
            detail: 'PermissionError: Contactos Settings',
          }),
        },
      }),
    )
    await mount('/contactos')
    let alert = await until(() => document.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('Pídele acceso a Marco Pérez')
    expect(alert.textContent).toContain(
      'Detail: PermissionError: Contactos Settings',
    )
    let labels = [...alert.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toContain('Retry permissions')
    expect(labels).toContain('Ask for access')
    app.unmount()
    root.remove()

    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          contactos: unavailable('contactos', {
            reason_code: 'missing_app',
            reason_text:
              'Esta tienda aún no tiene Contactos. Pide a soporte que actualice la aplicación.',
            retry: false,
          }),
        },
      }),
    )
    await mount('/contactos')
    alert = await until(() => document.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('Esta tienda aún no tiene Contactos')
    labels = [...alert.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).not.toContain('Retry')
    expect(labels).not.toContain('Retry permissions')
    expect(labels).not.toContain('Ask for access')
  })

  it('Archivos enabled: its page renders and its rail entry shows', async () => {
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          archivos: {
            key: 'archivos',
            enabled: true,
            capabilities: { read: true, create: true },
          },
        },
      }),
    )
    await mount('/archivos')
    expect(await until(() => document.querySelector('[role="alert"]'))).toBe(
      null,
    )
    expect(document.body.textContent).toContain('page')
    expect(
      document.querySelector(
        'a[href$="/archivos"], [data-module="archivos"]',
      ) ||
        [...document.querySelectorAll('nav *')].find((n) =>
          n.textContent?.trim().startsWith('Archivos'),
        ),
    ).toBeTruthy()
  })

  it('bottom-nav slots follow the role, enabled modules and the saved order', () => {
    shellBoot.value = boot()
    expect(navSlots.value.map((m) => m.key)).toEqual(['contactos', 'ventas'])
    shellBoot.value = boot({ mobile_slots: ['ventas', 'contactos'] })
    expect(navSlots.value.map((m) => m.key)).toEqual(['ventas', 'contactos'])
    shellBoot.value = boot({
      modules: {
        contactos: { key: 'contactos', enabled: true, capabilities: {} },
      },
    })
    expect(navSlots.value.map((m) => m.key)).toEqual(['contactos'])
  })
})

describe('one frame for every route', () => {
  it('desktop: a rail with the enabled modules and no bottom nav', async () => {
    state.mobile.value = false
    await mount('/deals')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(rail).not.toBeNull()
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Contactos', 'Ventas'])
    expect(
      rail.querySelector('[aria-current="page"]').getAttribute('aria-label'),
    ).toBe('Ventas')
    expect(root.querySelector('nav[aria-label="Main navigation"]')).toBeNull()
  })

  it('desktop rail: names while learning, icons once collapsed; the choice is kept', async () => {
    state.mobile.value = false
    localStorage.clear()
    resetRailForTests('expanded')
    await mount('/contactos')
    const rail = () => root.querySelector('nav[aria-label="Apps"]')
    const toggle = () => rail().querySelector('[data-testid="rail-toggle"]')
    expect(rail().dataset.rail).toBe('expanded')
    expect(rail().style.width).toBe('216px')
    const contactos = rail().querySelector('[data-module="contactos"]')
    expect(contactos.textContent.trim()).toBe('Contactos')
    expect(contactos.getAttribute('title')).toBeNull()
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().getAttribute('aria-label')).toBe('Collapse sidebar')

    toggle().click()
    await nextTick()
    expect(rail().dataset.rail).toBe('collapsed')
    expect(rail().style.width).toBe('56px')
    const icon = rail().querySelector('[data-module="contactos"]')
    expect(icon.textContent.trim()).toBe('')
    // Collapsed, the name stays reachable: a label on hover and the accessible name.
    expect(icon.getAttribute('aria-label')).toBe('Contactos')
    icon.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await nextTick()
    expect(
      rail().querySelector('[data-testid="rail-tip"]').textContent.trim(),
    ).toBe('Contactos')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('muelle.rail:guest')).toBe('collapsed')
    // Saved for the worker's other devices, once, after the toggle settles.
    await new Promise((resolve) => setTimeout(resolve, RAIL_SAVE_DELAY_MS + 50))
    expect(
      state.call.mock.calls.filter(
        ([method]) => method === 'crm.api.shell.save_rail',
      ),
    ).toEqual([['crm.api.shell.save_rail', { state: 'collapsed' }]])
  })

  it('desktop rail: icons by default, each with what waits in it', async () => {
    state.mobile.value = false
    localStorage.clear()
    resetRailForTests()
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method === 'crm.api.shell.rail_counts')
        return {
          ventas: { count: 3, urgent: false },
          contactos: { count: 120, urgent: true },
        }
      throw new Error(`unexpected ${method}`)
    })
    await mount('/contactos')
    const rail = () => root.querySelector('nav[aria-label="Apps"]')
    expect(rail().dataset.rail).toBe('collapsed')
    const contactos = () => rail().querySelector('[data-module="contactos"]')
    expect(
      await until(() => contactos()?.querySelector('[data-rail-count]')),
    ).toBeTruthy()
    const badge = contactos().querySelector('[data-rail-count]')
    expect(badge.textContent.trim()).toBe('99+')
    expect(badge.className).toContain('bg-surface-red-7')
    expect(contactos().getAttribute('aria-label')).toBe('Contactos · 99+')
    // One read per visit, not one per page change inside the minute.
    const reads = () =>
      state.call.mock.calls.filter(
        ([method]) => method === 'crm.api.shell.rail_counts',
      ).length
    expect(reads()).toBe(1)
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(reads()).toBe(1)
  })

  it('desktop rail: the saved width follows the worker from the boot; «[» toggles it', async () => {
    state.mobile.value = false
    localStorage.clear()
    resetRailForTests('expanded')
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot({ rail: 'collapsed' })
      if (method === 'crm.api.shell.save_rail') return 'expanded'
      throw new Error(`unexpected ${method}`)
    })
    await mount('/contactos')
    const rail = () => root.querySelector('nav[aria-label="Apps"]')
    expect(await until(() => rail()?.dataset.rail === 'collapsed')).toBe(true)
    const press = (target) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '[',
          bubbles: true,
          cancelable: true,
        }),
      )
    press(document.body)
    await nextTick()
    expect(rail().dataset.rail).toBe('expanded')
    // Not while typing: «[» is a character in a field.
    const field = document.createElement('input')
    root.append(field)
    field.focus()
    press(field)
    await nextTick()
    expect(rail().dataset.rail).toBe('expanded')
  })

  it('desktop rail: installed sibling apps open with the way back to this page', async () => {
    state.mobile.value = false
    resetRailForTests('expanded')
    window.installed_apps = ['frappe', 'crm', 'scanner_kit', 'posawesome']
    try {
      await mount('/contactos')
      const rail = root.querySelector('nav[aria-label="Apps"]')
      // Escáner first: the stock tool the shell opens most.
      expect(
        [...rail.querySelectorAll('[data-sibling]')].map(
          (a) => a.dataset.sibling,
        ),
      ).toEqual(['scan', 'pos'])
      const scan = rail.querySelector('[data-sibling="scan"]')
      expect(scan.textContent).toContain('Escáner')
      const href = new URL(scan.getAttribute('href'), 'https://x.test')
      // Escáner's home alias: /scan/ would redirect out of its offline scope.
      expect(href.pathname).toBe('/scan/inicio')
      expect(href.searchParams.get('return_to')).toBe('/crm/contactos')
      expect(href.searchParams.get('return_label')).toBe('Contactos')
    } finally {
      delete window.installed_apps
    }
  })

  it('desktop rail: the other apps open inside the shell and keep their place, Ferdium-style', async () => {
    state.mobile.value = false
    resetRailForTests('collapsed')
    resetAppStripForTests()
    window.installed_apps = ['frappe', 'crm', 'scanner_kit', 'posawesome']
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method === 'crm.api.shell.rail_counts')
        return { pos: { count: 2, urgent: false } }
      throw new Error(`unexpected ${method}`)
    })
    try {
      await mount('/contactos')
      const rail = root.querySelector('nav[aria-label="Apps"]')
      const main = () => root.querySelector('#muelle-content')
      const frame = (key) => root.querySelector(`[data-app-frame="${key}"]`)
      const click = (el, init = {}) =>
        el.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, ...init }),
        )
      // Icons only: round app icons with what waits in each on the badge.
      const pos = await until(() =>
        rail.querySelector('[data-sibling="pos"] [data-rail-count]'),
      )
      expect(pos.textContent).toBe('2')
      expect(
        rail.querySelector('[data-sibling="pos"]').getAttribute('aria-label'),
      ).toBe('POS · 2')
      const scan = rail.querySelector('[data-sibling="scan"]')
      // A plain click opens Escáner inside the shell, in place of the page.
      expect(click(scan)).toBe(false)
      const scanFrame = await until(() => frame('scan'))
      expect(scanFrame.getAttribute('src')).toBe(scan.getAttribute('href'))
      await nextTick()
      expect(main().style.display).toBe('none')
      expect(scan.getAttribute('aria-current')).toBe('page')
      expect(scan.hasAttribute('data-open')).toBe(true)
      // Ctrl+click is the browser's: a new tab, no frame.
      expect(
        click(rail.querySelector('[data-sibling="pos"]'), { ctrlKey: true }),
      ).toBe(true)
      expect(frame('pos')).toBeNull()
      // A module brings the page back; Escáner waits, hidden, where it was.
      click(rail.querySelector('[data-module="contactos"]'))
      await nextTick()
      expect(main().style.display).toBe('')
      expect(frame('scan')).toBe(scanFrame)
      expect(scanFrame.style.display).toBe('none')
      click(scan)
      await nextTick()
      expect(frame('scan')).toBe(scanFrame)
      expect(scanFrame.style.display).toBe('')
      // A hidden page that rewrites its query leaves the app on screen;
      // going to another page comes back to the shell.
      await router.replace('/contactos?segment=people')
      await nextTick()
      expect(main().style.display).toBe('none')
      await router.push('/deals')
      await nextTick()
      expect(main().style.display).toBe('')
      expect(scan.hasAttribute('aria-current')).toBe(false)
      // × closes it; the next open starts fresh.
      click(rail.querySelector('[data-close-app="scan"]'))
      await nextTick()
      expect(frame('scan')).toBeNull()
      expect(scan.hasAttribute('data-open')).toBe(false)
    } finally {
      delete window.installed_apps
      resetAppStripForTests()
    }
  })

  it('phone header «Escanear» opens Escáner’s picker with the way back, only where installed', async () => {
    state.mobile.value = true
    await mount('/contactos')
    expect(root.querySelector('[data-testid="shell-scan"]')).toBeNull()
    app.unmount()
    root.remove()
    window.installed_apps = ['crm', 'scanner_kit']
    try {
      await mount('/contactos?segment=people')
      const scan = root.querySelector('[data-testid="shell-scan"]')
      expect(scan.getAttribute('aria-label')).toBe('Scan a code')
      const url = new URL(scan.getAttribute('href'), 'https://x.test')
      expect(url.pathname).toBe('/scan/pick')
      expect(url.searchParams.get('want')).toBe('item')
      expect(url.searchParams.get('return_to')).toBe(
        '/crm/contactos?segment=people&escaneo=1',
      )
      expect(url.searchParams.get('return_label')).toBe('Contactos')
    } finally {
      delete window.installed_apps
    }
  })

  it('phone Más reaches Escáner as an app tile, for pages with their own app bar too', async () => {
    state.mobile.value = true
    window.installed_apps = ['crm', 'scanner_kit']
    try {
      await mount('/agenda')
      root
        .querySelector(
          'nav[aria-label="Main navigation"] button[aria-haspopup="dialog"]',
        )
        .click()
      const scan = await until(() =>
        document.querySelector(
          '[data-shell-layer="more"] [data-sibling="scan"]',
        ),
      )
      const url = new URL(scan.getAttribute('href'), 'https://x.test')
      expect(url.pathname).toBe('/scan/pick')
      expect(url.searchParams.get('return_to')).toBe('/crm/agenda?escaneo=1')
    } finally {
      delete window.installed_apps
    }
  })

  it('a scan picked in Escáner opens the artículo in Productos, with the way back', () => {
    const route = (query) => ({ path: '/cobranza', query, hash: '' })
    expect(scanPickTarget(route({ segment: 'vencidas' }))).toBeNull()
    expect(
      scanPickTarget(
        route({ segment: 'vencidas', escaneo: '1', done: 'Item:SKU 1' }),
        { productos: true, label: 'Cobranza' },
      ),
    ).toEqual({
      path: '/productos/SKU%201',
      query: {
        return_to: '/crm/cobranza?segment=vencidas',
        return_label: 'Cobranza',
      },
    })
    // Without Productos (or a cancelled scan) the worker stays, minus the marker.
    expect(
      scanPickTarget(
        route({ segment: 'vencidas', escaneo: '1', done: 'Item:X' }),
      ),
    ).toEqual({ path: '/cobranza', query: { segment: 'vencidas' }, hash: '' })
    expect(
      scanPickTarget(route({ escaneo: '1' }), { productos: true }),
    ).toEqual({ path: '/cobranza', query: {}, hash: '' })
    expect(scanPickHref('/hoy', 'Hoy', ['crm'])).toBeNull()
  })

  it('phone: one header and one bottom nav; Ventas pages get the header slot', async () => {
    state.mobile.value = true
    await mount('/deals')
    expect(root.querySelector('nav[aria-label="Apps"]')).toBeNull()
    expect(
      root.querySelectorAll('nav[aria-label="Main navigation"]'),
    ).toHaveLength(1)
    expect(root.querySelectorAll('header')).toHaveLength(1)
    expect(root.querySelector('#app-header')).not.toBeNull()
  })

  it('phone bottom nav is sticky so floating Desk launchers rise above it', async () => {
    state.mobile.value = true
    await mount('/contactos')
    const nav = root.querySelector('nav[aria-label="Main navigation"]')
    expect(nav.classList).toContain('sticky')
    expect(nav.classList).toContain('bottom-0')
  })

  it('phone: a record with its own bottom action bar (meta.ownBottomBar) hides the nav', async () => {
    state.mobile.value = true
    await mount('/cobranza/cliente/Ana')
    expect(root.querySelector('nav[aria-label="Main navigation"]')).toBeNull()
    await router.push('/contactos')
    await nextTick()
    expect(
      root.querySelector('nav[aria-label="Main navigation"]'),
    ).not.toBeNull()
  })

  it('phone Contactos shows its title instead of the Ventas header slot', async () => {
    state.mobile.value = true
    await mount('/contactos')
    expect(root.querySelector('#app-header')).toBeNull()
    expect(root.querySelector('header h1').textContent).toContain('Contactos')
  })

  it('phone Ventas page without its own header shows the route title', async () => {
    state.mobile.value = true
    await mount('/reports')
    const slot = root.querySelector('#app-header')
    const title = root.querySelector('[data-testid="shell-title"]')
    expect(slot.children).toHaveLength(0)
    expect(title.textContent.trim()).toBe('Reports')
    // a teleported page header covers the title (CSS :has on the slot)
    expect(slot.className).toContain('[&:not(:has(*))]:hidden')
    expect(title.className).toContain('[#app-header:has(*)+&]:hidden')
    expect(document.title).toBe('Reports · Muelle')
  })

  it('every routed page names itself for the phone header', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/router.js'),
      'utf8',
    )
    const block = source.slice(
      source.indexOf('const routes = ['),
      source.indexOf('\n]\n', source.indexOf('const routes = [')),
    )
    const pages = block
      .split('\n  {\n')
      .filter((route) => /\n {4}component:/.test(route))
    expect(pages.length).toBeGreaterThan(30)
    const untitled = pages
      .filter((route) => !/\btitle: '/.test(route))
      .map((route) => route.match(/path: '([^']+)'/)?.[1])
    expect(untitled).toEqual([])
  })

  it('phone header slides away on scroll down and returns on scroll up', async () => {
    state.mobile.value = true
    await mount('/contactos')
    const header = () => root.querySelector('[data-testid="shell-header"]')
    const scroller = document.createElement('div')
    root.querySelector('#muelle-content').append(scroller)
    const scrollTo = async (top) => {
      Object.defineProperty(scroller, 'scrollTop', {
        value: top,
        configurable: true,
      })
      scroller.dispatchEvent(new Event('scroll'))
      await nextTick()
    }
    await scrollTo(200)
    await scrollTo(400)
    expect(header().style.marginTop).toBe('-56px') // AppBar's height
    await scrollTo(380)
    expect(header().style.marginTop).toBe('')
    await scrollTo(600)
    expect(header().style.marginTop).toBe('-56px')
    // near the top the header always shows
    await scrollTo(20)
    expect(header().style.marginTop).toBe('')
  })

  it('phone Agenda brings its own calendar app bar and keeps the bottom nav', async () => {
    state.mobile.value = true
    await mount('/agenda')
    expect(root.querySelector('[data-testid="shell-header"]')).toBeNull()
    expect(
      root.querySelector('nav[aria-label="Main navigation"]'),
    ).not.toBeNull()
  })

  it('phone deal record owns the top: no shell header, no bottom nav', async () => {
    state.mobile.value = true
    mobileView.value = 'thread'
    await mount('/ventas/deal/CRM-DEAL-1')
    expect(root.querySelector('[data-testid="shell-header"]')).toBeNull()
    expect(root.querySelector('nav[aria-label="Main navigation"]')).toBeNull()
    mobileView.value = 'list'
  })

  it('doco’s floating «Ayuda» pill never shows; the Más sheet offers it', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/shell/MuelleShell.vue'),
      'utf8',
    )
    expect(source).toMatch(
      /<style>\s*(\/\*[\s\S]*?\*\/\s*)?#muelle-support-workflow \{\s*display: none !important;/,
    )
    const sheet = readFileSync(
      resolve(__dirname, '../../src/components/shell/MoreSheet.vue'),
      'utf8',
    )
    expect(sheet).toContain('window.docoSupport.openHelp()')
  })

  it.each([true, false])(
    'desktop rail: «Ayuda» is the bug beside the account (support %s)',
    async (installed) => {
      state.mobile.value = false
      const openHelp = vi.fn()
      if (installed) window.docoSupport = { openHelp }
      try {
        await mount('/contactos')
        const help = root.querySelector('[data-testid="rail-help"]')
        if (!installed) {
          expect(help).toBeNull()
          return
        }
        expect(help.getAttribute('aria-label')).toBe(
          'Help and report a problem',
        )
        // One island: the account and the bug share the rail's foot.
        expect(help.parentElement).toBe(
          root.querySelector('[data-testid="rail-account"]').parentElement
            .parentElement,
        )
        help.click()
        expect(openHelp).toHaveBeenCalledTimes(1)
      } finally {
        delete window.docoSupport
      }
    },
  )

  it('Ctrl+K opens the command palette and g c goes to Contactos', async () => {
    state.mobile.value = false
    await mount('/deals')
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
    )
    for (let i = 0; i < 20; i++) {
      await Promise.resolve()
      await nextTick()
      if (document.querySelector('[aria-label="Command palette"]')) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const palette = document.querySelector('[aria-label="Command palette"]')
    expect(palette).not.toBeNull()
    // The standard's footer is one reviewed es-MX line, not bare verbs.
    expect(
      palette
        .querySelector('[data-testid="palette-footer"]')
        .textContent.trim(),
    ).toBe('↑↓ moverse · ↵ abrir · Esc cerrar')
    document.querySelector('[aria-label="Close"]').click()
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(router.currentRoute.value.path).toBe('/contactos')
  })
})

const COMPRAS_ON = {
  key: 'compras',
  enabled: true,
  capabilities: { read: true, create: true },
}

describe('Compras in the shell', () => {
  it('a purchasing worker without Contactos or Ventas gets only Compras, unblocked', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          contactos: { key: 'contactos', enabled: false, capabilities: {} },
          ventas: { key: 'ventas', enabled: false, capabilities: {} },
          compras: COMPRAS_ON,
        },
      }),
    )
    await mount('/compras')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Compras'])
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.textContent).toContain('page')
  })

  it('a refused Compras shows its own reason, never the Contactos one', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          compras: {
            key: 'compras',
            enabled: false,
            reason: 'Sin permiso de órdenes de compra.',
            capabilities: {},
          },
        },
      }),
    )
    await mount('/compras')
    const alert = root.querySelector('[role="alert"]')
    // The test `__` leaves {0} unformatted; the label is the active module's.
    expect(alert.textContent).toContain('We could not open')
    expect(alert.textContent).toContain('Sin permiso de órdenes de compra.')
    // The reason never asks for Contactos; «Go to Contactos» is only where to keep working.
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
  })

  it('a refused Contactos does not block Compras', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          contactos: { key: 'contactos', enabled: false, capabilities: {} },
          compras: COMPRAS_ON,
        },
      }),
    )
    await mount('/compras')
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })

  it('«New purchase» and Compras places follow the boot', async () => {
    const query = {
      raw: 'purchase',
      text: 'purchase',
      scope: 'all',
      kind: 'text',
    }
    const withCreate = createShellProviders({
      boot: ref(boot({ modules: { compras: COMPRAS_ON } })),
      modules: ref(hostedModules),
    })
    expect((await withCreate[0].search(query)).map((i) => i.href)).toContain(
      '/compras/nueva',
    )
    const places = withCreate.find((p) => p.key === 'ir_a')
    const segment = { ...query, raw: 'recibir', text: 'recibir' }
    expect((await places.search(segment)).map((i) => i.href)).toContain(
      '/compras?segment=por-recibir',
    )
    const readOnly = createShellProviders({
      boot: ref(
        boot({
          modules: {
            compras: { ...COMPRAS_ON, capabilities: { read: true } },
          },
        }),
      ),
      modules: ref(hostedModules),
    })
    expect(
      (await readOnly[0].search(query)).some((i) => i.id === 'compras.create'),
    ).toBe(false)
  })
})

const GASTOS_ON = {
  key: 'gastos',
  enabled: true,
  capabilities: { read: true, submit: true, pay: false },
}

describe('Gastos in the shell', () => {
  it('is its own module and boots without the sales runtime', () => {
    expect(moduleKeyFor({ path: '/gastos/factura/PI-1', meta: {} })).toBe(
      'gastos',
    )
    expect(hostedModules.find((m) => m.key === 'gastos')?.to).toBe('/gastos')
    expect(isNeutralModule('gastos')).toBe(true)
  })

  it('a worker with only Gastos gets only Gastos, unblocked', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          contactos: { key: 'contactos', enabled: false, capabilities: {} },
          ventas: { key: 'ventas', enabled: false, capabilities: {} },
          gastos: GASTOS_ON,
        },
      }),
    )
    await mount('/gastos')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Gastos'])
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.textContent).toContain('page')
  })

  it('a refused Gastos shows its own reason, never another module’s', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          gastos: {
            key: 'gastos',
            enabled: false,
            reason: 'Sin permiso de facturas de proveedor.',
            capabilities: {},
          },
        },
      }),
    )
    await mount('/gastos')
    const alert = root.querySelector('[role="alert"]')
    expect(alert.textContent).toContain('We could not open')
    expect(alert.textContent).toContain('Sin permiso de facturas de proveedor.')
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
  })

  it('Gastos places follow the boot', async () => {
    const query = {
      raw: 'vencidas',
      text: 'vencidas',
      scope: 'all',
      kind: 'text',
    }
    const on = createShellProviders({
      boot: ref(boot({ modules: { gastos: GASTOS_ON } })),
      modules: ref(hostedModules),
    })
    const places = on.find((p) => p.key === 'ir_a')
    expect((await places.search(query)).map((i) => i.href)).toContain(
      '/gastos?segment=por-pagar&chip=vencidas',
    )
    const off = createShellProviders({
      boot: ref(
        boot({ modules: { gastos: { ...GASTOS_ON, enabled: false } } }),
      ),
      modules: ref(hostedModules),
    })
    const offPlaces = off.find((p) => p.key === 'ir_a')
    expect(
      (await offPlaces.search(query)).some((i) => i.id.startsWith('gastos.')),
    ).toBe(false)
  })
})

describe('Clínica in the shell palette', () => {
  const query = { raw: 'ana', text: 'ana', scope: 'all', kind: 'text' }
  const CLINICA_ON = {
    key: 'clinica',
    enabled: true,
    capabilities: { read: true },
  }

  it("asks Clínica for its patients and today's appointments and opens them in /clinica", async () => {
    state.call.mockImplementation(async (method, args) => {
      expect(method).toBe('clinica.shell.search')
      expect(args).toEqual({ q: 'ana' })
      return {
        items: [
          {
            id: 'patient:PAT-1',
            title: 'Ana Demo',
            subtitle: 'Paciente · 1990',
            href: '/clinica/patients?patient=PAT-1',
          },
          {
            id: 'appointment:APT-1',
            title: 'Ana Demo',
            subtitle: 'Cita de hoy · 12:00',
            icon: 'lucide-calendar-clock',
            href: '/clinica/agenda?appointment=APT-1&dialog=details',
          },
          { id: 'evil', title: 'x', href: 'https://evil.invalid/clinica/' },
          { id: 'desk', title: 'x', href: '/app/patient/PAT-1' },
        ],
      }
    })
    const providers = createShellProviders({
      boot: ref(boot({ modules: { clinica: CLINICA_ON } })),
      modules: ref(hostedModules),
    })
    const clinica = providers.find((p) => p.key === 'clinica')
    const items = await clinica.search(query, new AbortController().signal)
    expect(items.map((i) => [i.id, i.group, i.external])).toEqual([
      ['clinica:patient:PAT-1', 'registros', '/clinica/patients?patient=PAT-1'],
      [
        'clinica:appointment:APT-1',
        'registros',
        '/clinica/agenda?appointment=APT-1&dialog=details',
      ],
    ])
    expect(items.every((i) => !i.href)).toBe(true)
  })

  it('stays silent when Clínica is off for this user or the query is empty', async () => {
    state.call.mockImplementation(async () => {
      throw new Error('must not be called')
    })
    const off = createShellProviders({
      boot: ref(
        boot({ modules: { clinica: { ...CLINICA_ON, enabled: false } } }),
      ),
      modules: ref(hostedModules),
    })
    expect(
      await off
        .find((p) => p.key === 'clinica')
        .search(query, new AbortController().signal),
    ).toEqual([])
    const on = createShellProviders({
      boot: ref(boot({ modules: { clinica: CLINICA_ON } })),
      modules: ref(hostedModules),
    })
    expect(
      await on
        .find((p) => p.key === 'clinica')
        .search(
          { ...query, kind: 'empty', text: '' },
          new AbortController().signal,
        ),
    ).toEqual([])
  })
})

describe('Inmobiliaria in the shell palette', () => {
  const query = {
    raw: 'garibaldi',
    text: 'garibaldi',
    scope: 'all',
    kind: 'text',
  }
  const UNIT = {
    id: 'unidad:GRB-A-101',
    title: 'GRB-A-101',
    subtitle: 'Unidad · DEMO Garibaldi · Disponible · $3.2 MDP',
    icon: 'lucide-building-2',
    href: '/desk/unidad-inmobiliaria/GRB-A-101',
  }
  const SHELL_UNIT = {
    id: 'unidad:GRB-A-102',
    title: 'Departamento 102 · Torre A',
    subtitle: 'Unidad · DEMO Garibaldi · Disponible · $3.4 MDP',
    icon: 'lucide-building-2',
    href: '/crm/inmobiliaria/unidad/GRB-A-102',
    desk: '/desk/unidad-inmobiliaria/GRB-A-102',
  }
  // A record without a screen in the shell (no tipo): its Desk form.
  const DESARROLLO = {
    id: 'desarrollo:GARIBALDI',
    title: 'Desarrollo Garibaldi',
    subtitle: 'Desarrollo · DEMO Garibaldi · 3 torres',
    icon: 'lucide-building-2',
    href: '/desk/desarrollo-inmobiliario/GARIBALDI',
  }
  const inmobiliaria = () =>
    createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    }).find((p) => p.key === 'inmobiliaria')
  afterEach(() => delete window.installed_apps)

  it('asks Inmobiliaria for its records: a record with a screen opens in the shell, also from its Desk form; only other records keep Desk', async () => {
    window.installed_apps = ['frappe', 'crm', 'inmobiliaria']
    state.call.mockImplementation(async (method, args) => {
      expect(method).toBe('inmobiliaria.busqueda.palette')
      expect(args).toEqual({ q: 'garibaldi' })
      return {
        items: [
          SHELL_UNIT,
          UNIT,
          {
            id: 'venta:VTA-2026-00001',
            title: 'Zacarías Pérez',
            subtitle: 'Venta · GRB-A-102 · En pagos · $5.1 MDP',
            icon: 'lucide-handshake',
            href: '/crm/inmobiliaria/venta/VTA-2026-00001',
            desk: '/desk/venta-inmobiliaria/VTA-2026-00001',
          },
          {
            id: 'apartado:APT-1',
            title: 'Ana',
            icon: 'lucide-skull',
            href: '/desk/apartado-de-unidad/APT-1',
          },
          DESARROLLO,
          // A list or a new form of a doctype with a screen is no record.
          {
            id: 'nueva',
            title: 'x',
            href: '/desk/unidad-inmobiliaria/new-unidad-inmobiliaria-1',
          },
          { id: 'lista', title: 'x', href: '/desk/aviso-pld?estado=Borrador' },
          { id: 'evil', title: 'x', href: 'https://evil.invalid/desk/x' },
          { id: 'up', title: 'x', href: '/desk/../crm/hoy' },
          { id: 'up2', title: 'x', href: '/crm/inmobiliaria/../hoy' },
          { id: 'crm', title: 'x', href: '/crm/hoy' },
        ],
      }
    })
    const items = await inmobiliaria().search(
      query,
      new AbortController().signal,
    )
    expect(items.map((i) => [i.id, i.group, i.icon, i.href, i.desk])).toEqual([
      [
        'inmobiliaria:unidad:GRB-A-102',
        'registros',
        'lucide-building-2',
        '/inmobiliaria/unidad/GRB-A-102',
        undefined,
      ],
      // its Desk form, answered by the server: the unit's screen all the same
      [
        'inmobiliaria:unidad:GRB-A-101',
        'registros',
        'lucide-building-2',
        '/inmobiliaria/unidad/GRB-A-101',
        undefined,
      ],
      [
        'inmobiliaria:venta:VTA-2026-00001',
        'registros',
        'lucide-handshake',
        '/inmobiliaria/venta/VTA-2026-00001',
        undefined,
      ],
      // an icon outside the known set falls back to the record screen's own
      [
        'inmobiliaria:apartado:APT-1',
        'registros',
        'lucide-bookmark',
        '/inmobiliaria/apartado/APT-1',
        undefined,
      ],
      [
        'inmobiliaria:desarrollo:GARIBALDI',
        'registros',
        'lucide-building-2',
        undefined,
        '/desk/desarrollo-inmobiliario/GARIBALDI',
      ],
    ])
    expect(items[1].subtitle).toBe(UNIT.subtitle)
    expect(items.every((i) => !i.external)).toBe(true)
  })

  it('never calls Inmobiliaria where it is not installed, nor for an empty or one-letter query', async () => {
    state.call.mockImplementation(async () => {
      throw new Error('must not be called')
    })
    const signal = new AbortController().signal
    window.installed_apps = ['frappe', 'crm']
    expect(await inmobiliaria().search(query, signal)).toEqual([])
    delete window.installed_apps
    expect(await inmobiliaria().search(query, signal)).toEqual([])
    window.installed_apps = ['frappe', 'crm', 'inmobiliaria']
    expect(
      await inmobiliaria().search(
        { ...query, kind: 'empty', text: '' },
        signal,
      ),
    ).toEqual([])
    expect(
      await inmobiliaria().search({ ...query, raw: 'g', text: 'g' }, signal),
    ).toEqual([])
  })

  it('choosing an Inmobiliaria record without a shell screen opens its Desk form in this tab, without a return parameter', async () => {
    window.installed_apps = ['frappe', 'crm', 'inmobiliaria']
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method === 'inmobiliaria.busqueda.palette')
        return { items: [DESARROLLO] }
      throw new Error(`unexpected ${method}`)
    })
    const assign = vi.fn()
    const location = window.location
    delete window.location
    window.location = { ...location, assign }
    try {
      state.mobile.value = false
      await mount('/contactos')
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      )
      const input = await until(() =>
        document.querySelector('[aria-label="Command palette"] input'),
      )
      input.value = 'garibaldi'
      input.dispatchEvent(new Event('input'))
      const option = await until(() =>
        [...document.querySelectorAll('[role="option"]')].find((o) =>
          o.textContent.includes('Desarrollo Garibaldi'),
        ),
      )
      expect(option.textContent).toContain('3 torres')
      option.click()
      await nextTick()
      expect(assign).toHaveBeenCalledTimes(1)
      expect(assign).toHaveBeenCalledWith(
        '/desk/desarrollo-inmobiliario/GARIBALDI',
      )
    } finally {
      window.location = location
    }
  })

  it('choosing an Inmobiliaria record with a shell screen opens it in the shell, not Desk', async () => {
    window.installed_apps = ['frappe', 'crm', 'inmobiliaria']
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method === 'inmobiliaria.busqueda.palette')
        return { items: [SHELL_UNIT] }
      throw new Error(`unexpected ${method}`)
    })
    const assign = vi.fn()
    const location = window.location
    delete window.location
    window.location = { ...location, assign }
    try {
      state.mobile.value = false
      await mount('/contactos')
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      )
      const input = await until(() =>
        document.querySelector('[aria-label="Command palette"] input'),
      )
      input.value = 'garibaldi'
      input.dispatchEvent(new Event('input'))
      const option = await until(() =>
        [...document.querySelectorAll('[role="option"]')].find((o) =>
          o.textContent.includes('Departamento 102'),
        ),
      )
      option.click()
      await until(
        () =>
          router.currentRoute.value.path === '/inmobiliaria/unidad/GRB-A-102',
      )
      expect(router.currentRoute.value.path).toBe(
        '/inmobiliaria/unidad/GRB-A-102',
      )
      expect(assign).not.toHaveBeenCalled()
    } finally {
      window.location = location
    }
  })

  it('every record screen is a shell row, from its shell address or its Desk form; never a Desk row', () => {
    // Desk's form address of a doctype, spelled here on its own (frappe.router.slug).
    const slug = (doctype) => doctype.toLowerCase().replace(/ /g, '-')
    const items = inmobiliariaItems({
      items: Object.entries(TIPOS).flatMap(([tipo, { doctype }]) => [
        {
          id: `${tipo}:S-1`,
          title: doctype,
          href: `/crm/inmobiliaria/${tipo}/S-1`,
        },
        {
          id: `${tipo}:D 2`,
          title: doctype,
          href: `/desk/${slug(doctype)}/D%202`,
        },
        {
          id: `${tipo}:A-3`,
          title: doctype,
          href: `/app/${slug(doctype)}/A-3`,
        },
        {
          id: `${tipo}:new`,
          title: doctype,
          href: `/desk/${slug(doctype)}/new`,
        },
        { id: `${tipo}:list`, title: doctype, href: `/desk/${slug(doctype)}` },
      ]),
    })
    expect(items.filter((item) => item.desk || !item.href)).toEqual([])
    expect(items.map((item) => item.href)).toEqual(
      Object.keys(TIPOS).flatMap((tipo) => [
        `/inmobiliaria/${tipo}/S-1`,
        `/inmobiliaria/${tipo}/D%202`,
        `/inmobiliaria/${tipo}/A-3`,
      ]),
    )
    // The server sent no icon: each row shows its record screen's own.
    expect(items.map((item) => item.icon)).toEqual(
      Object.values(TIPOS).flatMap(({ icono }) => [icono, icono, icono]),
    )
  })

  it('gives every record screen its own lucide icon; an unknown one falls back to it', () => {
    const lucide = resolve(
      dirname(
        createRequire(import.meta.url).resolve('lucide-static/package.json'),
      ),
      'icons',
    )
    const iconos = Object.values(TIPOS).map((t) => t.icono)
    expect(new Set(iconos).size).toBe(iconos.length)
    for (const icono of iconos)
      expect(
        existsSync(resolve(lucide, `${icono.replace(/^lucide-/, '')}.svg`)),
        icono,
      ).toBe(true)
    const rows = inmobiliariaItems({
      items: [
        {
          id: 'aviso:AV-1',
          title: 'AV-1',
          href: '/crm/inmobiliaria/aviso/AV-1',
          icon: 'lucide-skull',
        },
        {
          id: 'liquidacion:LIQ-1',
          title: 'LIQ-1',
          href: '/desk/liquidacion-a-propietarios/LIQ-1',
          icon: 'lucide-wallet',
        },
        DESARROLLO,
      ],
    })
    expect(rows.map((row) => row.icon)).toEqual([
      'lucide-shield-alert',
      'lucide-wallet',
      'lucide-building-2',
    ])
  })
})

const PRODUCTOS_ON = {
  key: 'productos',
  enabled: true,
  capabilities: { read: true, edit: false },
}

describe('Productos in the shell', () => {
  it('a stock worker without Contactos or Ventas gets only Productos, unblocked', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          contactos: { key: 'contactos', enabled: false, capabilities: {} },
          ventas: { key: 'ventas', enabled: false, capabilities: {} },
          productos: PRODUCTOS_ON,
        },
      }),
    )
    await mount('/productos')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Productos'])
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })

  it('a refused Productos shows its own reason', async () => {
    state.mobile.value = false
    state.call.mockImplementation(async () =>
      boot({
        modules: {
          ...boot().modules,
          productos: {
            key: 'productos',
            enabled: false,
            reason: 'Pide permiso para consultar artículos.',
            capabilities: {},
          },
        },
      }),
    )
    await mount('/productos')
    const alert = root.querySelector('[role="alert"]')
    expect(alert.textContent).toContain(
      'Pide permiso para consultar artículos.',
    )
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
  })

  it('Productos is hosted, neutral, and its lists are palette places', async () => {
    expect(moduleKeyFor({ path: '/productos/SKU-1', meta: {} })).toBe(
      'productos',
    )
    expect(hostedModules.find((m) => m.key === 'productos')?.to).toBe(
      '/productos',
    )
    expect(isNeutralModule('productos')).toBe(true)
    const providers = createShellProviders({
      boot: ref(boot({ modules: { productos: PRODUCTOS_ON } })),
      modules: ref(hostedModules),
    })
    const places = providers.find((p) => p.key === 'ir_a')
    const query = { raw: 'precio', text: 'precio', scope: 'all', kind: 'text' }
    expect((await places.search(query)).map((i) => i.href)).toContain(
      '/productos?vista=sin-precio',
    )
    const off = createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    })
    const offPlaces = off.find((p) => p.key === 'ir_a')
    expect(
      (await offPlaces.search(query)).some((i) =>
        i.id.startsWith('productos.'),
      ),
    ).toBe(false)
  })
})

describe('palette providers', () => {
  it('offers «New contact» only with create rights and maps Contactos records', async () => {
    const providers = createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    })
    const [actions, contactos, places] = providers
    const query = { raw: 'ana', text: 'ana', scope: 'all', kind: 'text' }
    expect((await actions.search(query)).map((i) => i.href)).toContain(
      '/contactos?create=1',
    )
    const denied = createShellProviders({
      boot: ref(
        boot({
          modules: {
            contactos: {
              key: 'contactos',
              enabled: true,
              capabilities: { create: false },
            },
          },
        }),
      ),
      modules: ref(hostedModules),
    })
    expect(
      (await denied[0].search(query)).some((i) => i.id === 'contactos.create'),
    ).toBe(false)

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          rows: [
            {
              source: 'contact',
              name: 'Ana López',
              title: 'Ana López',
              kind: 'person',
              fields: { mobile_no: '+52 669 123' },
            },
          ],
        },
      }),
    }))
    const rows = await contactos.search(query, new AbortController().signal)
    expect(rows[0]).toMatchObject({
      group: 'registros',
      title: 'Ana López',
      href: '/contactos/contact/Ana%20L%C3%B3pez',
    })
    const go = await places.search({
      raw: 'prove',
      text: 'prove',
      scope: 'all',
      kind: 'text',
    })
    expect(go.map((i) => i.href)).toContain('/contactos?segment=suppliers')
    expect(go.map((i) => i.href)).not.toContain('/archivos?view=ayuda')
  })

  it('Archivos places appear only while the module is enabled', async () => {
    const enabled = boot({
      modules: {
        ...boot().modules,
        archivos: { key: 'archivos', enabled: true, capabilities: {} },
      },
    })
    const places = createShellProviders({
      boot: ref(enabled),
      modules: ref([]),
    }).find((p) => p.key === 'ir_a')
    const go = await places.search({
      raw: 'ayuda',
      text: 'ayuda',
      scope: 'all',
      kind: 'text',
    })
    expect(go.map((i) => i.href)).toEqual(['/archivos?view=ayuda'])
  })

  it('Escáner places and «Find in Escáner» appear only where scanner_kit is installed', async () => {
    const query = (text) => ({ raw: text, text, scope: 'all', kind: 'text' })
    const providers = () =>
      createShellProviders({ boot: ref(boot()), modules: ref([]) })
    const search = (key, text) =>
      providers()
        .find((p) => p.key === key)
        .search(query(text))
    expect(await search('ir_a', 'conteo')).toEqual([])
    window.installed_apps = ['crm', 'scanner_kit']
    try {
      const go = await search('ir_a', 'conteo')
      expect(go.map((i) => [i.title, i.external])).toEqual([
        ['Escáner › Conteo del día', '/scan/conteo'],
        ['Escáner › Revisión de conteo', '/scan/conteo/revision'],
      ])
      // Found by the worker's words, not only the title.
      expect((await search('ir_a', 'cajon')).map((i) => i.external)).toContain(
        '/scan/bins/move',
      )
      const find = (await search('acciones', 'funda roja')).find(
        (i) => i.id === 'escaner.search',
      )
      expect(find.external).toBe('/scan/items?q=funda%20roja')
    } finally {
      delete window.installed_apps
    }
  })

  it('«Escanear un código» is an action wherever Escáner is installed, and comes back here', async () => {
    window.installed_apps = ['crm', 'scanner_kit']
    const assign = vi.fn()
    const location = window.location
    delete window.location
    window.location = { ...location, assign }
    try {
      state.mobile.value = false
      await mount('/contactos')
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      )
      const input = await until(() =>
        document.querySelector('[aria-label="Command palette"] input'),
      )
      input.value = 'escanear'
      input.dispatchEvent(new Event('input'))
      const option = await until(() =>
        [...document.querySelectorAll('[role="option"]')].find((o) =>
          o.textContent.includes('Scan a code'),
        ),
      )
      option.click()
      await nextTick()
      const url = new URL(assign.mock.calls[0][0], 'https://x.test')
      expect(url.pathname).toBe('/scan/pick')
      expect(url.searchParams.get('return_to')).toBe('/crm/contactos?escaneo=1')
      expect(url.searchParams.get('return_label')).toBe('Contactos')
    } finally {
      window.location = location
      delete window.installed_apps
    }
  })

  it('choosing an Escáner place opens it with the way back to this page', async () => {
    window.installed_apps = ['crm', 'scanner_kit']
    const assign = vi.fn()
    const location = window.location
    delete window.location
    window.location = { ...location, assign }
    try {
      state.mobile.value = false
      await mount('/contactos')
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      )
      const input = await until(() =>
        document.querySelector('[aria-label="Command palette"] input'),
      )
      input.value = 'cajones'
      input.dispatchEvent(new Event('input'))
      const option = await until(() =>
        [...document.querySelectorAll('[role="option"]')].find((o) =>
          o.textContent.includes('Escáner › Cajones'),
        ),
      )
      option.click()
      await nextTick()
      expect(assign).toHaveBeenCalledTimes(1)
      const url = new URL(assign.mock.calls[0][0], 'https://x.test')
      expect(url.pathname).toBe('/scan/bins')
      expect(url.searchParams.get('return_to')).toBe('/crm/contactos')
      expect(url.searchParams.get('return_label')).toBe('Contactos')
    } finally {
      window.location = location
      delete window.installed_apps
    }
  })
})

describe('Ventas deals in the palette', () => {
  const query = { raw: 'acme', text: 'acme', scope: 'all', kind: 'text' }
  afterEach(() => state.call.mockReset())

  it('finds deals and opens the one deal record', async () => {
    state.call.mockResolvedValue([
      { name: 'CRM-DEAL-1', title: 'Acme', status: 'Qualification' },
    ])
    const ventas = createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    }).find((provider) => provider.key === 'ventas')
    const rows = await ventas.search(query, new AbortController().signal)
    expect(state.call).toHaveBeenCalledWith('crm.api.palette.search_deals', {
      q: 'acme',
    })
    expect(rows[0]).toMatchObject({
      group: 'registros',
      title: 'Acme',
      href: '/ventas/deal/CRM-DEAL-1',
      record: { source: 'deal', name: 'CRM-DEAL-1' },
    })
    expect(toRecentRef(rows[0])).toEqual({
      id: 'deal:CRM-DEAL-1',
      href: '/ventas/deal/CRM-DEAL-1',
      record: { source: 'deal', name: 'CRM-DEAL-1' },
    })
  })

  it('a question is never offered as «Nuevo contacto «…»» or an Escáner search', async () => {
    window.installed_apps = ['crm', 'scanner_kit']
    try {
      const [actions] = createShellProviders({
        boot: ref(boot()),
        modules: ref(hostedModules),
      })
      const ids = async (raw) =>
        (
          await actions.search({ raw, text: raw, scope: 'all', kind: 'text' })
        ).map((item) => item.id)
      for (const raw of [
        '¿Qué tengo pendiente hoy?',
        'qué tengo hoy',
        'cuánto me debe Ana',
        'por qué no llegó',
        'ya llegó el pedido?',
      ]) {
        const found = await ids(raw)
        expect(found, raw).not.toContain('contactos.create')
        expect(found, raw).not.toContain('escaner.search')
      }
      // A Mexican full name is long but no question: «Nuevo contacto» stays.
      for (const raw of [
        'Ana López',
        'Jose Oswaldo Rodriguez Estrada Lopez',
        'Quesada Ruiz',
      ])
        expect(await ids(raw), raw).toContain('contactos.create')
    } finally {
      delete window.installed_apps
    }
  })

  it('palette order: records above «Nuevo …»; a question keeps «Preguntar a Muelle» first; empty opens on Recientes', () => {
    const actions = {
      group: 'acciones',
      items: [
        { id: 'new.deal', title: 'Nuevo trato' },
        { id: 'asistente.preguntar', action: 'assistant', title: 'Ask' },
      ],
    }
    const records = { group: 'registros', items: [{ id: 'deal:D-1' }] }
    const places = { group: 'ir_a', items: [{ id: 'go.hoy' }] }
    const typed = orderPaletteSections([actions, places, records])
    expect(typed.map((s) => [s.group, s.items.map((i) => i.id)])).toEqual([
      ['acciones', ['asistente.preguntar']],
      ['registros', ['deal:D-1']],
      ['acciones', ['new.deal']],
      ['ir_a', ['go.hoy']],
    ])
    expect(typed[0].lead).toBe(true)
    const noQuestion = orderPaletteSections([
      { group: 'acciones', items: [actions.items[0]] },
      records,
    ])
    expect(noQuestion.map((s) => s.group)).toEqual(['registros', 'acciones'])
    const empty = orderPaletteSections(
      [actions, places, { group: 'recientes', items: [{ id: 'r' }] }],
      { empty: true },
    )
    expect(empty.map((s) => s.group)).toEqual(['recientes', 'acciones', 'ir_a'])
  })

  it('a customer search shows their deal with person, RO, phone and stage (CRM-S3.3)', () => {
    expect(
      dealItem({
        name: 'CRM-DEAL-2026-03311',
        title: 'Apple iPhone 12 — Karolina Quevedo',
        person: 'Karolina Quevedo',
        repair_order: 'RO-01234',
        mobile_no: '695 122 3254',
        status: 'Ready for Pickup',
        status_label: 'Listo para recoger',
        closed: false,
      }),
    ).toEqual({
      id: 'deal:CRM-DEAL-2026-03311',
      group: 'registros',
      title: 'Apple iPhone 12 — Karolina Quevedo',
      subtitle: 'Trato · Listo para recoger · RO-01234 · 695 122 3254',
      icon: 'lucide-handshake',
      href: '/ventas/deal/CRM-DEAL-2026-03311',
      record: { source: 'deal', name: 'CRM-DEAL-2026-03311' },
    })
    const closed = dealItem({
      name: 'D-2',
      title: 'Pantalla',
      person: 'Ana',
      closed: true,
    })
    // No raw record ID on the line; the kind word stands for the deal.
    expect(closed.subtitle).toBe('Trato')
    expect(closed.icon).toBe('lucide-archive')
  })

  it('Ventas refused: no deal search and deal recents are dropped', async () => {
    const off = boot({
      modules: {
        contactos: { key: 'contactos', enabled: true, capabilities: {} },
        ventas: { key: 'ventas', enabled: false, capabilities: {} },
      },
    })
    const ventas = createShellProviders({
      boot: ref(off),
      modules: ref(hostedModules),
    }).find((provider) => provider.key === 'ventas')
    expect(await ventas.search(query, new AbortController().signal)).toEqual([])
    const deal = {
      id: 'deal:D-1',
      href: '/ventas/deal/D-1',
      record: { source: 'deal', name: 'D-1' },
    }
    expect(await resolveRecent([deal], off)).toEqual([])
    expect(state.call).not.toHaveBeenCalled()
    state.call.mockResolvedValue([
      { source: 'deal', name: 'D-1', title: 'Acme' },
    ])
    expect(await resolveRecent([deal], boot())).toEqual([
      { ...deal, group: 'recientes', title: 'Acme', icon: 'lucide-history' },
    ])
  })
})

// Async sheets (Más, the palette) import their modules on first open; on a
// slow CI runner that takes over the old 40 tries (S1d: Más now loads
// useAssistant itself, the shell no longer does at boot).
async function until(find, tries = 200) {
  for (let i = 0; i < tries; i++) {
    await Promise.resolve()
    await nextTick()
    const found = find()
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return find()
}
async function openPalette() {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
  )
  const palette = await until(() =>
    document.querySelector('[aria-label="Command palette"]'),
  )
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10))
  await nextTick()
  return palette
}
const RECENT_KEY_PREFIX = 'muelle:palette-recent:'
function storedRecent() {
  const key = Object.keys(localStorage).find((k) =>
    k.startsWith(RECENT_KEY_PREFIX),
  )
  return key ? JSON.parse(localStorage.getItem(key)) : null
}
function seedLegacyRecent(items) {
  const key = `${RECENT_KEY_PREFIX}${bootScope(window.site_name || location.host, '')}`
  localStorage.setItem(key, JSON.stringify(items))
}
const legacy = [
  {
    id: 'contact:Ana',
    group: 'recientes',
    title: 'Ana López',
    subtitle: 'Persona · +52 669 123 4567',
    href: '/contactos/contact/Ana',
    ref: { doctype: 'Contact', name: 'Ana' },
  },
  {
    id: 'contact:Jorge',
    group: 'recientes',
    title: 'Jorge López',
    subtitle: 'Persona · jorge@example.com',
    href: '/contactos/contact/Jorge',
    ref: { doctype: 'Contact', name: 'Jorge' },
  },
]

describe('palette recents never outlive read access', () => {
  afterEach(() => localStorage.clear())

  it('stores references only: no names, phones or emails', () => {
    const ref = toRecentRef({
      ...legacy[0],
      group: 'registros',
      record: { source: 'contact', name: 'Ana' },
    })
    expect(ref).toEqual({
      id: 'contact:Ana',
      href: '/contactos/contact/Ana',
      record: { source: 'contact', name: 'Ana' },
    })
    seedLegacyRecent(legacy)
    expect(JSON.stringify(loadRecent())).not.toMatch(/López|669|example/)
  })

  it('Contactos revoked: nothing cached is shown and the list is dropped', async () => {
    seedLegacyRecent(legacy)
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return boot({
          modules: {
            contactos: { key: 'contactos', enabled: false, capabilities: {} },
            ventas: {
              key: 'ventas',
              enabled: true,
              capabilities: { read: true },
            },
          },
        })
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = false
    await mount('/deals')
    const palette = await openPalette()
    expect(palette.textContent).not.toMatch(/López|669|example/)
    expect(state.call).not.toHaveBeenCalledWith(
      'crm.api.shell.resolve_recent',
      expect.anything(),
    )
    expect(storedRecent()).toEqual([])
  })

  it('record revoked: only records the server still lets you read are shown', async () => {
    seedLegacyRecent(legacy)
    state.call.mockImplementation(async (method, args) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method === 'crm.api.shell.resolve_recent') {
        expect(JSON.stringify(args)).not.toMatch(/López|669|example/)
        return [{ source: 'contact', name: 'Jorge', title: 'Jorge L.' }]
      }
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = false
    await mount('/deals')
    const palette = await openPalette()
    await until(() => palette.textContent.includes('Jorge L.'))
    expect(palette.textContent).toContain('Jorge L.')
    expect(palette.textContent).not.toMatch(/Ana|669|jorge@example/)
    expect(storedRecent().map((item) => item.record.name)).toEqual(['Jorge'])
  })
})

describe('Ventas navigation on every screen', () => {
  it('Ventas sections show from 640 px, where the shell switches to desktop', async () => {
    const { default: VentasSidebar } = await import(
      '@/components/shell/VentasSidebar.vue'
    )
    state.mobile.value = false
    await mount('/deals')
    const host = document.createElement('div')
    document.body.append(host)
    const sidebarApp = createApp({ render: () => h(VentasSidebar) })
    sidebarApp.config.globalProperties.__ = (text) => text
    sidebarApp.use(router)
    sidebarApp.mount(host)
    const el = host.querySelector('aside')
    expect(el.classList).toContain('sm:flex')
    expect(el.classList).not.toContain('md:flex')
    sidebarApp.unmount()
    host.remove()
  })

  it('«Solo íconos» folds the Ventas sections to icons and stays chosen', async () => {
    const { default: VentasSidebar } = await import(
      '@/components/shell/VentasSidebar.vue'
    )
    const { ventasCompact } = await import('@/composables/ventasNav')
    ventasCompact.value = false
    state.mobile.value = false
    await mount('/deals')
    const show = () => {
      const host = document.createElement('div')
      document.body.append(host)
      const app = createApp({ render: () => h(VentasSidebar) })
      app.config.globalProperties.__ = (text) => text
      app.use(router)
      app.mount(host)
      return { host, app, aside: host.querySelector('aside') }
    }
    let view = show()
    expect(view.aside.dataset.ventasSidebar).toBe('wide')
    expect(view.aside.classList).toContain('lg:w-[220px]')
    const toggle = view.aside.querySelector(
      '[data-testid="ventas-sidebar-toggle"]',
    )
    expect(toggle.getAttribute('aria-label')).toBe('Collapse sidebar')
    expect(toggle.textContent.trim()).toBe('Icons only')
    toggle.click()
    await nextTick()
    expect(view.aside.dataset.ventasSidebar).toBe('compact')
    expect(view.aside.classList).not.toContain('lg:w-[220px]')
    // The word goes; the icon and its label for readers stay.
    expect(toggle.textContent.trim()).toBe('')
    expect(toggle.getAttribute('aria-label')).toBe('Expand sidebar')
    view.app.unmount()
    view.host.remove()
    // Another page (a remount) keeps the choice.
    view = show()
    expect(view.aside.dataset.ventasSidebar).toBe('compact')
    view.aside.querySelector('[data-testid="ventas-sidebar-toggle"]').click()
    await nextTick()
    expect(view.aside.dataset.ventasSidebar).toBe('wide')
    view.app.unmount()
    view.host.remove()
  })

  it.each([
    ['/contactos', '/ventas'],
    ['/deals', '/deals'],
  ])('Más offers Ventas settings from %s', async (start, landing) => {
    showSettings.value = false
    state.mobile.value = true
    await mount(start)
    root.querySelector('nav[aria-label="Main navigation"] button').click()
    const button = await until(() =>
      [...document.querySelectorAll('[data-shell-layer="more"] button')].find(
        (b) => b.textContent.includes('Ventas settings'),
      ),
    )
    expect(button).toBeTruthy()
    button.click()
    await until(() => showSettings.value)
    expect(showSettings.value).toBe(true)
    expect(router.currentRoute.value.path).toBe(landing)
    showSettings.value = false
  })

  it('phone Más never opens Desk, not even for an admin (SPEC §6.3)', async () => {
    state.mobile.value = true
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return boot({
          user: { name: 'a@x.test', full_name: 'Ana', is_admin: true },
        })
      throw new Error(`unexpected ${method}`)
    })
    await mount('/contactos')
    root.querySelector('nav[aria-label="Main navigation"] button').click()
    const sheet = await until(() =>
      document.querySelector(
        '[data-shell-layer="more"] [data-testid="more-landing"]',
      ),
    )
    expect(sheet).toBeTruthy()
    const more = document.querySelector('[data-shell-layer="more"]')
    expect(more.querySelector('a[href="/desk"]')).toBeNull()
    expect(more.textContent).toContain('Sign out')
  })

  it('Más › Settings: «Open Muelle on» shows the saved choice and saves a new one', async () => {
    state.mobile.value = true
    state.toasts.length = 0
    state.call.mockImplementation(async (method, args) => {
      if (method === 'crm.api.shell.boot') return boot({ landing: 'contactos' })
      if (method === 'crm.api.hoy.save_landing') return { landing: args.key }
      throw new Error(`unexpected ${method}`)
    })
    await mount('/contactos')
    root.querySelector('nav[aria-label="Main navigation"] button').click()
    const select = await until(() =>
      document.querySelector(
        '[data-shell-layer="more"] [data-testid="more-landing"]',
      ),
    )
    expect(select.value).toBe('contactos')
    expect([...select.options].map((o) => o.value)).toContain('')
    select.value = 'hoy'
    select.dispatchEvent(new Event('change'))
    await until(() => state.toasts.length)
    expect(state.call).toHaveBeenCalledWith('crm.api.hoy.save_landing', {
      key: 'hoy',
    })
    expect(state.toasts[0]).toEqual(['success', 'Muelle will open on Hoy.'])
    expect(shellBoot.value.landing).toBe('hoy')
  })

  it.each([true, false])(
    'Más: «Pregúntale a Muelle» door only when the assistant is on (%s); it closes Más and opens the assistant',
    async (enabled) => {
      const { assistant, _resetAssistant, loadStatus } = await import(
        '@/components/assistant/useAssistant'
      )
      _resetAssistant()
      state.mobile.value = true
      state.call.mockImplementation(async (method) => {
        if (method === 'crm.api.shell.boot') return boot()
        if (method.endsWith('shell_api.status')) return { enabled }
        if (method.endsWith('shell_api.history')) return { messages: [] }
        return null
      })
      // The status call is cached per module; ask again for this case.
      await loadStatus({ refresh: true })
      const settle = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
      }
      await mount('/contactos')
      root.querySelector('nav[aria-label="Main navigation"] button').click()
      await until(() => document.querySelector('[data-shell-layer="more"]'))
      await settle()
      const door = document.querySelector('[data-testid="more-assistant"]')
      if (!enabled) {
        expect(door).toBeNull()
        return
      }
      expect(door.textContent).toContain('Ask Muelle')
      door.click()
      await until(() => assistant.open)
      await settle()
      expect(document.querySelector('[data-shell-layer="more"]')).toBeNull()
    },
  )

  it("the warm-up gets the phone bar's module keys and the module on screen", async () => {
    warmUp.calls.length = 0
    await mount('/contactos')
    expect(warmUp.calls.length).toBeGreaterThan(0)
    const { modules, current } = warmUp.calls.at(-1)
    expect(modules()).toEqual(navSlots.value.map((slot) => slot.key))
    expect(modules().every((key) => typeof key === 'string')).toBe(true)
    expect(modules()).toContain('contactos')
    expect(current()).toBe('contactos')
  })

  it('boot asks shell_api.status once and nothing else of the assistant; ⌘J reuses the answer (E7)', async () => {
    const { assistant, _resetAssistant } = await import(
      '@/components/assistant/useAssistant'
    )
    const { assistantWanted } = await import(
      '@/components/assistant/assistantDoor'
    )
    _resetAssistant()
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method.endsWith('shell_api.status')) return { enabled: true }
      if (method.endsWith('shell_api.history')) return { messages: [] }
      return null
    })
    await mount('/contactos')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const asked = () => state.call.mock.calls.filter(([m]) => m.startsWith(API))
    expect(asked().map(([m]) => m)).toEqual([`${API}.status`])
    expect(assistantWanted.value).toBe(false)
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'j',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    await until(() => assistant.open)
    expect(asked().filter(([m]) => m.endsWith('.status'))).toHaveLength(1)
    expect(assistantWanted.value).toBe(true)
    _resetAssistant()
  })

  it.each([true, false])(
    'desktop rail: «Pregúntale a Muelle» is the sparkle right after search, only when the status says yes (%s); it opens the sheet',
    async (enabled) => {
      const { assistant, _resetAssistant } = await import(
        '@/components/assistant/useAssistant'
      )
      _resetAssistant()
      state.mobile.value = false
      state.call.mockImplementation(async (method) => {
        if (method === 'crm.api.shell.boot') return boot()
        if (method.endsWith('shell_api.status')) return { enabled }
        if (method.endsWith('shell_api.history')) return { messages: [] }
        return null
      })
      await mount('/contactos')
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
      const door = root.querySelector('[data-testid="rail-assistant"]')
      if (!enabled) {
        expect(door).toBeNull()
        return
      }
      expect(door.getAttribute('aria-label')).toBe('Ask Muelle')
      expect(door.getAttribute('aria-keyshortcuts')).toBe('Control+J')
      const rail = root.querySelector('nav[aria-label="Apps"]')
      const order = [...rail.querySelectorAll('[data-testid]')].map(
        (el) => el.dataset.testid,
      )
      expect(order.indexOf('rail-assistant')).toBe(
        order.indexOf('rail-search') + 1,
      )
      // An icon beside the field, not a row with its own name.
      expect(door.textContent.trim()).toBe('')
      expect(order.indexOf('rail-assistant')).toBeLessThan(
        order.indexOf('rail-toggle'),
      )
      expect(
        document.querySelectorAll('[data-testid="rail-assistant"]'),
      ).toHaveLength(1)
      door.click()
      await until(() => assistant.open)
      expect(assistant.open).toBe(true)
      _resetAssistant()
    },
  )

  it('phone command bar: search is the main door, the sparkle an icon beside it', async () => {
    const { _resetAssistant } = await import(
      '@/components/assistant/useAssistant'
    )
    _resetAssistant()
    state.mobile.value = true
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method.endsWith('shell_api.status')) return { enabled: true }
      return null
    })
    await mount('/contactos')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    const bar = root.querySelector('[data-testid="shell-command-bar"]')
    const search = bar.querySelector('[data-testid="shell-search"]')
    const door = bar.querySelector('[data-testid="shell-assistant"]')
    expect(search.getAttribute('aria-label')).toBe('Search or go to…')
    // The full words, or just «Buscar» under 360px.
    expect(
      [...search.querySelectorAll('span:not([aria-hidden])')].map((el) =>
        el.textContent.trim(),
      ),
    ).toEqual(['Search or go to…', 'Search'])
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+K Control+G')
    expect(door.getAttribute('aria-label')).toBe('Ask Muelle')
    expect(door.textContent.trim()).toBe('')
    const order = [...bar.querySelectorAll('[data-testid]')].map(
      (el) => el.dataset.testid,
    )
    expect(order.slice(0, 2)).toEqual(['shell-search', 'shell-assistant'])
    // One global search door: the top bar keeps only the title and the bell.
    expect(root.querySelector('[data-testid="shell-search-top"]')).toBeNull()
    expect(root.querySelector('[data-testid="rail-assistant"]')).toBeNull()
    search.click()
    await until(() => document.querySelector('[aria-label="Command palette"]'))
    _resetAssistant()
  })

  it('phone command bar: search stays the main door with the assistant off', async () => {
    state.mobile.value = true
    await mount('/contactos')
    const bar = root.querySelector('[data-testid="shell-command-bar"]')
    expect(bar.querySelector('[data-testid="shell-search"]')).not.toBeNull()
    expect(bar.querySelector('[data-testid="shell-assistant"]')).toBeNull()
  })

  it('⌘J with a dialog open and the status off closes nothing', async () => {
    const { assistant, _resetAssistant } = await import(
      '@/components/assistant/useAssistant'
    )
    _resetAssistant()
    state.mobile.value = false
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      if (method.endsWith('shell_api.status')) return { enabled: false }
      return null
    })
    await mount('/contactos')
    const palette = await openPalette()
    expect(palette.getAttribute('aria-modal')).toBe('true')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'j',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10))
    await nextTick()
    expect(
      document.querySelector('[aria-label="Command palette"]'),
    ).not.toBeNull()
    expect(assistant.open).toBe(false)
    expect(document.querySelector('[data-shell-layer="assistant"]')).toBeNull()
    _resetAssistant()
  })
})

const avisosOnly = {
  modules: {
    contactos: {
      key: 'contactos',
      enabled: false,
      reason: 'Sin Contactos',
      capabilities: {},
    },
    ventas: { key: 'ventas', enabled: false, capabilities: {} },
    avisos: {
      key: 'avisos',
      enabled: true,
      capabilities: { read: true },
      badge: { count: 2, capped: false },
    },
  },
}

describe('Avisos in the shell', () => {
  it('desktop: the bell is pinned at the bottom of the rail with the grouped count', async () => {
    state.mobile.value = false
    await mount('/deals')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Contactos', 'Ventas'])
    const bell = await until(() =>
      rail.querySelector('button[aria-label^="Avisos"]'),
    )
    expect(bell.getAttribute('aria-label')).toBe('Avisos, 3 to review')
    expect(bell.textContent).toContain('3')
  })

  it('no bell when the boot refuses Avisos', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return boot({
          modules: {
            ventas: { key: 'ventas', enabled: true, capabilities: {} },
            avisos: { key: 'avisos', enabled: false, capabilities: {} },
          },
        })
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = false
    await mount('/deals')
    await until(() => false, 40)
    expect(root.querySelector('button[aria-label^="Avisos"]')).toBeNull()
  })

  it('phone: a worker without Contactos or Ventas gets the header bell and the Avisos page', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot(avisosOnly)
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = true
    await mount('/avisos')
    expect(root.textContent).toContain('page')
    expect(root.querySelector('[role="alert"]')).toBeNull()
    const bell = await until(() =>
      root.querySelector('header button[aria-label^="Avisos"]'),
    )
    expect(bell.getAttribute('aria-label')).toBe('Avisos, 2 to review')
    const nav = root.querySelector('nav[aria-label="Main navigation"]')
    expect(nav.textContent).not.toContain('Avisos')
    await router.push('/contactos')
    bell.click()
    await until(() => router.currentRoute.value.path === '/avisos')
    expect(router.currentRoute.value.path).toBe('/avisos')
  })

  it('a refused Avisos route shows the Avisos refusal, never the Contactos one', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return boot({
          modules: {
            contactos: { key: 'contactos', enabled: true, capabilities: {} },
            avisos: {
              key: 'avisos',
              enabled: false,
              reason: 'Solo personal',
              capabilities: {},
            },
          },
        })
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = false
    await mount('/avisos')
    const alert = root.querySelector('[role="alert"]')
    expect(alert.textContent).toContain('We could not open Avisos')
    expect(alert.textContent).toContain('Solo personal')
    // The reason never asks for Contactos; «Go to Contactos» is only where to keep working.
    expect(alert.querySelector('p').textContent).not.toContain('Contactos')
  })

  it('the recovery screen is never replaced by a module refusal', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot(avisosOnly)
      throw new Error(`unexpected ${method}`)
    })
    state.mobile.value = false
    await mount('/not-permitted?intended=/avisos')
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.textContent).toContain('page')
  })
})

describe('Pendientes in the shell', () => {
  const answer = (modules) =>
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot({ modules })
      throw new Error(`unexpected ${method}`)
    })
  const refusedPendientes = {
    key: 'pendientes',
    enabled: false,
    reason: 'Pide permiso para leer tus pendientes.',
    capabilities: {},
  }

  it('a refused Pendientes route shows its own refusal and the first module the worker has', async () => {
    answer({
      pendientes: refusedPendientes,
      contactos: { key: 'contactos', enabled: true, capabilities: {} },
      ventas: { key: 'ventas', enabled: true, capabilities: {} },
    })
    state.mobile.value = false
    await mount('/pendientes')
    const alert = await until(() => root.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('We could not open Pendientes')
    expect(alert.textContent).toContain(refusedPendientes.reason)
    expect(alert.textContent).not.toContain('Contactos page')
    const go = [...alert.querySelectorAll('button')].find(
      (button) => button.textContent === 'Go to Contactos',
    )
    expect(go).toBeTruthy()
    go.click()
    await until(() => router.currentRoute.value.path === '/contactos')
    expect(router.currentRoute.value.path).toBe('/contactos')
  })

  it('a Contactos refusal never blocks the Pendientes queue', async () => {
    answer({
      pendientes: { key: 'pendientes', enabled: true, capabilities: {} },
      contactos: {
        key: 'contactos',
        enabled: false,
        reason: 'Sin Contactos',
        capabilities: {},
      },
      ventas: { key: 'ventas', enabled: false, capabilities: {} },
    })
    state.mobile.value = false
    await mount('/pendientes')
    await until(() => shellBoot.value)
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.textContent).toContain('page')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Pendientes'])
  })

  it('the recovery screen answers for itself, not for the module it is filed under', async () => {
    answer({
      pendientes: { key: 'pendientes', enabled: true, capabilities: {} },
      contactos: { key: 'contactos', enabled: false, capabilities: {} },
      ventas: { key: 'ventas', enabled: false, capabilities: {} },
    })
    state.mobile.value = false
    await mount('/not-permitted?intended=%2Fdeals')
    await until(() => shellBoot.value)
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('keyboard standard: Ctrl+K / Ctrl+G modes and the Alt+H sheet', () => {
  const press = (init, target = window) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  const palette = () => document.querySelector('[aria-label="Command palette"]')
  const sheet = () => document.querySelector('[data-shell-layer="shortcuts"]')
  const tabs = () =>
    [...sheet().querySelectorAll('[role="tab"]')].map((tab) => [
      tab.dataset.section,
      tab.getAttribute('aria-selected'),
    ])
  const panelText = () =>
    sheet().querySelector('[role="tabpanel"]:not([hidden])').textContent
  async function settle() {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      await nextTick()
    }
  }
  const mine = () =>
    hostedModules.filter((m) => ['contactos', 'ventas'].includes(m.key))
  beforeEach(() => {
    state.mobile.value = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ message: { rows: [] } }),
      })),
    )
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      return []
    })
  })
  afterEach(() => {
    closeShortcutSheet()
    vi.unstubAllGlobals()
  })

  it('Ctrl+G opens the palette in records mode: placeholder, chips, groups and footer', async () => {
    await mount('/deals')
    press({ key: 'g', ctrlKey: true })
    const dialog = await until(palette)
    await settle()
    expect(dialog.dataset.mode).toBe('records')
    const input = dialog.querySelector('input')
    expect(input.placeholder).toBe('Buscar registros…')
    expect(input.getAttribute('role')).toBe('combobox')
    expect(document.activeElement).toBe(input)
    expect(
      [...dialog.querySelectorAll('[data-palette-mode]')].map((chip) => [
        chip.textContent.replace(/\s+/g, ' ').trim(),
        chip.getAttribute('aria-pressed'),
      ]),
    ).toEqual([
      ['Todo Ctrl+K', 'false'],
      ['Registros Ctrl+G', 'true'],
    ])
    // Records only: no Acciones and no Ir a, even for an empty input.
    expect(dialog.textContent).not.toContain('Actions')
    expect(dialog.textContent).not.toContain('New contact')
    expect(
      dialog.querySelector('[data-testid="palette-footer"]').textContent.trim(),
    ).toBe('↑↓ moverse · ↵ abrir · Esc cerrar')
  })

  it('K and G switch modes in the one open dialog, keep the text, and the same key refocuses', async () => {
    await mount('/deals')
    press({ key: 'k', ctrlKey: true })
    await until(palette)
    await settle()
    const input = palette().querySelector('input')
    expect(palette().dataset.mode).toBe('all')
    expect(input.placeholder).toBe('Buscar o ir a…')
    // Group headings are the standard's es-MX copy even without a catalog.
    expect(palette().textContent).toContain('Acciones')
    input.value = 'ana'
    input.dispatchEvent(new Event('input'))
    // Ctrl+G fires while typing in the palette's own input.
    press({ key: 'g', ctrlKey: true }, input)
    await settle()
    expect(
      document.querySelectorAll('[aria-label="Command palette"]'),
    ).toHaveLength(1)
    expect(palette().dataset.mode).toBe('records')
    expect(palette().querySelector('input')).toBe(input)
    expect(input.value).toBe('ana')
    expect(input.placeholder).toBe('Buscar registros…')
    press({ key: 'k', ctrlKey: true }, input)
    await settle()
    expect(palette().dataset.mode).toBe('all')
    expect(input.value).toBe('ana')
    // Pressing the open mode's key again brings the focus back to the input.
    input.blur()
    expect(document.activeElement).not.toBe(input)
    press({ key: 'k', ctrlKey: true })
    await settle()
    expect(document.activeElement).toBe(input)
    // The chips switch too, with the text kept.
    palette().querySelector('[data-palette-mode="records"]').click()
    await settle()
    expect(palette().dataset.mode).toBe('records')
    expect(input.value).toBe('ana')
    expect(document.activeElement).toBe(input)
  })

  it('the palette keeps the focus: Tab cycles inside, Esc closes from anywhere and the focus returns', async () => {
    await mount('/deals')
    const field = document.createElement('input')
    const outside = document.createElement('button')
    root.append(field, outside)
    field.focus()
    press({ key: 'k', ctrlKey: true }, field)
    const dialog = await until(palette)
    await settle()
    const input = dialog.querySelector('input')
    expect(document.activeElement).toBe(input)
    // Chips, input and Esc; the results are reached with ↑↓, not Tab.
    const stops = tabbables(dialog)
    expect(stops).toContain(input)
    expect(stops.some((el) => el.getAttribute('role') === 'option')).toBe(false)
    expect(dialog.querySelector('[role="option"]')).not.toBeNull()
    // Tab never leaves the dialog: one full round comes back to the input.
    for (let i = 0; i < stops.length; i++) {
      press({ key: 'Tab' }, document.activeElement)
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    expect(document.activeElement).toBe(input)
    // Shift+Tab on the first stop goes to the last one.
    stops[0].focus()
    press({ key: 'Tab', shiftKey: true }, stops[0])
    expect(document.activeElement).toBe(stops[stops.length - 1])
    // Focus that slipped out (doco's «Ayuda», a rail link) is pulled back in.
    outside.focus()
    press({ key: 'Tab' }, outside)
    expect(document.activeElement).toBe(stops[0])
    // ↓ and Esc still answer with the focus outside the dialog.
    outside.focus()
    press({ key: 'ArrowDown' }, outside)
    await nextTick()
    expect(document.activeElement).toBe(input)
    outside.focus()
    press({ key: 'Escape' }, outside)
    await settle()
    expect(palette()).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('the sheet, the Más sheet and the rail menus keep the focus too', async () => {
    await mount('/deals')
    const outside = document.createElement('button')
    root.append(outside)
    // Alt+H sheet: Tab from outside comes back in, Esc from outside closes.
    const opener = root.querySelector('[data-testid="rail-search"]')
    opener.focus()
    press({ key: 'h', code: 'KeyH', altKey: true }, opener)
    const dialog = await until(sheet)
    await settle()
    const sheetStops = tabbables(dialog)
    // The roving tabs count once; the hidden panel not at all.
    expect(
      sheetStops.filter((el) => el.getAttribute('role') === 'tab'),
    ).toHaveLength(1)
    sheetStops[sheetStops.length - 1].focus()
    press({ key: 'Tab' }, document.activeElement)
    expect(document.activeElement).toBe(sheetStops[0])
    outside.focus()
    press({ key: 'Tab', shiftKey: true }, outside)
    expect(document.activeElement).toBe(sheetStops[sheetStops.length - 1])
    outside.focus()
    press({ key: 'Escape' }, outside)
    await settle()
    expect(sheet()).toBeNull()
    expect(document.activeElement).toBe(opener)
    // Account menu: the first entry takes the focus, Tab cycles, Esc returns.
    const account = root.querySelector('[aria-label="Account menu"]')
    account.click()
    await settle()
    const menu = document.querySelector('[role="menu"]')
    const items = tabbables(menu)
    expect(document.activeElement).toBe(items[0])
    items[items.length - 1].focus()
    press({ key: 'Tab' }, document.activeElement)
    expect(document.activeElement).toBe(items[0])
    press({ key: 'Tab', shiftKey: true }, document.activeElement)
    expect(document.activeElement).toBe(items[items.length - 1])
    outside.focus()
    press({ key: 'Escape' }, outside)
    await settle()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(account)
  })

  it('phone Más sheet: Tab stays inside, Esc from anywhere closes, «Más» gets the focus back', async () => {
    state.mobile.value = true
    await mount('/contactos')
    const outside = document.createElement('button')
    root.append(outside)
    const more = root.querySelector(
      'nav[aria-label="Main navigation"] button[aria-haspopup="dialog"]',
    )
    more.focus()
    more.click()
    const dialog = await until(() =>
      document.querySelector('[data-shell-layer="more"]'),
    )
    await settle()
    const stops = tabbables(dialog)
    expect(stops.length).toBeGreaterThan(2)
    // From the sheet itself (tabindex -1) Tab goes to its first stop.
    press({ key: 'Tab' }, document.activeElement)
    expect(document.activeElement).toBe(stops[0])
    press({ key: 'Tab', shiftKey: true }, document.activeElement)
    expect(document.activeElement).toBe(stops[stops.length - 1])
    press({ key: 'Tab' }, document.activeElement)
    expect(document.activeElement).toBe(stops[0])
    outside.focus()
    press({ key: 'Escape' }, outside)
    await settle()
    expect(document.querySelector('[data-shell-layer="more"]')).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  it('the rail search names both keys; no hard-coded «Ctrl K»', async () => {
    await mount('/deals')
    const search = root.querySelector('[data-testid="rail-search"]')
    expect(search.dataset.tip).toBe(
      'Buscar o ir a… (Ctrl+K) · Buscar registros (Ctrl+G)',
    )
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+K Control+G')
    const rail = readFileSync(
      resolve(__dirname, '../../src/components/shell/ShellRail.vue'),
      'utf8',
    )
    expect(rail).not.toContain('Ctrl K')
  })

  it('Alt+H opens the sheet even while typing; Esc closes it and returns the focus', async () => {
    await mount('/deals')
    const field = document.createElement('input')
    root.append(field)
    field.focus()
    // `?` types a question mark inside a field.
    press({ key: '?', shiftKey: true }, field)
    await settle()
    expect(sheet()).toBeNull()
    press({ key: 'h', code: 'KeyH', altKey: true }, field)
    const dialog = await until(sheet)
    await settle()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector('h2').textContent.trim()).toBe(
      'Atajos de teclado',
    )
    expect(document.activeElement.getAttribute('role')).toBe('tab')
    press({ key: 'Escape' }, document.activeElement)
    await settle()
    expect(sheet()).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('`?` opens the sheet only outside text fields; ⌥H on a Mac (˙) opens it too', async () => {
    await mount('/deals')
    press({ key: '?', shiftKey: true }, document.body)
    expect(await until(sheet)).not.toBeNull()
    closeShortcutSheet()
    await settle()
    expect(sheet()).toBeNull()
    // macOS types ⌥H as «˙»; the physical key decides.
    press({ key: '˙', code: 'KeyH', altKey: true }, document.body)
    expect(await until(sheet)).not.toBeNull()
  })

  it('the sheet: Atajos rápidos first, ARIA tabs with arrows/Home/End, go-to only for my modules', async () => {
    await mount('/deals')
    press({ key: 'h', code: 'KeyH', altKey: true })
    await until(sheet)
    await settle()
    expect(sheet().querySelector('[role="tablist"]')).not.toBeNull()
    expect(tabs()).toEqual([
      ['quick', 'true'],
      ['app', 'false'],
    ])
    const quick = panelText()
    for (const text of [
      'Ver los atajos de teclado',
      'Buscar o ir a…',
      'Buscar registros',
      'Cerrar la capa superior',
    ])
      expect(quick).toContain(text)
    press({ key: 'ArrowDown' }, document.activeElement)
    await settle()
    expect(tabs()).toEqual([
      ['quick', 'false'],
      ['app', 'true'],
    ])
    expect(document.activeElement.dataset.section).toBe('app')
    const app = panelText()
    expect(app).toContain('Ir a Contactos')
    expect(app).toContain('Ir a Ventas')
    // Only keys the shell implements: no module the worker lacks, no «c»;
    // «[» shows or hides the app names of the rail.
    expect(app).not.toContain('Ir a Agenda')
    expect(app).not.toContain('Crear')
    expect(app).toContain('Mostrar u ocultar la barra lateral')
    press({ key: 'Home' }, document.activeElement)
    await settle()
    expect(tabs()[0]).toEqual(['quick', 'true'])
    press({ key: 'End' }, document.activeElement)
    await settle()
    expect(tabs()[1]).toEqual(['app', 'true'])
  })

  it('«En esta página» lists the keys the page registered, and goes with the page', async () => {
    const canCreate = ref(true)
    const remove = registerPageShortcuts(null, () =>
      agendaShortcuts({ canCreate: canCreate.value }),
    )
    const page = () =>
      shellCheatSheet({ modules: mine() }).find((s) => s.id === 'page')
    expect(page().title).toBe('En esta página')
    expect(page().rows.map((row) => row.keys.join())).toEqual([
      'C',
      'T',
      'D',
      'W',
      'M',
      'L',
      'J',
      'K',
    ])
    canCreate.value = false
    expect(page().rows.map((row) => row.keys.join())).not.toContain('C')
    await mount('/agenda')
    press({ key: 'h', code: 'KeyH', altKey: true })
    await until(sheet)
    await settle()
    expect(tabs().map(([id]) => id)).toEqual(['quick', 'page', 'app'])
    remove()
    expect(pageShortcuts.value.extra).toEqual([])
    expect(
      shellCheatSheet({ modules: mine() }).map((section) => section.id),
    ).toEqual(['quick', 'app'])
    // A power list answers the list context with its own listener: its rows
    // are listed (the shell never calls them).
    const removeContext = registerPageShortcuts('list')
    expect(
      shellCheatSheet({ modules: mine() })[0].rows.map((row) => row.id),
    ).toContain('search')
    removeContext()
    expect(
      shellCheatSheet({ modules: mine() })[0].rows.map((row) => row.id),
    ).not.toContain('search')
    // A list page that answers the search through the shell gets the row too.
    const removeList = registerPageKeys({ keys: { search: () => {} } })
    const [quick] = shellCheatSheet({ modules: mine() })
    expect(quick.rows.find((row) => row.id === 'search').keys).toEqual([
      '/',
      'Ctrl+Shift+K',
    ])
    removeList()
  })

  it('a Spanish worker reads the standard copy even where another catalog differs', () => {
    const catalog = {
      'Show keyboard shortcuts': 'Mostrar atajos de teclado',
      'Keyboard shortcuts': 'Atajos del teclado',
      'Day view': 'Vista de día',
    }
    globalThis.__ = (text) => catalog[text] || text
    window.lang = 'es-MX'
    try {
      expect(shellT('Show keyboard shortcuts')).toBe(
        'Ver los atajos de teclado',
      )
      expect(shellT('Keyboard shortcuts')).toBe('Atajos de teclado')
      expect(shellT('All', [], 'Palette mode')).toBe('Todo')
      // Strings outside the standard keep the app catalog.
      expect(shellT('Day view')).toBe('Vista de día')
      window.lang = 'en'
      expect(shellT('Show keyboard shortcuts')).toBe(
        'Mostrar atajos de teclado',
      )
    } finally {
      delete window.lang
    }
  })

  it('labels follow the platform: ⌘/⌥ on Apple, Ctrl/Alt elsewhere', () => {
    const keysOf = (apple) =>
      shellCheatSheet({ modules: mine(), apple })[0].rows.map((r) => r.keys)
    expect(keysOf(true)).toEqual([['⌥H', '?'], ['⌘K'], ['⌘G'], ['Esc']])
    expect(keysOf(false)).toEqual([
      ['Alt+H', '?'],
      ['Ctrl+K'],
      ['Ctrl+G'],
      ['Esc'],
    ])
    expect(searchEntryHint(true).label).toBe(
      'Buscar o ir a… (⌘K) · Buscar registros (⌘G)',
    )
    expect(searchEntryHint(true).aria).toBe('Meta+K Meta+G')
    expect(keyLabel('alt+h', true)).toBe('⌥H')
    expect(keyLabel('alt+h', false)).toBe('Alt+H')
  })

  it('entry points: the account menu, the Más sheet and the palette action open the sheet', async () => {
    await mount('/deals')
    root.querySelector('[aria-label="Account menu"]').click()
    await settle()
    const item = document.querySelector('[data-testid="menu-shortcuts"]')
    expect(item.textContent).toContain('Atajos de teclado')
    expect(item.querySelector('kbd').textContent).toBe('Alt+H')
    item.click()
    expect(await until(sheet)).not.toBeNull()
    press({ key: 'Escape' }, document.activeElement)
    await settle()
    expect(sheet()).toBeNull()
    expect(document.activeElement.getAttribute('aria-label')).toBe(
      'Account menu',
    )
    const more = readFileSync(
      resolve(__dirname, '../../src/components/shell/MoreSheet.vue'),
      'utf8',
    )
    // Phone «Más» has no shortcuts row: the sheet is for touch, the palette has it.
    expect(more).not.toContain('more-shortcuts')
    expect(more).toContain('layer="more"')
    // «Ver atajos de teclado» in the palette's Acciones.
    const [actions] = createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    })
    const found = await actions.search({
      raw: 'keyboard',
      text: 'keyboard',
      scope: 'all',
      kind: 'text',
    })
    expect(found).toContainEqual(
      expect.objectContaining({
        id: 'shortcuts',
        action: 'shortcuts',
        shortcut: 'alt+h',
      }),
    )
    press({ key: 'k', ctrlKey: true })
    await until(palette)
    await settle()
    const input = palette().querySelector('input')
    input.value = 'keyboard'
    input.dispatchEvent(new Event('input'))
    const option = await until(() =>
      [...palette().querySelectorAll('[role="option"]')].find((o) =>
        o.textContent.includes('Ver atajos de teclado'),
      ),
    )
    expect(option.textContent).toContain('Alt+H')
    // A row shows only a key the shell answers: «c» has no global handler yet.
    const create = [...palette().querySelectorAll('[role="option"]')].find(
      (o) => o.textContent.includes('New contact'),
    )
    expect(create.querySelector('kbd')).toBeNull()
    option.click()
    expect(await until(sheet)).not.toBeNull()
    await settle()
    expect(palette()).toBeNull()
  })

  it('the classic CRM sidebar Help offers the sheet with its key', () => {
    const sidebar = readFileSync(
      resolve(__dirname, '../../src/components/Layouts/AppSidebar.vue'),
      'utf8',
    )
    expect(sidebar).toMatch(
      /:label="shellT\('Keyboard shortcuts'\)"[\s\S]*openShortcutSheet[\s\S]*keyLabel\('alt\+h'\)/,
    )
  })

  it('Ctrl+K lists the record on screen first, shows only answered keys, and runs the action after closing', async () => {
    const call = vi.fn()
    const won = vi.fn(() => palette())
    const remove = useRecordActions(() => [
      {
        id: 'deal.call',
        title: 'Call the contact',
        icon: 'lucide-phone',
        keys: ['l'],
        run: call,
      },
      { id: 'deal.won', title: 'Mark as won', run: won },
    ])
    try {
      await mount('/deals')
      press({ key: 'k', ctrlKey: true })
      await until(palette)
      await settle()
      const heading = palette().querySelector('[role="listbox"] > div')
      // «ACCIONES»: the contracts' es-MX heading, upper-cased by CSS.
      expect(heading.textContent.trim()).toBe('Acciones')
      const options = [...palette().querySelectorAll('[role="option"]')]
      expect(options[0].textContent).toContain('Call the contact')
      expect(options[0].querySelector('kbd').textContent).toBe('L')
      expect(options[1].textContent).toContain('Mark as won')
      expect(options[1].querySelector('kbd')).toBeNull()
      options[1].click()
      await settle()
      expect(palette()).toBeNull()
      // It ran once the palette was gone, not while it was open.
      expect(won).toHaveBeenCalledTimes(1)
      expect(won.mock.results[0].value).toBeNull()
      // «l» outside the palette is the page key.
      press({ key: 'l' }, document.body)
      expect(call).toHaveBeenCalledTimes(1)
      // «Nuevo trato» for a worker with Ventas, after the record's actions.
      const [actions] = createShellProviders({
        boot: ref(boot()),
        modules: ref(hostedModules),
      })
      const found = await actions.search({
        raw: 'trato',
        text: 'trato',
        scope: 'all',
        kind: 'text',
      })
      expect(found).toContainEqual(
        expect.objectContaining({
          id: 'ventas.create',
          href: '/deals?create=1',
        }),
      )
      const [none] = createShellProviders({
        boot: ref(boot({ modules: {} })),
        modules: ref(hostedModules),
      })
      const nothing = await none.search({
        raw: 'trato',
        text: 'trato',
        scope: 'all',
        kind: 'text',
      })
      expect(nothing.map((item) => item.id)).not.toContain('ventas.create')
    } finally {
      remove()
    }
    expect(pageShortcuts.value.extra).toEqual([])
  })
})

describe('shell-level keys: c creates in this module, Esc closes the page layer', () => {
  const press = (init, target = document.body) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  async function settle() {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      await nextTick()
    }
  }
  const appRows = () =>
    shellCheatSheet({ modules: hostedModules })
      .flatMap((section) => section.rows)
      .map((row) => row.id)
  beforeEach(() => {
    state.mobile.value = false
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return boot()
      return []
    })
  })

  it('«c» runs the palette’s create action of the current module, and only there', async () => {
    await mount('/contactos')
    await settle()
    expect(appRows()).toContain('create')
    press({ key: 'c' })
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/contactos?create=1')
    // While typing, «c» is a letter.
    const field = document.createElement('input')
    root.append(field)
    await router.push('/contactos')
    press({ key: 'c' }, field)
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/contactos')
    field.remove()
    // The palette shows [C] on «New contact» here, the same action «c» runs.
    press({ key: 'k', ctrlKey: true })
    const dialog = await until(() =>
      document.querySelector('[aria-label="Command palette"]'),
    )
    const input = dialog.querySelector('input')
    input.value = 'contact'
    input.dispatchEvent(new Event('input'))
    const option = await until(() =>
      [...dialog.querySelectorAll('[role="option"]')].find((o) =>
        o.textContent.includes('New contact'),
      ),
    )
    expect(option.querySelector('kbd').textContent).toBe('C')
  })

  it('a module without a create action neither lists nor answers «c»', async () => {
    await mount('/avisos')
    await settle()
    expect(appRows()).not.toContain('create')
    press({ key: 'c' })
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/avisos')
  })

  it('the page’s own create and Esc win; nothing runs under a foreign dialog', async () => {
    await mount('/contactos')
    await settle()
    const create = vi.fn()
    const close = vi.fn()
    const remove = registerPageKeys({ keys: { create, close } })
    press({ key: 'c' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe('/contactos')
    press({ key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    press({ key: 'Escape' })
    press({ key: 'c' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    dialog.remove()
    remove()
  })
})

describe('Inmobiliaria in the shell: every record screen opens, every state leads on', () => {
  // The record screens the app serves (INMO-SH). The route, TIPOS and the
  // documents hand-off hold exactly these.
  const CONTRACT_TIPOS = [
    'unidad',
    'apartado',
    'venta',
    'expediente',
    'contrato',
    'mantenimiento',
    'aviso',
    'liquidacion',
    'comision',
    'entrega',
    'garantia',
    'etapa',
    'captacion',
    'oferta',
    'ajuste',
    'solicitud',
    'propiedad',
  ]
  const ROUTER_SOURCE = readFileSync(
    resolve(__dirname, '../../src/router.js'),
    'utf8',
  )
  const FICHA_PATH = /path: '(\/inmobiliaria\/:tipo\([a-z|]+\)\/:name)'/.exec(
    ROUTER_SOURCE,
  )?.[1]
  const FICHA = (args) => ({
    tipo_label: TIPOS[args.tipo]?.etiqueta || '',
    titulo: `Ficha ${args.name}`,
    doctype: TIPOS[args.tipo]?.doctype || '',
    name: args.name,
    acciones: [],
    secciones: [],
  })
  const inmoBoot = (capabilities = { read: true }) => ({
    user: { name: 'ana@example.test', full_name: 'Ana López' },
    modules: {
      contactos: {
        key: 'contactos',
        enabled: true,
        capabilities: { read: true },
      },
      inmobiliaria: { key: 'inmobiliaria', enabled: true, capabilities },
    },
  })
  const COLA_SIN_RENGLONES = {
    key: 'propiedades_sin_captacion',
    etiqueta: 'Propiedades sin captación',
    count: 3,
    filas: [],
    mas: false,
    desk: '/desk/propiedad-administrada?captacion=0',
  }
  const COLA_POR_PAGAR = {
    key: 'por_pagar',
    etiqueta: 'Por pagar',
    count: 2,
    mas: false,
    filas: [
      {
        name: 'AV-1',
        title: 'Aviso de Laura',
        url: '/crm/inmobiliaria/aviso/AV-1',
      },
      // The server may still answer a row with its Desk form.
      {
        name: 'LIQ-1',
        title: 'Liquidación de octubre',
        url: '/desk/liquidacion-a-propietarios/LIQ-1',
      },
    ],
  }

  let width
  beforeEach(() => {
    width = window.innerWidth
    window.history.replaceState(null, '')
    localStorage.clear()
    resetShellForTests()
  })
  afterEach(() => {
    unmountPage()
    setWidth(width)
  })

  function setWidth(value) {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value,
    })
    window.dispatchEvent(new Event('resize'))
  }
  // The server's answers by method: a value, or a function of the call's arguments.
  function answer(methods) {
    state.call.mockImplementation(async (method, args) => {
      if (!(method in methods)) throw new Error(`unexpected ${method}`)
      const reply = methods[method]
      return typeof reply === 'function' ? reply(args) : reply
    })
  }
  // A refusal as frappe-ui's call() rejects it: the server's own words.
  const refusal = (text) => () => {
    throw Object.assign(new Error('PermissionError'), {
      exc_type: 'PermissionError',
      messages: [text],
    })
  }
  // The real pages on a memory router; the places they lead to are stubs.
  async function mountPage(path, { phone = false } = {}) {
    setWidth(phone ? 390 : 1280)
    const stub = (text) => ({ render: () => h('p', text) })
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/hoy', component: stub('Hoy page') },
        { path: '/contactos', component: stub('Contactos page') },
        { path: '/inmobiliaria', component: Inmobiliaria },
        {
          path: '/inmobiliaria/cola/:cola',
          component: InmobiliariaCola,
          props: true,
        },
        {
          path: '/inmobiliaria/disponibilidad',
          component: InmobiliariaDisponibilidad,
        },
        { path: FICHA_PATH, component: InmobiliariaFicha, props: true },
        { path: '/not-permitted', component: NotPermitted },
        { path: '/:rest(.*)*', component: stub('Other page') },
      ],
    })
    await router.push(path)
    await router.isReady()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(RouterView) })
    app.config.globalProperties.__ = (text) => text
    app.use(router)
    app.mount(root)
  }
  function unmountPage() {
    app?.unmount()
    root?.remove()
    app = root = null
  }
  const text = () => root.textContent.replace(/\s+/g, ' ')
  const labels = (node) =>
    [...node.querySelectorAll('button')].map((b) => b.textContent.trim())
  const at = (path) => until(() => router.currentRoute.value.path === path)

  it('the route opens the 17 record screens TIPOS names, each with its es-MX name, and nothing else', () => {
    expect(FICHA_PATH).toBeTruthy()
    const routed = /:tipo\(([a-z|]+)\)/.exec(FICHA_PATH)[1].split('|')
    expect([...routed].sort()).toEqual([...CONTRACT_TIPOS].sort())
    expect(Object.keys(TIPOS).sort()).toEqual([...CONTRACT_TIPOS].sort())
    const doctypes = Object.values(TIPOS).map((t) => t.doctype)
    expect(new Set(doctypes).size).toBe(CONTRACT_TIPOS.length)
    for (const { etiqueta } of Object.values(TIPOS))
      expect(etiqueta).toMatch(/^\p{Lu}[\p{L} ]+$/u)
    // vue-router takes every tipo, a name with a slash, and no other segment.
    const probe = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: FICHA_PATH, name: 'ficha', component: { render: () => null } },
        {
          path: '/:rest(.*)*',
          name: 'otra',
          component: { render: () => null },
        },
      ],
    })
    for (const tipo of CONTRACT_TIPOS) {
      const to = probe.resolve(`/inmobiliaria/${tipo}/X%2F1`)
      expect([to.name, to.params.tipo, to.params.name]).toEqual([
        'ficha',
        tipo,
        'X/1',
      ])
    }
    expect(probe.resolve('/inmobiliaria/desarrollo/D-1').name).toBe('otra')
    expect(probe.resolve('/inmobiliaria/cola/x').name).toBe('otra')
    // Every Inmobiliaria route names itself for the phone header, literally.
    const blocks = ROUTER_SOURCE.split('\n  {\n').filter((route) =>
      /(?:^|\n) +path: '\/inmobiliaria/.test(route),
    )
    expect(blocks).toHaveLength(4)
    for (const route of blocks) expect(route).toMatch(/\btitle: '[^']+'/)
  })

  it('a Desk form of a record with a screen becomes that screen; lists, new forms and other doctypes do not', () => {
    expect(fichaFromDesk('/desk/aviso-pld/AV-1')).toBe(
      '/inmobiliaria/aviso/AV-1',
    )
    expect(
      fichaFromDesk('/app/liquidacion-a-propietarios/LIQ%2F10?tab=pagos'),
    ).toBe('/inmobiliaria/liquidacion/LIQ%2F10')
    for (const url of [
      '/desk/aviso-pld',
      '/desk/aviso-pld/new',
      '/desk/aviso-pld/new-aviso-pld-1',
      '/desk/aviso-pld/view/list',
      '/desk/crm-deal/CRM-DEAL-1',
      '/crm/inmobiliaria/aviso/AV-1',
      '',
      null,
    ])
      expect(fichaFromDesk(url)).toBe('')
    expect(deskTipo('/desk/aviso-pld?estado=Borrador')).toBe('aviso')
    expect(deskTipo('/desk/crm-deal/CRM-DEAL-1')).toBe('')
    expect(parseFicha('/inmobiliaria/oferta/OF%201?ver=x')).toEqual({
      tipo: 'oferta',
      name: 'OF 1',
    })
    expect(parseFicha('/inmobiliaria/cola/ofertas')).toBeNull()
    expect(linkOf('/desk/solicitud-de-arrendamiento/SOL-1')).toEqual({
      to: '/inmobiliaria/solicitud/SOL-1',
    })
    expect(linkOf('/desk/desarrollo-inmobiliario/GARIBALDI')).toEqual({
      href: '/desk/desarrollo-inmobiliario/GARIBALDI',
    })
  })

  it('a list that counts records it cannot show one by one says how many and leads on, never «nada pendiente»', async () => {
    shellBoot.value = inmoBoot()
    answer({ 'inmobiliaria.api.shell.cola': COLA_SIN_RENGLONES })
    await mountPage(
      '/inmobiliaria/cola/propiedades_sin_captacion?inicio=administracion',
      { phone: true },
    )
    const pane = await until(() =>
      root.querySelector('[data-testid="inmo-cola-sin-renglones"]'),
    )
    expect(pane.textContent).toContain('3 pendientes en esta lista')
    expect(text()).not.toMatch(/nada pendiente/i)
    // Not an administrator: no Desk list; the words say who can help.
    expect(root.querySelector('[data-testid="inmo-cola-desk"]')).toBeNull()
    expect(pane.textContent).toContain('Avisa a un administrador')
    const salida = pane.querySelector('[data-testid="inmo-cola-salida"]')
    expect(salida.textContent).toBe('Volver al inicio')
    salida.click()
    await at('/inmobiliaria')
    expect(router.currentRoute.value.fullPath).toBe(
      '/inmobiliaria?inicio=administracion',
    )
  })

  it('an administrator also gets that list in the desk, named as such; desktop gives the state the whole width', async () => {
    shellBoot.value = inmoBoot({ read: true, admin: true })
    answer({ 'inmobiliaria.api.shell.cola': COLA_SIN_RENGLONES })
    await mountPage('/inmobiliaria/cola/propiedades_sin_captacion')
    const link = await until(() =>
      root.querySelector('[data-testid="inmo-cola-desk"]'),
    )
    expect(link.textContent.trim()).toBe('Abrir la lista en el escritorio')
    expect(link.getAttribute('href')).toBe(
      '/desk/propiedad-administrada?captacion=0',
    )
    expect(text()).toContain('3 pendientes en esta lista')
    expect(text()).toContain('Ábrelos en el escritorio')
    // No row to choose: no «Elige un renglón» pane beside it.
    expect(root.querySelector('[data-testid="inmo-cola-detalle"]')).toBeNull()
  })

  it('a list that fails to open shows the server’s words, «Reintentar» and the way back to whoever opened it', async () => {
    let calls = 0
    const refuse = refusal('No tienes acceso a <b>esta lista</b>.')
    answer({
      'inmobiliaria.api.shell.cola': () => {
        calls++
        return refuse()
      },
    })
    await mountPage(
      '/inmobiliaria/cola/apartados_por_vencer?return_to=/crm/hoy&return_label=Hoy',
      { phone: true },
    )
    const alert = await until(() => root.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('No tienes acceso a esta lista.')
    expect(labels(alert)).toEqual(['Reintentar', 'Volver a Hoy'])
    alert.querySelector('button').click()
    await until(() => calls === 2)
    const salida = await until(() =>
      root.querySelector('[data-testid="inmo-cola-salida"]'),
    )
    salida.click()
    await at('/hoy')
    expect(router.currentRoute.value.path).toBe('/hoy')
  })

  it('the bar’s arrow on a list opened from a link goes up to whoever opened it, else to its home', async () => {
    answer({
      'inmobiliaria.api.shell.cola': {
        key: 'apartados_por_vencer',
        etiqueta: 'Apartados por vencer',
        count: 0,
        filas: [],
        mas: false,
      },
    })
    await mountPage(
      '/inmobiliaria/cola/apartados_por_vencer?return_to=/crm/hoy&return_label=Hoy',
      { phone: true },
    )
    await until(() => text().includes('Nada pendiente aquí'))
    expect(
      root.querySelector('[data-testid="inmo-cola-salida"]').textContent,
    ).toBe('Volver a Hoy')
    root.querySelector('[data-appbar-back]').click()
    await at('/hoy')
    expect(router.currentRoute.value.path).toBe('/hoy')
    unmountPage()
    await mountPage('/inmobiliaria/cola/apartados_por_vencer?inicio=ventas', {
      phone: true,
    })
    await until(() => text().includes('Nada pendiente aquí'))
    root.querySelector('[data-appbar-back]').click()
    await at('/inmobiliaria')
    expect(router.currentRoute.value.fullPath).toBe(
      '/inmobiliaria?inicio=ventas',
    )
  })

  it('desktop: each row opens its record beside the list, also one the server sent as a Desk form; no row leads to Desk', async () => {
    const fichas = []
    answer({
      'inmobiliaria.api.shell.cola': COLA_POR_PAGAR,
      'inmobiliaria.api.shell.ficha': (args) => {
        fichas.push(args)
        return FICHA(args)
      },
    })
    await mountPage('/inmobiliaria/cola/por_pagar')
    const rows = await until(() => {
      const found = [...root.querySelectorAll('[data-fila]')]
      return found.length === 2 && found
    })
    for (const row of rows)
      expect(row.getAttribute('href')).toMatch(
        /^\/inmobiliaria\/cola\/por_pagar\?ver=/,
      )
    root.querySelector('[data-fila="LIQ-1"]').click()
    const titulo = await until(() =>
      root.querySelector(
        '[data-testid="inmo-cola-detalle"] [data-testid="inmo-ficha-titulo"]',
      ),
    )
    expect(titulo.textContent.trim()).toBe('Ficha LIQ-1')
    expect(fichas).toEqual([{ tipo: 'liquidacion', name: 'LIQ-1' }])
    // The record opens in place: «back» still leaves the list.
    expect(router.currentRoute.value.path).toBe('/inmobiliaria/cola/por_pagar')
    root.querySelector('[data-fila="AV-1"]').click()
    await until(() => fichas.length === 2)
    expect(fichas[1]).toEqual({ tipo: 'aviso', name: 'AV-1' })
  })

  it('phone: a row opens its record screen, a Desk-form row too, carrying the way back to the list', async () => {
    answer({ 'inmobiliaria.api.shell.cola': COLA_POR_PAGAR })
    await mountPage('/inmobiliaria/cola/por_pagar?inicio=administracion', {
      phone: true,
    })
    const row = await until(() => root.querySelector('[data-fila="LIQ-1"]'))
    const to = router.resolve(row.getAttribute('href'))
    expect(to.path).toBe('/inmobiliaria/liquidacion/LIQ-1')
    expect(to.query).toEqual({
      return_to: '/crm/inmobiliaria/cola/por_pagar?inicio=administracion',
      return_label: 'Por pagar',
    })
    expect(root.querySelector('[data-testid="inmo-cola-detalle"]')).toBeNull()
  })

  it('the home starts on the one the server names, else on its first; the URL’s home wins while the worker has it', async () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/pages/Inmobiliaria.vue'),
      'utf8',
    )
    expect(source).not.toMatch(/administraci[oó]n/i)
    const INICIO = {
      admin: true,
      inicios: [
        {
          key: 'ventas',
          nombre: 'Ventas',
          titulo: 'Lo de ventas',
          pendientes: 2,
          colas: [
            {
              key: 'apartados_por_vencer',
              etiqueta: 'Apartados por vencer',
              count: 2,
              url: '/crm/inmobiliaria/cola/apartados_por_vencer',
            },
          ],
        },
        {
          key: 'administracion',
          nombre: 'Administración',
          titulo: 'Lo de administración',
          pendientes: 1,
          colas: [
            { key: 'por_pagar', etiqueta: 'Liquidaciones por pagar', count: 1 },
          ],
        },
      ],
      accesos: [
        {
          key: 'disponibilidad',
          etiqueta: 'Disponibilidad',
          icono: 'lucide-layout-grid',
          url: '/crm/inmobiliaria/disponibilidad',
        },
        // Without an address a shortcut is left out, never a link to here.
        {
          key: 'sin-direccion',
          etiqueta: 'Sin dirección',
          icono: 'x',
          url: '',
        },
      ],
    }
    const titulo = () => root.querySelector('section > h2')?.textContent.trim()
    answer({ 'inmobiliaria.api.shell.inicio': INICIO })
    await mountPage('/inmobiliaria', { phone: true })
    // An administrator too starts on the first home the server lists.
    expect(await until(titulo)).toBe('Lo de ventas')
    expect(
      root
        .querySelector('[data-cola="apartados_por_vencer"]')
        .getAttribute('href'),
    ).toBe('/inmobiliaria/cola/apartados_por_vencer?inicio=ventas')
    expect(
      [...root.querySelectorAll('[data-acceso]')].map((a) => [
        a.getAttribute('data-acceso'),
        a.getAttribute('href'),
      ]),
    ).toEqual([['disponibilidad', '/inmobiliaria/disponibilidad']])
    unmountPage()
    answer({
      'inmobiliaria.api.shell.inicio': {
        ...INICIO,
        predeterminado: 'administracion',
      },
    })
    await mountPage('/inmobiliaria', { phone: true })
    expect(await until(titulo)).toBe('Lo de administración')
    unmountPage()
    await mountPage('/inmobiliaria?inicio=ventas', { phone: true })
    expect(await until(titulo)).toBe('Lo de ventas')
    unmountPage()
    await mountPage('/inmobiliaria?inicio=obra', { phone: true })
    expect(await until(titulo)).toBe('Lo de administración')
  })

  it('a home that fails to open shows the server’s words, «Reintentar» and the way on to another module', async () => {
    shellBoot.value = inmoBoot()
    answer({
      'inmobiliaria.api.shell.inicio': refusal(
        'No tienes acceso a <strong>Inmobiliaria</strong>.',
      ),
    })
    await mountPage('/inmobiliaria', { phone: true })
    const alert = await until(() => root.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('No tienes acceso a Inmobiliaria.')
    expect(labels(alert)).toEqual(['Reintentar', 'Ir a Contactos'])
    alert.querySelector('[data-testid="inmo-salida"]').click()
    await at('/contactos')
    expect(router.currentRoute.value.path).toBe('/contactos')
  })

  it('a record that fails to open offers «Reintentar» and the way back; a failed action keeps the record on screen with its reason', async () => {
    let missing = true
    const toasts = state.toasts.length
    answer({
      'inmobiliaria.api.shell.ficha': (args) => {
        if (missing) return refusal('No se encontró el aviso AV-1.')()
        return {
          ...FICHA(args),
          acciones: [
            {
              id: 'presentar',
              etiqueta: 'Presentar aviso',
              tipo: 'primary',
              habilitada: true,
              metodo: 'inmobiliaria.api.acciones.presentar_aviso',
              args: { aviso: args.name },
            },
          ],
        }
      },
      'inmobiliaria.api.acciones.presentar_aviso': refusal(
        'El aviso necesita el RFC del cliente.',
      ),
    })
    await mountPage(
      '/inmobiliaria/aviso/AV-1?return_to=/crm/hoy&return_label=Hoy',
      { phone: true },
    )
    const alert = await until(() => root.querySelector('[role="alert"]'))
    expect(alert.textContent).toContain('No se encontró el aviso AV-1.')
    expect(labels(alert)).toEqual(['Reintentar', 'Volver a Hoy'])
    missing = false
    alert.querySelector('button').click()
    const accion = await until(() =>
      root.querySelector('[data-testid="inmo-siguiente-paso"]'),
    )
    accion.click()
    const problema = await until(() =>
      root.querySelector('[data-testid="inmo-accion-problema"]'),
    )
    expect(problema.textContent).toContain('Presentar aviso:')
    expect(problema.textContent).toContain(
      'El aviso necesita el RFC del cliente.',
    )
    expect(labels(problema)).toEqual(['Reintentar', 'Entendido'])
    expect(
      root
        .querySelector('[data-testid="inmo-ficha-titulo"]')
        .textContent.trim(),
    ).toBe('Ficha AV-1')
    expect(router.currentRoute.value.path).toBe('/inmobiliaria/aviso/AV-1')
    expect(state.toasts.length).toBe(toasts)
  })

  it('NotPermitted: an Inmobiliaria address is Inmobiliaria’s, and once the shell opens it the worker goes straight on', async () => {
    expect(recoveryModule('/inmobiliaria/venta/VTA-1')).toBe('inmobiliaria')
    expect(recoveryModule('/inmobiliaria?inicio=ventas')).toBe('inmobiliaria')
    answer({
      'crm.api.shell.boot': inmoBoot(),
      'inmobiliaria.api.shell.ficha': FICHA,
    })
    const intended =
      '/inmobiliaria/venta/VTA-1?return_to=/crm/hoy&return_label=Hoy'
    await mountPage(`/not-permitted?intended=${encodeURIComponent(intended)}`, {
      phone: true,
    })
    await at('/inmobiliaria/venta/VTA-1')
    expect(router.currentRoute.value.path).toBe('/inmobiliaria/venta/VTA-1')
    expect(router.currentRoute.value.query).toEqual({
      return_to: '/crm/hoy',
      return_label: 'Hoy',
    })
    expect(
      await until(() =>
        root.querySelector('[data-testid="inmo-ficha-titulo"]'),
      ),
    ).toBeTruthy()
  })

  it('NotPermitted: without Inmobiliaria it explains Inmobiliaria, not Ventas, and leads on to a module the worker has', async () => {
    answer({
      'crm.api.shell.boot': {
        ...inmoBoot(),
        modules: {
          ...inmoBoot().modules,
          inmobiliaria: {
            key: 'inmobiliaria',
            enabled: false,
            capabilities: {},
          },
        },
      },
    })
    await mountPage('/not-permitted?intended=/inmobiliaria/venta/VTA-1', {
      phone: true,
    })
    const ir = await until(() =>
      [...root.querySelectorAll('button')].find(
        (b) => b.textContent === 'Ir a Contactos',
      ),
    )
    expect(text()).toContain('Para abrir Inmobiliaria necesitas')
    expect(text()).not.toContain('prospectos de ventas')
    expect(router.currentRoute.value.path).toBe('/not-permitted')
    ir.click()
    await at('/contactos')
    expect(router.currentRoute.value.path).toBe('/contactos')
  })

  it('a board without developments says who registers the first one and leads back to the home, never to the escritorio', async () => {
    let puedeCrear = false
    answer({
      'inmobiliaria.api.shell.tablero': () => ({
        vacio: true,
        deal: null,
        puede_crear: puedeCrear,
        puede_demo: false,
        desarrollos: [],
      }),
      'inmobiliaria.api.shell.inicio': { inicios: [], accesos: [] },
    })
    await mountPage('/inmobiliaria/disponibilidad', { phone: true })
    const vacio = await until(() =>
      root.querySelector('[data-testid="inmo-tablero-vacio"]'),
    )
    expect(vacio.textContent).toContain('Todavía no hay desarrollos')
    expect(vacio.textContent).toContain(
      'en cuanto un administrador dé de alta el primero',
    )
    expect(labels(vacio)).toEqual(['Volver al inicio'])
    expect(text()).not.toMatch(/escritorio/i)
    unmountPage()

    puedeCrear = true
    await mountPage('/inmobiliaria/disponibilidad', { phone: true })
    const propio = await until(() =>
      root.querySelector('[data-testid="inmo-tablero-vacio"]'),
    )
    expect(propio.textContent).toContain('en cuanto des de alta el primero')
    expect(text()).not.toMatch(/escritorio/i)
    propio.querySelector('[data-testid="inmo-tablero-salida"]').click()
    await at('/inmobiliaria')
    expect(router.currentRoute.value.path).toBe('/inmobiliaria')
  })
})

describe('the bar and Más follow each worker (Personalizar, Barra por puesto)', () => {
  const on = (...keys) =>
    Object.fromEntries(
      keys.map((key) => [key, { key, enabled: true, capabilities: {} }]),
    )
  const stockBoot = (overrides = {}) =>
    boot({
      user: {
        name: 'beto@example.test',
        full_name: 'Beto Almacén',
        nav_role: 'almacen',
        ...(overrides.user || {}),
      },
      modules: on(
        'hoy',
        'pendientes',
        'contactos',
        'compras',
        'productos',
        'inventario',
      ),
      ...overrides,
    })
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
    }
  }
  const tabs = () =>
    [...root.querySelectorAll('nav[aria-label="Main navigation"] > a')].map(
      (tab) => tab.textContent.trim(),
    )
  const openMore = async () => {
    root.querySelector('nav[aria-label="Main navigation"] > button').click()
    await until(() => document.querySelector('[data-shell-layer="more"]'))
    await settle()
  }
  const sheet = () => document.querySelector('[data-shell-layer="layout"]')
  const row = (key) => sheet().querySelector(`[data-layout-row="${key}"]`)
  afterEach(async () => {
    const { layoutSheet } = await import('@/composables/muelleShell')
    layoutSheet.value = null
    delete window.installed_apps
    state.toasts.length = 0
  })

  it('phone: a stock worker gets Inventario, Compras and Escáner, which leaves with the way back', async () => {
    state.mobile.value = true
    window.installed_apps = ['frappe', 'crm', 'scanner_kit']
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return stockBoot()
      return null
    })
    await mount('/compras')
    expect(tabs()).toEqual(['Hoy', 'Inventario', 'Compras', 'Escáner'])
    const scan = root.querySelector(
      'nav[aria-label="Main navigation"] > a[data-sibling="scan"]',
    )
    const href = new URL(scan.getAttribute('href'), 'https://x.test')
    expect(href.pathname).toBe('/scan/inicio')
    expect(href.searchParams.get('return_to')).toBe('/crm/compras')
  })

  it('phone Más: hidden places fold under «Hidden» and still open', async () => {
    state.mobile.value = true
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return stockBoot({
          layout: {
            dock: [],
            order: [],
            hidden: ['contactos'],
            source: 'team',
          },
        })
      return null
    })
    await mount('/compras')
    await openMore()
    const more = document.querySelector('[data-shell-layer="more"]')
    const tiles = () =>
      [...more.querySelectorAll('a')].map((a) => a.textContent.trim())
    expect(tiles()).toContain('Pendientes')
    expect(tiles()).not.toContain('Contactos')
    const fold = more.querySelector('[data-testid="more-hidden"]')
    expect(fold.textContent).toContain('1')
    fold.click()
    await settle()
    expect(tiles()).toContain('Contactos')
  })

  it('Personalizar: pinning to a full bar moves its last place to Más, and Save keeps it', async () => {
    state.mobile.value = true
    const saved = []
    state.call.mockImplementation(async (method, args) => {
      if (method === 'crm.api.shell.boot') return stockBoot()
      if (method === 'crm.api.shell.save_layout') {
        saved.push(JSON.parse(args.layout))
        return { ...JSON.parse(args.layout), source: 'personal' }
      }
      return null
    })
    await mount('/compras')
    await openMore()
    document.querySelector('[data-testid="more-customize"]').click()
    await until(sheet)
    await settle()
    expect(sheet().textContent).toContain('3 of 3')
    // Pendientes onto the full bar: Productos (its last place) goes to Más.
    row('pendientes').querySelector('[data-action="to-bar"]').click()
    await settle()
    expect(sheet().textContent).toContain(
      'Productos moved to Más to make room.',
    )
    row('contactos').querySelector('[data-action="hide"]').click()
    await settle()
    // No reset while the bar is the puesto's.
    expect(sheet().querySelector('[data-testid="layout-reset"]')).toBeNull()
    sheet().querySelector('[data-testid="layout-save"]').click()
    await settle()
    expect(saved).toEqual([
      {
        dock: ['inventario', 'compras', 'pendientes'],
        order: ['productos'],
        hidden: ['contactos'],
      },
    ])
    expect(tabs()).toEqual(['Hoy', 'Inventario', 'Compras', 'Pendientes'])
    expect(state.toasts).toContainEqual([
      'success',
      'Saved. Your bar and Más changed.',
    ])
  })

  it('Personalizar: the grip moves a place with the arrow keys', async () => {
    state.mobile.value = true
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return stockBoot()
      return null
    })
    await mount('/compras')
    await openMore()
    document.querySelector('[data-testid="more-customize"]').click()
    await until(sheet)
    await settle()
    const order = () =>
      [...sheet().querySelectorAll('[data-reorder-list="bar"] > li')].map(
        (li) => li.dataset.layoutRow,
      )
    expect(order()).toEqual(['inventario', 'compras', 'productos'])
    row('productos')
      .querySelector('[data-drag-handle]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      )
    await settle()
    expect(order()).toEqual(['inventario', 'productos', 'compras'])
  })

  it('my own arrangement offers the way back to my puesto’s', async () => {
    state.mobile.value = true
    const calls = []
    state.call.mockImplementation(async (method, args) => {
      calls.push([method, args])
      if (method === 'crm.api.shell.boot')
        return stockBoot({
          layout: {
            dock: ['pendientes'],
            order: [],
            hidden: [],
            source: 'personal',
          },
        })
      if (method === 'crm.api.shell.reset_layout')
        return { dock: [], order: [], hidden: [], source: 'default' }
      return null
    })
    await mount('/compras')
    expect(tabs()[1]).toBe('Pendientes')
    await openMore()
    document.querySelector('[data-testid="more-customize"]').click()
    await until(sheet)
    await settle()
    sheet().querySelector('[data-testid="layout-reset"]').click()
    await settle()
    expect(calls).toContainEqual([
      'crm.api.shell.reset_layout',
      { nav_class: 'almacen' },
    ])
    expect(tabs()).toEqual(['Hoy', 'Inventario', 'Compras', 'Productos'])
  })

  it('Barra por puesto: only the owner sees it, and Save sets that puesto’s bar', async () => {
    state.mobile.value = true
    const calls = []
    const owner = boot({
      user: { name: 'o@x.test', nav_role: 'dueno', arranges_team: true },
      modules: on(
        'hoy',
        'pendientes',
        'gastos',
        'resultados',
        'bancos',
        'ventas',
      ),
    })
    state.call.mockImplementation(async (method, args) => {
      calls.push([method, args])
      if (method === 'crm.api.shell.boot') return owner
      if (method === 'crm.api.shell.team_layouts') return { layouts: {} }
      if (method === 'crm.api.shell.save_team_layout')
        return { layouts: { [args.nav_class]: JSON.parse(args.layout) } }
      return null
    })
    await mount('/pendientes')
    await openMore()
    document.querySelector('[data-testid="more-team-layout"]').click()
    await until(sheet)
    await settle()
    const select = sheet().querySelector('[data-testid="layout-class"]')
    select.value = 'contador'
    select.dispatchEvent(new Event('change'))
    await settle()
    expect(
      [...sheet().querySelectorAll('[data-reorder-list="bar"] > li')].map(
        (li) => li.dataset.layoutRow,
      ),
    ).toEqual(['bancos', 'gastos', 'resultados'])
    sheet().querySelector('[data-testid="layout-save"]').click()
    await settle()
    const save = calls.find(([m]) => m === 'crm.api.shell.save_team_layout')
    expect(save[1].nav_class).toBe('contador')
    expect(JSON.parse(save[1].layout).dock).toEqual([
      'bancos',
      'gastos',
      'resultados',
    ])
    expect(state.toasts.at(-1)[1]).toContain('Saved for Contador')
  })

  it('a worker who does not arrange the team never sees «Barra por puesto»', async () => {
    state.mobile.value = true
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot') return stockBoot()
      return null
    })
    await mount('/compras')
    await openMore()
    expect(
      document.querySelector('[data-testid="more-team-layout"]'),
    ).toBeNull()
  })

  it('desktop rail: the bar’s places lead, the hidden wait behind «Más»', async () => {
    state.mobile.value = false
    resetRailForTests('expanded')
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.shell.boot')
        return stockBoot({
          layout: {
            dock: ['productos'],
            order: ['contactos'],
            hidden: ['compras'],
            source: 'personal',
          },
        })
      return null
    })
    await mount('/pendientes')
    const rail = root.querySelector('nav[aria-label="Apps"]')
    expect(
      [...rail.querySelectorAll('[data-module]')].map((a) => a.dataset.module),
    ).toEqual(['hoy', 'productos', 'pendientes', 'contactos', 'inventario'])
    rail.querySelector('[data-testid="rail-more"]').click()
    await settle()
    const menu = document.querySelector('[data-testid="rail-more-menu"]')
    expect(menu.querySelector('[data-module="compras"]')).not.toBeNull()
    menu.querySelector('[data-testid="rail-customize"]').click()
    await until(sheet)
    expect(sheet()).not.toBeNull()
  })
})
