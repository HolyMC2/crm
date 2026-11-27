import { activeSettingsPage, showSettings } from '@/composables/settings'

// The section the page opens on, taken once by InboxSettingsPage.
let openOn = ''
export function takeInboxSettingsView() {
  const view = openOn
  openOn = ''
  return view
}

// The inbox's own settings page (Settings › Customer inbox), for managers;
// `view` opens it on one section ('calls').
export function openInboxSettings(view = '') {
  openOn = typeof view === 'string' ? view : '' // a click handler passes its event
  activeSettingsPage.value = __('Customer inbox')
  showSettings.value = true
}
