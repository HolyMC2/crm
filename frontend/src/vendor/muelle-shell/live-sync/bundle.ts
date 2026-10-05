// Vendored from muelle/workspace/packages/live-sync@0.1.0 (c813e3981ed0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
/**
 * Silent bundle updates: no «nueva versión» prompt, ever.
 *
 * The build writes `version.json` with the entry chunk's file name. A tab
 * compares it with the entry it booted from; once they differ the tab is
 * stale and moves to the new build through ONE safety gate (`canSwap`):
 *  - at once while the tab is hidden, or on return before the first tap;
 *  - while visible, after `idleMs` (15 s) without input;
 *  - on the next in-app page change (the app's router glue asks `isStale`);
 *  - after a lazy chunk vanished from the server (`recoverChunkError`).
 * The gate blocks on anything that could lose work or leave an operation
 * half done: a registered app blocker (a sale, a payment, a print), a view
 * vetoing `beforeunload` (unsaved edits), an open dialog, typed text, input
 * in the last `idleMs`, a write request still in flight, or being offline.
 * Unknown state blocks: a blocker that throws counts as busy. A swap keeps
 * the route (with its filters) and the scroll positions.
 *
 * One tab that finds a new build tells its siblings; checks run at startup,
 * on return, on `online`, after a websocket reconnect (the app calls
 * `check`) and every `checkMs` (60 s).
 */

const TYPED_FIELDS =
  'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], ' +
  'input[type="url"], input[type="password"], textarea'
const EDITABLE = `${TYPED_FIELDS}, input[type="search"], select, [contenteditable=""], [contenteditable="true"]`
const CHUNK_RELOAD_KEY = 'live-sync:chunk-reload-at'
const CHUNK_RELOAD_GUARD_MS = 30_000
const SCROLL_KEY = 'live-sync:swap-scroll'
const SCROLLERS = 'main, [data-live-scroll]'

export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  )
}

/**
 * True when reloading would not throw away anything on screen: no open
 * dialog, no typed text (a focused empty field is fine — screens autofocus
 * their search box), and no view vetoing a synthetic `beforeunload` (views
 * with unsaved edits register one while dirty).
 */
export function pageIsClean(win: Window = window): boolean {
  const doc = win.document
  if (doc.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')) return false
  const active = doc.activeElement
  if (active?.matches(EDITABLE)) {
    const value: unknown = (active as HTMLInputElement).value
    if (typeof value !== 'string' || value.trim() !== '') return false
  }
  for (const field of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TYPED_FIELDS)) {
    if (!field.disabled && !field.readOnly && field.value.trim() !== '') return false
  }
  const probe = new Event('beforeunload', { cancelable: true })
  win.dispatchEvent(probe)
  return !probe.defaultPrevented
}

// ---- blockers --------------------------------------------------------------

const blockers = new Map<string, () => boolean>()

/**
 * Register an app-level reason not to swap now (true = busy): a cart with
 * lines, a payment or print waiting for its outcome, a pending outbox. A
 * blocker that throws counts as busy. Returns the unregister.
 */
export function registerSwapBlocker(name: string, busy: () => boolean): () => void {
  blockers.set(name, busy)
  return () => {
    if (blockers.get(name) === busy) blockers.delete(name)
  }
}

const trackedWindows = new WeakSet<Window>()
const inflight = new WeakMap<Window, { writes: number }>()

/**
 * Count write requests (anything but GET/HEAD/OPTIONS) in flight through
 * `fetch`, so a save, payment or print request is never cut by a swap.
 * Idempotent per window.
 */
export function trackInflightWrites(win: Window = window): void {
  if (trackedWindows.has(win) || typeof win.fetch !== 'function') return
  trackedWindows.add(win)
  const state = { writes: 0 }
  inflight.set(win, state)
  const original = win.fetch.bind(win)
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return original(input, init)
    state.writes += 1
    return original(input, init).finally(() => {
      state.writes -= 1
    })
  }
}

export function inflightWrites(win: Window = window): number {
  return inflight.get(win)?.writes ?? 0
}

/** Why a swap is blocked right now, or null when it is safe. */
export function swapBlocker(win: Window = window, sinceInputMs = Infinity, quietMs = 15_000): string | null {
  if (!win.navigator.onLine) return 'offline'
  for (const [name, busy] of blockers) {
    try {
      if (busy()) return name
    } catch {
      return name
    }
  }
  if (inflightWrites(win) > 0) return 'write-in-flight'
  if (sinceInputMs < quietMs) return 'recent-input'
  if (!pageIsClean(win)) return 'page-not-clean'
  return null
}

// ---- scroll and route preservation ------------------------------------------

function saveScroll(win: Window, href: string) {
  try {
    const doc = win.document
    const positions = [...doc.querySelectorAll<HTMLElement>(SCROLLERS)].map((el) => el.scrollTop)
    win.sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ href, x: win.scrollX, y: win.scrollY, positions }))
  } catch {
    /* storage blocked: the swap still keeps the route */
  }
}

/**
 * Put the scroll positions back after a swap reload. Call once the first
 * route has rendered (e.g. after `router.isReady()` and a tick).
 */
export function restoreSwapScroll(win: Window = window): void {
  try {
    const raw = win.sessionStorage.getItem(SCROLL_KEY)
    if (!raw) return
    win.sessionStorage.removeItem(SCROLL_KEY)
    const saved = JSON.parse(raw) as { href: string; x: number; y: number; positions: number[] }
    if (saved.href !== win.location.href) return
    if (saved.x || saved.y) win.scrollTo(saved.x, saved.y)
    const scrollers = [...win.document.querySelectorAll<HTMLElement>(SCROLLERS)]
    saved.positions.forEach((top, i) => {
      const el = scrollers[i]
      if (el) el.scrollTop = top
    })
  } catch {
    /* nothing to restore */
  }
}

// ---- watcher -----------------------------------------------------------------

export interface BundleWatcherOptions {
  /** URL of the build's version.json ({ "entry": "<entry chunk file name>" }). */
  versionUrl: string
  /** URL or path of the entry chunk this tab booted from (`import.meta.url`). */
  runningEntry: string
  /** App name for the sibling-tab channel (tabs of other apps never hear it). */
  app: string
  checkMs?: number
  minCheckGapMs?: number
  /** Quiet time after the last input before a visible tab may swap. */
  idleMs?: number
  /** false disables the sibling-tab channel. */
  channel?: boolean
  /** Test seams. */
  win?: Window
  fetchEntry?: (url: string) => Promise<string | null>
  navigate?: (href: string) => void
}

export interface BundleWatcher {
  isStale(): boolean
  /** Check version.json now (throttled unless `force`). */
  check(force?: boolean): Promise<void>
  /** Why a swap would be blocked now, or null. */
  blocker(): string | null
  /** Move to the new build now if stale and safe; returns whether it did. */
  applyIfSafe(target?: string): boolean
  /** Route glue: a page change while stale becomes a full load of `target` when safe. */
  navigateIfStale(target: string): boolean
  /** A lazy chunk vanished: load `target` when safe (at most once per 30 s), else later. */
  recoverChunkError(target: string): boolean
  destroy(): void
}

async function defaultFetchEntry(url: string): Promise<string | null> {
  try {
    // Query-busted: Cloudflare and the browser cache /assets/* for hours.
    const sep = url.includes('?') ? '&' : '?'
    const response = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as { entry?: unknown }
    return typeof data.entry === 'string' ? data.entry : null
  } catch {
    return null
  }
}

function entryPath(entry: string, base: string): string {
  try {
    return new URL(entry, base).pathname
  } catch {
    return entry
  }
}

export function createBundleWatcher(options: BundleWatcherOptions): BundleWatcher {
  const win = options.win ?? window
  const doc = win.document
  const running = entryPath(options.runningEntry, win.location.href)
  const checkMs = options.checkMs ?? 60_000
  const minGap = options.minCheckGapMs ?? 10_000
  const idleMs = options.idleMs ?? 15_000
  const fetchEntry = options.fetchEntry ?? defaultFetchEntry
  const navigate = options.navigate ?? ((href: string) => (href === win.location.href ? win.location.reload() : win.location.assign(href)))

  trackInflightWrites(win)

  let stale = false
  let lastCheck = 0
  let lastInput = Date.now()
  let swapping = false
  let pendingTarget: string | null = null
  const cleanups: Array<() => void> = []
  const listen = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts)
    cleanups.push(() => target.removeEventListener(type, fn, opts))
  }

  const differs = (entry: string) => !running.endsWith(`/${entry}`) && running !== entry

  let channel: BroadcastChannel | null = null
  const Channel = (win as any).BroadcastChannel as typeof BroadcastChannel | undefined
  if (options.channel !== false && Channel) {
    try {
      channel = new Channel(`live-sync-bundle:${options.app}`)
      channel.onmessage = (event: MessageEvent) => {
        const entry = event.data?.entry
        if (event.data?.app === options.app && typeof entry === 'string' && differs(entry)) markStale(entry, false)
      }
    } catch {
      channel = null
    }
  }

  function markStale(entry: string, announce: boolean) {
    const first = !stale
    stale = true
    if (first && announce) channel?.postMessage({ app: options.app, entry })
    applyIfSafe()
  }

  function blocker(): string | null {
    const hidden = doc.visibilityState === 'hidden'
    // Hidden: nobody is typing; the last input was before the tab was left.
    return swapBlocker(win, hidden ? Infinity : Date.now() - lastInput, idleMs)
  }

  function swap(target: string) {
    swapping = true
    saveScroll(win, target)
    navigate(target)
  }

  function applyIfSafe(target?: string): boolean {
    if (!stale || swapping) return false
    if (blocker() !== null) return false
    swap(target ?? pendingTarget ?? win.location.href)
    return true
  }

  function navigateIfStale(target: string): boolean {
    if (!stale || swapping) return false
    // The worker just asked to move: their own click is not "recent input".
    if (swapBlocker(win, Infinity, idleMs) !== null) return false
    swap(target)
    return true
  }

  function recoverChunkError(target: string): boolean {
    stale = true
    pendingTarget = target
    try {
      const last = Number(win.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
      if (Date.now() - last < CHUNK_RELOAD_GUARD_MS) return false
    } catch {
      /* private mode: no loop guard */
    }
    if (swapping || swapBlocker(win, Infinity, idleMs) !== null) return false // retried by the tick
    try {
      win.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    swap(target)
    return true
  }

  async function check(force = false) {
    if (!win.navigator.onLine) return
    if (!force && Date.now() - lastCheck < minGap) return
    lastCheck = Date.now()
    const entry = await fetchEntry(options.versionUrl)
    if (entry && differs(entry)) markStale(entry, true)
  }

  const markInput = () => {
    lastInput = Date.now()
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input']) {
    listen(win, type, markInput, { capture: true, passive: true })
  }
  listen(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      applyIfSafe()
      return
    }
    // Back at the tab, nothing touched yet: a known-stale clean page moves
    // before the first tap.
    if (stale && !swapping && swapBlocker(win, Infinity, idleMs) === null) {
      swap(pendingTarget ?? win.location.href)
      return
    }
    void check()
  })
  listen(win, 'online', () => void check())
  // A page restored from the back-forward cache runs whatever build it had.
  listen(win, 'pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) void check(true)
  })
  const poll = win.setInterval(() => void check(true), checkMs)
  const tick = win.setInterval(() => applyIfSafe(), 5_000)
  cleanups.push(() => {
    win.clearInterval(poll)
    win.clearInterval(tick)
  })
  void check(true)

  return {
    isStale: () => stale,
    check,
    blocker,
    applyIfSafe,
    navigateIfStale,
    recoverChunkError,
    destroy() {
      for (const cleanup of cleanups.splice(0)) cleanup()
      channel?.close()
      channel = null
    },
  }
}
