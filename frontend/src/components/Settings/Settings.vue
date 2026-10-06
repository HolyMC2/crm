<template>
  <Dialog
    v-model:open="showSettings"
    size="5xl"
    :disableOutsideClickToClose="
      disableSettingModalOutsideClick || session.pending.value
    "
  >
    <template #body>
      <div
        class="flex h-[min(48rem,calc(100dvh_-_8rem))] min-w-0 flex-col bg-surface-gray-1 text-ink-gray-8"
      >
        <header
          class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-outline-gray-2 p-3"
        >
          <button
            v-if="isMobileView && !categories"
            type="button"
            class="min-h-11 rounded px-3 focus-visible:ring-2"
            @click="categories = true"
          >
            {{ __('Back to settings') }}
          </button>
          <h1 v-else class="text-lg font-semibold">{{ __('Settings') }}</h1>
          <span
            v-if="session.dirty.value"
            class="text-sm text-ink-gray-6"
            role="status"
            >{{ __('Unsaved changes') }}</span
          >
          <button
            type="button"
            class="min-h-11 rounded border border-outline-gray-2 px-3 focus-visible:ring-2"
            @click="showSettings = false"
          >
            {{ __('Return to work') }}
          </button>
        </header>
        <p v-if="notice" role="alert" class="px-4 py-2 text-sm">{{ notice }}</p>
        <div class="flex min-h-0 min-w-0 flex-1">
          <nav
            v-show="!isMobileView || categories"
            :aria-label="__('Settings categories')"
            class="min-w-0 flex-1 overflow-y-auto p-2 md:w-56 md:flex-none"
          >
            <template v-for="group in tabs" :key="group.label">
              <h2
                v-if="!group.hideLabel"
                class="px-3 pb-1 pt-4 text-xs font-semibold text-ink-gray-6"
              >
                {{ group.label }}
              </h2>
              <button
                v-for="item in group.items"
                :key="item.label"
                type="button"
                class="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm focus-visible:ring-2"
                :class="
                  activeTab?.label === item.label
                    ? 'bg-surface-gray-3'
                    : 'hover:bg-surface-gray-2'
                "
                :aria-current="
                  activeTab?.label === item.label ? 'page' : undefined
                "
                :disabled="session.pending.value"
                @click="selectTab(item.label)"
              >
                <Icon :icon="item.icon" class="size-4 shrink-0" />
                <span class="min-w-0 break-words">{{ item.label }}</span>
              </button>
            </template>
            <div
              v-if="isAdmin() && marketingState !== 'present'"
              class="mt-4 rounded border border-outline-gray-2 p-3 text-sm"
              role="status"
            >
              <p v-if="marketingState === 'missing'">
                {{
                  __(
                    'Marketing and Social settings are unavailable because Marketing is not installed.',
                  )
                }}
              </p>
              <p v-else-if="marketingState === 'pending'">
                {{ __('Checking optional settings…') }}
              </p>
              <template v-else>
                <p>
                  {{
                    __(
                      'Optional settings could not be checked. Native CRM settings remain available.',
                    )
                  }}
                </p>
                <button
                  type="button"
                  class="mt-2 min-h-11 rounded border px-3 focus-visible:ring-2"
                  @click="loadCapabilities"
                >
                  {{ __('Retry') }}
                </button>
              </template>
            </div>
          </nav>
          <section
            v-show="!isMobileView || !categories"
            :aria-label="activeTab?.label"
            class="settings-content min-w-0 flex-1 overflow-y-auto bg-surface-elevation-2"
          >
            <KeepAlive>
              <component
                :is="activeTab.component"
                v-if="activeTab && (!isMobileView || !categories)"
                :key="activeTab.label"
              />
            </KeepAlive>
          </section>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import LucideLayoutDashboard from '~icons/lucide/layout-dashboard'
import LucideNetwork from '~icons/lucide/network'
import MonitorCogIcon from '~icons/lucide/monitor-cog'
import LucideTextCursorInput from '~icons/lucide/text-cursor-input'
import SlidersIcon from '@/components/Icons/SlidersIcon.vue'
import SparkleIcon from '@/components/Icons/SparkleIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import ERPNextIcon from '@/components/Icons/ERPNextIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import EmailTemplateIcon from '@/components/Icons/EmailTemplateIcon.vue'
import SettingsIcon from '@/components/Icons/SettingsIcon.vue'
import SettingsIcon2 from '@/components/Icons/SettingsIcon2.vue'
import Users from '@/components/Settings/Users.vue'
import Hierarchy from '@/components/Settings/Hierarchy/Hierarchy.vue'
import InviteUserPage from '@/components/Settings/InviteUserPage.vue'
import ProfilePage from '@/components/Settings/Profile/ProfilePage.vue'
import PreferencesSettings from '@/components/Settings/PreferencesSettings.vue'
import EffectiveSettings from '@/components/Settings/EffectiveSettings.vue'
import WhatsAppSettings from '@/components/Settings/WhatsAppSettings.vue'
import ERPNextSettings from '@/components/Settings/ERPNextSettings.vue'
import LeadSyncSourcePage from '@/components/Settings/LeadSyncing/LeadSyncSourcePage.vue'
import DefaultsSettings from '@/components/Settings/DefaultsSettings.vue'
import PipelineSettings from '@/components/Settings/PipelineSettings.vue'
import BrandSettings from '@/components/Settings/BrandSettings.vue'
import CalendarSettings from '@/components/Settings/CalendarSettings.vue'
import HomeActions from '@/components/Settings/HomeActions.vue'
import MarketingSettings from '@/components/Settings/MarketingSettings.vue'
import SocialSettings from '@/components/Settings/SocialSettings.vue'
import LucideMegaphone from '~icons/lucide/megaphone'
import FormsSettings from '@/components/Forms/FormsSettings.vue'
import GeneralSettings from '@/components/Settings/GeneralSettings.vue'
import DashboardSettings from '@/components/Settings/DashboardSettings.vue'
import EmailTemplatePage from '@/components/Settings/EmailTemplate/EmailTemplatePage.vue'
import TelephonyPage from '@/components/Settings/Telephony/TelephonyPage.vue'
import EmailConfig from '@/components/Settings/EmailConfig.vue'
import Icon from '@/components/Icon.vue'
import { usersStore } from '@/stores/users'
import {
  showSettings,
  activeSettingsPage,
  disableSettingModalOutsideClick,
  isMobileView,
  registerSettingsCloseGuard,
} from '@/composables/settings'
import { isWhatsappInstalled } from '@/composables/whatsapp'
import { Dialog, Avatar } from 'frappe-ui'
import { ref, markRaw, computed, watch, h, provide, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  addonAvailable,
  appState,
  loadCapabilities,
} from '@/utils/crmCapabilities'
import {
  createSettingsSession,
  SETTINGS_SESSION,
} from '@/composables/settingsSession'
import AssignmentRulePage from './AssignmentRules/AssignmentRulePage.vue'
import ShieldCheck from '~icons/lucide/shield-check'
import SlaConfig from './Sla/SlaConfig.vue'

const { isAdmin, isManager, getUser } = usersStore()

const user = computed(() => getUser() || {})

const tabs = computed(() => {
  let _tabs = [
    {
      label: __('User Configuration'),
      items: [
        {
          label: __('Profile'),
          icon: () =>
            h(Avatar, {
              size: 'xs',
              label: user.value.full_name,
              image: user.value.user_image,
            }),
          component: markRaw(ProfilePage),
        },
        {
          label: __('Preferences'),
          icon: SlidersIcon,
          component: markRaw(PreferencesSettings),
        },
      ],
    },
    {
      label: __('System Configuration'),
      items: [
        {
          label: __('Effective configuration'),
          component: markRaw(EffectiveSettings),
          icon: MonitorCogIcon,
        },
        {
          label: __('General'),
          component: markRaw(GeneralSettings),
          icon: SettingsIcon,
        },
        {
          label: __('Dashboard'),
          component: markRaw(DashboardSettings),
          icon: LucideLayoutDashboard,
        },
        {
          label: __('Sales pipelines'),
          component: markRaw(PipelineSettings),
          icon: LucideNetwork,
        },
        {
          label: __('Defaults'),
          component: markRaw(DefaultsSettings),
          icon: MonitorCogIcon,
        },
        {
          label: __('Brand'),
          icon: SparkleIcon,
          component: markRaw(BrandSettings),
        },
        {
          label: __('Calendar'),
          icon: CalendarIcon,
          component: markRaw(CalendarSettings),
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('User Management'),
      items: [
        {
          label: __('Users'),
          icon: 'user',
          component: markRaw(Users),
          condition: () => isManager(),
        },
        {
          label: __('Invite User'),
          icon: 'user-plus',
          component: markRaw(InviteUserPage),
          condition: () => isManager(),
        },
        {
          label: __('Sales Hierarchy'),
          icon: LucideNetwork,
          component: markRaw(Hierarchy),
          condition: () => isManager(),
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Email'),
      items: [
        {
          label: __('Accounts'),
          icon: Email2Icon,
          component: markRaw(EmailConfig),
          condition: () => isManager(),
        },
        {
          label: __('Templates'),
          icon: EmailTemplateIcon,
          component: markRaw(EmailTemplatePage),
        },
      ],
    },
    {
      label: __('Automation & Rules'),
      items: [
        {
          label: __('Assignment Rules'),
          icon: markRaw(h(SettingsIcon2, { class: 'rotate-90' })),
          component: markRaw(AssignmentRulePage),
        },
        {
          label: __('SLA Policies'),
          icon: markRaw(h(ShieldCheck)),
          component: markRaw(SlaConfig),
        },
        {
          label: __('Forms'),
          component: markRaw(FormsSettings),
          icon: markRaw(LucideTextCursorInput),
        },
        {
          // The channel ladder lives here: tier, shop number, event→action rules.
          // System Manager only — the doctype grants Sales Manager read but not
          // write, and an Update button that always 403s is worse than no tab.
          label: __('Marketing y canal'),
          component: markRaw(MarketingSettings),
          icon: markRaw(LucideMegaphone),
          condition: () => isAdmin() && addonAvailable.value,
        },
        {
          // Social calendar knobs: Holiday List (festivos = blackout), curated
          // blackouts, posting windows, brand voice. Doctype grants System
          // Manager + Marketing Manager write, so Update cannot 403 here.
          label: __('Social (redes)'),
          component: markRaw(SocialSettings),
          icon: 'share-2',
          condition: () => isAdmin() && addonAvailable.value,
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Customization'),
      items: [
        {
          label: __('Home Actions'),
          component: markRaw(HomeActions),
          icon: 'house',
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Integrations', null, 'FCRM'),
      items: [
        {
          label: __('Telephony'),
          icon: PhoneIcon,
          component: markRaw(TelephonyPage),
        },
        {
          label: __('WhatsApp'),
          icon: WhatsAppIcon,
          component: markRaw(WhatsAppSettings),
          condition: () => isWhatsappInstalled.value && isManager(),
        },
        {
          label: __('Inventory & Billing'),
          icon: ERPNextIcon,
          component: markRaw(ERPNextSettings),
          condition: () => isManager(),
        },
        {
          label: __('Lead Syncing'),
          icon: 'refresh-cw',
          component: markRaw(LeadSyncSourcePage),
          condition: () => isManager(),
        },
      ],
    },
  ]

  return _tabs.filter((tab) => {
    if (tab.condition && !tab.condition()) return false
    if (tab.items) {
      tab.items = tab.items.filter((item) => {
        if (item.condition && !item.condition()) return false
        return true
      })
    }
    return true
  })
})

const session = createSettingsSession()
provide(SETTINGS_SESSION, session)
const categories = ref(!activeSettingsPage.value)
const notice = ref('')
const activeTab = computed(
  () =>
    tabs.value
      .flatMap((group) => group.items)
      .find((item) => item.label === activeSettingsPage.value) ||
    tabs.value[0]?.items[0],
)
const marketingState = computed(() => appState('doco_marketing'))
loadCapabilities()

function selectTab(label) {
  if (session.pending.value) {
    notice.value = __(
      'Wait for the current save to finish. Your settings stay open.',
    )
    return
  }
  notice.value = ''
  activeSettingsPage.value = label
  categories.value = false
}
let restoringPage = false
watch(
  activeSettingsPage,
  (page, previous) => {
    if (restoringPage) return
    if (session.pending.value && page !== previous) {
      restoringPage = true
      activeSettingsPage.value = previous
      restoringPage = false
      notice.value = __(
        'Wait for the current save to finish. Your settings stay open.',
      )
    } else categories.value = false
  },
  { flush: 'sync' },
)

function canClose() {
  if (session.pending.value) {
    notice.value = __(
      'Wait for the current save to finish. Your settings stay open.',
    )
    return false
  }
  return session.canLeave(() =>
    window.confirm(__('Discard unsaved settings and return to your work?')),
  )
}
const removeCloseGuard = registerSettingsCloseGuard(canClose)
const removeRouteGuard = useRouter().beforeEach(() => {
  if (!showSettings.value) return true
  showSettings.value = false
  return !showSettings.value
})
function beforeUnload(event) {
  if (!session.dirty.value && !session.pending.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  removeCloseGuard()
  removeRouteGuard()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped>
@media (max-width: 767px) {
  .settings-content :deep(button),
  .settings-content :deep(select),
  .settings-content :deep(input:not([type='checkbox']):not([type='radio'])) {
    min-height: 2.75rem;
  }
  .settings-content :deep(.p-8) {
    padding: 1rem;
  }
}
</style>
