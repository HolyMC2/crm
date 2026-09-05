<!-- eslint-disable vue/no-v-html -->
<template>
  <!-- desk: 400px slide-out beside the rail; phone: full-screen sheet (a fixed
       400px box ran OFF a 390px viewport — unclosable, content clipped) -->
  <div
    v-if="visible"
    ref="target"
    class="z-20 bg-surface-base transition-all duration-300 ease-in-out"
    :class="isMobile ? 'fixed inset-0 w-screen' : 'absolute h-screen'"
    :style="
      isMobile
        ? {}
        : {
            'box-shadow': '8px 0px 8px rgba(0, 0, 0, 0.1)',
            'max-width': '400px',
            'min-width': '400px',
            left: 'calc(100% + 1px)',
          }
    "
  >
    <div class="flex h-screen flex-col text-ink-gray-9">
      <div class="flex justify-between items-center">
        <div class="text-lg-medium text-ink-gray-8 px-4 pt-[15px] pb-3">
          {{ __('Notifications') }}
        </div>
        <div class="flex gap-1 mr-3">
          <Button
            v-if="activeTab != 'events' && filtered.length"
            :tooltip="__('Mark all as read')"
            :icon="MarkAsDoneIcon"
            variant="ghost"
            @click="markAllAsRead"
          />
          <Button :tooltip="__('Cerrar')" icon="x" variant="ghost" @click="toggle()" />
        </div>
      </div>
      <TabButtons
        v-model="activeTab"
        :buttons="tabs"
        class="flex px-4 py-0.5 [&_button]:w-full [&_div]:w-full [&_button>span]:w-full"
      />
      <div v-if="activeTab != 'events'" class="flex h-full">
        <div
          v-if="filtered.length"
          class="divide-y divide-outline-elevation-2 overflow-auto text-base"
        >
          <RouterLink
            v-for="n in filtered"
            :key="n.comment"
            :to="getRoute(n)"
            class="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 hover:bg-surface-gray-2"
            @click="openNotification(n)"
          >
            <div class="mt-1 flex items-center gap-2.5">
              <div
                class="size-[5px] rounded-full"
                :class="[n.read ? 'bg-transparent' : 'bg-surface-gray-10']"
              />
              <WhatsAppIcon v-if="n.type == 'WhatsApp'" class="size-7" />
              <UserAvatar v-else :user="n.from_user.name" size="lg" />
            </div>
            <div>
              <div
                v-if="n.notification_text"
                v-html="sanitizeHTML(n.notification_text)"
              />
              <div v-else class="mb-2 space-x-1 leading-5 text-ink-gray-5">
                <span class="font-medium text-ink-gray-9">
                  {{ n.from_user.full_name }}
                </span>
                <span>
                  {{ __('mentioned you in {0}', [n.reference_doctype]) }}
                </span>
                <span class="font-medium text-ink-gray-9">
                  {{ n.reference_name }}
                </span>
              </div>
              <div class="text-sm text-ink-gray-5">
                {{ __(timeAgo(n.creation)) }}
              </div>
            </div>
          </RouterLink>
        </div>
        <EmptyState
          v-else
          title="No New Notifications"
          description="You have no new notifications"
          :icon="NotificationsIcon"
          width="lg"
        />
      </div>
      <div v-else class="flex h-full">
        <EventNotificationsArea />
      </div>
    </div>
  </div>
</template>
<script setup>
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import MarkAsDoneIcon from '@/components/Icons/MarkAsDoneIcon.vue'
import NotificationsIcon from '@/components/Icons/NotificationsIcon.vue'
import EventNotificationsArea from '@/components/EventNotificationsArea.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  visible,
  notifications,
  notificationsStore,
} from '@/stores/notifications'
import { useEventNotificationAlert } from '@/data/notifications'
import { globalStore } from '@/stores/global'
import { timeAgo, sanitizeHTML } from '@/utils'
import { onClickOutside } from '@vueuse/core'
import { useTelemetry } from 'frappe-ui/frappe'
import { TabButtons } from 'frappe-ui'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { isMobile } from '@/composables/breakpoint'

const { $socket } = globalStore()
const { mark_as_read, toggle, mark_doc_as_read } = notificationsStore()
const { handleEventNotification } = useEventNotificationAlert()
const { capture } = useTelemetry()

const activeTab = ref('all')
// per-type tabs with live unread counts — 300+ WhatsApp pings were burying the
// Assignment/Mention rows in one flat list
const TAB_TYPE = { whatsapp: 'WhatsApp', assignment: 'Assignment', mention: 'Mention' }
const tabs = computed(() => {
  const data = notifications.data || []
  const unread = (t) => data.filter((n) => !n.read && n.type === t).length
  const withCount = (base, t) => {
    const c = unread(t)
    return c ? `${base} · ${c}` : base
  }
  return [
    { label: __('Todas'), value: 'all' },
    { label: withCount('WhatsApp', 'WhatsApp'), value: 'whatsapp' },
    { label: withCount(__('Asignación'), 'Assignment'), value: 'assignment' },
    { label: withCount(__('Mención'), 'Mention'), value: 'mention' },
    { label: __('Events'), value: 'events' },
  ]
})
const filtered = computed(() => {
  const data = notifications.data || []
  const t = TAB_TYPE[activeTab.value]
  return t ? data.filter((n) => n.type === t) : data
})

// opening a notification CLOSES the panel — it used to stay on top of the very
// page the click navigated to (on phone it covered the whole screen: «no abre»)
function openNotification(n) {
  markAsRead(n.comment || n.notification_type_doc)
  toggle()
}

const target = ref(null)
onClickOutside(
  target,
  () => {
    if (visible.value) toggle()
  },
  {
    ignore: ['#notifications-btn'],
  },
)

function markAsRead(doc) {
  capture('notification_mark_as_read')
  mark_doc_as_read(doc)
}

function markAllAsRead() {
  capture('notification_mark_all_as_read')
  mark_as_read.reload()
}

onBeforeUnmount(() => {
  $socket.off('crm_notification')
  $socket.off('event_notification')
})

onMounted(() => {
  $socket.on('crm_notification', () => notifications.reload())
  $socket.on('event_notification', (data) => handleEventNotification(data))
})

function getRoute(notification) {
  let params = {
    leadId: notification.reference_name,
  }
  if (notification.route_name === 'Deal') {
    params = {
      dealId: notification.reference_name,
    }
  }

  return {
    name: notification.route_name,
    params: params,
    hash: notification.hash,
  }
}
</script>
