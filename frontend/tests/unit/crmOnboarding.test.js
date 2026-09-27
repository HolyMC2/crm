import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const fixture = vi.hoisted(() => ({
  native: null,
  resources: null,
  config: null,
  help: null,
  session: null,
  users: null,
  document: null,
  mobile: null,
  router: null,
  request: vi.fn(),
  fetch: vi.fn(),
  capture: vi.fn(),
  send: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const Button = {
    props: ['label'],
    emits: ['click'],
    setup:
      (p, { emit, slots }) =>
      () =>
        h(
          'button',
          { onClick: () => emit('click') },
          p.label || slots.default?.(),
        ),
  }
  return {
    createResource: (...args) => fixture.resources.createResource(...args),
    getCachedResource: (...args) =>
      fixture.resources.getCachedResource(...args),
    setConfig: (...args) => fixture.config.setConfig(...args),
    call: vi.fn(),
    toast: { error: vi.fn() },
    Button,
    FrappeUIProvider: {
      setup:
        (_, { slots }) =>
        () =>
          slots.default?.(),
    },
    useTheme: () => ({ setTheme() {} }),
  }
})
vi.mock('frappe-ui/frappe', () => ({
  useOnboarding: (...args) => fixture.native.useOnboarding(...args),
  get minimize() {
    return fixture.help.minimize
  },
  useTelemetry: () => ({ capture: fixture.capture }),
}))
vi.mock('@/stores/session', () => ({ sessionStore: () => fixture.session }))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: fixture.users,
    isManager: () =>
      ['System Manager', 'Sales Manager'].includes(
        fixture.users.data?.allUsers?.[0]?.role,
      ),
    getUser: () => ({ name: fixture.session.user }),
  }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getLeadStatus: () => ({ color: 'gray' }),
    statusOptions: () => [{ value: 'New', label: 'New' }],
  }),
}))
vi.mock('@/router', () => ({
  get default() {
    return fixture.router
  },
}))
vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ send: fixture.send }),
}))
vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return {
    showSettings: ref(false),
    activeSettingsPage: ref(''),
    mobileSidebarOpened: ref(false),
    isMobileView: ref(false),
  }
})
vi.mock('@/composables/breakpoint', () => ({
  get isMobile() {
    return fixture.mobile
  },
}))
vi.mock('@/data/document', () => ({
  useDocument: () => ({
    document: fixture.document,
    triggerOnBeforeCreate: async () => {},
  }),
}))
vi.mock('@/components/FieldLayout/FieldLayout.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/stores/settings', () => ({ syncBrandFavicon() {} }))
vi.mock('@/utils/prefetch', () => ({ prefetchHotChunks() {} }))
vi.mock('@/composables/telemetry', () => ({ initTelemetry() {} }))
vi.mock('@/utils/dialogs', () => ({ Dialogs: { render: () => null } }))
vi.mock('@/pages/NotPermitted.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/EventNotificationPopup.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Modals/DoctypeModals.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Modals/GlobalModals.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Layouts/DocoNavRail.vue', () => ({
  default: { render: () => h('nav', { 'data-native-layout': 'desktop' }) },
}))
vi.mock('@/components/Layouts/AppHeader.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Mobile/MobileSidebar.vue', () => ({
  default: { render: () => h('nav', { 'data-native-layout': 'mobile' }) },
}))
vi.mock('@/components/Mobile/MobileAppHeader.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Mobile/MobileTabBar.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Mobile/OutboxStrip.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/installNudge', async () => {
  const { ref } = await import('vue')
  return {
    initInstallNudge() {},
    installNudgeVisible: ref(false),
    acceptInstall() {},
    dismissInstallNudge() {},
  }
})

let app, root, api, ui
const user = 'seller@example.invalid'
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  document.cookie = 'user_id=' + user
  globalThis.__ = (text) => text
  fixture.session = reactive({ user, isLoggedIn: true })
  fixture.mobile = ref(false)
  fixture.document = reactive({
    doc: {
      first_name: 'Native fixture',
      email: 'fixture@example.invalid',
      status: 'New',
    },
  })
  fixture.router = createRouter({ history: createMemoryHistory(), routes: [] })
  fixture.resources =
    await import('../../node_modules/frappe-ui/src/resources/resources.js')
  fixture.config =
    await import('../../node_modules/frappe-ui/src/utils/config.ts')
  fixture.native =
    await import('../../node_modules/frappe-ui/frappe/Onboarding/onboarding.js')
  fixture.help =
    await import('../../node_modules/frappe-ui/frappe/Help/help.js')
  ui = await import('frappe-ui')
  ui.setConfig('resourceFetcher', fixture.request)
  fixture.request.mockImplementation(async (options) => {
    if (options.url === 'crm.api.session.get_users')
      return [
        [{ name: user, role: 'Sales User' }],
        [{ name: user, role: 'Sales User' }],
      ]
    if (options.url === 'frappe.onboarding.get_onboarding_status') return {}
    if (options.url.endsWith('.get_fields_layout')) return []
    if (options.url === 'frappe.client.insert')
      return { ...options.params.doc, name: 'LEAD-NATIVE-1' }
    throw Error('Unexpected native read: ' + options.url)
  })
  fixture.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ message: null }),
  })
  vi.stubGlobal('fetch', fixture.fetch)
  fixture.users = ui.createResource({
    url: 'crm.api.session.get_users',
    auto: true,
    transform: ([allUsers, crmUsers]) => ({ allUsers, crmUsers }),
  })
  api = await import('@/composables/onboarding')
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  root = null
  vi.unstubAllGlobals()
})

async function mountShell(mobile = false) {
  fixture.mobile.value = mobile
  const { default: LeadModal } =
    await import('@/components/Modals/LeadModal.vue')
  const { default: App } = await import('@/App.vue')
  const page = defineComponent({
    setup: () => () => h(LeadModal, { modelValue: true }),
  })
  fixture.router.addRoute({ path: '/', name: 'Leads', component: page })
  fixture.router.addRoute({
    path: '/crm/leads/:leadId',
    name: 'Lead',
    component: { render: () => h('div', 'Native lead detail') },
  })
  await fixture.router.push('/')
  await fixture.router.isReady()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(App)
  app.use(fixture.router)
  app.config.globalProperties.__ = (text) => text
  // Native global component names are intentional in this real-shell harness.
  // eslint-disable-next-line vue/no-reserved-component-names
  app.component('Button', ui.Button)
  // eslint-disable-next-line vue/no-reserved-component-names
  app.component('Dialog', {
    setup:
      (_, { slots }) =>
      () =>
        h('section', { role: 'dialog' }, slots.body?.()),
  })
  app.component('ErrorMessage', {
    props: { message: { type: String, default: '' } },
    setup: (p) => () => h('span', p.message),
  })
  app.mount(root)
  await vi.dynamicImportSettled()
  await settle()
  return api.useCrmOnboarding()
}

function writes() {
  return fixture.fetch.mock.calls
    .filter(
      ([url]) =>
        url === '/api/method/frappe.onboarding.update_user_onboarding_status',
    )
    .map(([, options]) => JSON.parse(options.body))
}

describe('shared CRM native onboarding owner', () => {
  it.each([false, true])(
    'registers from the active shell and successful Lead callback without sidebar (%s mobile)',
    async (mobile) => {
      const owner = await mountShell(mobile)
      await owner.retry()
      await settle()
      expect(
        root.querySelector(
          `[data-native-layout="${mobile ? 'mobile' : 'desktop'}"]`,
        ),
      ).toBeTruthy()
      const create = [...root.querySelectorAll('button')].find(
        (b) => b.textContent === 'Create',
      )
      expect(create).toBeTruthy()
      create.click()
      await settle()
      expect(
        fixture.request.mock.calls.filter(
          ([o]) => o.url === 'frappe.client.insert',
        ),
      ).toHaveLength(1)
      await vi.waitFor(() =>
        expect(fixture.router.currentRoute.value.name).toBe('Lead'),
      )
      expect(owner.error.value).toBeNull()
      expect(writes()).toHaveLength(1)
      const steps = JSON.parse(writes()[0].steps)
      expect(steps.find((s) => s.name === 'create_first_lead').completed).toBe(
        true,
      )
      expect(localStorage.getItem('firstLead' + user)).toBe('LEAD-NATIVE-1')
      expect(steps.some((s) => s.name === 'invite_your_team')).toBe(false)
    },
  )
  it('waits late native roles/status and preserves saved progress before the pending update', async () => {
    const roles = deferred(),
      status = deferred()
    fixture.users = ui.createResource({
      url: 'crm.api.session.get_users',
      transform: ([allUsers, crmUsers]) => ({ allUsers, crmUsers }),
    })
    fixture.request.mockImplementation((o) =>
      o.url === 'crm.api.session.get_users' ? roles.promise : status.promise,
    )
    fixture.users.fetch()
    const owner = api.useCrmOnboarding()
    const callback = vi.fn()
    const pending = owner.updateOnboardingStep(
      'create_first_lead',
      true,
      false,
      callback,
    )
    expect(writes()).toHaveLength(0)
    const names = [
      'setup_your_password',
      'create_first_lead',
      'invite_your_team',
      'convert_lead_to_deal',
      'create_first_task',
      'create_first_note',
      'add_first_comment',
      'send_first_email',
      'change_deal_status',
    ]
    status.resolve({
      frappecrm_onboarding_status: names.map((name) => ({
        name,
        completed: name === 'setup_your_password',
      })),
    })
    roles.resolve([
      [{ name: user, role: 'Sales Manager' }],
      [{ name: user, role: 'Sales Manager' }],
    ])
    expect(await pending).toBe(true)
    await settle()
    const saved = JSON.parse(writes()[0].steps)
    expect(saved.find((s) => s.name === 'setup_your_password').completed).toBe(
      true,
    )
    expect(saved.find((s) => s.name === 'create_first_lead').completed).toBe(
      true,
    )
    expect(saved.find((s) => s.name === 'invite_your_team')).toBeTruthy()
    expect(callback).toHaveBeenCalledTimes(1)
  })
  it('shows native status failure, retains pending completion and retries without repeating CRM creation', async () => {
    const error = new Error('Native status unavailable')
    let fail = true
    fixture.request.mockImplementation(async (o) => {
      if (o.url === 'frappe.onboarding.get_onboarding_status') {
        if (fail) throw error
        return {}
      }
      if (o.url.endsWith('.get_fields_layout')) return []
      throw Error(o.url)
    })
    const owner = await mountShell()
    expect(await owner.updateOnboardingStep('create_first_lead')).toBe(false)
    await settle()
    expect(owner.ready.value).toBe(false)
    expect(owner.error.value.message).toBe(error.message)
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'Onboarding progress is unavailable',
    )
    expect(writes()).toHaveLength(0)
    fail = false
    expect(await owner.retry()).toBe(true)
    await settle()
    expect(writes()).toHaveLength(1)
    expect(owner.error.value).toBeNull()
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(
      fixture.request.mock.calls.filter(
        ([o]) => o.url === 'frappe.client.insert',
      ),
    ).toHaveLength(0)
  })
  it('shares initialization across callers/navigation and does not reset native completion', async () => {
    const a = api.useCrmOnboarding(),
      b = api.useCrmOnboarding()
    expect(a).toBe(b)
    await a.retry()
    await a.updateOnboardingStep('create_first_lead')
    await settle()
    await b.retry()
    const c = api.useCrmOnboarding()
    expect(c).toBe(a)
    expect(writes()).toHaveLength(1)
    expect(
      fixture.request.mock.calls.filter(
        ([o]) => o.url === 'frappe.onboarding.get_onboarding_status',
      ),
    ).toHaveLength(1)
    expect(
      a.steps.value.find((s) => s.name === 'create_first_lead').completed,
    ).toBe(true)
  })
  it('does not request onboarding during module import before authenticated bootstrap', () => {
    expect(
      fixture.request.mock.calls.some(([o]) => o.url.includes('onboarding')),
    ).toBe(false)
  })
  it('reuses a prior native cache and prevents extra native auto reloads', async () => {
    fixture.native.useOnboarding('frappecrm')
    const status = ui.getCachedResource('onboarding_status')
    await settle()
    expect(status.auto).toBe(true)
    const owner = api.useCrmOnboarding()
    await owner.retry()
    expect(ui.getCachedResource('onboarding_status')).toBe(status)
    expect(status.auto).toBe(false)
    fixture.native.useOnboarding('frappecrm')
    fixture.native.useOnboarding('frappecrm')
    await settle()
    expect(
      fixture.request.mock.calls.filter(
        ([o]) => o.url === 'frappe.onboarding.get_onboarding_status',
      ),
    ).toHaveLength(2)
    await owner.updateOnboardingStep('create_first_lead')
    expect(writes()).toHaveLength(1)
    expect(
      JSON.parse(writes()[0].steps).find((s) => s.name === 'create_first_lead')
        .completed,
    ).toBe(true)
  })
  it('retains native progress and one owner when the authenticated shell remounts', async () => {
    const first = await mountShell()
    await first.retry()
    await first.updateOnboardingStep('create_first_lead')
    app.unmount()
    root.remove()
    const second = await mountShell(true)
    expect(second).toBe(first)
    await second.updateOnboardingStep('create_first_task')
    expect(
      fixture.request.mock.calls.filter(
        ([o]) => o.url === 'frappe.onboarding.get_onboarding_status',
      ),
    ).toHaveLength(1)
    const saved = JSON.parse(writes().at(-1).steps)
    expect(saved.find((s) => s.name === 'create_first_lead').completed).toBe(
      true,
    )
    expect(saved.find((s) => s.name === 'create_first_task').completed).toBe(
      true,
    )
  })
  it.each([null, [], { frappecrm_onboarding_status: 'invalid' }])(
    'refuses malformed native status %j without replacing saved progress',
    async (response) => {
      localStorage.setItem(
        'onboardingStatus',
        JSON.stringify({
          [user]: {
            frappecrm_onboarding_status: [
              { name: 'setup_your_password', completed: true },
            ],
          },
        }),
      )
      const saved = localStorage.getItem('onboardingStatus')
      fixture.request.mockResolvedValue(response)
      const owner = api.useCrmOnboarding()
      expect(await owner.updateOnboardingStep('create_first_lead')).toBe(false)
      expect(owner.error.value).toBeTruthy()
      expect(owner.ready.value).toBe(false)
      expect(writes()).toHaveLength(0)
      expect(localStorage.getItem('onboardingStatus')).toBe(saved)
    },
  )
  it('retries a failed native role read before registering role-sensitive actions', async () => {
    fixture.users = ui.createResource({
      url: 'crm.api.session.get_users',
      transform: ([allUsers, crmUsers]) => ({ allUsers, crmUsers }),
    })
    fixture.request.mockRejectedValueOnce(
      new Error('Native role service unavailable'),
    )
    await expect(fixture.users.fetch()).rejects.toThrow(
      'Native role service unavailable',
    )
    fixture.request.mockRejectedValueOnce(
      new Error('Native role service unavailable'),
    )
    const owner = api.useCrmOnboarding()
    expect(await owner.retry()).toBe(false)
    expect(owner.error.value.message).toBe('Native role service unavailable')
    expect(owner.ready.value).toBe(false)
    expect(writes()).toHaveLength(0)
    expect(await owner.retry()).toBe(true)
    expect(owner.steps.value.some((s) => s.name === 'invite_your_team')).toBe(
      false,
    )
  })
  it('keeps an unknown role unavailable until explicit retry returns an actual role', async () => {
    await fixture.users.promise
    await settle()
    fixture.users.setData([[{ name: user, role: null }], []])
    const owner = api.useCrmOnboarding()
    expect(await owner.retry()).toBe(false)
    expect(owner.ready.value).toBe(false)
    expect(writes()).toHaveLength(0)
    expect(await owner.retry()).toBe(true)
    expect(owner.error.value).toBeNull()
    expect(owner.steps.value.some((s) => s.name === 'invite_your_team')).toBe(
      false,
    )
  })
  it('does not submit pending progress after the authenticated actor changes', async () => {
    const owner = api.useCrmOnboarding()
    await owner.retry()
    fixture.session.user = 'other@example.invalid'
    expect(await owner.updateOnboardingStep('create_first_lead')).toBe(false)
    expect(owner.error.value.message).toContain('session changed')
    expect(writes()).toHaveLength(0)
  })
  it('guest initialization performs no onboarding read and never registers privileged role actions', () => {
    fixture.session.user = null
    fixture.session.isLoggedIn = false
    document.cookie = 'user_id=Guest'
    fixture.request.mockClear()
    expect(api.useCrmOnboarding()).toBeNull()
    expect(fixture.request).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
  })
})
