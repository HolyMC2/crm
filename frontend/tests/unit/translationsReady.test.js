import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { getConfig, setConfig } from 'frappe-ui'
import translationPlugin, { dictionaryRevision } from '@/translation'
import {
  MAX_WAIT_MS,
  applyNewer,
  dictionaryStore,
  fullSource,
  keptVersions,
  linkedVersion,
  loadWholeDictionary,
  mountWhenTranslated,
  translationsReady,
  wholeDictionaryFor,
} from '@/utils/translationsReady'

const SRC = '/api/method/crm.www.crm.translations?v=abc'

function addScript(src = SRC) {
  const script = document.createElement('script')
  script.setAttribute('src', src)
  document.body.appendChild(script)
  return script
}

beforeEach(() => {
  vi.useFakeTimers()
  delete window.translated_messages
  delete window.translated_messages_first
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.useRealTimers()
  delete window.translated_messages
  delete window.translated_messages_first
})

describe('the mount waits for the dictionary script', () => {
  it('nothing to wait for without the script on the page', () => {
    expect(translationsReady()).toBeNull()
  })

  it('nothing to wait for once the script has run', () => {
    addScript()
    window.translated_messages = { Hoy: 'Today' }
    expect(translationsReady()).toBeNull()
  })

  it('settles when the script runs', async () => {
    const script = addScript()
    const settled = vi.fn()
    const wait = translationsReady()
    wait.then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    script.dispatchEvent(new Event('load'))
    await wait
    expect(settled).toHaveBeenCalledOnce()
  })

  it('settles when the script fails: the shell shows, in the source language', async () => {
    const script = addScript()
    const wait = translationsReady()
    script.dispatchEvent(new Event('error'))
    await expect(wait).resolves.toBeUndefined()
  })

  it('never waits past the cap', async () => {
    addScript()
    const settled = vi.fn()
    translationsReady().then(settled)
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('mounts at once when there is nothing to wait for, after the script otherwise', async () => {
    const mount = vi.fn(() => 'app')
    expect(mountWhenTranslated(mount)).toBe('app')
    expect(mount).toHaveBeenCalledOnce()

    const script = addScript()
    const later = vi.fn()
    const result = mountWhenTranslated(later)
    expect(later).not.toHaveBeenCalled()
    script.dispatchEvent(new Event('load'))
    await result
    expect(later).toHaveBeenCalledOnce()
  })
})

const OLD = 'a'.repeat(16)
const NEW = 'b'.repeat(16)
const versioned = (version) =>
  `/api/method/crm.www.crm.translations?v=${version}`

function fakeStore(entry, { failGet = false, failSet = false } = {}) {
  return {
    get: vi.fn(() =>
      failGet ? Promise.reject(new Error('no idb')) : Promise.resolve(entry),
    ),
    set: vi.fn(() =>
      failSet ? Promise.reject(new Error('quota')) : Promise.resolve(),
    ),
  }
}

// The script runs: it sets the global, then fires load.
function run(script, messages) {
  window.translated_messages = messages
  script.dispatchEvent(new Event('load'))
}

describe('a dictionary this browser kept spares the wait after a deploy', () => {
  beforeEach(() => {
    vi.stubGlobal('requestIdleCallback', (fn) => setTimeout(fn, 0))
  })
  afterEach(() => vi.unstubAllGlobals())

  const fakeVersions = (noted = {}) => ({
    get: vi.fn((key) => noted[key] ?? null),
    set: vi.fn((key, version) => (noted[key] = version)),
  })
  const options = (store, onNewer = vi.fn(), versions = fakeVersions()) => ({
    store,
    onNewer,
    versions,
    lang: 'es-MX',
    site: 'tienda.example',
  })

  it('reads the version the page links, and only a built set', () => {
    addScript(versioned(NEW))
    expect(linkedVersion()).toBe(NEW)
    document.body.innerHTML = ''
    addScript(versioned(''))
    expect(linkedVersion()).toBe('')
    document.body.innerHTML = ''
    addScript(
      '/api/method/crm.www.crm.translations?v={{ translations_version }}',
    )
    expect(linkedVersion()).toBe('')
  })

  it('mounts at once with the kept one, repaints with the new one and keeps it', async () => {
    const script = addScript(versioned(NEW))
    const kept = { Hoy: 'Hoy (anterior)' }
    const store = fakeStore({ version: OLD, messages: kept })
    const opts = options(store)
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, opts)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get).toHaveBeenCalledWith('tienda.example|es-MX')
    expect(mount).toHaveBeenCalledOnce()
    expect(window.translated_messages).toBe(kept)

    const fresh = { Hoy: 'Hoy' }
    run(script, fresh)
    await result
    expect(mount).toHaveBeenCalledOnce()
    expect(opts.onNewer).toHaveBeenCalledWith(fresh)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.set).toHaveBeenCalledWith('tienda.example|es-MX', {
      version: NEW,
      messages: fresh,
    })
    expect(opts.versions.set).toHaveBeenCalledWith('tienda.example|es-MX', NEW)
  })

  it('the noted version is the linked one: IndexedDB is not read', async () => {
    const script = addScript(versioned(NEW))
    const store = fakeStore({ version: NEW, messages: { Hoy: 'Hoy' } })
    const versions = fakeVersions({ 'tienda.example|es-MX': NEW })
    const opts = options(store, vi.fn(), versions)
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, opts)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get).not.toHaveBeenCalled()
    expect(mount).not.toHaveBeenCalled()
    run(script, { Hoy: 'Hoy' })
    await result
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    expect(opts.onNewer).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('an older noted version still reads the kept dictionary', async () => {
    addScript(versioned(NEW))
    const kept = { Hoy: 'Hoy (anterior)' }
    const store = fakeStore({ version: OLD, messages: kept })
    const versions = fakeVersions({ 'tienda.example|es-MX': OLD })
    const mount = vi.fn()
    mountWhenTranslated(mount, options(store, vi.fn(), versions))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get).toHaveBeenCalledOnce()
    expect(mount).toHaveBeenCalledOnce()
    expect(window.translated_messages).toBe(kept)
  })

  it('the version note lives in localStorage and never throws', () => {
    const memory = new Map()
    const storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    }
    const versions = keptVersions(storage)
    expect(versions.get('s|es')).toBeNull()
    versions.set('s|es', NEW)
    expect(versions.get('s|es')).toBe(NEW)
    const broken = keptVersions({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(broken.get('s|es')).toBeNull()
    expect(() => broken.set('s|es', NEW)).not.toThrow()
    expect(keptVersions(undefined).get('s|es')).toBeNull()
  })

  it('the kept one is this version: no repaint and no write', async () => {
    const script = addScript(versioned(NEW))
    const store = fakeStore({ version: NEW, messages: { Hoy: 'Hoy' } })
    const opts = options(store)
    const mount = vi.fn()
    mountWhenTranslated(mount, opts)
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    run(script, { Hoy: 'Hoy' })
    await vi.advanceTimersByTimeAsync(0)
    expect(opts.onNewer).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('nothing kept: waits for the script, then keeps it for the next load', async () => {
    const script = addScript(versioned(NEW))
    const store = fakeStore(null)
    const opts = options(store)
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, opts)
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).not.toHaveBeenCalled()
    const fresh = { Hoy: 'Hoy' }
    run(script, fresh)
    await result
    expect(mount).toHaveBeenCalledOnce()
    expect(opts.onNewer).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.set).toHaveBeenCalledWith('tienda.example|es-MX', {
      version: NEW,
      messages: fresh,
    })
  })

  it('the script before the kept one: it wins and nothing repaints', async () => {
    const script = addScript(versioned(NEW))
    let answer
    const store = {
      get: vi.fn(() => new Promise((resolve) => (answer = resolve))),
      set: vi.fn(() => Promise.resolve()),
    }
    const opts = options(store)
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, opts)
    const fresh = { Hoy: 'Hoy' }
    run(script, fresh)
    await result
    answer({ version: OLD, messages: { Hoy: 'viejo' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    expect(window.translated_messages).toBe(fresh)
    expect(opts.onNewer).not.toHaveBeenCalled()
  })

  it('a page without a built version neither reads nor keeps', async () => {
    const script = addScript(versioned(''))
    const store = fakeStore({ version: OLD, messages: { Hoy: 'viejo' } })
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, options(store))
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).not.toHaveBeenCalled()
    run(script, { Hoy: 'Hoy' })
    await result
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    expect(store.get).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('a store that fails costs only the head start', async () => {
    const script = addScript(versioned(NEW))
    const store = fakeStore(null, { failGet: true, failSet: true })
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, options(store))
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).not.toHaveBeenCalled()
    run(script, { Hoy: 'Hoy' })
    await result
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    expect(store.set).toHaveBeenCalledOnce()
  })

  it('ignores a kept entry that is not a built set', async () => {
    addScript(versioned(NEW))
    const store = fakeStore({ version: '', messages: { Hoy: 'viejo' } })
    const mount = vi.fn()
    mountWhenTranslated(mount, options(store))
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).not.toHaveBeenCalled()
    expect(window.translated_messages).toBeUndefined()
  })

  it('without IndexedDB the store refuses, and the page waits as before', async () => {
    await expect(dictionaryStore(undefined).get('x')).rejects.toThrow()
  })

  it('a mounted screen repaints in the newer words', async () => {
    setConfig('translatedMessages', { Today: 'Hoy (anterior)' })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp({ render: () => h('p', window.__('Today')) })
    app.use(translationPlugin)
    app.mount(root)
    expect(root.textContent).toBe('Hoy (anterior)')
    applyNewer({ Today: 'Hoy' })
    await nextTick()
    expect(root.textContent).toBe('Hoy')
    app.unmount()
  })

  it('a newer dictionary becomes the config and moves the revision renders read', () => {
    const before = dictionaryRevision.value
    const fresh = { Hoy: 'Hoy' }
    applyNewer(fresh)
    expect(getConfig('translatedMessages')).toBe(fresh)
    expect(dictionaryRevision.value).toBe(before + 1)
  })
})

const FIRST = 'c'.repeat(16)

describe('the landing route mounts with the first part, the whole set follows', () => {
  beforeEach(() => {
    vi.stubGlobal('requestIdleCallback', (fn) => setTimeout(fn, 0))
  })
  afterEach(() => vi.unstubAllGlobals())

  // The page's script is the first part; data-full names the whole set.
  function addFirst(full = `v=${NEW}`) {
    const script = addScript(
      `/api/method/crm.www.crm.translations?part=first&v=${FIRST}`,
    )
    script.setAttribute('data-full', full)
    return script
  }
  function runFirst(script, messages) {
    window.translated_messages_first = messages
    script.dispatchEvent(new Event('load'))
  }
  // loadScript stands in for the <script> the module appends.
  function fakeLoader() {
    const element = document.createElement('i')
    const loadScript = vi.fn(() => element)
    const run = (messages) => {
      window.translated_messages = messages
      element.dispatchEvent(new Event('load'))
    }
    return { loadScript, run, element }
  }
  const versionsNoting = (noted = {}) => ({
    get: vi.fn((key) => noted[key] ?? null),
    set: vi.fn((key, version) => (noted[key] = version)),
  })
  const opts = (extra = {}) => ({
    store: fakeStore(null),
    versions: versionsNoting(),
    onNewer: vi.fn(),
    lang: 'es-MX',
    site: 'tienda.example',
    ...extra,
  })

  it('reads the whole set from data-full, and only a versioned one', () => {
    addFirst()
    expect(fullSource()).toBe(`/api/method/crm.www.crm.translations?v=${NEW}`)
    expect(linkedVersion()).toBe(NEW)
    document.body.innerHTML = ''
    addFirst('{{ translations_full_query }}')
    expect(fullSource()).toBe('')
    expect(linkedVersion()).toBe('')
    document.body.innerHTML = ''
    addScript(versioned(NEW))
    expect(fullSource()).toBe('')
  })

  it('mounts with the first part and loads the whole set only when asked', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    const o = opts({ loadScript: loader.loadScript })
    const mount = vi.fn()
    const result = mountWhenTranslated(mount, o)
    const first = { Hoy: 'Hoy' }
    runFirst(script, first)
    await result
    expect(mount).toHaveBeenCalledOnce()
    expect(window.translated_messages).toBe(first)
    expect(loader.loadScript).not.toHaveBeenCalled()

    const loading = loadWholeDictionary()
    expect(loader.loadScript).toHaveBeenCalledWith(
      `/api/method/crm.www.crm.translations?v=${NEW}`,
    )
    expect(loadWholeDictionary()).toBe(loading)
    const whole = { Hoy: 'Hoy', Tratos: 'Tratos' }
    loader.run(whole)
    await loading
    expect(o.onNewer).toHaveBeenCalledWith(whole)
    await vi.advanceTimersByTimeAsync(0)
    expect(o.store.set).toHaveBeenCalledWith('tienda.example|es-MX', {
      version: NEW,
      messages: whole,
    })
    expect(loadWholeDictionary()).toBeNull()
  })

  it('a route the first part covers never waits; another waits for the whole set', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    mountWhenTranslated(vi.fn(), opts({ loadScript: loader.loadScript }))
    runFirst(script, { Hoy: 'Hoy' })
    expect(wholeDictionaryFor({ name: 'Hoy' })).toBeUndefined()
    const guard = wholeDictionaryFor({ name: 'Deals' })
    expect(guard).toBeInstanceOf(Promise)
    expect(loader.loadScript).toHaveBeenCalledOnce()
    const settled = vi.fn()
    guard.then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    loader.run({ Hoy: 'Hoy', Tratos: 'Tratos' })
    await guard
    expect(settled).toHaveBeenCalledWith(undefined)
    expect(wholeDictionaryFor({ name: 'Deals' })).toBeUndefined()
  })

  it('a whole set that never arrives holds a navigation no longer than the cap', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    mountWhenTranslated(vi.fn(), opts({ loadScript: loader.loadScript }))
    runFirst(script, { Hoy: 'Hoy' })
    const settled = vi.fn()
    wholeDictionaryFor({ name: 'Inbox' }).then(settled)
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('a kept whole set mounts at once and the first part does not replace it', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    const kept = { Hoy: 'Hoy (anterior)', Tratos: 'Tratos' }
    const o = opts({
      loadScript: loader.loadScript,
      store: fakeStore({ version: OLD, messages: kept }),
    })
    const mount = vi.fn()
    mountWhenTranslated(mount, o)
    await vi.advanceTimersByTimeAsync(0)
    expect(mount).toHaveBeenCalledOnce()
    runFirst(script, { Hoy: 'Hoy' })
    expect(window.translated_messages).toBe(kept)
    const whole = { Hoy: 'Hoy', Tratos: 'Tratos' }
    const loading = loadWholeDictionary()
    loader.run(whole)
    await loading
    expect(o.onNewer).toHaveBeenCalledWith(whole)
  })

  it('a kept set of this very version mounts and nothing repaints', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    const kept = { Hoy: 'Hoy', Tratos: 'Tratos' }
    const o = opts({
      loadScript: loader.loadScript,
      store: fakeStore({ version: NEW, messages: kept }),
    })
    mountWhenTranslated(vi.fn(), o)
    await vi.advanceTimersByTimeAsync(0)
    runFirst(script, { Hoy: 'Hoy' })
    const loading = loadWholeDictionary()
    loader.run({ ...kept })
    await loading
    await vi.advanceTimersByTimeAsync(0)
    expect(o.onNewer).not.toHaveBeenCalled()
    expect(o.store.set).not.toHaveBeenCalled()
  })

  it('a first part that fails starts the whole set at once', async () => {
    const script = addFirst()
    const loader = fakeLoader()
    const mount = vi.fn()
    const result = mountWhenTranslated(
      mount,
      opts({ loadScript: loader.loadScript }),
    )
    script.dispatchEvent(new Event('error'))
    await result
    expect(mount).toHaveBeenCalledOnce()
    expect(loader.loadScript).toHaveBeenCalledOnce()
  })

  it('a first part that already ran is adopted without waiting, and the whole set follows', () => {
    addFirst()
    const first = { Hoy: 'Hoy' }
    window.translated_messages_first = first
    const loader = fakeLoader()
    const mount = vi.fn(() => 'app')
    expect(
      mountWhenTranslated(mount, opts({ loadScript: loader.loadScript })),
    ).toBe('app')
    expect(window.translated_messages).toBe(first)
    expect(wholeDictionaryFor({ name: 'Deals' })).toBeInstanceOf(Promise)
    expect(loader.loadScript).toHaveBeenCalledOnce()
  })

  it('a page with one script keeps the guard idle', () => {
    addScript(versioned(NEW))
    mountWhenTranslated(vi.fn(), opts())
    expect(wholeDictionaryFor({ name: 'Deals' })).toBeUndefined()
    expect(loadWholeDictionary()).toBeNull()
  })
})
