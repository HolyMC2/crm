import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { getConfig, setConfig } from 'frappe-ui'
import translationPlugin, { dictionaryRevision } from '@/translation'
import {
  MAX_WAIT_MS,
  applyNewer,
  dictionaryStore,
  keptVersions,
  linkedVersion,
  mountWhenTranslated,
  translationsReady,
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
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.useRealTimers()
  delete window.translated_messages
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
