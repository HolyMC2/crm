<!--
  Bottom tab bar (mobile shell) — native-app primary nav: Inbox / Leads / Deals /
  Tasks / Más (opens the drawer for everything else). Green actives via the shared
  routeGroup, badge counts from the same shell endpoint as rail + drawer.
  Hidden while the on-screen keyboard is up (visualViewport shrink) and inside the
  inbox/deal drill-down panes (thread/context) where the ← back flow rules.
-->
<template>
  <nav
    v-show="visible"
    class="flex flex-none items-stretch border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    :aria-label="__('Navegación principal')"
  >
    <button
      v-for="t in tabs"
      :key="t.key"
      class="press relative flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5"
      :class="isActive(t) ? 'text-ink-green-8' : 'text-ink-gray-5'"
      :aria-label="__(t.label)"
      :aria-current="isActive(t) ? 'page' : undefined"
      @click="onTab(t)"
    >
      <span class="relative">
        <component :is="t.icon" class="h-[21px] w-[21px]" />
        <span
          v-if="t.badge && badgeFor(t.badge)"
          class="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-bold"
          :class="t.badge === 'unread' ? 'bg-surface-red-7 text-ink-red-1' : 'bg-surface-amber-2 text-ink-amber-8'"
        >
          {{ badgeFor(t.badge) > 99 ? '99+' : badgeFor(t.badge) }}
        </span>
      </span>
      <span class="text-[10px] font-semibold leading-none">{{ __(t.label) }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createResource } from 'frappe-ui'
import { routeGroup } from '@/composables/navModel'
import { mobileView } from '@/composables/inbox'
import { mobileSidebarOpened } from '@/composables/settings'
import InboxIcon from '~icons/lucide/messages-square'
import LeadsIcon from '~icons/lucide/users'
import DealsIcon from '~icons/lucide/handshake'
import TasksIcon from '~icons/lucide/square-check-big'
import MoreIcon from '~icons/lucide/menu'

const route = useRoute()
const router = useRouter()

const tabs = [
  { key: 'inbox', icon: InboxIcon, label: 'Inbox', to: '/inbox', group: 'inbox', badge: 'unread' },
  { key: 'leads', icon: LeadsIcon, label: 'Leads', to: '/leads', group: 'leads' },
  { key: 'deals', icon: DealsIcon, label: 'Deals', to: '/deals', group: 'deals' },
  { key: 'tasks', icon: TasksIcon, label: 'Tasks', to: '/tasks', group: 'tasks', badge: 'overdue' },
  { key: 'more', icon: MoreIcon, label: 'Más' },
]

const activeGroup = computed(() => routeGroup(route.path))
function isActive(t) {
  return t.group && activeGroup.value === t.group
}
function onTab(t) {
  try {
    navigator.vibrate?.(8) // subtle tick on tab switch (Android)
  } catch (e) {}
  if (!t.to) {
    mobileSidebarOpened.value = true
    return
  }
  if (route.path !== t.to) router.push(t.to)
}

// ── visibility ─────────────────────────────────────────────────────────────
// Drill-down panes: the inbox + deal 360° set mobileView to thread/context;
// there the conversation owns the whole screen (WhatsApp-style) and back is ←.
const inDrillDown = computed(
  () =>
    (/^\/(inbox|deal\/)/.test(route.path)) && mobileView.value !== 'list',
)
// On-screen keyboard: visualViewport shrinks well below the layout viewport.
const keyboardOpen = ref(false)
let vv = null
function onVvResize() {
  keyboardOpen.value = vv ? vv.height < window.innerHeight * 0.75 : false
}
onMounted(() => {
  vv = window.visualViewport
  vv?.addEventListener('resize', onVvResize)
})
onBeforeUnmount(() => vv?.removeEventListener('resize', onVvResize))

const visible = computed(() => !inDrillDown.value && !keyboardOpen.value)

// ── badges (shared cache with drawer/rail) ─────────────────────────────────
const badges = createResource({
  url: 'doco_marketing.api.shell.get_badge_counts',
  cache: 'shellBadgeCounts',
  auto: true,
})
function badgeFor(kind) {
  const d = badges.data || {}
  if (kind === 'unread') return d.unread_messages
  if (kind === 'pending') return d.pending_reviews
  return d.overdue_tasks
}
</script>
