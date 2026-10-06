import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

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
        path: '/archivos',
        component: { render: () => h('p', 'Archivos page') },
        meta: { app: 'archivos', title: 'Archivos' },
      },
      { path: '/deals', component: { render: () => h('p', 'Deals page') } },
      { path: '/ventas', component: { render: () => null } },
      {
        path: '/avisos',
        component: { render: () => h('p', 'Avisos page') },
        meta: { app: 'avisos', title: 'Avisos' },
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
    expect(hostedModules.map((m) => m.key)).toEqual([
      'contactos',
      'ventas',
      'compras',
      'archivos',
      'avisos',
    ])
    expect(moduleKeyFor({ path: '/archivos', meta: { app: 'archivos' } })).toBe(
      'archivos',
    )
  })

  it('Compras is its own module and boots without the sales runtime', () => {
    expect(moduleKeyFor({ path: '/compras/orden/PO-1', meta: {} })).toBe(
      'compras',
    )
    expect(hostedModules.find((m) => m.key === 'compras')?.to).toBe('/compras')
    expect(isNeutralModule('compras')).toBe(true)
    expect(isNeutralModule('ventas')).toBe(false)
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
    expect(alert.textContent).not.toContain('Contactos')
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
    // Footer verbs carry a context: bare «open» resolves to «abierto» in ERPNext's catalog.
    expect(palette.textContent).toContain('open|Command palette hint')
    expect(palette.textContent).toContain('move|Command palette hint')
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
    expect(alert.textContent).not.toContain('Contactos')
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
    expect(alert.textContent).not.toContain('Contactos')
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
