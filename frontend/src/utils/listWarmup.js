import { currentScope } from '@/composables/muelleShell'
import { listKey, readCachedList, writeCachedList } from './listCache'
import { afterFirstRoute } from './prefetch'

// The worker's main modules (the phone bar's slots) have their default list
// read once per page load in idle time after the first route, and saved the
// way a visit saves it, so even the first open this session paints at once.
// The key and the read are the ones the page itself makes for its plain URL
// (no query); a page whose default differs simply reads as before.

// A copy younger than this needs no warm-up.
export const WARM_FRESH_MS = 10 * 60 * 1000
const PAGE = 30
const SLOW_LINES = new Set(['slow-2g', '2g'])

/** Each module's default list: its key and its read (null: nothing to warm). */
export const WARMERS = {
  async pendientes() {
    const { parseQuery, pendientesApi, queueArgs } = await import(
      '@/composables/usePendientes'
    )
    const s = parseQuery({})
    return {
      list: listKey('pendientes', [
        s.segment,
        s.source,
        s.priority,
        s.from,
        s.to,
      ]),
      read: () => pendientesApi('queue', queueArgs(s, 0)),
    }
  },
  async compras() {
    const { comprasApi, loadComprasBoot, queueState } = await import(
      '@/composables/useCompras'
    )
    if (!(await loadComprasBoot())?.enabled) return null
    const s = queueState({})
    return {
      list: listKey('compras', [s.segment, s.q]),
      read: () =>
        comprasApi('queue', {
          segment: s.segment,
          search: '',
          start: 0,
          page_length: PAGE,
        }),
    }
  },
  async productos() {
    const {
      catalogArgs,
      isInventoryView,
      listState,
      loadProductosBoot,
      productosApi,
    } = await import('@/composables/useProductos')
    if (!(await loadProductosBoot())?.enabled) return null
    const s = listState({})
    const filters =
      s.view === 'todos'
        ? catalogArgs(s)
        : isInventoryView(s.view)
          ? { days: s.days, group: s.group, brand: s.brand }
          : {}
    return {
      list: listKey('productos', [s.view, s.store, filters]),
      read: () =>
        productosApi('queue', {
          view: s.view,
          search: '',
          store: s.store,
          start: 0,
          page_length: PAGE,
          ...filters,
        }),
    }
  },
}

/** Data saver or a 2g line: lists load when opened. */
export function warmUpAllowed(connection = globalThis.navigator?.connection) {
  return !connection?.saveData && !SLOW_LINES.has(connection?.effectiveType)
}

/**
 * Reads the default list of each module in `modules` (skipping `except`, the
 * one on screen) one after another; failures are ignored, the page reads
 * again when opened.
 */
export async function warmLists(
  modules,
  { except = null, warmers = WARMERS } = {},
) {
  if (!warmUpAllowed()) return []
  const warmed = []
  const scope = currentScope()
  for (const module of modules) {
    if (module === except || !warmers[module]) continue
    try {
      const target = await warmers[module]()
      if (!target || readCachedList(target.list, scope, WARM_FRESH_MS)) continue
      const answer = await target.read()
      // Signed out or switched user meanwhile: never save under another scope.
      if (currentScope() !== scope) return warmed
      writeCachedList(target.list, answer, scope)
      warmed.push(module)
    } catch {
      // The page reads it when opened.
    }
  }
  return warmed
}

let scheduled = false
/**
 * Once per page load: after the first route and an idle slot, warms the lists
 * of `modules()` except the one `current()` names (read at that moment).
 */
export function warmListsAfterFirstRoute(router, modules, current) {
  if (scheduled) return
  scheduled = true
  afterFirstRoute(router, () => warmLists(modules(), { except: current() }))
}

/** Tests only. */
export function _resetWarmUp() {
  scheduled = false
}
