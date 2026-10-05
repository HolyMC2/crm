// Vendored from muelle/workspace/packages/live-sync@0.1.0 (c813e3981ed0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
/** The slice of a socket.io client the hub uses. */
export interface SocketLike {
  readonly connected: boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
}

/**
 * One changed record. Carries identifiers only: whoever receives it refetches
 * through the app's normal permission-checked API. A change without `name`
 * means "anything of this doctype may have changed" (bulk edits, overflow).
 */
export interface Change {
  doctype: string
  name?: string
  /** insert | update | submit | cancel | delete | bulk | stock … (informative). */
  op?: string
  /** `modified` of the saved record when known. */
  modified?: string
  /** Event id from the server envelope; sibling-tab copies are deduplicated on it. */
  id?: string
}

export type BatchReason = 'change' | 'resync' | 'reconcile' | 'retry'

/** What a watcher's refetch receives once a burst of changes has settled. */
export interface Batch {
  /** Names that changed, deduplicated, in arrival order. */
  names: string[]
  /** True when the watcher must reload everything it shows (resync, reconnect,
   *  unnamed change, overflow or a retry); `names` is then incomplete. */
  full: boolean
  reason: BatchReason
}

export type Refetch = (batch: Batch) => unknown

export interface WatchOptions {
  /** Only these records: joins their document rooms instead of the doctype room. */
  names?: string[]
  /** Quiet period before the refetch runs (default: the hub's `debounceMs`). */
  debounceMs?: number
  /** Floor between two push refetches of this watcher, for heavy views such as
   *  dashboards; changes in between are folded into the next run (ms). */
  minIntervalMs?: number
}

/** Maps an app-specific socket event to the changes it announces. */
export type EventMapper = (data: any) => Change | Change[] | null | undefined

/** Browser pieces the hub touches; injectable for tests and non-browser hosts. */
export interface HubEnv {
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  BroadcastChannel?: typeof BroadcastChannel
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: any) => void
  now: () => number
  random: () => number
}

export interface LiveSyncOptions {
  /** The app's socket, or a promise for it (lazy socket.io import). Null: no push,
   *  sibling-tab relay, return and reconciliation resyncs still work. */
  socket?: SocketLike | Promise<SocketLike | null> | null
  /** BroadcastChannel base name; false disables the relay. */
  channel?: string | false
  /** Appended to the channel name: site, user and session generation, so tabs
   *  of another user or an older session never hear this one. */
  namespace?: string
  /** App events besides Frappe's `doc_update` / `list_update`. */
  events?: Record<string, EventMapper>
  /** Doctypes whose changes the server delivers per authorized user (app
   *  events): watching them never joins a Frappe room, so Frappe's own
   *  room-wide `list_update` cannot leak other shops' record names. */
  scopedDoctypes?: string[]
  /** Quiet period before a refetch (ms, default 200). */
  debounceMs?: number
  /** A continuous stream still refetches at least this often (ms, default 750). */
  maxWaitMs?: number
  /** Names kept per watcher before the batch collapses to `full` (default 50). */
  maxNames?: number
  /** Resyncs after (re)connect or network return spread over this window (ms, default 300). */
  resyncJitterMs?: number
  /** Foreground reconciliation period, ±10 % jitter (ms, default 60 000; 0 disables). */
  reconcileMs?: number
  /** Room caps per tab (defaults 24 rooms, of which at most 16 document rooms). */
  maxRooms?: number
  maxDocRooms?: number
  env?: Partial<HubEnv>
}

export interface LiveSyncStatus {
  connected: boolean
  /** Rooms joined (or waiting for the socket to connect). */
  rooms: string[]
  /** Rooms wanted but over the cap: those views rely on reconciliation. */
  overCap: string[]
}

export interface LiveSync {
  /** Call `refetch` after `doctypes` change. Returns the unsubscribe. */
  watch(doctypes: string | string[], refetch: Refetch, options?: WatchOptions): () => void
  /** Announce a change this tab made: sibling tabs and this tab's other views refetch. */
  notify(change: Change | Change[]): void
  /** Every watcher reloads fully (spread by jitter when `jitter` is true). */
  resync(jitter?: boolean, reason?: BatchReason): void
  /** Runs after each reconnect, after rooms are re-joined. Returns the unsubscribe. */
  onReconnect(listener: () => void): () => void
  status(): LiveSyncStatus
  destroy(): void
}
