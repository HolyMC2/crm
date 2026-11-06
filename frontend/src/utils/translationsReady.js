// The page loads the build's dictionary (crm/shell_dictionary.py) as a classic
// deferred script placed after the module entry, so the entry evaluates while
// the dictionary still downloads. The first render must still see it:
// frappe-ui's translatedMessages config is a plain object that App.vue sets
// once, so the mount waits for the script, but never past MAX_WAIT_MS (a dead
// request then costs the language, not the shell).
const SCRIPT = 'script[src*="crm.www.crm.translations"]'
export const MAX_WAIT_MS = 10000

/**
 * null when nothing is left to wait for (no dictionary script on the page, or
 * it already ran); otherwise a promise that settles when it has run, failed
 * or taken too long.
 */
export function translationsReady({
  doc = globalThis.document,
  maxWait = MAX_WAIT_MS,
} = {}) {
  if (globalThis.translated_messages) return null
  const script = doc?.querySelector?.(SCRIPT)
  if (!script) return null
  return new Promise((resolve) => {
    let timer = null
    const done = () => {
      clearTimeout(timer)
      script.removeEventListener('load', done)
      script.removeEventListener('error', done)
      resolve()
    }
    script.addEventListener('load', done)
    script.addEventListener('error', done)
    timer = setTimeout(done, maxWait)
  })
}

/** Runs `mount` once the dictionary is in: now when there is nothing to wait for. */
export function mountWhenTranslated(mount, options) {
  const wait = translationsReady(options)
  if (!wait) return mount()
  return wait.then(mount)
}
