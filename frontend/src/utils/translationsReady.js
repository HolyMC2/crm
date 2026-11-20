// The page loads the build's dictionary (crm/shell_dictionary.py) as a classic
// deferred script placed after the module entry, so the entry evaluates while
// the dictionary still downloads. The first render must still see it:
// frappe-ui's translatedMessages config is a plain object that App.vue sets
// once, so the mount waits for the script, but never past MAX_WAIT_MS (a dead
// request then costs the language, not the shell).
//
// After a deploy the page links a new version, which the browser has not
// cached yet (about 300 KB gzip). The last dictionary this browser loaded is
// kept in IndexedDB per site and language: the mount uses it at once, and when
// the new script arrives the app re-renders with it (applyNewer). Only a
// browser that never loaded a dictionary waits for the script. A note in
// localStorage names the kept version, so a load whose linked version is the
// kept one (the script is in the HTTP cache) never reads the megabyte back.
import { setConfig } from 'frappe-ui'
import { dictionaryRevision } from '@/translation'

const SCRIPT = 'script[src*="crm.www.crm.translations"]'
export const MAX_WAIT_MS = 10000
// crm/shell_dictionary.py versions a built set by its payload hash; "" (a
// language's first build is pending) is the whole dictionary and is not kept.
const VERSION = /^[0-9a-f]{16}$/
const DATABASE = 'crm-translations'
const STORE = 'dictionary'
const KEPT_VERSION = 'crm-translations-version|'

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

/** The version the page links the dictionary with, or '' when it is not a built set. */
export function linkedVersion(doc = globalThis.document) {
  const src = doc?.querySelector?.(SCRIPT)?.getAttribute('src') || ''
  const version = src.match(/[?&]v=([^&#]*)/)?.[1] || ''
  return VERSION.test(version) ? version : ''
}

/** The site's last dictionary in IndexedDB: { get(key), set(key, value) }, both promises. */
export function dictionaryStore(idb = globalThis.indexedDB) {
  let opened = null
  const open = () => {
    if (!idb) return Promise.reject(new Error('IndexedDB is not available'))
    opened ||= new Promise((resolve, reject) => {
      const request = idb.open(DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB is blocked'))
    }).catch((error) => {
      opened = null
      throw error
    })
    return opened
  }
  return {
    async get(key) {
      const db = await open()
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(key)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
      })
    },
    async set(key, value) {
      const db = await open()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    },
  }
}

/**
 * The version of the kept dictionary per site and language, in localStorage:
 * { get(key) → version | null, set(key, version) }. Never throws: without
 * localStorage nothing is noted and IndexedDB is always read.
 */
export function keptVersions(storage = globalThis.localStorage) {
  return {
    get(key) {
      try {
        return storage?.getItem(KEPT_VERSION + key) ?? null
      } catch {
        return null
      }
    },
    set(key, version) {
      try {
        storage?.setItem(KEPT_VERSION + key, version)
      } catch {
        // full or blocked: the next load reads IndexedDB, as without the note
      }
    },
  }
}

/** The newer dictionary replaces the one the first render used: every translated render repaints. */
export function applyNewer(messages) {
  setConfig('translatedMessages', messages)
  dictionaryRevision.value++
}

const usable = (entry) =>
  !!entry &&
  typeof entry.version === 'string' &&
  VERSION.test(entry.version) &&
  !!entry.messages &&
  typeof entry.messages === 'object'

const whenIdle = (fn) =>
  typeof globalThis.requestIdleCallback === 'function'
    ? globalThis.requestIdleCallback(fn, { timeout: 5000 })
    : setTimeout(fn, 2000)

/**
 * Runs `mount` once the dictionary is in: now when there is nothing to wait
 * for, with the browser's last dictionary when it keeps one, after the script
 * otherwise. A newer script then replaces the kept one (`onNewer`) and is kept
 * for the next load. When the kept one is already the linked version (a load
 * between two deploys) the script comes from the HTTP cache: IndexedDB is not
 * read.
 */
export function mountWhenTranslated(mount, options = {}) {
  const wait = translationsReady(options)
  if (!wait) return mount()
  const doc = options.doc ?? globalThis.document
  const script = doc.querySelector(SCRIPT)
  const version = linkedVersion(doc)
  const lang = options.lang ?? globalThis.lang
  const site = options.site ?? globalThis.site_name ?? ''
  const key = version && lang ? `${site}|${lang}` : ''
  const onNewer = options.onNewer ?? applyNewer
  let mounted = false
  let shown = null
  let kept = undefined
  const go = () => {
    if (mounted) return
    mounted = true
    return mount()
  }
  let store = null
  if (key) {
    try {
      store = options.store ?? dictionaryStore()
    } catch {
      store = null
    }
  }
  const versions = key ? options.versions ?? keptVersions() : null
  if (store && versions.get(key) === version) {
    kept = version
  } else if (store) {
    Promise.resolve()
      .then(() => store.get(key))
      .then(
        (entry) => {
          kept = usable(entry) ? entry.version : null
          if (kept === version) versions.set(key, version)
          if (mounted || globalThis.translated_messages || !kept) return
          globalThis.translated_messages = entry.messages
          shown = entry
          go()
        },
        () => {
          kept = null
        },
      )
  }
  script.addEventListener(
    'load',
    () => {
      const fresh = globalThis.translated_messages
      if (!fresh || typeof fresh !== 'object') return
      if (shown && fresh !== shown.messages && shown.version !== version)
        onNewer(fresh)
      if (!store) return
      whenIdle(() => {
        if (kept === version) return
        store
          .set(key, { version, messages: fresh })
          .then(() => versions.set(key, version))
          .catch(() => {})
      })
    },
    { once: true },
  )
  return wait.then(go)
}
