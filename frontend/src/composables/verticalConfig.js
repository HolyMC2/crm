import { onScopeDispose, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { hasApp } from '@/utils/crmCapabilities'

// Personalized descriptors must not reuse the old site-wide resource cache.
// Clear first and discard late replies when navigation changes the CRM record.
export function useVerticalConfig(docname) {
  const config = ref(null)
  let generation = 0
  const refresh = async (clearContext = false) => {
    const request = ++generation
    const name = docname()
    // Keep legacy section instances while refreshing the same context, so a
    // reception/repair draft is not discarded by a periodic capability check.
    config.value = !clearContext && config.value ? { ...config.value, providers: [] } : null
    if (!hasApp('doco')) {
      config.value = null
      return
    }
    try {
      const response = await call('crm.api.capabilities.get_vertical_config', {
        entity: name ? { doctype: 'CRM Deal', name } : null,
      })
      if (request === generation) config.value = response
    } catch (error) {
      // Optional workspace discovery cannot interrupt native record editing.
      // A transient failure must not unmount an unsaved legacy repair draft.
      // Auth denial/deleted context does revoke that legacy contribution.
      const denied = [401, 403, 404].includes(error?.status) ||
        ['PermissionError', 'AuthenticationError', 'DoesNotExistError'].includes(error?.exc_type)
      if (request === generation && denied) config.value = null
    }
  }
  const stop = watch(
    [() => hasApp('doco'), docname],
    () => refresh(true),
    { immediate: true },
  )
  // Role/settings edits in another tab do not change this record's name.
  // Revalidate on return, and bound staleness for a continuously open view.
  const whenVisible = () => {
    if (document.visibilityState !== 'hidden') refresh()
  }
  window.addEventListener('focus', whenVisible)
  document.addEventListener('visibilitychange', whenVisible)
  const interval = setInterval(whenVisible, 60_000)
  onScopeDispose(() => {
    generation++
    stop()
    clearInterval(interval)
    window.removeEventListener('focus', whenVisible)
    document.removeEventListener('visibilitychange', whenVisible)
  })
  return config
}
