<template>
  <div>
    <!-- Spans the rail so the 400px panel opens beside it, from the top. -->
    <div
      class="pointer-events-none absolute left-0 top-0 h-full w-full [&>*]:pointer-events-auto"
    >
      <Notifications />
    </div>
    <button
      class="relative flex size-10 items-center justify-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2"
      :aria-label="__('Notifications')"
      :title="__('Notifications')"
      @click="toggle()"
    >
      <span class="lucide-bell size-[18px]" aria-hidden="true" />
      <span
        v-if="unreadNotificationsCount"
        class="absolute right-1.5 top-1.5 size-2 rounded-full bg-surface-red-5"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
<script setup>
import Notifications from '@/components/Notifications.vue'
import {
  notificationsStore,
  unreadNotificationsCount,
} from '@/stores/notifications'

const { toggle } = notificationsStore()
</script>
