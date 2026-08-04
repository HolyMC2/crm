<!--
  Mobile drawer — reskinned to the DocoNavRail design language (green actives,
  ink/surface tokens) so mobile stops looking like the stock frappe sidebar.
  Adds what the old drawer was missing entirely on mobile: Settings (modal is
  mounted here — desktop mounts it in DocoNavRail), theme toggle, apps switcher
  (Desk + installed apps) and sign out. Nav items come from the shared navModel
  so desktop/mobile never drift.
-->
<template>
  <TransitionRoot :show="sidebarOpened">
    <Dialog as="div" class="fixed inset-0 z-40" :aria-label="__('Menú')" @close="sidebarOpened = false">
      <TransitionChild
        as="template"
        enter="transition ease-[cubic-bezier(.32,.72,0,1)] duration-200 transform"
        enter-from="-translate-x-full"
        enter-to="translate-x-0"
        leave="transition ease-in duration-200 transform"
        leave-from="translate-x-0"
        leave-to="-translate-x-full"
      >
        <div
          class="relative z-10 flex h-full w-[286px] flex-col border-r border-outline-gray-1 bg-surface-base pt-[env(safe-area-inset-top)]"
        >
          <!-- brand header -->
          <div class="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
            <div
              class="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[15px] font-bold text-white"
              style="background: var(--brand)"
            >
              {{ (brandName[0] || 'C').toUpperCase() }}
            </div>
            <span class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-gray-9">
              {{ brandName }}
            </span>
            <button
              class="press flex h-8 w-8 items-center justify-center rounded-lg text-ink-gray-5"
              :aria-label="__('Close menu')"
              @click="sidebarOpened = false"
            >
              <FeatherIcon name="x" class="h-4.5 w-4.5" />
            </button>
          </div>

          <!-- scrollable nav -->
          <div class="flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2">
            <!-- notifications -->
            <button
              id="notifications-btn"
              class="press mb-2 flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5"
              :class="rowClass('')"
              @click="go({ name: 'Notifications' })"
            >
              <NotificationsIcon class="h-[18px] w-[18px] flex-none" />
              <span class="flex-1 text-left text-[13.5px] font-medium">
                {{ __('Notifications') }}
              </span>
              <span
                v-if="unreadNotificationsCount"
                class="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-surface-red-1 px-1.5 text-[11px] font-bold text-ink-red-7"
              >
                {{ unreadNotificationsCount }}
              </span>
            </button>

            <!-- primary nav (shared model with DocoNavRail) -->
            <nav class="flex flex-col gap-0.5">
              <button
                v-for="item in primaryItems"
                :key="item.key"
                class="press flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5"
                :class="rowClass(item.group)"
                :aria-current="activeGroup === item.group ? 'page' : undefined"
                @click="go({ path: item.to })"
              >
                <component :is="item.icon" class="h-[18px] w-[18px] flex-none" />
                <span class="flex-1 truncate text-left text-[13.5px] font-medium">
                  {{ __(item.label) }}
                </span>
                <span
                  v-if="badgeFor(item.badge)"
                  class="flex h-5 min-w-5 flex-none items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                  :class="
                    item.badge === 'unread'
                      ? 'bg-surface-red-1 text-ink-red-7'
                      : 'bg-surface-amber-1 text-ink-amber-7'
                  "
                >
                  {{ badgeFor(item.badge) }}
                </span>
              </button>
            </nav>

            <!-- saved views -->
            <div v-for="view in savedViews" :key="view.name">
              <CollapsibleSection :label="view.name" :opened="view.opened">
                <template #header="{ opened, toggle }">
                  <button
                    class="mt-4 flex h-7 w-full cursor-pointer items-center gap-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-gray-5"
                    :aria-expanded="opened"
                    @click="toggle()"
                  >
                    <FeatherIcon
                      name="chevron-right"
                      class="h-3.5 w-3.5 transition-transform duration-200"
                      :class="{ 'rotate-90': opened }"
                    />
                    <span>{{ __(view.name) }}</span>
                  </button>
                </template>
                <nav class="flex flex-col gap-0.5">
                  <SidebarLink
                    v-for="link in view.views"
                    :key="link.label"
                    :icon="link.icon"
                    :label="__(link.label)"
                    :to="link.to"
                    class="press !h-9 rounded-[10px] px-0.5"
                  />
                </nav>
              </CollapsibleSection>
            </div>

            <!-- apps switcher -->
            <div class="mt-4 px-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-gray-5">
              {{ __('Apps') }}
            </div>
            <div class="mt-1.5 grid grid-cols-4 gap-1 px-0.5">
              <a
                v-for="app in apps.data || []"
                :key="app.name"
                :href="app.route"
                class="press flex flex-col items-center gap-1 rounded-[10px] px-1 py-2 hover:bg-surface-gray-2"
              >
                <img class="h-7 w-7 rounded-md" :src="app.logo" alt="" />
                <span class="w-full truncate text-center text-[10.5px] text-ink-gray-7">
                  {{ app.title }}
                </span>
              </a>
            </div>
          </div>

          <!-- utility footer -->
          <div class="flex-none border-t border-outline-gray-1 px-2.5 py-2">
            <button
              class="press flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-ink-gray-7 hover:bg-surface-gray-2"
              @click="openSettings"
            >
              <SettingsGearIcon class="h-[18px] w-[18px] flex-none" />
              <span class="flex-1 text-left text-[13.5px] font-medium">{{ __('Settings') }}</span>
            </button>
            <button
              class="press flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-ink-gray-7 hover:bg-surface-gray-2"
              @click="toggleDark"
            >
              <component :is="isDark ? SunIcon : MoonIcon" class="h-[18px] w-[18px] flex-none" />
              <span class="flex-1 text-left text-[13.5px] font-medium">
                {{ isDark ? __('Light mode') : __('Dark mode') }}
              </span>
              <span
                class="relative h-[18px] w-8 flex-none rounded-full transition-colors duration-200"
                :class="isDark ? 'bg-surface-green-7' : 'bg-surface-gray-4'"
              >
                <span
                  class="absolute top-[2px] h-3.5 w-3.5 rounded-full bg-surface-base transition-all duration-200"
                  :class="isDark ? 'left-[18px]' : 'left-[2px]'"
                />
              </span>
            </button>
            <!-- Web Push toggle (spec 1.1) — hidden when unsupported/unconfigured -->
            <button
              v-if="!['unsupported', 'unconfigured'].includes(pushState)"
              class="press flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-ink-gray-7 hover:bg-surface-gray-2"
              :disabled="pushBusy || pushState === 'denied'"
              :class="pushState === 'denied' ? 'opacity-50' : ''"
              @click="togglePush"
            >
              <BellRingIcon class="h-[18px] w-[18px] flex-none" />
              <span class="flex-1 text-left text-[13.5px] font-medium">
                {{ pushState === 'denied' ? __('Notificaciones bloqueadas') : __('Notificaciones push') }}
              </span>
              <span
                v-if="pushState !== 'denied'"
                class="relative h-[18px] w-8 flex-none rounded-full transition-colors duration-200"
                :class="pushState === 'on' ? 'bg-surface-green-7' : 'bg-surface-gray-4'"
              >
                <span
                  class="absolute top-[2px] h-3.5 w-3.5 rounded-full bg-surface-base transition-all duration-200"
                  :class="pushState === 'on' ? 'left-[18px]' : 'left-[2px]'"
                />
              </span>
            </button>
            <button
              class="press flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-ink-red-7 hover:bg-surface-red-1"
              @click="signOut"
            >
              <LogOutIcon class="h-[18px] w-[18px] flex-none" />
              <span class="flex-1 text-left text-[13.5px] font-medium">{{ __('Sign out') }}</span>
            </button>

            <!-- user card -->
            <div class="mt-1 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2">
              <span
                class="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-violet-2 text-[11px] font-semibold text-ink-violet-6"
              >
                <img
                  v-if="user.user_image"
                  :src="user.user_image"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <span v-else>{{ initials }}</span>
              </span>
              <div class="min-w-0">
                <div class="truncate text-[13px] font-semibold text-ink-gray-9">
                  {{ user.full_name || __('User') }}
                </div>
                <div class="truncate text-[11px] text-ink-gray-5">
                  {{ user.name }}
                </div>
              </div>
            </div>
          </div>

          <!-- Settings modal lives here on mobile (desktop mounts it in DocoNavRail) -->
          <Settings />
        </div>
      </TransitionChild>
      <TransitionChild
        as="template"
        enter="transition-opacity ease-linear duration-200"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity ease-linear duration-200"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <DialogOverlay class="fixed inset-0 bg-surface-gray-8 bg-opacity-50 backdrop-blur-[2px]" />
      </TransitionChild>
    </Dialog>
  </TransitionRoot>
</template>
<script setup>
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogOverlay,
} from '@headlessui/vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import PinIcon from '@/components/Icons/PinIcon.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import NotificationsIcon from '@/components/Icons/NotificationsIcon.vue'
import SidebarLink from '@/components/SidebarLink.vue'
import Settings from '@/components/Settings/Settings.vue'
import { viewsStore } from '@/stores/views'
import { unreadNotificationsCount } from '@/stores/notifications'
import { navItems, navItemsBottom, routeGroup } from '@/composables/navModel'
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FeatherIcon, createResource, useTheme } from 'frappe-ui'
import { mobileSidebarOpened as sidebarOpened, showSettings } from '@/composables/settings'
import { sessionStore } from '@/stores/session'
import { usersStore } from '@/stores/users'
import { getSettings } from '@/stores/settings'
import SettingsGearIcon from '~icons/lucide/settings'
import LogOutIcon from '~icons/lucide/log-out'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'
import BellRingIcon from '~icons/lucide/bell-ring'
import { pushState, pushBusy, refreshPushState, enablePush, disablePush } from '@/composables/push'

const route = useRoute()
const router = useRouter()
const { getPinnedViews, getPublicViews } = viewsStore()
const { logout } = sessionStore()
const { getUser } = usersStore()
const { brand } = getSettings()
const { setTheme } = useTheme()

const user = computed(() => getUser() || {})
const brandName = computed(() => brand?.value?.name || 'CRM')
const initials = computed(() => {
  const n = (user.value.full_name || '').trim()
  if (!n) return '?'
  const parts = n.split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})

const primaryItems = [...navItems, ...navItemsBottom]
const activeGroup = computed(() => routeGroup(route.path))

function rowClass(group) {
  return group && activeGroup.value === group
    ? 'bg-surface-green-2 text-ink-green-7'
    : 'text-ink-gray-7 hover:bg-surface-gray-2'
}

function go(to) {
  sidebarOpened.value = false
  router.push(to)
}

function openSettings() {
  sidebarOpened.value = false
  showSettings.value = true
}

function signOut() {
  sidebarOpened.value = false
  logout.submit()
}

// ── web push (spec 1.1) ────────────────────────────────────────────────────
onMounted(refreshPushState)
function togglePush() {
  if (pushState.value === 'on') disablePush()
  else enablePush() // user gesture — permission prompt allowed here
}

// ── theme ──────────────────────────────────────────────────────────────────
// useTheme()'s internal ref starts at 'light' regardless of what's applied, so
// track the applied theme ourselves from the html[data-theme] attribute.
const isDark = ref(
  document.documentElement.getAttribute('data-theme') === 'dark',
)
function toggleDark() {
  const next = isDark.value ? 'light' : 'dark'
  setTheme(next)
  isDark.value = next === 'dark'
}

// ── badges (same endpoint the desktop rail uses) ───────────────────────────
const badges = createResource({
  url: 'doco_marketing.api.shell.get_badge_counts',
  cache: 'shellBadgeCounts',
  auto: true,
})
function badgeFor(kind) {
  if (!kind) return 0
  const d = badges.data || {}
  if (kind === 'unread') return d.unread_messages
  if (kind === 'pending') return d.pending_reviews
  return d.overdue_tasks
}

// ── apps switcher (Desk + installed apps; same source as desktop Apps.vue) ──
const apps = createResource({
  url: 'frappe.apps.get_apps',
  cache: 'apps',
  auto: true,
  transform: (data) => {
    let _apps = [
      {
        name: 'frappe',
        logo: '/assets/frappe/images/framework.png',
        title: __('Desk'),
        route: '/app',
      },
    ]
    ;(data || []).forEach((app) => {
      if (app.name === 'crm') return
      _apps.push({
        name: app.name,
        logo: app.logo,
        title: __(app.title),
        route: app.route,
      })
    })
    return _apps
  },
})

// ── saved views (public + pinned), unchanged from the old drawer ───────────
const savedViews = computed(() => {
  let _views = []
  if (getPublicViews().length) {
    _views.push({
      name: 'Public Views',
      opened: true,
      views: parseView(getPublicViews()),
    })
  }
  if (getPinnedViews().length) {
    _views.push({
      name: 'Pinned Views',
      opened: true,
      views: parseView(getPinnedViews()),
    })
  }
  return _views
})

function parseView(views) {
  return views.map((view) => {
    return {
      label: view.label,
      icon: getIcon(view.route_name, view.icon),
      to: {
        name: view.route_name,
        params: { viewType: view.type || 'list' },
        query: { view: view.name },
      },
    }
  })
}

function getIcon(routeName, icon) {
  if (icon) return h('div', { class: 'size-auto' }, icon)
  switch (routeName) {
    case 'Leads':
      return LeadsIcon
    case 'Deals':
      return DealsIcon
    case 'Contacts':
      return ContactsIcon
    case 'Organizations':
      return OrganizationsIcon
    case 'Notes':
      return NoteIcon
    case 'Call Logs':
      return PhoneIcon
    default:
      return PinIcon
  }
}
</script>
