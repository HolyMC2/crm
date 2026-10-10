import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const state = vi.hoisted(() => ({ call: vi.fn(), mobile: null }))
vi.mock('frappe-ui', async () => {
  const { h, ref } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    useTheme: () => ({ currentTheme: ref('light'), setTheme: vi.fn() }),
    Button: {
      props: ['label'],
      setup: (props) => () => h('button', props.label),
    },
    createResource: () => ({ data: null, fetch: vi.fn() }),
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.mobile = ref(false)
  return { isMobile: state.mobile }
})
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ logout: { submit: vi.fn() } }),
}))
vi.mock('@/composables/ventasNav', () => ({
  useVentasNav: () => ({
    primary: [],
    secondary: [],
    groupOf: () => '',
    badgeFor: () => 0,
  }),
}))
vi.mock('@/components/Notifications.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))

import MuelleShell from '@/components/shell/MuelleShell.vue'
import { mobileView } from '@/composables/mobileView'
import {
  hostedModules,
  isNeutralModule,
  moduleKeyFor,
  navSlots,
  shellBoot,
} from '@/composables/muelleShell'
import {
  createShellProviders,
  loadRecent,
  resolveRecent,
  toRecentRef,
} from '@/utils/shellPalette'
import { showSettings } from '@/composables/settings'
import {
  closeShortcutSheet,
  keyLabel,
  pageShortcuts,
  registerPageShortcuts,
  searchEntryHint,
  shellCheatSheet,
  shellT,
} from '@/composables/shellKeyboard'
import { agendaShortcuts } from '@/composables/useAgenda'
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
        path: '/gastos',
        component: { render: () => h('p', 'Gastos page') },
        meta: { app: 'gastos', title: 'Gastos' },
      },
      {
        path: '/archivos',
        component: { render: () => h('p', 'Archivos page') },
        meta: { app: 'archivos', title: 'Archivos' },
      },
      {
        path: '/agenda',
        component: { render: () => h('p', 'Agenda page') },
        meta: { app: 'agenda', title: 'Agenda' },
      },
      { path: '/deals', component: { render: () => h('p', 'Deals page') } },
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
      'garantias',
      'archivos',
      'avisos',
    ])
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

  it('phone Contactos shows its title instead of the Ventas header slot', async () => {
    state.mobile.value = true
    await mount('/contactos')
    expect(root.querySelector('#app-header')).toBeNull()
    expect(root.querySelector('header h1').textContent).toContain('Contactos')
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
    expect(header().style.marginTop).toBe('-48px')
    await scrollTo(380)
    expect(header().style.marginTop).toBe('')
    await scrollTo(600)
    expect(header().style.marginTop).toBe('-48px')
    // near the top the header always shows
    await scrollTo(20)
    expect(header().style.marginTop).toBe('')
  })

  it('phone deal record owns the top: no shell header, no bottom nav', async () => {
    state.mobile.value = true
    mobileView.value = 'thread'
    await mount('/ventas/deal/CRM-DEAL-1')
    expect(root.querySelector('[data-testid="shell-header"]')).toBeNull()
    expect(root.querySelector('nav[aria-label="Main navigation"]')).toBeNull()
    mobileView.value = 'list'
  })

  it('phone hides doco’s floating «Ayuda» pill; the Más sheet offers it', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/shell/MuelleShell.vue'),
      'utf8',
    )
    expect(source).toMatch(
      /@media \(max-width: 639px\)[\s\S]*#muelle-support-workflow[\s\S]*display: none !important/,
    )
    const sheet = readFileSync(
      resolve(__dirname, '../../src/components/shell/MoreSheet.vue'),
      'utf8',
    )
    expect(sheet).toContain('window.docoSupport.openHelp()')
  })

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
})

describe('Ventas deals in the palette', () => {
  const query = { raw: 'acme', text: 'acme', scope: 'all', kind: 'text' }
  afterEach(() => state.call.mockReset())

  it('finds deals and opens the one deal record', async () => {
    state.call.mockResolvedValue([
      { name: 'CRM-DEAL-1', organization: 'Acme', status: 'Qualification' },
    ])
    const ventas = createShellProviders({
      boot: ref(boot()),
      modules: ref(hostedModules),
    }).find((provider) => provider.key === 'ventas')
    const rows = await ventas.search(query, new AbortController().signal)
    expect(state.call).toHaveBeenCalledWith(
      'frappe.client.get_list',
      expect.objectContaining({ doctype: 'CRM Deal' }),
    )
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

async function until(find) {
  for (let i = 0; i < 40; i++) {
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
    const { default: VentasSidebar } =
      await import('@/components/shell/VentasSidebar.vue')
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

  it.each([
    ['/contactos', '/ventas'],
    ['/deals', '/deals'],
  ])('Más offers Ventas settings from %s', async (start, landing) => {
    showSettings.value = false
    state.mobile.value = true
    await mount(start)
    root.querySelector('nav[aria-label="Main navigation"] button').click()
    const button = await until(() =>
      [...document.querySelectorAll('[aria-label="More"] button')].find((b) =>
        b.textContent.includes('Ventas settings'),
      ),
    )
    expect(button).toBeTruthy()
    button.click()
    await until(() => showSettings.value)
    expect(showSettings.value).toBe(true)
    expect(router.currentRoute.value.path).toBe(landing)
    showSettings.value = false
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
    await until(() => false)
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
    expect(palette().textContent).toContain('Actions')
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

  it('the rail search names both keys; no hard-coded «Ctrl K»', async () => {
    await mount('/deals')
    const search = root.querySelector('[data-testid="rail-search"]')
    expect(search.getAttribute('title')).toBe(
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
    // Only keys the shell implements: no module the worker lacks, no «c» or «[».
    expect(app).not.toContain('Ir a Agenda')
    expect(app).not.toContain('Crear')
    expect(app).not.toContain('barra lateral')
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
    // A list page that declares the list context gets the list search row.
    const removeList = registerPageShortcuts('list')
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
    expect(more).toContain('data-testid="more-shortcuts"')
    expect(more).toContain("keyLabel('alt+h')")
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
})
