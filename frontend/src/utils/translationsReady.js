// The page loads the build's dictionary (crm/shell_dictionary.py) as a classic
// deferred script placed after the module entry, so the entry evaluates while
// the dictionary still downloads. The first render must still see it:
// frappe-ui's translatedMessages config is a plain object that App.vue sets
// once, so the mount waits for the script, but never past MAX_WAIT_MS (a dead
// request then costs the language, not the shell).
//
// On the landing route (crm/www/crm.py) that script is the set's first part, a
// few kilobytes with the words of the entry, the shell and Hoy (it sets
// window.translated_messages_first), and its data-full names the whole set
// (about 300 KB gzip). The mount waits for the first part only; the whole set
// loads once the first route is up (loadWholeDictionary), becomes the config
// and repaints. A navigation to any other route before it is in waits for it
// (wholeDictionaryFor, a router guard), so no screen shows its English.
//
// After a deploy the page links a new version, which the browser has not
// cached yet. The last whole dictionary this browser loaded is kept in
// IndexedDB per site and language: the mount uses it at once, and when the new
// script arrives the app re-renders with it (applyNewer). Only a browser that
// never loaded a dictionary waits for the script. A note in localStorage names
// the kept version, so a load whose linked version is the kept one (the script
// is in the HTTP cache) never reads the megabyte back.
import { setConfig } from 'frappe-ui'
import { dictionaryRevision } from '@/translation'

const SCRIPT = 'script[src*="crm.www.crm.translations"]'
export const MAX_WAIT_MS = 10000
// crm/shell_dictionary.py versions a built set by its payload hash; "" (a
// language's first build is pending) is the whole dictionary and is not kept.
const VERSION = /^[0-9a-f]{16}$/
const FULL_QUERY = /^v=[0-9a-f]{16}$/
const DATABASE = 'crm-translations'
const STORE = 'dictionary'
const KEPT_VERSION = 'crm-translations-version|'
// The routes whose screen the first part covers (frontend/scripts/
// translation-keys.mjs FIRST_ROUTE): any other waits for the whole set.
export const FIRST_ROUTE_NAMES = new Set(['Hoy'])

const ran = () =>
  globalThis.translated_messages || globalThis.translated_messages_first

/**
 * null when nothing is left to wait for (no dictionary script on the page, or
 * it already ran); otherwise a promise that settles when it has run, failed
 * or taken too long.
 */
export function translationsReady({
  doc = globalThis.document,
  maxWait = MAX_WAIT_MS,
} = {}) {
  if (ran()) return null
  const script = doc?.querySelector?.(SCRIPT)
  if (!script) return null
  return settled(script, maxWait)
}

function settled(script, maxWait) {
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

/** The whole set's URL when the page's script is the first part, else ''. */
export function fullSource(doc = globalThis.document) {
  const script = doc?.querySelector?.(SCRIPT)
  const query = script?.getAttribute?.('data-full') || ''
  if (!FULL_QUERY.test(query)) return ''
  return `${(script.getAttribute('src') || '').split('?')[0]}?${query}`
}

/** The version of the whole set the page links, or '' when it is not a built set. */
export function linkedVersion(doc = globalThis.document) {
  const script = doc?.querySelector?.(SCRIPT)
  const full = script?.getAttribute?.('data-full') || ''
  const src = FULL_QUERY.test(full)
    ? `?${full}`
    : script?.getAttribute('src') || ''
  if (/[?&]part=first/.test(src)) return ''
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

function appendScript(src, doc) {
  const script = doc.createElement('script')
  script.src = src
  doc.head.appendChild(script)
  return script
}

// The whole set while only the first part is in: { load() → promise }, or null.
let whole = null

/**
 * Starts the whole set's download (once) when the page mounted with the first
 * part; a promise that settles when it has run, failed or taken too long, or
 * null when nothing is pending.
 */
export function loadWholeDictionary() {
  return whole ? whole.load() : null
}

/** Router guard: a route the first part does not cover waits for the whole set. */
export function wholeDictionaryFor(to) {
  if (!whole || FIRST_ROUTE_NAMES.has(to?.name)) return undefined
  return whole.load().then(() => undefined)
}

/**
 * Runs `mount` once the dictionary is in: now when there is nothing to wait
 * for, with the browser's last dictionary when it keeps one, after the script
 * otherwise. A newer script then replaces the kept one (`onNewer`) and is kept
 * for the next load. When the kept one is already the linked version (a load
 * between two deploys) the script comes from the HTTP cache: IndexedDB is not
 * read. When the script is the first part, the whole set follows through
 * loadWholeDictionary (or `options.loadScript(src)`, which returns the script
 * element) and replaces it the same way.
 */
export function mountWhenTranslated(mount, options = {}) {
  whole = null
  const doc = options.doc ?? globalThis.document
  const wait = translationsReady(options)
  const full = fullSource(doc)
  const adoptFirst = () => {
    if (!globalThis.translated_messages && globalThis.translated_messages_first)
      globalThis.translated_messages = globalThis.translated_messages_first
  }
  if (!wait && !full) {
    adoptFirst()
    return mount()
  }
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
    adoptFirst()
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
  // The whole set ran: it replaces what the first render used, and is kept.
  const arrived = (fresh, first) => {
    if (!fresh || typeof fresh !== 'object') return
    if (
      first ||
      (shown && fresh !== shown.messages && shown.version !== version)
    )
      onNewer(fresh)
    if (!store) return
    whenIdle(() => {
      if (kept === version) return
      store
        .set(key, { version, messages: fresh })
        .then(() => versions.set(key, version))
        .catch(() => {})
    })
  }
  if (full) {
    let loading = null
    whole = {
      load() {
        loading ||= new Promise((resolve) => {
          const element = (
            options.loadScript ?? ((src) => appendScript(src, doc))
          )(full)
          element.addEventListener(
            'load',
            () => {
              const fresh = globalThis.translated_messages
              whole = null
              // Mounted with the first part (not a kept whole set): repaint.
              arrived(fresh, !shown)
            },
            { once: true },
          )
          settled(element, options.maxWait ?? MAX_WAIT_MS).then(resolve)
        })
        return loading
      },
    }
    // A first part that never arrives does not hold the whole set back.
    script.addEventListener(
      'error',
      () => {
        whole?.load()
      },
      { once: true },
    )
  } else {
    script.addEventListener(
      'load',
      () => arrived(globalThis.translated_messages, false),
      { once: true },
    )
  }
  // A first part that already ran: mount now, the whole set still follows.
  return wait ? wait.then(go) : go()
}
