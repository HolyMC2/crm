import { computed, ref, toValue, watch } from 'vue'
import {
  callError,
  contactScope,
  contactStorage,
  enterContactScope,
  loadContactState,
  saveContactState,
  scopedKey,
  stableRequest,
} from '@/utils/contactos'

// Same request as frappe-ui's call, but a refusal keeps the server's GuardDTO
// (`guard`) so editors recover by its stable code, never by message text.
export async function contactosApi(method, args = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const path = `doco.contactos.api.${method}`
  const response = await fetch(`/api/method/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError(path, response.status, data)
}
export function useContactosDraft(key, defaults = {}) {
  const scope = contactScope()
  const storage = contactStorage()
  enterContactScope(storage, scope)
  const draftKey = computed(() => toValue(key))
  const saved = loadContactState(storage, scope, `draft:${draftKey.value}`)
  const draft = ref(saved?.draft || JSON.parse(JSON.stringify(defaults)))
  let baseline = JSON.stringify(defaults)
  let receipt = saved?.receipt || null
  function markDrafts() {
    if (typeof window === 'undefined') return
    let any = false
    try {
      any = Object.keys(storage || {}).some(
        (k) =>
          k.startsWith(`contactos:${scope}:draft:`) &&
          JSON.parse(storage.getItem(k))?.dirty,
      )
    } catch {
      /* private storage */
    }
    window.__MUELLE_HAS_DRAFT__ = any
  }
  watch(
    draft,
    () => {
      if (JSON.stringify(draft.value) === baseline) {
        try {
          storage?.removeItem(scopedKey(scope, `draft:${draftKey.value}`))
        } catch {
          /* optional storage */
        }
      } else
        saveContactState(storage, scope, `draft:${draftKey.value}`, {
          draft: draft.value,
          receipt,
          dirty: true,
        })
      markDrafts()
    },
    { deep: true },
  )
  function acceptInitial(value) {
    draft.value = JSON.parse(JSON.stringify(value))
    baseline = JSON.stringify(draft.value)
  }
  watch(
    draftKey,
    (value) => {
      const stored = loadContactState(storage, scope, `draft:${value}`)
      draft.value = stored?.draft || JSON.parse(JSON.stringify(defaults))
      receipt = stored?.receipt || null
      baseline = JSON.stringify(defaults)
      markDrafts()
    },
    { flush: 'sync' },
  )
  function id(payload) {
    receipt = stableRequest(receipt, payload)
    saveContactState(storage, scope, `draft:${draftKey.value}`, {
      draft: draft.value,
      receipt,
      dirty: true,
    })
    markDrafts()
    return receipt.id
  }
  function clear() {
    receipt = null
    try {
      storage?.removeItem(scopedKey(scope, `draft:${draftKey.value}`))
    } catch {
      /* optional storage */
    }
    markDrafts()
  }
  markDrafts()
  return { draft, id, clear, acceptInitial, restored: !!saved }
}
export function useContactosBootstrap() {
  const boot = ref(null),
    error = ref(null),
    loading = ref(false)
  async function reload() {
    loading.value = true
    error.value = null
    try {
      boot.value = await contactosApi('bootstrap')
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }
  return {
    boot,
    error,
    loading,
    reload,
    capabilities: computed(() => boot.value?.capabilities || {}),
  }
}
