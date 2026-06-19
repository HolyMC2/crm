<!--
  DocoNavRail — 58px icon rail that replaces AppSidebar in the FCRM redesign.
  Phase 1 of the new-look shell. Self-contained: still mounts the Notifications
  panel + Settings modal (as AppSidebar did) so swapping it in loses nothing.
  Spec: handoff/README.md §4.1–4.2. AppSidebar.vue is intentionally left in place
  (unused) to keep the upstream fork rebase-clean.
-->
<template>
  <div
    class="flex h-full w-[58px] flex-none flex-col items-center gap-1 border-r border-outline-gray-1 bg-surface-white py-3"
  >
    <!-- logo mark -->
    <div
      class="mb-2.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[15px] font-bold text-white"
      style="background: #16a34a"
    >
      C
    </div>

    <!-- primary nav -->
    <Tooltip
      v-for="item in navItems"
      :key="item.key"
      :text="__(item.label)"
      placement="right"
    >
      <button
        class="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors"
        :class="
          activeGroup === item.group
            ? ''
            : 'text-ink-gray-4 hover:bg-surface-gray-2'
        "
        :style="
          activeGroup === item.group
            ? 'background:#eaf6ee;color:#16a34a'
            : ''
        "
        @click="go(item.to)"
      >
        <component :is="item.icon" class="h-[18px] w-[18px]" />
        <span
          v-if="item.badge && badgeFor(item.badge)"
          class="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full"
          :style="`background:${item.badge === 'unread' ? '#e5484d' : '#d9930b'};border:1.5px solid #fbfcfc`"
        />
      </button>
    </Tooltip>

    <!-- separator -->
    <div class="my-1 h-[18px] w-px bg-outline-gray-1" />

    <!-- secondary nav -->
    <Tooltip
      v-for="item in navItemsBottom"
      :key="item.key"
      :text="__(item.label)"
      placement="right"
    >
      <button
        class="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors"
        :class="
          activeGroup === item.group
            ? ''
            : 'text-ink-gray-4 hover:bg-surface-gray-2'
        "
        :style="
          activeGroup === item.group
            ? 'background:#eaf6ee;color:#16a34a'
            : ''
        "
        @click="go(item.to)"
      >
        <component :is="item.icon" class="h-[18px] w-[18px]" />
      </button>
    </Tooltip>

    <!-- notifications bell (panel mounted below; toggled via notificationsStore) -->
    <Tooltip :text="__('Notifications')" placement="right">
      <button
        class="relative mt-auto flex h-[38px] w-[38px] items-center justify-center rounded-[9px] text-ink-gray-4 transition-colors hover:bg-surface-gray-2"
        :aria-label="__('Notifications')"
        @click="toggleNotifications()"
      >
        <NotificationsIcon class="h-[18px] w-[18px]" />
        <span
          v-if="unreadNotificationsCount"
          class="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full"
          style="background: #e5484d; border: 1.5px solid #fbfcfc"
        />
      </button>
    </Tooltip>

    <!-- avatar → profile panel -->
    <button
      class="mt-1 flex h-[30px] w-[30px] flex-none items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white transition-opacity hover:opacity-80"
      style="background: #c98bdb"
      @click="showProfile = !showProfile"
    >
      <img
        v-if="user.user_image"
        :src="user.user_image"
        class="h-full w-full object-cover"
      />
      <span v-else>{{ initials }}</span>
    </button>

    <!-- profile panel popup (spec §4.2) -->
    <template v-if="showProfile">
      <div class="fixed inset-0 z-[290]" @click="showProfile = false" />
      <div
        class="fixed bottom-[72px] left-2.5 z-[300] w-[242px] overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-white"
        style="box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14)"
      >
        <!-- header -->
        <div class="border-b border-outline-gray-1 p-4 pb-3">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-[38px] w-[38px] flex-none items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white"
              style="background: #c98bdb"
            >
              <img
                v-if="user.user_image"
                :src="user.user_image"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ initials }}</span>
            </div>
            <div class="min-w-0">
              <div class="truncate text-[13.5px] font-bold text-ink-gray-9">
                {{ user.full_name || __('User') }}
              </div>
              <div class="truncate text-[11.5px] text-ink-gray-5">
                {{ subline }}
              </div>
            </div>
          </div>
        </div>
        <!-- links -->
        <div class="py-1.5">
          <button
            v-for="link in profileLinks"
            :key="link.label"
            class="flex w-full items-center gap-2.5 px-3.5 py-[9px] text-left text-[13px] text-ink-gray-8 hover:bg-surface-gray-2"
            @click="link.onClick"
          >
            <component :is="link.icon" class="h-4 w-4 text-ink-gray-6" />
            {{ __(link.label) }}
          </button>
        </div>
        <!-- sign out -->
        <div class="border-t border-outline-gray-1 py-1.5">
          <button
            class="flex w-full items-center gap-2.5 px-3.5 py-[9px] text-left text-[13px] hover:bg-surface-red-1"
            style="color: #e5484d"
            @click="signOut"
          >
            <LogOutIcon class="h-4 w-4" />
            {{ __('Sign out') }}
          </button>
        </div>
      </div>
    </template>

    <!-- carried over from AppSidebar: these must still mount somewhere -->
    <Notifications />
    <Settings />
  </div>
</template>

<script setup>
import Notifications from '@/components/Notifications.vue'
import Settings from '@/components/Settings/Settings.vue'
import NotificationsIcon from '@/components/Icons/NotificationsIcon.vue'
import { sessionStore } from '@/stores/session'
import { usersStore } from '@/stores/users'
import { getSettings } from '@/stores/settings'
import { showSettings } from '@/composables/settings'
import { unreadNotificationsCount, notificationsStore } from '@/stores/notifications'
import { Tooltip, createResource } from 'frappe-ui'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DashboardIcon from '~icons/lucide/layout-dashboard'
import LeadsIcon from '~icons/lucide/users'
import InboxIcon from '~icons/lucide/messages-square'
import CampaignsIcon from '~icons/lucide/megaphone'
import CallsIcon from '~icons/lucide/phone'
import TasksIcon from '~icons/lucide/square-check-big'
import ReportsIcon from '~icons/lucide/bar-chart-3'
import ScoreRulesIcon from '~icons/lucide/sliders-horizontal'
import WebshopIcon from '~icons/lucide/shopping-cart'
import SettingsGearIcon from '~icons/lucide/settings'
import LogOutIcon from '~icons/lucide/log-out'

const route = useRoute()
const router = useRouter()
const { logout } = sessionStore()
const { getUser } = usersStore()
const { toggle: toggleNotifications } = notificationsStore()
const { brand } = getSettings()

const user = computed(() => getUser() || {})
const showProfile = ref(false)

const initials = computed(() => {
  const n = (user.value.full_name || '').trim()
  if (!n) return '?'
  const parts = n.split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})

const subline = computed(() => {
  const role = user.value.role
  const company = brand?.value?.name
  return [role, company].filter(Boolean).join(' · ') || user.value.name || ''
})

// ── nav model ──────────────────────────────────────────────────────────────
const navItems = [
  { key: 'dashboard', icon: DashboardIcon, label: 'Dashboard', to: '/dashboard', group: 'dashboard' },
  { key: 'leads', icon: LeadsIcon, label: 'Leads', to: '/leads', group: 'leads' },
  { key: 'inbox', icon: InboxIcon, label: 'Inbox', to: '/inbox', group: 'inbox', badge: 'unread' },
  { key: 'campaigns', icon: CampaignsIcon, label: 'Campaigns', to: '/campaigns', group: 'campaigns' },
  { key: 'calls', icon: CallsIcon, label: 'Calls', to: '/call-logs', group: 'calls' },
  { key: 'tasks', icon: TasksIcon, label: 'Tasks', to: '/tasks', group: 'tasks', badge: 'overdue' },
  { key: 'reports', icon: ReportsIcon, label: 'Reports', to: '/reports', group: 'reports' },
]
const navItemsBottom = [
  { key: 'score-rules', icon: ScoreRulesIcon, label: 'Score Rules', to: '/score-rules', group: 'score-rules' },
  { key: 'webshop', icon: WebshopIcon, label: 'Webshop', to: '/webshop', group: 'webshop' },
]

// active-group mapping — handoff §4.1. A route path lights exactly one icon.
function routeGroup(path) {
  if (/^\/(inbox|deals)(\/|$)/.test(path)) return 'inbox'
  if (/^\/campaigns(\/|$)/.test(path)) return 'campaigns'
  if (/^\/(leads|pipeline|calendar|stage-scripts|enrichment|pipeline-analysis)(\/|$)/.test(path))
    return 'leads'
  if (/^\/dashboard(\/|$)/.test(path)) return 'dashboard'
  if (/^\/call-logs(\/|$)/.test(path)) return 'calls'
  if (/^\/tasks(\/|$)/.test(path)) return 'tasks'
  if (/^\/reports(\/|$)/.test(path)) return 'reports'
  if (/^\/score-rules(\/|$)/.test(path)) return 'score-rules'
  if (/^\/webshop(\/|$)/.test(path)) return 'webshop'
  return ''
}
const activeGroup = computed(() => routeGroup(route.path))

function go(to) {
  showProfile.value = false
  if (route.path !== to) router.push(to)
}

// ── badges ───────────────────────────────────────────────────────────────
const badges = createResource({
  url: 'doco_marketing.api.shell.get_badge_counts',
  auto: true,
})
function badgeFor(kind) {
  const d = badges.data || {}
  return kind === 'unread' ? d.unread_messages : d.overdue_tasks
}
// refresh on navigation — cheap, keeps counts current as the user moves around.
// (Realtime socket push is a Phase-2 upgrade; see ScheduleWakeup note in PR.)
watch(() => route.path, () => badges.reload())

// ── profile panel ──────────────────────────────────────────────────────────
const profileLinks = [
  { label: 'Dashboard', icon: DashboardIcon, onClick: () => go('/dashboard') },
  { label: 'Score Rules', icon: ScoreRulesIcon, onClick: () => go('/score-rules') },
  {
    label: 'Settings',
    icon: SettingsGearIcon,
    onClick: () => {
      showProfile.value = false
      showSettings.value = true
    },
  },
]

function signOut() {
  showProfile.value = false
  logout.submit()
}
</script>
