import { ref } from 'vue'
import { currentScope, refused } from '@/composables/muelleShell'
import { dropCachedList, readCachedList, writeCachedList } from './listCache'

// A module's capabilities answer (get_capabilities, bootstrap, boot), kept
// like the shell boot: a fresh visit answers from the last copy this browser
// saw for the site, user and roles scope, so the page starts its list read at
// once while the fresh answer replaces the copy a moment later. Capabilities
// only steer the UI: every module API rechecks, and a refusal drops the copy.
// Stored with the lists (utils/listCache.js, «boot:<module>»), so the same
// age, cap and logout sweep apply.

/**
 * `fetch()` asks the server; `empty` stands in for a blank answer and
 * `failed(error)` for a failed one. `load({ refresh })` resolves with the
 * boot; `refresh` waits for the server (a retry after a fix).
 */
export function createModuleBoot(
  name,
  fetch,
  {
    empty = { enabled: false },
    failed = () => ({ enabled: false, failed: true }),
  } = {},
) {
  const boot = ref(null)
  const list = 'boot:' + name
  let pending = null
  let scope
  // True while `boot` holds the saved copy and the fresh answer is due.
  let stale = false

  function ask(key) {
    pending ||= fetch()
      .then((data) => {
        if (scope !== key) return boot.value
        boot.value = data || empty
        stale = false
        if (data) writeCachedList(list, data, key)
        return boot.value
      })
      .catch((error) => {
        if (scope !== key) return boot.value
        if (refused(error)) dropCachedList(list, key)
        else if (stale) return boot.value // offline or a blip: keep the copy
        boot.value = failed(error)
        stale = false
        return boot.value
      })
      .finally(() => (pending = null))
    return pending
  }

  function load({ refresh = false } = {}) {
    const key = currentScope()
    if (key !== scope) {
      scope = key
      const saved = readCachedList(list, key)
      if (saved) boot.value = saved
      stale = Boolean(saved)
    }
    if (refresh) return ask(key)
    if (stale) {
      ask(key)
      return Promise.resolve(boot.value)
    }
    if (boot.value) return Promise.resolve(boot.value)
    return ask(key)
  }

  return { boot, load }
}
