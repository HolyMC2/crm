import { computed, inject, onBeforeUnmount, reactive, toValue } from 'vue'
import { createDocumentResource, getCachedDocumentResource } from 'frappe-ui'

export const SETTINGS_SESSION = Symbol('settings-session')

// Keep the editor's own reactive data as the source of truth. Nothing sensitive
// is copied into localStorage or a second settings document.
export function createSettingsSession() {
  const editors = reactive(new Map())
  const dirty = computed(() =>
    [...editors.values()].some((state) => Boolean(toValue(state.dirty))),
  )
  const pending = computed(() =>
    [...editors.values()].some((state) => Boolean(toValue(state.pending))),
  )
  function register(state) {
    const key = Symbol()
    editors.set(key, state)
    return () => editors.delete(key)
  }
  function canLeave(confirm) {
    if (pending.value) return false
    if (!dirty.value) return true
    if (!confirm()) return false
    for (const state of editors.values()) {
      if (toValue(state.dirty)) state.discard?.()
    }
    return true
  }
  return { dirty, pending, register, canLeave }
}

export function discardSettingsDocument(resource) {
  if (resource.originalDoc) {
    resource.doc = JSON.parse(JSON.stringify(resource.originalDoc))
  }
}

export function settingsDocumentResource(options) {
  const cached = getCachedDocumentResource(options.doctype, options.name)
  // frappe-ui reloads a cached auto resource on a second creation. Two settings
  // categories can share User: opening the second must not erase the first.
  if (cached?.isDirty || cached?.save?.loading) return cached
  return createDocumentResource(options)
}

export function useSettingsDraft(state) {
  const session = inject(SETTINGS_SESSION, null)
  const unregister = session?.register(state)
  onBeforeUnmount(() => unregister?.())
}

export function settingsErrorKind(error) {
  const type = error?.exc_type || error?.name
  const status = error?.status || error?.response?.status
  if (type === 'PermissionError' || status === 403) return 'denied'
  if (type === 'DoesNotExistError' || status === 404) return 'not_configured'
  return 'unavailable'
}

export function settingsErrorMessage(error) {
  const kind = settingsErrorKind(error)
  if (kind === 'denied')
    return __('You do not have permission to access these settings.')
  if (kind === 'not_configured')
    return __('These settings are not configured on this site.')
  return __('Settings could not be loaded. Your work is preserved. Try again.')
}
