import { activeSettingsPage, showSettings } from '@/composables/settings'

// The inbox's own settings page (Settings › Customer inbox), for managers.
export function openInboxSettings() {
  activeSettingsPage.value = __('Customer inbox')
  showSettings.value = true
}
