import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const fixture = vi.hoisted(() => ({
  native: null,
  resources: null,
  config: null,
  help: null,
  intermediate: null,
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
  get IntermediateStepModal() {
    return fixture.intermediate
  },
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
// App.vue frames CRM routes in the Muelle shell; its chrome renders only on
// Contactos routes, so a pass-through keeps these tests on the CRM runtime.
vi.mock('@/components/shell/MuelleShell.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: {
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.()),
    },
  }
})
vi.mock('@/components/shell/VentasSidebar.vue', () => ({
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
vi.mock('@/components/Telephony/CallUI.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Mobile/OutboxStrip.vue', () => ({
  default: { render: () => h('nav', { 'data-native-layout': 'mobile' }) },
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

async function prepareNativeFixture() {
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
  fixture.resources = await import(
    '../../node_modules/frappe-ui/src/resources/resources.js'
  )
  fixture.config = await import(
    '../../node_modules/frappe-ui/src/utils/config.ts'
  )
  fixture.native = await import(
    '../../node_modules/frappe-ui/frappe/Onboarding/onboarding.js'
  )
  fixture.help = await import(
    '../../node_modules/frappe-ui/frappe/Help/help.js'
  )
  fixture.intermediate = (
    await import(
      '../../node_modules/frappe-ui/frappe/Onboarding/IntermediateStepModal.vue'
    )
  ).default
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
}

// vi.resetModules() re-evaluates the shell per test, but Vite transforms each
// module once per worker. Pay that cold transform of the frappe-ui sources and
// the App/LeadModal graph here, under its own budget, instead of inside the
// first test's hook or test timeout (it overran both on a loaded runner).
beforeAll(async () => {
  await prepareNativeFixture()
  await import('@/components/Modals/LeadModal.vue')
  await import('@/App.vue')
}, 60_000)
beforeEach(prepareNativeFixture)
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  root = null
  vi.unstubAllGlobals()
})

async function mountShell(mobile = false) {
  fixture.mobile.value = mobile
  const { default: LeadModal } = await import(
    '@/components/Modals/LeadModal.vue'
  )
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
  // App → MuelleShell → CrmRuntime → layout are nested async components.
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled()
    await settle()
  }
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
  it('keeps a failed native POST pending and retries only onboarding after successful Lead creation', async () => {
    const owner = await mountShell()
    await owner.retry()
    fixture.fetch.mockRejectedValueOnce(
      new Error('Native onboarding save unavailable'),
    )
    const create = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Create',
    )
    create.click()
    await vi.waitFor(() =>
      expect(fixture.router.currentRoute.value.name).toBe('Lead'),
    )
    await settle()
    expect(owner.error.value?.message).toBe(
      'Native onboarding save unavailable',
    )
    expect(root.querySelector('[role="alert"]')).toBeTruthy()
    expect(localStorage.getItem('firstLead' + user)).toBeNull()
    expect(
      owner.steps.value.find((s) => s.name === 'create_first_lead').completed,
    ).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(await owner.retry()).toBe(true)
    await settle()
    expect(writes()).toHaveLength(2)
    expect(writes()[0]).toEqual(writes()[1])
    expect(localStorage.getItem('firstLead' + user)).toBe('LEAD-NATIVE-1')
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(
      fixture.request.mock.calls.filter(
        ([o]) => o.url === 'frappe.client.insert',
      ),
    ).toHaveLength(1)
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
    const status = ui.getCachedResource(['onboarding_status', user])
    await settle()
    expect(status.auto).toBe(true)
    const owner = api.useCrmOnboarding()
    await owner.retry()
    expect(ui.getCachedResource(['onboarding_status', user])).toBe(status)
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
  it('serializes pending native persistence and coalesces concurrent retry calls', async () => {
    const owner = api.useCrmOnboarding()
    await owner.retry()
    const persisted = deferred()
    fixture.fetch.mockReturnValueOnce(persisted.promise)
    const firstCallback = vi.fn(),
      secondCallback = vi.fn()
    const first = owner.updateOnboardingStep(
      'create_first_lead',
      true,
      false,
      firstCallback,
    )
    const second = owner.skip('create_first_task', secondCallback)
    const retry = owner.retry()
    await settle()
    expect(writes()).toHaveLength(1)
    expect(firstCallback).not.toHaveBeenCalled()
    expect(secondCallback).not.toHaveBeenCalled()
    persisted.resolve({
      ok: true,
      status: 200,
      json: async () => ({ message: null }),
    })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(await retry).toBe(true)
    expect(writes()).toHaveLength(2)
    expect(firstCallback).toHaveBeenCalledTimes(1)
    expect(secondCallback).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(writes()[1].steps)
    expect(saved.find((s) => s.name === 'create_first_lead').completed).toBe(
      true,
    )
    expect(saved.find((s) => s.name === 'create_first_task').completed).toBe(
      true,
    )
  })
  it.each([false, true])(
    'renders and continues the native guidance modal on the active shell (%s mobile)',
    async (mobile) => {
      const owner = await mountShell(mobile)
      await owner.retry()
      fixture.router.addRoute({
        path: '/crm/deals/:dealId',
        name: 'Deal',
        component: { render: () => h('div', 'Native deal detail') },
      })
      localStorage.setItem('firstLead' + user, 'LEAD-NATIVE-1')
      localStorage.setItem('firstDeal' + user, 'DEAL-NATIVE-1')
      for (const [step, title, label, route, id] of [
        [
          'convert_lead_to_deal',
          'Convert lead to deal',
          'Convert',
          'Lead',
          'LEAD-NATIVE-1',
        ],
        [
          'change_deal_status',
          'Change deal status',
          'Change',
          'Deal',
          'DEAL-NATIVE-1',
        ],
      ]) {
        await owner.steps.value.find((s) => s.name === step).onClick()
        await vi.waitFor(() =>
          expect(
            [...document.body.querySelectorAll('[role="dialog"]')].some((el) =>
              el.textContent.includes(title),
            ),
          ).toBe(true),
        )
        const dialogs = [
          ...document.body.querySelectorAll('[role="dialog"]'),
        ].filter((el) => el.textContent.includes(title))
        expect(dialogs).toHaveLength(1)
        const buttons = [...dialogs[0].querySelectorAll('button')].filter(
          (b) => b.textContent === label,
        )
        expect(buttons).toHaveLength(1)
        buttons[0].click()
        await vi.waitFor(() =>
          expect(fixture.router.currentRoute.value.name).toBe(route),
        )
        expect(
          Object.values(fixture.router.currentRoute.value.params),
        ).toContain(id)
        expect(owner.showIntermediateModal.value).toBe(false)
        await settle()
      }
    },
  )
  it.each(['skip', 'skipAll', 'reset', 'resetAll'])(
    'awaits native %s persistence and retains its failure for explicit retry',
    async (method) => {
      const owner = api.useCrmOnboarding()
      await owner.retry()
      await owner.updateOnboardingStep('create_first_lead')
      fixture.fetch.mockClear()
      const before = owner.steps.value.map(({ name, completed }) => ({
        name,
        completed,
      }))
      fixture.fetch.mockRejectedValueOnce(new Error('Native step save failed'))
      const callback = vi.fn()
      const args = method.endsWith('All')
        ? [callback]
        : [
            method === 'reset' ? 'create_first_lead' : 'create_first_task',
            callback,
          ]
      expect(await owner[method](...args)).toBe(false)
      expect(callback).not.toHaveBeenCalled()
      expect(
        owner.steps.value.map(({ name, completed }) => ({ name, completed })),
      ).toEqual(before)
      expect(await owner.retry()).toBe(true)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(writes()).toHaveLength(2)
      expect(writes()[0]).toEqual(writes()[1])
    },
  )
  it('does not strand an action arriving as an empty retry settles', async () => {
    const owner = api.useCrmOnboarding()
    await owner.retry()
    const empty = owner.retry()
    await Promise.resolve()
    const callback = vi.fn()
    expect(
      await owner.updateOnboardingStep(
        'create_first_lead',
        true,
        false,
        callback,
      ),
    ).toBe(true)
    expect(await empty).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(1)
  })
  it('rechecks actor identity between queued persistence requests', async () => {
    const owner = api.useCrmOnboarding()
    await owner.retry()
    const first = deferred()
    fixture.fetch.mockReturnValueOnce(first.promise)
    const saved = vi.fn(),
      withheld = vi.fn()
    const a = owner.updateOnboardingStep(
      'create_first_lead',
      true,
      false,
      saved,
    )
    const b = owner.skip('create_first_task', withheld)
    await settle()
    expect(writes()).toHaveLength(1)
    fixture.session.user = 'other@example.invalid'
    first.resolve({
      ok: true,
      status: 200,
      json: async () => ({ message: null }),
    })
    expect(await a).toBe(false)
    expect(await b).toBe(false)
    expect(saved).toHaveBeenCalledTimes(1)
    expect(withheld).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(1)
    expect(owner.error.value.message).toContain('session changed')
  })
  it('preserves hidden manager history and matches a current seller step by name after POST', async () => {
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
    fixture.request.mockResolvedValue({
      frappecrm_onboarding_status: names.map((name) => ({
        name,
        completed: name === 'invite_your_team',
      })),
    })
    const owner = api.useCrmOnboarding()
    await owner.retry()
    const callback = vi.fn()
    expect(
      await owner.updateOnboardingStep(
        'change_deal_status',
        true,
        false,
        callback,
      ),
    ).toBe(true)
    expect(owner.error.value).toBeNull()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(
      owner.steps.value.find((s) => s.name === 'convert_lead_to_deal')
        .completed,
    ).toBe(false)
    expect(
      owner.steps.value.find((s) => s.name === 'change_deal_status').completed,
    ).toBe(true)
    expect(owner.steps.value.some((s) => s.name === 'invite_your_team')).toBe(
      false,
    )
    const saved = JSON.parse(writes()[0].steps)
    expect(saved).toHaveLength(9)
    expect(saved.find((s) => s.name === 'invite_your_team').completed).toBe(
      true,
    )
    expect(await owner.resetAll()).toBe(true)
    const reset = JSON.parse(writes()[1].steps)
    expect(reset).toHaveLength(9)
    expect(reset.find((s) => s.name === 'invite_your_team').completed).toBe(
      true,
    )
    expect(
      reset
        .filter((s) => s.name !== 'invite_your_team')
        .every((s) => !s.completed),
    ).toBe(true)
  })
  it('reopens saved seller completion when the current manager newly receives Invite', async () => {
    const names = [
      'setup_your_password',
      'create_first_lead',
      'convert_lead_to_deal',
      'create_first_task',
      'create_first_note',
      'add_first_comment',
      'send_first_email',
      'change_deal_status',
    ]
    await fixture.users.promise
    await settle()
    fixture.users.setData([
      [{ name: user, role: 'Sales Manager' }],
      [{ name: user, role: 'Sales Manager' }],
    ])
    localStorage.setItem('isOnboardingStepsCompletedfrappecrm' + user, 'true')
    fixture.request.mockResolvedValue({
      frappecrm_onboarding_status: names.map((name) => ({
        name,
        completed: true,
      })),
    })
    const owner = api.useCrmOnboarding()
    await owner.retry()
    expect(owner.isOnboardingStepsCompleted.value).toBe(false)
    expect(owner.steps.value.filter((s) => s.completed)).toHaveLength(8)
    expect(
      owner.steps.value.find((s) => s.name === 'invite_your_team').completed,
    ).toBe(false)
    expect(await owner.updateOnboardingStep('invite_your_team')).toBe(true)
    const saved = JSON.parse(writes()[0].steps)
    expect(saved).toHaveLength(9)
    expect(saved.every((s) => s.completed)).toBe(true)
    expect(new Set(saved.map((s) => s.name)).size).toBe(9)
  })
  it('isolates native registry callbacks and persisted progress for actor replacement and revisit', async () => {
    const secondUser = 'second@example.invalid'
    const saved = {}
    fixture.request.mockImplementation(async (o) => {
      if (o.url === 'crm.api.session.get_users')
        return [
          [{ name: fixture.session.user, role: 'Sales User' }],
          [{ name: fixture.session.user, role: 'Sales User' }],
        ]
      if (o.url === 'frappe.onboarding.get_onboarding_status')
        return saved[fixture.session.user] || {}
      throw Error(o.url)
    })
    fixture.fetch.mockImplementation(async (_url, options) => {
      saved[fixture.session.user] = {
        frappecrm_onboarding_status: JSON.parse(JSON.parse(options.body).steps),
      }
      return { ok: true, status: 200, json: async () => ({ message: null }) }
    })
    fixture.router.addRoute({
      path: '/crm/leads/:leadId',
      name: 'Lead',
      component: { render: () => null },
    })
    localStorage.setItem('firstLead' + user, 'LEAD-A')
    localStorage.setItem('firstLead' + secondUser, 'LEAD-B')
    const first = api.useCrmOnboarding()
    await first.retry()
    await first.updateOnboardingStep('create_first_lead')
    fixture.session.user = secondUser
    document.cookie = 'user_id=' + secondUser
    const second = api.useCrmOnboarding()
    expect(await second.retry()).toBe(true)
    expect(
      second.steps.value.find((s) => s.name === 'create_first_lead').completed,
    ).toBe(false)
    const secondNative = fixture.native.useOnboarding('frappecrm')
    await secondNative.steps
      .find((s) => s.name === 'convert_lead_to_deal')
      .onClick()
    expect(second.showIntermediateModal.value).toBe(true)
    expect(first.showIntermediateModal.value).toBe(false)
    await second.currentStep.value.onClick()
    await vi.waitFor(() =>
      expect(fixture.router.currentRoute.value.params.leadId).toBe('LEAD-B'),
    )
    await second.updateOnboardingStep('create_first_task')
    fixture.session.user = user
    document.cookie = 'user_id=' + user
    const returned = api.useCrmOnboarding()
    expect(await returned.retry()).toBe(true)
    const returnedNative = fixture.native.useOnboarding('frappecrm')
    expect(returnedNative.steps).not.toBe(secondNative.steps)
    expect(
      returned.steps.value.find((s) => s.name === 'create_first_lead')
        .completed,
    ).toBe(true)
    expect(
      returned.steps.value.find((s) => s.name === 'create_first_task')
        .completed,
    ).toBe(false)
    await returnedNative.steps
      .find((s) => s.name === 'convert_lead_to_deal')
      .onClick()
    expect(returned.showIntermediateModal.value).toBe(true)
    expect(first.showIntermediateModal.value).toBe(false)
    await returned.currentStep.value.onClick()
    await vi.waitFor(() =>
      expect(fixture.router.currentRoute.value.params.leadId).toBe('LEAD-A'),
    )
    expect(
      saved[secondUser].frappecrm_onboarding_status.find(
        (s) => s.name === 'create_first_task',
      ).completed,
    ).toBe(true)
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
