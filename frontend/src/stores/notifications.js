import { defineStore } from 'pinia'
import { computed } from 'vue'
import {
  avisosBadge,
  avisosPanelOpen,
  badgeLabel,
} from '@/composables/useAvisos'

// The CRM bell and drawer are Avisos now: the panel shows grouped avisos
// and the count is unread groups (never every raw row loaded at startup).
// One slide-over: the shell bell and Ventas reminders open the same panel.
export const visible = avisosPanelOpen

export const unreadNotificationsCount = computed(
  () => badgeLabel(avisosBadge.value) || 0,
)

export const notificationsStore = defineStore('crm-notifications', () => {
  function toggle() {
    visible.value = !visible.value
  }

  return {
    unreadNotificationsCount,
    toggle,
  }
})
