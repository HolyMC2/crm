<!--
  DocoNavRail — 58px icon rail that replaces AppSidebar in the FCRM redesign.
  Phase 1 of the new-look shell. Self-contained: still mounts the Notifications
  panel + Settings modal (as AppSidebar did) so swapping it in loses nothing.
  Spec: handoff/README.md §4.1–4.2. AppSidebar.vue is intentionally left in place
  (unused) to keep the upstream fork rebase-clean.
-->
<template>
  <div
    class="relative flex h-full flex-none flex-col gap-1 border-r border-outline-gray-1 bg-surface-base py-3 transition-all duration-200"
    :class="isExpanded ? 'w-[210px] items-stretch px-2' : 'w-[58px] items-center'"
  >
    <!-- Notifications slide-out panel. Mounted FIRST so its absolute box
         (top:auto → static position) anchors at the rail's top, then opens to
         the right via left:calc(100%+1px). The rail being `relative` is what
         scopes that offset to the 58/210px rail instead of the viewport. -->
    <Notifications />

    <!-- logo mark -->
    <div
      class="mb-2.5 flex items-center gap-2.5"
      :class="isExpanded ? 'px-1.5' : ''"
    >
      <div
        class="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[15px] font-bold text-white"
        style="background: var(--brand)"
      >
        C
      </div>
      <span
        v-if="isExpanded"
        class="truncate text-[15px] font-bold text-ink-gray-9"
      >
        {{ brandName }}
      </span>
    </div>

    <!-- primary nav -->
    <Tooltip
      v-for="item in navItems"
      :key="item.key"
      :text="isExpanded ? '' : __(item.label)"
      placement="right"
    >
      <button
        class="relative flex h-[38px] items-center rounded-[9px] transition-colors"
        :class="[
          isExpanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-[38px] justify-center',
          activeGroup === item.group
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'text-ink-gray-4 hover:bg-surface-gray-2',
        ]"
        @click="go(item.to)"
      >
        <component :is="item.icon" class="h-[18px] w-[18px] flex-none" />
        <span v-if="isExpanded" class="truncate text-[13px] font-medium">
          {{ __(item.label) }}
        </span>
        <span
          v-if="item.badge && badgeFor(item.badge)"
          class="absolute h-[7px] w-[7px] rounded-full"
          :class="isExpanded ? 'right-2 top-1/2 -translate-y-1/2' : 'right-1.5 top-1.5'"
          :style="`background:${item.badge === 'unread' ? '#e5484d' : '#d9930b'};border:1.5px solid var(--surface-base)`"
        />
      </button>
    </Tooltip>

    <!-- separator -->
    <div
      class="my-1 h-px bg-outline-gray-1"
      :class="isExpanded ? 'w-full' : 'w-[18px]'"
    />

    <!-- secondary nav -->
    <Tooltip
      v-for="item in navItemsBottom"
      :key="item.key"
      :text="isExpanded ? '' : __(item.label)"
      placement="right"
    >
      <button
        class="relative flex h-[38px] items-center rounded-[9px] transition-colors"
        :class="[
          isExpanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-[38px] justify-center',
          activeGroup === item.group
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'text-ink-gray-4 hover:bg-surface-gray-2',
        ]"
        @click="go(item.to)"
      >
        <component :is="item.icon" class="h-[18px] w-[18px] flex-none" />
        <span v-if="isExpanded" class="truncate text-[13px] font-medium">
          {{ __(item.label) }}
        </span>
      </button>
    </Tooltip>

    <!-- notifications bell (panel mounted below; toggled via notificationsStore) -->
    <Tooltip :text="isExpanded ? '' : __('Notifications')" placement="right">
      <button
        class="relative mt-auto flex h-[38px] items-center rounded-[9px] text-ink-gray-4 transition-colors hover:bg-surface-gray-2"
        :class="isExpanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-[38px] justify-center'"
        :aria-label="__('Notifications')"
        @click="toggleNotifications()"
      >
        <NotificationsIcon class="h-[18px] w-[18px] flex-none" />
        <span v-if="isExpanded" class="truncate text-[13px] font-medium">
          {{ __('Notifications') }}
        </span>
        <span
          v-if="unreadNotificationsCount"
          class="absolute h-[7px] w-[7px] rounded-full"
          :class="isExpanded ? 'right-2 top-1/2 -translate-y-1/2' : 'right-1.5 top-1.5'"
          style="background: #e5484d; border: 1.5px solid var(--surface-base)"
        />
      </button>
    </Tooltip>

    <!-- avatar → profile panel -->
    <button
      class="mt-1 flex items-center rounded-[9px] transition-colors hover:bg-surface-gray-2"
      :class="isExpanded ? 'w-full justify-start gap-2.5 px-2 py-1' : 'w-[38px] justify-center'"
      @click="showProfile = !showProfile"
    >
      <span
        class="flex h-[30px] w-[30px] flex-none items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold bg-surface-violet-2 text-ink-violet-8"
      >
        <img
          v-if="user.user_image"
          :src="user.user_image"
          class="h-full w-full object-cover"
        />
        <span v-else>{{ initials }}</span>
      </span>
      <span
        v-if="isExpanded"
        class="truncate text-[13px] font-medium text-ink-gray-8"
      >
        {{ user.full_name || __('User') }}
      </span>
    </button>

    <!-- collapse / expand toggle -->
    <Tooltip :text="isExpanded ? '' : __('Expand')" placement="right">
      <button
        class="mt-1 flex h-[34px] items-center rounded-[9px] text-ink-gray-4 transition-colors hover:bg-surface-gray-2"
        :class="isExpanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-[38px] justify-center'"
        :aria-label="isExpanded ? __('Collapse sidebar') : __('Expand sidebar')"
        @click="isExpanded = !isExpanded"
      >
        <component
          :is="isExpanded ? ChevronsLeftIcon : ChevronsRightIcon"
          class="h-[18px] w-[18px] flex-none"
        />
        <span v-if="isExpanded" class="truncate text-[13px] font-medium">
          {{ __('Collapse') }}
        </span>
      </button>
    </Tooltip>

    <!-- profile panel popup (spec §4.2) -->
    <template v-if="showProfile">
      <div class="fixed inset-0 z-[290]" @click="showProfile = false" />
      <div
        class="fixed bottom-[72px] left-2.5 z-[300] w-[242px] overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base"
        style="box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14)"
      >
        <!-- header -->
        <div class="border-b border-outline-gray-1 p-4 pb-3">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-[38px] w-[38px] flex-none items-center justify-center overflow-hidden rounded-full text-sm-semibold bg-surface-violet-2 text-ink-violet-8"
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
            class="flex w-full items-center gap-2.5 px-3.5 py-[9px] text-left text-[13px] text-ink-red-8 hover:bg-surface-red-1"
            @click="signOut"
          >
            <LogOutIcon class="h-4 w-4" />
            {{ __('Sign out') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Settings modal (teleported; position-independent) -->
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
import { useStorage } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DashboardIcon from '~icons/lucide/layout-dashboard'
import ScoreRulesIcon from '~icons/lucide/sliders-horizontal'
import SettingsGearIcon from '~icons/lucide/settings'
import LogOutIcon from '~icons/lucide/log-out'
import ChevronsLeftIcon from '~icons/lucide/chevrons-left'
import ChevronsRightIcon from '~icons/lucide/chevrons-right'
// shared with the mobile drawer so the two navs never drift (see navModel.js)
import { navItems, navItemsBottom, routeGroup } from '@/composables/navModel'

const route = useRoute()
const router = useRouter()
const { logout } = sessionStore()
const { getUser } = usersStore()
const { toggle: toggleNotifications } = notificationsStore()
const { brand } = getSettings()

const user = computed(() => getUser() || {})
const showProfile = ref(false)

// expand ↔ collapse the rail (icons-only ⇄ icons+labels), persisted per browser.
const isExpanded = useStorage('doco-nav-expanded', false)
const brandName = computed(() => brand?.value?.name || 'CRM')

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

// nav model (navItems / navItemsBottom / routeGroup) lives in navModel.js, shared
// with the mobile drawer. active-group mapping — handoff §4.1: one path → one icon.
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
  if (kind === 'unread') return d.unread_messages
  if (kind === 'pending') return d.pending_reviews
  return d.overdue_tasks
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
