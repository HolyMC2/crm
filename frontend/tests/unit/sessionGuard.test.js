// PROD-4-a: after a deploy or a restart the sid expires while the browser keeps
// its user_id cookie. The first call (crm.api.shell.boot) then answers 403
// PermissionError as Guest, and the worker used to land on «No tienes permiso»
// with «Pedir acceso»: a dead end. A refusal now asks the server who this
// browser is; Guest gets «Tu sesión terminó» and a sign-in that comes back to
// the same /crm route.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ call: vi.fn(), mobile: null }))
vi.mock('frappe-ui', async () => {
  const { h, ref } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: () => {}, error: () => {} },
    useColorScheme: () => ({
      colorScheme: ref('light'),
      setColorScheme: vi.fn(),
    }),
    Button: {
      props: ['label'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h('button', { onClick: () => emit('click') }, props.label),
    },
    createResource: () => ({ data: null, fetch: vi.fn() }),
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
  return {
    ventasCompact: ref(false),
    toggleVentasCompact: () => {},
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
vi.mock('@/utils/listWarmup', () => ({ warmListsAfterFirstRoute: () => {} }))
vi.mock('@/utils/prefetch', async (importOriginal) => ({
  ...(await importOriginal()),
  afterFirstRoute: () => {},
}))

import '@/uiHost'
import MuelleShell from '@/components/shell/MuelleShell.vue'
import NotPermitted from '@/pages/NotPermitted.vue'
import {
  BOOT_CACHE_PREFIX,
  currentScope,
  loadShell,
  resetShellForTests,
  shellBoot,
  shellError,
} from '@/composables/muelleShell'
import {
  askLoggedUser,
  refusalKind,
  resetSessionGuardForTests,
  sessionEnded,
  sessionLost,
  signInHref,
} from '@/utils/sessionGuard'
import { errorKind } from '@/utils/contactos'

const refusal = () =>
  Object.assign(new Error('not whitelisted'), {
    status: 403,
    exc_type: 'PermissionError',
    messages: ['No tienes permiso para abrir esta app.'],
  })
const answer = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
})
const asGuest = () =>
  vi.fn(async () => answer(403, { exc_type: 'PermissionError' }))
const asUser = () =>
  vi.fn(async () => answer(200, { message: 'ana@example.test' }))
function boot() {
  return {
    user: { name: 'ana@example.test', full_name: 'Ana López' },
    modules: {
      hoy: { key: 'hoy', enabled: true, capabilities: {} },
      compras: { key: 'compras', enabled: true, capabilities: {} },
      ventas: { key: 'ventas', enabled: true, capabilities: {} },
    },
  }
}
const saveBoot = () =>
  localStorage.setItem(
    BOOT_CACHE_PREFIX + currentScope(),
    JSON.stringify({ at: Date.now(), boot: boot() }),
  )
async function until(find, tries = 200) {
  for (let i = 0; i < tries; i++) {
    await Promise.resolve()
    await nextTick()
    const found = find()
    if (found) return found
    await new Promise((done) => setTimeout(done, 10))
  }
  return find()
}

let app, root, router
beforeEach(() => {
  localStorage.clear()
  resetShellForTests()
  resetSessionGuardForTests()
  state.call.mockReset()
  state.mobile.value = false
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
  vi.unstubAllGlobals()
})

describe('the refusal classifier', () => {
  it('reads exception and status: permission, session, or nothing for a lost connection', () => {
    expect(refusalKind(refusal())).toBe('permission')
    expect(refusalKind({ status: 401 })).toBe('session')
    expect(refusalKind({ exc_type: 'SessionExpired' })).toBe('session')
    expect(refusalKind({ exc_type: 'CSRFTokenError', status: 400 })).toBe(
      'session',
    )
    expect(refusalKind(new TypeError('Failed to fetch'))).toBeNull()
    expect(refusalKind({ status: 502 })).toBeNull()
  })

  it('Contactos reuses it and keeps its guard codes and conflicts', () => {
    expect(errorKind(refusal())).toBe('permission')
    expect(errorKind({ status: 401 })).toBe('session')
    expect(errorKind({ exc_type: 'TimestampMismatchError', status: 403 })).toBe(
      'conflict',
    )
    expect(
      errorKind({
        status: 401,
        guard: { code: 'permission', message: 'x', actions: [] },
      }),
    ).toBe('permission')
    expect(errorKind(new TypeError('Failed to fetch'))).toBeNull()
  })

  it('asks who this browser is with a GET: a refusal is Guest, a lost connection is unknown', async () => {
    const guest = asGuest()
    expect(await askLoggedUser(guest)).toBe('Guest')
    expect(guest).toHaveBeenCalledWith(
      '/api/method/frappe.auth.get_logged_user',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(await askLoggedUser(vi.fn(async () => answer(401, {})))).toBe(
      'Guest',
    )
    expect(await askLoggedUser(asUser())).toBe('ana@example.test')
    expect(await askLoggedUser(vi.fn(async () => answer(502, {})))).toBeNull()
    expect(
      await askLoggedUser(
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        }),
      ),
    ).toBeNull()
  })

  it('only a refusal answered by Guest is an ended session', async () => {
    expect(await sessionLost(refusal(), asUser())).toBe(false)
    expect(sessionEnded.value).toBe(false)
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await sessionLost(refusal(), offline)).toBe(false)
    const network = asGuest()
    expect(await sessionLost(new TypeError('Failed to fetch'), network)).toBe(
      false,
    )
    expect(network).not.toHaveBeenCalled()
    expect(await sessionLost(refusal(), asGuest())).toBe(true)
    expect(sessionEnded.value).toBe(true)
  })

  it('signs in back to the same /crm route, never off the site', () => {
    expect(signInHref('/compras/orden/PO-0001?list=%2Fcompras')).toBe(
      '/login?redirect-to=' +
        encodeURIComponent('/crm/compras/orden/PO-0001?list=%2Fcompras'),
    )
    expect(signInHref('/hoy')).toBe('/login?redirect-to=%2Fcrm%2Fhoy')
    expect(signInHref('//evil.example/x')).toBe(
      '/login?redirect-to=' + encodeURIComponent('/crm//evil.example/x'),
    )
    expect(signInHref('\\evil')).toBe('/login?redirect-to=%2Fcrm')
  })
})

describe('the shell boot after a refusal', () => {
  it('signed out: the saved boot stays and the shell says the session ended', async () => {
    saveBoot()
    vi.stubGlobal('fetch', asGuest())
    const error = refusal()
    state.call.mockRejectedValue(error)
    await expect(loadShell({ refresh: true })).rejects.toBe(error)
    expect(sessionEnded.value).toBe(true)
    expect(shellError.value).toBe('Your session ended')
    expect(shellBoot.value?.user?.name).toBe('ana@example.test')
    expect(
      localStorage.getItem(BOOT_CACHE_PREFIX + currentScope()),
    ).not.toBeNull()
  })

  it('the Guest answer resets user_id: the signed-in boot stays on screen, also for a call in the meantime', async () => {
    saveBoot()
    let answerGuest
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answerGuest = () => resolve(answer(403, {}))
          }),
      ),
    )
    state.call.mockRejectedValue(refusal())
    const first = loadShell({ refresh: true }).catch(() => null)
    await until(() => answerGuest)
    // Frappe's Guest answer set user_id=Guest; the shell asks again meanwhile.
    document.cookie = 'user_id=Guest; path=/'
    const second = loadShell().catch(() => null)
    answerGuest()
    await Promise.all([first, second])
    expect(sessionEnded.value).toBe(true)
    expect(shellBoot.value?.user?.name).toBe('ana@example.test')
    await loadShell().catch(() => null)
    expect(shellBoot.value?.user?.name).toBe('ana@example.test')
    document.cookie = 'user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('still signed in: a refusal drops the saved boot, as before', async () => {
    saveBoot()
    vi.stubGlobal('fetch', asUser())
    state.call.mockRejectedValue(refusal())
    await expect(loadShell({ refresh: true })).rejects.toBeTruthy()
    expect(sessionEnded.value).toBe(false)
    expect(shellBoot.value).toBeNull()
    expect(localStorage.getItem(BOOT_CACHE_PREFIX + currentScope())).toBeNull()
  })
})

describe('what the worker sees', () => {
  async function mountShell(path) {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/hoy',
          component: { render: () => h('p', 'Hoy page') },
          meta: { app: 'hoy', title: 'Hoy' },
        },
        {
          path: '/compras/orden/:name',
          component: { render: () => h('p', 'Compras record') },
          meta: { app: 'compras', title: 'Compras', listParent: 'Compras' },
        },
      ],
    })
    await router.push(path)
    await router.isReady()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(MuelleShell, null, { default: () => h(RouterView) }),
    })
    app.config.globalProperties.__ = (text) => text
    app.use(router)
    app.mount(root)
  }
  async function mountNotPermitted(path) {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/not-permitted', component: NotPermitted },
        { path: '/:rest(.*)*', component: { render: () => h('p', 'Other') } },
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
  const labels = () =>
    [...root.querySelectorAll('button')].map((b) => b.textContent.trim())

  for (const path of ['/hoy', '/compras/orden/PO-0001']) {
    it(`${path} with an expired sid asks to sign in, not for access, and comes back to ${path}`, async () => {
      saveBoot()
      vi.stubGlobal('fetch', asGuest())
      state.call.mockRejectedValue(refusal())
      const assign = vi
        .spyOn(window.location, 'assign')
        .mockImplementation(() => {})
      await mountShell(path)
      const prompt = await until(() =>
        root.querySelector('[data-testid="session-ended"]'),
      )
      expect(prompt.textContent).toContain('Your session ended')
      expect(labels()).toContain('Sign in')
      expect(labels()).not.toContain('Ask for access')
      expect(labels()).not.toContain('Retry permissions')
      ;[...prompt.querySelectorAll('button')]
        .find((b) => b.textContent === 'Sign in')
        .click()
      expect(assign).toHaveBeenCalledWith(
        '/login?redirect-to=' + encodeURIComponent('/crm' + path),
      )
    })
  }

  it('a real refusal while signed in keeps «Ask for access»', async () => {
    vi.stubGlobal('fetch', asUser())
    state.call.mockRejectedValue(refusal())
    await mountShell('/hoy')
    await until(() => root.querySelector('[role="alert"]'))
    expect(root.querySelector('[data-testid="session-ended"]')).toBeNull()
    expect(labels()).toContain('Ask for access')
  })

  it('Not Permitted: Guest sees the session copy and sign-in, not «Pedir acceso»', async () => {
    saveBoot()
    vi.stubGlobal('fetch', asGuest())
    state.call.mockRejectedValue(refusal())
    await mountNotPermitted('/not-permitted?intended=%2Fdeals')
    await until(() => root.querySelector('[data-testid="session-ended"]'))
    expect(root.textContent).toContain('Your session ended')
    expect(labels()).toEqual(['Sign in'])
    expect(root.textContent).not.toContain('No tienes permiso')
    // The saved boot still opens Hoy, but only signing in does.
    expect(router.currentRoute.value.path).toBe('/not-permitted')
  })

  it('Not Permitted: a signed-in refusal keeps «Pedir acceso»', async () => {
    vi.stubGlobal('fetch', asUser())
    state.call.mockRejectedValue(refusal())
    await mountNotPermitted('/not-permitted?intended=%2Fdeals')
    await until(() => labels().includes('Pedir acceso'))
    expect(root.querySelector('[data-testid="session-ended"]')).toBeNull()
    expect(root.textContent).toContain('No tienes permiso')
  })
})
