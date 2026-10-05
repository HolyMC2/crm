// Vendored from muelle/workspace/packages/live-sync@0.1.0 (c813e3981ed0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
import type {
  Batch,
  BatchReason,
  Change,
  HubEnv,
  LiveSync,
  LiveSyncOptions,
  LiveSyncStatus,
  Refetch,
  SocketLike,
  WatchOptions,
} from './types'

/**
 * One hub per tab. Views `watch` the doctypes they show; the hub joins the
 * matching Frappe rooms, turns every change announcement into one coalesced
 * refetch per view, and keeps views current across reconnects, hidden tabs
 * and sibling tabs. Correctness never depends on replay: every (re)connect,
 * every return to the tab, every network recovery and a periodic
 * reconciliation reload what the views show.
 *
 * Permission model: record-scoped doctypes (`scopedDoctypes`) arrive only as
 * app events the server sends per authorized user; watching them joins no
 * room. Other doctypes use Frappe's `doctype:<dt>` / `doc:<dt>/<name>` rooms,
 * which the websocket server joins only after `frappe.realtime.has_permission`
 * allows the user to read them. Announcements carry identifiers only; what a
 * view shows always comes from its own permission-checked refetch.
 */

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000
const SEEN_IDS = 500

interface Watcher {
  doctypes: Set<string>
  names: Set<string> | null
  refetch: Refetch
  debounceMs: number
  minIntervalMs: number
  lastRunAt: number | null
  pending: Set<string>
  full: boolean
  reason: BatchReason
  firstAt: number | null
  timer: unknown
  running: boolean
  rerun: boolean
  failures: number
  active: boolean
}

interface Room {
  key: string
  doc: boolean
  count: number
  joined: boolean
  join: [string, ...string[]]
  leave: [string, ...string[]]
}

interface RelayMessage {
  v: 1
  type: 'change'
  origin: 'socket' | 'local'
  changes: Change[]
}

function defaultEnv(): HubEnv {
  const g = globalThis as any
  return {
    document: g.document,
    window: g.window,
    BroadcastChannel: g.BroadcastChannel,
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: (handle) => g.clearTimeout(handle),
    now: () => Date.now(),
    random: () => Math.random(),
  }
}

function asChanges(value: unknown): Change[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.filter((c): c is Change => !!c && typeof c.doctype === 'string' && c.doctype !== '')
}

/** Frappe's own announcements: `doc_update` (document rooms) and `list_update` (doctype rooms). */
function frappeChange(data: any): Change | null {
  if (!data || typeof data.doctype !== 'string') return null
  const change: Change = { doctype: data.doctype }
  if (typeof data.name === 'string' && data.name !== '') change.name = data.name
  if (typeof data.modified === 'string') change.modified = data.modified
  return change
}

let localIds = 0
function localId(): string {
  localIds += 1
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${localIds}`
}

export function createLiveSync(options: LiveSyncOptions = {}): LiveSync {
  const env: HubEnv = { ...defaultEnv(), ...options.env }
  const debounceMs = options.debounceMs ?? 200
  const maxWaitMs = options.maxWaitMs ?? 750
  const maxNames = options.maxNames ?? 50
  const jitterMs = options.resyncJitterMs ?? 300
  const reconcileMs = options.reconcileMs ?? 60_000
  const maxRooms = options.maxRooms ?? 24
  const maxDocRooms = options.maxDocRooms ?? 16
  const events = options.events ?? {}
  const scoped = new Set(options.scopedDoctypes ?? [])

  const watchers = new Set<Watcher>()
  const rooms = new Map<string, Room>()
  const reconnectListeners = new Set<() => void>()
  const seen = new Set<string>()
  let socket: SocketLike | null = null
  let everConnected = false
  let destroyed = false
  let reconcileTimer: unknown = null
  const cleanups: Array<() => void> = []

  const isHidden = () => env.document?.visibilityState === 'hidden'

  function remember(id: string | undefined): boolean {
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    if (seen.size > SEEN_IDS) seen.delete(seen.values().next().value as string)
    return true
  }

  // ---- refetch scheduling -------------------------------------------------

  function schedule(w: Watcher, delay = w.debounceMs, exact = false) {
    if (!w.active) return
    if (isHidden()) return // resynced on the next `visible`
    if (w.running) {
      w.rerun = true
      return
    }
    // A failing view keeps its backoff: new changes fold into the retry.
    if (!exact && w.failures > 0 && w.timer !== null) return
    const now = env.now()
    if (w.firstAt === null) w.firstAt = now
    let wait = exact ? delay : Math.max(0, Math.min(delay, maxWaitMs - (now - w.firstAt)))
    if (!exact && w.lastRunAt !== null && w.reason === 'change') wait = Math.max(wait, w.lastRunAt + w.minIntervalMs - now)
    if (w.timer !== null) env.clearTimeout(w.timer)
    w.timer = env.setTimeout(() => void flush(w), wait)
  }

  async function flush(w: Watcher) {
    w.timer = null
    if (!w.active) return
    const batch: Batch = { names: [...w.pending], full: w.full, reason: w.reason }
    w.pending.clear()
    w.full = false
    w.reason = 'change'
    w.firstAt = null
    w.lastRunAt = env.now()
    w.running = true
    let failed = false
    try {
      await w.refetch(batch)
    } catch (err) {
      failed = true
      console.warn('[live-sync] refetch failed', err)
    } finally {
      w.running = false
    }
    if (!w.active) return
    if (failed) {
      // Retry the whole view with backoff; newer changes fold into the retry.
      w.failures += 1
      w.full = true
      w.reason = 'retry'
      w.rerun = false
      const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (w.failures - 1))
      schedule(w, backoff, true)
      return
    }
    w.failures = 0
    if (w.rerun) {
      w.rerun = false
      schedule(w)
    }
  }

  function hasWork(w: Watcher) {
    return w.full || w.pending.size > 0
  }

  function enqueue(w: Watcher, name: string | undefined) {
    if (name === undefined || w.pending.size >= maxNames) w.full = true
    else w.pending.add(name)
    if (isHidden()) return
    schedule(w)
  }

  function dispatch(change: Change) {
    for (const w of watchers) {
      if (!w.doctypes.has(change.doctype)) continue
      if (w.names && change.name !== undefined && !w.names.has(change.name)) continue
      enqueue(w, change.name)
    }
  }

  function resync(jitter = false, reason: BatchReason = 'resync') {
    for (const w of watchers) {
      w.full = true
      if (w.reason === 'change') w.reason = reason
      schedule(w, jitter ? Math.floor(env.random() * jitterMs) : 0)
    }
  }

  // ---- sibling tabs -------------------------------------------------------

  let channel: BroadcastChannel | null = null
  if (options.channel !== false && env.BroadcastChannel) {
    const base = options.channel ?? 'muelle-live-sync'
    try {
      channel = new env.BroadcastChannel(options.namespace ? `${base}:${options.namespace}` : base)
      channel.onmessage = (event: MessageEvent<RelayMessage>) => {
        const msg = event.data
        if (!msg || msg.v !== 1 || msg.type !== 'change') return
        // A tab with a live socket hears socket announcements itself.
        if (msg.origin === 'socket' && socket?.connected) return
        // Received messages are applied here and never posted again.
        for (const change of asChanges(msg.changes)) if (remember(change.id)) dispatch(change)
      }
    } catch {
      channel = null
    }
  }

  function relay(origin: RelayMessage['origin'], changes: Change[]) {
    if (!channel || changes.length === 0) return
    try {
      channel.postMessage({ v: 1, type: 'change', origin, changes } satisfies RelayMessage)
    } catch {
      /* closed channel or uncloneable payload: siblings resync on focus */
    }
  }

  // ---- rooms --------------------------------------------------------------

  function emitRoom(args: readonly string[]) {
    if (!socket?.connected) return // joined on the next `connect`
    const [event, ...rest] = args
    socket.emit(event as string, ...rest)
  }

  function joinedCounts() {
    let all = 0
    let docs = 0
    for (const room of rooms.values()) {
      if (!room.joined) continue
      all += 1
      if (room.doc) docs += 1
    }
    return { all, docs }
  }

  function canJoin(doc: boolean) {
    const { all, docs } = joinedCounts()
    return all < maxRooms && (!doc || docs < maxDocRooms)
  }

  function retain(key: string, doc: boolean, join: Room['join'], leave: Room['leave']) {
    const room = rooms.get(key)
    if (room) {
      room.count += 1
      return
    }
    const joined = canJoin(doc)
    rooms.set(key, { key, doc, count: 1, joined, join, leave })
    if (joined) emitRoom(join)
    else console.warn('[live-sync] room cap reached; relying on reconciliation for', key)
  }

  function release(key: string) {
    const room = rooms.get(key)
    if (!room) return
    room.count -= 1
    if (room.count > 0) return
    rooms.delete(key)
    if (!room.joined) return
    emitRoom(room.leave)
    // A freed slot goes to the oldest room still waiting.
    for (const waiting of rooms.values()) {
      if (!waiting.joined && canJoin(waiting.doc)) {
        waiting.joined = true
        emitRoom(waiting.join)
        break
      }
    }
  }

  // ---- socket -------------------------------------------------------------

  function fromSocket(changes: Change[]) {
    const fresh = changes.filter((c) => remember(c.id))
    if (fresh.length === 0) return
    for (const change of fresh) dispatch(change)
    relay('socket', fresh)
  }

  function attach(s: SocketLike) {
    if (destroyed) return
    socket = s
    const onFrappe = (data: any) => fromSocket(asChanges(frappeChange(data)))
    const handlers: Array<[string, (data: any) => void]> = [
      ['doc_update', onFrappe],
      ['list_update', onFrappe],
      ...Object.entries(events).map(
        ([name, map]) =>
          [
            name,
            (data: any) => {
              try {
                fromSocket(asChanges(map(data)))
              } catch (err) {
                console.warn('[live-sync] event mapper failed', name, err)
              }
            },
          ] as [string, (data: any) => void],
      ),
    ]
    const onConnect = () => {
      // Every connection starts with no rooms and replays nothing: re-join,
      // then reload what the views show (the first connect too, since views
      // loaded before their rooms existed).
      for (const room of rooms.values()) if (room.joined) emitRoom(room.join)
      resync(true)
      if (!everConnected) {
        everConnected = true
        return
      }
      for (const listener of reconnectListeners) {
        try {
          listener()
        } catch {
          /* a listener never blocks the others */
        }
      }
    }
    for (const [name, fn] of handlers) s.on(name, fn)
    s.on('connect', onConnect)
    cleanups.push(() => {
      for (const [name, fn] of handlers) s.off(name, fn)
      s.off('connect', onConnect)
    })
    if (s.connected) onConnect()
  }

  if (options.socket) {
    Promise.resolve(options.socket).then(
      (s) => {
        if (s) attach(s)
      },
      (err) => console.warn('[live-sync] no socket; resync on return and reconciliation only', err),
    )
  }

  // ---- visibility, network, reconciliation --------------------------------

  function planReconcile() {
    if (reconcileTimer !== null) env.clearTimeout(reconcileTimer)
    reconcileTimer = null
    if (!reconcileMs || destroyed || isHidden()) return
    const wait = Math.floor(reconcileMs * (0.9 + env.random() * 0.2))
    reconcileTimer = env.setTimeout(() => {
      reconcileTimer = null
      resync(false, 'reconcile')
      planReconcile()
    }, wait)
  }

  const onVisibility = () => {
    if (isHidden()) {
      for (const w of watchers) {
        if (w.timer !== null) {
          env.clearTimeout(w.timer)
          w.timer = null
        }
      }
      planReconcile() // stops it
      return
    }
    // Coming back always reloads: a hidden tab may have been frozen and its
    // socket may have missed events without ever disconnecting.
    resync(true)
    planReconcile()
  }
  const onOnline = () => resync(true)
  if (env.document) {
    env.document.addEventListener('visibilitychange', onVisibility)
    cleanups.push(() => env.document?.removeEventListener('visibilitychange', onVisibility))
  }
  if (env.window) {
    env.window.addEventListener('online', onOnline)
    cleanups.push(() => env.window?.removeEventListener('online', onOnline))
  }
  planReconcile()

  // ---- public API ---------------------------------------------------------

  function watch(doctypes: string | string[], refetch: Refetch, watchOptions: WatchOptions = {}) {
    const list = (Array.isArray(doctypes) ? doctypes : [doctypes]).filter(Boolean)
    const names = watchOptions.names?.filter(Boolean)
    const w: Watcher = {
      doctypes: new Set(list),
      names: names && names.length > 0 ? new Set(names) : null,
      refetch,
      debounceMs: watchOptions.debounceMs ?? debounceMs,
      minIntervalMs: watchOptions.minIntervalMs ?? 0,
      lastRunAt: null,
      pending: new Set(),
      full: false,
      reason: 'change',
      firstAt: null,
      timer: null,
      running: false,
      rerun: false,
      failures: 0,
      active: true,
    }
    const keys: string[] = []
    for (const doctype of w.doctypes) {
      if (scoped.has(doctype)) continue // delivered per user by the server
      if (w.names) {
        for (const name of w.names) {
          const key = `doc:${doctype}/${name}`
          retain(key, true, ['doc_subscribe', doctype, name], ['doc_unsubscribe', doctype, name])
          keys.push(key)
        }
      } else {
        const key = `doctype:${doctype}`
        retain(key, false, ['doctype_subscribe', doctype], ['doctype_unsubscribe', doctype])
        keys.push(key)
      }
    }
    watchers.add(w)
    return () => {
      if (!w.active) return
      w.active = false
      if (w.timer !== null) env.clearTimeout(w.timer)
      watchers.delete(w)
      for (const key of keys) release(key)
    }
  }

  function notify(change: Change | Change[]) {
    const changes = asChanges(change).map((c) => ({ ...c, id: c.id ?? localId() }))
    for (const c of changes) {
      remember(c.id)
      dispatch(c)
    }
    relay('local', changes)
  }

  function onReconnect(listener: () => void) {
    reconnectListeners.add(listener)
    return () => void reconnectListeners.delete(listener)
  }

  function status(): LiveSyncStatus {
    const list = [...rooms.values()]
    return {
      connected: !!socket?.connected,
      rooms: list.filter((r) => r.joined).map((r) => r.key),
      overCap: list.filter((r) => !r.joined).map((r) => r.key),
    }
  }

  function destroy() {
    destroyed = true
    for (const w of watchers) {
      w.active = false
      if (w.timer !== null) env.clearTimeout(w.timer)
    }
    watchers.clear()
    for (const room of rooms.values()) if (room.joined) emitRoom(room.leave)
    rooms.clear()
    if (reconcileTimer !== null) env.clearTimeout(reconcileTimer)
    reconcileTimer = null
    for (const cleanup of cleanups.splice(0)) cleanup()
    channel?.close()
    channel = null
    reconnectListeners.clear()
  }

  return { watch, notify, resync, onReconnect, status, destroy }
}
