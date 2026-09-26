import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
const state = vi.hoisted(() => ({
  installed: [],
  loaded: 'resolved',
  mounted: [],
  routeGuard: null,
}))
vi.mock('frappe-ui', () => ({
  Dialog: {
    props: ['open'],
    setup(props, { slots }) {
      return () => (props.open ? slots.body?.() : null)
    },
  },
  Avatar: {
    render() {
      return null
    },
  },
  createDocumentResource: vi.fn(),
  getCachedDocumentResource: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({
    beforeEach: (fn) => {
      state.routeGuard = fn
      return () => {
        state.routeGuard = null
      }
    },
  }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    isAdmin: () => true,
    isManager: () => true,
    getUser: () => ({ full_name: 'Manager' }),
  }),
}))
vi.mock('@/composables/whatsapp', () => ({
  isWhatsappInstalled: { value: false },
}))
vi.mock('@/utils/crmCapabilities', async () => {
  return {
    addonAvailable: {
      get value() {
        return (
          state.loaded === 'resolved' &&
          state.installed.includes('doco_marketing')
        )
      },
    },
    appState: () =>
      state.loaded === 'resolved'
        ? state.installed.includes('doco_marketing')
          ? 'present'
          : 'missing'
        : state.loaded,
    loadCapabilities: vi.fn(),
  }
})
vi.mock('@/components/Icon.vue', () => ({
  default: {
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Users.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('Users')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Hierarchy/Hierarchy.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('Hierarchy')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/InviteUserPage.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('InviteUserPage')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Profile/ProfilePage.vue', async () => {
  const { h, ref } = await import('vue')
  const { useSettingsDraft } = await import('@/composables/settingsSession')
  return {
    default: {
      setup() {
        const draft = ref('')
        const pending = ref(false)
        useSettingsDraft({ dirty: () => !!draft.value, pending })
        return () =>
          h('div', [
            h('input', {
              'aria-label': 'Draft setting',
              value: draft.value,
              onInput: (e) => (draft.value = e.target.value),
            }),
            h(
              'button',
              { onClick: () => (pending.value = !pending.value) },
              pending.value ? 'Finish save' : 'Start save',
            ),
          ])
      },
    },
  }
})
vi.mock('@/components/Settings/PreferencesSettings.vue', async () => {
  const { h, ref } = await import('vue')
  const { useSettingsDraft } = await import('@/composables/settingsSession')
  return {
    default: {
      setup() {
        const draft = ref('')
        const pending = ref(false)
        useSettingsDraft({ dirty: () => !!draft.value, pending })
        return () =>
          h('div', [
            h('input', {
              'aria-label': 'Draft setting',
              value: draft.value,
              onInput: (e) => (draft.value = e.target.value),
            }),
            h(
              'button',
              { onClick: () => (pending.value = !pending.value) },
              pending.value ? 'Finish save' : 'Start save',
            ),
          ])
      },
    },
  }
})
vi.mock('@/components/Settings/WhatsAppSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('WhatsAppSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/ERPNextSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('ERPNextSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/LeadSyncing/LeadSyncSourcePage.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('LeadSyncSourcePage')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/DefaultsSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('DefaultsSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/PipelineSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('PipelineSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/BrandSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('BrandSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/CalendarSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('CalendarSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/HomeActions.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('HomeActions')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/MarketingSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('MarketingSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/SocialSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('SocialSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Forms/FormsSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('FormsSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/GeneralSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('GeneralSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/DashboardSettings.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('DashboardSettings')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/EmailTemplate/EmailTemplatePage.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('EmailTemplatePage')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Telephony/TelephonyPage.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('TelephonyPage')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/EmailConfig.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('EmailConfig')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/AssignmentRules/AssignmentRulePage.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('AssignmentRulePage')
    },
    render() {
      return null
    },
  },
}))
vi.mock('@/components/Settings/Sla/SlaConfig.vue', () => ({
  default: {
    mounted() {
      state.mounted.push('SlaConfig')
    },
    render() {
      return null
    },
  },
}))
import Workspace from '@/components/Settings/Settings.vue'
import { activeSettingsPage, showSettings } from '@/composables/settings'
const cleanups = []
const confirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm')
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(width = 1280) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
  showSettings.value = true
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(Workspace) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await flush()
  return el
}
function button(el, text) {
  return [...el.querySelectorAll('button')].find(
    (n) => n.textContent.trim() === text,
  )
}
async function click(el, text) {
  const node = button(el, text)
  expect(node, text).toBeTruthy()
  node.click()
  await flush()
}
async function edit(el, text) {
  const input = el.querySelector('input')
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}
beforeEach(() => {
  state.mounted = []
  state.installed = []
  state.loaded = 'resolved'
  activeSettingsPage.value = ''
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    writable: true,
    value: vi.fn(() => false),
  })
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  showSettings.value = false
  if (confirmDescriptor)
    Object.defineProperty(window, 'confirm', confirmDescriptor)
  else delete window.confirm
})
describe('settings workspace', () => {
  it('preserves two editors across category navigation and cancels a dirty close', async () => {
    const el = await mount()
    await edit(el, 'Profile draft')
    await click(el, 'Preferences')
    await edit(el, 'Preferences draft')
    await click(el, 'Profile')
    expect(el.querySelector('input').value).toBe('Profile draft')
    await click(el, 'Return to work')
    expect(showSettings.value).toBe(true)
    expect(el.querySelector('input').value).toBe('Profile draft')
    expect(window.confirm).toHaveBeenCalledOnce()
  })
  it('blocks dismissal and route changes during a save, then retains the queue route', async () => {
    const el = await mount()
    await edit(el, 'Still saving')
    await click(el, 'Start save')
    await click(el, 'Return to work')
    expect(showSettings.value).toBe(true)
    expect(state.routeGuard()).toBe(false)
    expect(window.confirm).not.toHaveBeenCalled()
    await click(el, 'Finish save')
    expect(state.routeGuard()).toBe(false)
    window.confirm.mockReturnValue(true)
    expect(state.routeGuard()).toBe(true)
    expect(showSettings.value).toBe(false)
  })
  it.each([360, 390])(
    'uses category navigation at %ipx and retains the editor through resize',
    async (width) => {
      const el = await mount(width)
      expect(el.querySelector('input')).toBeNull()
      await click(el, 'Profile')
      await edit(el, 'Phone draft')
      await click(el, 'Back to settings')
      await click(el, 'Profile')
      expect(el.querySelector('input').value).toBe('Phone draft')
      window.innerWidth = 1440
      window.dispatchEvent(new Event('resize'))
      await flush()
      expect(el.querySelector('input').value).toBe('Phone draft')
      expect(button(el, 'Back to settings')).toBeUndefined()
    },
  )
  it('never mounts addon DocTypes when Marketing is absent', async () => {
    const el = await mount()
    expect(button(el, 'Marketing y canal')).toBeUndefined()
    expect(button(el, 'Social (redes)')).toBeUndefined()
    expect(el.textContent).toContain('Marketing is not installed')
    expect(state.mounted).not.toContain('MarketingSettings')
    expect(state.mounted).not.toContain('SocialSettings')
  })
  it('mounts configured addon editors only after explicit selection', async () => {
    state.installed = ['doco_marketing']
    const el = await mount()
    expect(state.mounted).not.toContain('MarketingSettings')
    await click(el, 'Marketing y canal')
    expect(state.mounted).toContain('MarketingSettings')
    await click(el, 'Social (redes)')
    expect(state.mounted).toContain('SocialSettings')
  })
  it('marks capability outage separately and offers retry without removing native settings', async () => {
    state.loaded = 'unknown'
    const el = await mount()
    expect(el.textContent).toContain('Optional settings could not be checked')
    expect(button(el, 'Retry')).toBeTruthy()
    expect(button(el, 'Sales pipelines')).toBeTruthy()
    expect(state.mounted).not.toContain('MarketingSettings')
  })
})
