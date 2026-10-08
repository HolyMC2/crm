import { computed, ref, toValue, watch } from 'vue'
import {
  callError,
  contactScope,
  createReadCache,
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
  if (response.ok) {
    // Any write can change list rows or the record; reads re-ask the server.
    if (!READS.has(method)) contactosReads.clear()
    return data.message
  }
  throw callError(path, response.status, data)
}
const READS = new Set([
  'bootstrap',
  'search',
  'get_record',
  'get_editor_meta',
  'candidates',
  'list_followups',
  'get_followup',
  'list_segments',
  'lookup',
])
// Responses live in memory only, per site and user (never browser storage).
export const contactosReads = createReadCache({ max: 40 })
let readsScope = null
/** Cache key for a read, scoped to the current site and user. */
export function contactosReadKey(method, args = {}) {
  const scope = contactScope()
  if (scope !== readsScope) {
    contactosReads.clear()
    readsScope = scope
  }
  return `${scope}|${method}|${JSON.stringify(args)}`
}
const BOOT_FRESH_MS = 60_000
const RECORD_FRESH_MS = 15_000
/**
 * A record DTO: one shared request with a hover prefetch, and a copy under
 * 15 s old is used as is (writes clear the cache; versions still guard saves).
 */
export function readRecord(ref, { fresh = false } = {}) {
  const args = { source: ref.source, name: ref.name }
  const key = contactosReadKey('get_record', args)
  const hit = contactosReads.get(key)
  if (!fresh && hit && Date.now() - hit.at < RECORD_FRESH_MS)
    return Promise.resolve(hit.value)
  return contactosReads.load(key, () => contactosApi('get_record', args), {
    fresh,
  })
}
export function prefetchRecord(ref) {
  readRecord(ref).catch(() => {})
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
  const cached = contactosReads.get(contactosReadKey('bootstrap'))
  const boot = ref(cached?.value ?? null),
    error = ref(null),
    loading = ref(false)
  // Always asks the server (after saving a segment, configuration or retry).
  async function reload({ fresh = true } = {}) {
    loading.value = true
    error.value = null
    try {
      boot.value = await contactosReads.load(
        contactosReadKey('bootstrap'),
        () => contactosApi('bootstrap'),
        { fresh },
      )
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }
  // Opening a page: a cached boot renders at once and revalidates in the
  // background once it is a minute old; only the first visit waits for it.
  async function ensure() {
    const hit = contactosReads.get(contactosReadKey('bootstrap'))
    if (!hit) return reload({ fresh: false })
    boot.value = hit.value
    if (Date.now() - hit.at > BOOT_FRESH_MS) reload({ fresh: false })
  }
  return {
    boot,
    error,
    loading,
    reload,
    ensure,
    capabilities: computed(() => boot.value?.capabilities || {}),
  }
}
