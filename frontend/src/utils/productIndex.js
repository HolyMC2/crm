// The worker's products, kept on this device so Ctrl+K ranks them on the
// keystroke, as Taller ranks its parts: the code, name, group and brand of
// every product they may read, in the server's default order
// (doco.workspaces.products.palette_index). Price and stock are not kept: the
// palette asks for those of the few rows it shows, and the server reads each
// again under the worker's permissions (products.palette `names`).
//
// The list carries the server's stamp, and every palette answer brings the
// stamp of the moment. When they differ the server did not trust this list
// for that answer (it searched itself) and a new one is read. A list an hour
// old is read again as well, for its order: what is on hand, what sold last.
import { call } from 'frappe-ui'
import { bootScope } from '@/vendor/muelle-shell/contracts'
import {
  fold,
  isCandidate,
  rank,
  searchable,
  termPatterns,
} from '@/utils/itemRank'

// The palette shows this many products (doco PALETTE_ROWS), the best of the
// first PRODUCT_POOL the text may mean in the default order (doco
// PALETTE_POOL): what the shop has and sells comes before the rest of the
// catalogue, here as on the server.
export const PRODUCT_ROWS = 5
export const PRODUCT_POOL = 200
export const PRODUCT_INDEX_STALE_MS = 60 * 60 * 1000
// After a stamp that differed the next read waits this long (a catalogue
// being edited is not read at every change); after a read that failed, longer
// (offline, or a server that has no list to give).
export const PRODUCT_INDEX_RETRY_MS = 30 * 1000
export const PRODUCT_INDEX_FAILED_MS = 5 * 60 * 1000
// A row's price and stock, as last answered, show at once this long.
export const PRODUCT_DETAILS_MS = 60 * 1000
const DETAILS_KEPT = 400

const DATABASE = 'muelle-palette'
const STORE = 'products'

// One copy per site and worker, as the palette's recents and reach.
function storageKey() {
  const user = decodeURIComponent(
    globalThis.document?.cookie
      ?.split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
  const site = globalThis.window?.site_name || globalThis.location?.host
  return bootScope(site, user)
}

// IndexedDB: a catalogue of ten thousand products is most of a megabyte,
// too much to parse out of localStorage before the palette opens.
function deviceBackend() {
  let opened = null
  const open = () => {
    opened ||= import('idb-keyval').then((idb) => ({
      idb,
      store: idb.createStore(DATABASE, STORE),
    }))
    return opened
  }
  return {
    get: async (key) => {
      const { idb, store } = await open()
      return idb.get(key, store)
    },
    set: async (key, value) => {
      const { idb, store } = await open()
      return idb.set(key, value, store)
    },
    clear: async () => {
      const { idb, store } = await open()
      return idb.clear(store)
    },
  }
}

let backend = deviceBackend()
// The list in use, the read under way, the stored copy's one restore, and
// until when no new read begins (after a stamp's read, or a failure).
let current = null
let reading = null
let restoring = null
let waitUntil = -Infinity
// Bumped at sign-out: a read that began before it keeps nothing.
let session = 0
let memo = { index: null, text: null, found: null }
const details = new Map()

function valid(kept) {
  return (
    !!kept &&
    typeof kept.at === 'number' &&
    typeof kept.stamp === 'string' &&
    Array.isArray(kept.rows) &&
    Array.isArray(kept.barcodes)
  )
}

// Each product keeps its texts and code folded, so a keystroke only looks
// for the typed words in them; the few it then ranks are split into search
// words on first use (`wordsOf`).
function prepare(kept) {
  const rows = []
  const byCode = new Map()
  for (const entry of kept.rows) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
    const [name, itemName, group, brand] = entry
    const row = {
      name,
      title: itemName || name,
      item_group: group || '',
      brand: brand || '',
      texts: fold(`${itemName || ''}\n${group || ''}\n${brand || ''}`),
      code: name.toLowerCase(),
      search: null,
    }
    rows.push(row)
    byCode.set(row.code, row)
  }
  const byBarcode = new Map()
  for (const entry of kept.barcodes) {
    if (!Array.isArray(entry)) continue
    const row = byCode.get(String(entry[1] ?? '').toLowerCase())
    const barcode = String(entry[0] ?? '').toLowerCase()
    if (!row || !barcode) continue
    if (!byBarcode.has(barcode)) byBarcode.set(barcode, [])
    byBarcode.get(barcode).push(row)
  }
  return {
    at: kept.at,
    stamp: kept.stamp,
    complete: kept.complete === true,
    rows,
    byCode,
    byBarcode,
  }
}
const wordsOf = (row) =>
  (row.search ||= searchable(
    row.title,
    [row.item_group, row.brand],
    [row.name],
  ))

function read(now) {
  if (reading) return reading
  const began = session
  const request = call('doco.workspaces.products.palette_index')
    .then((answer) => {
      if (began !== session) return null
      const kept = {
        at: now,
        stamp: String(answer?.stamp || ''),
        complete: answer?.complete === true,
        rows: Array.isArray(answer?.rows) ? answer.rows : [],
        barcodes: Array.isArray(answer?.barcodes) ? answer.barcodes : [],
      }
      current = prepare(kept)
      // No room or no storage: the list stays in memory for this page only.
      backend.set(storageKey(), kept).catch(() => {})
      return current
    })
    .catch(() => {
      // Offline, or a server that has no list yet: keep what there is.
      waitUntil = now + PRODUCT_INDEX_FAILED_MS
      return current
    })
    .finally(() => {
      if (reading === request) reading = null
    })
  reading = request
  return reading
}

const usable = (index) => (index?.complete ? index : null)

/**
 * The list, ready to rank: this page's, else the copy this device kept, else
 * read now. A copy past PRODUCT_INDEX_STALE_MS answers while a new one is
 * read. Null when there is none to use: the catalogue is too large for a
 * device (the server says so), or the read failed; the palette then asks the
 * server to search, as it did before.
 */
export async function loadProductIndex({ now = Date.now() } = {}) {
  if (!current) {
    restoring ||= backend
      .get(storageKey())
      .then((kept) => {
        if (!current && valid(kept)) current = prepare(kept)
      })
      .catch(() => {})
    await restoring
  }
  const waiting = now < waitUntil
  if (!current) return waiting ? null : usable(await read(now))
  if (now - current.at >= PRODUCT_INDEX_STALE_MS && !waiting) read(now)
  return usable(current)
}

/**
 * The stamp a palette answer brought. One that differs from the list's means
 * the catalogue changed, or what the worker may read did: read it again.
 */
export function noteProductStamp(stamp, { now = Date.now() } = {}) {
  if (!usable(current) || !stamp || stamp === current.stamp) return
  if (now < waitUntil) return
  waitUntil = now + PRODUCT_INDEX_RETRY_MS
  read(now)
}

/**
 * The products the text finds in the list on this device, best first, as
 * products.palette finds them: the exact code or a scanned barcode leads,
 * then the shared ranker orders the first PRODUCT_POOL products the text may
 * mean. `{ stamp, names, rows }`, or null when the device has no list to
 * rank.
 */
export function findProducts(text) {
  const index = usable(current)
  if (!index) return null
  if (memo.index === index && memo.text === text) return memo.found
  const typed = String(text).toLowerCase()
  const exact = new Set(
    [index.byCode.get(typed), ...(index.byBarcode.get(typed) || [])].filter(
      Boolean,
    ),
  )
  const patterns = termPatterns(text)
  const pool = []
  // No search word (a query of signs only) finds the exact code alone.
  if (patterns.length)
    for (const row of index.rows) {
      if (exact.has(row) || !isCandidate(patterns, row.texts, row.code))
        continue
      pool.push(row)
      if (pool.length + exact.size >= PRODUCT_POOL) break
    }
  const rows = [...exact, ...rank(pool, text, wordsOf)].slice(0, PRODUCT_ROWS)
  const found = {
    stamp: index.stamp,
    names: rows.map((row) => row.name),
    rows: rows.map(({ name, title, item_group }) => ({
      name,
      title,
      item_group,
    })),
  }
  memo = { index, text, found }
  return found
}

/** Keep the rows a palette answer brought (price, stock) for the next keystrokes. */
export function keepProductDetails(items, { now = Date.now() } = {}) {
  if (details.size > DETAILS_KEPT) details.clear()
  for (const row of items || [])
    if (row && typeof row.name === 'string')
      details.set(row.name, { at: now, row })
}

/** A product's last answered row while it is fresh, else null. */
export function productDetails(name, { now = Date.now() } = {}) {
  const kept = details.get(name)
  return kept && now - kept.at < PRODUCT_DETAILS_MS ? kept.row : null
}

/** Sign-out: no worker's product list stays on a shared device. */
export async function forgetProductIndex() {
  session += 1
  current = null
  reading = null
  restoring = null
  memo = { index: null, text: null, found: null }
  details.clear()
  await backend.clear().catch(() => {})
}

/** Tests: start over, on a given store (`get`, `set`, `clear`). */
export function _resetProductIndex(store) {
  backend = store || deviceBackend()
  current = null
  reading = null
  restoring = null
  waitUntil = -Infinity
  memo = { index: null, text: null, found: null }
  details.clear()
}
