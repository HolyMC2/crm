<template>
  <!-- The CRM bell (rail, sidebar) opens Avisos: one grouped stream with
       owner links. Calendar reminders stay as a section of the same panel. -->
  <AvisosPanel v-model:open="visible">
    <section
      v-if="events?.length"
      class="border-t border-outline-gray-1"
      :aria-label="__('Event reminders')"
    >
      <h3 class="px-4 pt-3 text-sm font-semibold text-ink-gray-7">
        {{ __('Event reminders') }}
      </h3>
      <EventNotificationsArea />
    </section>
  </AvisosPanel>
</template>
<script setup>
import AvisosPanel from '@/components/avisos/AvisosPanel.vue'
import EventNotificationsArea from '@/components/EventNotificationsArea.vue'
import { visible } from '@/stores/notifications'
import {
  useEventNotificationAlert,
  useEventNotifications,
} from '@/data/notifications'
import { globalStore } from '@/stores/global'
import { startAvisosLive } from '@/composables/useAvisos'
import { onBeforeUnmount, onMounted } from 'vue'

const { $socket } = globalStore()
const { handleEventNotification } = useEventNotificationAlert()
const { events } = useEventNotifications()

onMounted(() => {
  startAvisosLive($socket)
  $socket?.on('event_notification', handleEventNotification)
})
onBeforeUnmount(() => {
  $socket?.off('event_notification', handleEventNotification)
})
</script>
