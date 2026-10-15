import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isMobile } from '@/composables/breakpoint'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { isTypingTarget } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import {
  cssValue,
  domId as rowDomId,
  keyAction,
  loadLength,
  moveFocus,
  patchQuery,
  rangeKeys,
  readMemory,
  textParam,
  writeMemory,
} from '@/utils/powerList'

// One power worklist (the Agenda/Cobranza standard) for a module's queue:
//
// * the URL is the list's state — its filters, the search and the focused row
//   (`foco`); a filter pushes a history entry, the search replaces it, and the
//   focused row moves with `replace`, so «back» from a record lands on it;
// * scroll and loaded-rows memory per list (never per focused row);
// * the keyboard works the list (j/k/Enter/x/Shift+X/⌘A, / and Esc) and the
//   module's verbs, never while typing or under a sheet, and lists the verbs
//   in the Alt+H sheet;
// * live: a change to the watched doctypes reloads the rows already shown in
//   place, no more often than the floor;
// * selection for one bulk action.
//
// The page renders the rows and owns its sheets; this owns the list's state.

const PAGE = 30
const MAX_PAGE = 100

/**
 * @param {object} options
 * @param {string} options.name            module key (memory and element ids)
 * @param {string} options.routeName       the list's route name
 * @param {(query) => any[]} options.filters  the URL values that reload the list
 * @param {(query) => string} options.memoryKey  scroll memory key of a list
 * @param {(args) => Promise<object>} options.fetch  one page: `{rows, has_more}`
 * @param {(page, ctx) => void} [options.onPage]  keep the page's other data
 * @param {(row) => string} [options.rowKey]  a row's key in this list
 * @param {(row) => string} [options.focusOf]  a row's value in `foco`
 * @param {(row) => void} options.open      navigate to the row's record
 * @param {object} options.keys            combo → action (listKeys(verbs))
 * @param {object} [options.verbs]         action → (row, ctx) => void
 * @param {() => object[]} [options.shortcuts]  Alt+H rows for the verbs
 * @param {() => boolean} [options.enabled]  the module is ready (boot)
 * @param {() => boolean} [options.paused]   keys off (guard, another view)
 * @param {() => boolean} [options.selectable]  this list has a bulk action
 * @param {{doctypes: string[], minIntervalMs?: number}} [options.live]
 */
export function usePowerList(options) {
  const route = useRoute()
  const router = useRouter()
  const phone = isMobile
  const focusParam = options.focusParam || 'foco'
  const rowKey = options.rowKey || ((row) => row.name)
  const focusOf = options.focusOf || rowKey
  const enabled = options.enabled || (() => true)
  const paused = options.paused || (() => false)
  const selectable = options.selectable || (() => true)
  const verbs = options.verbs || {}
  const pageSize = options.pageSize || PAGE
  const maxPage = options.maxPage || MAX_PAGE
  const socket =
    getCurrentInstance()?.appContext.config.globalProperties.$socket

  const scroller = ref(null)
  const listbox = ref(null)
  const rows = ref([])
  const hasMore = ref(false)
  const loading = ref(false)
  const problem = ref(null)
  const search = ref(textParam(route.query.q))
  const searchOpen = ref(Boolean(textParam(route.query.q)))
  const focusKey = ref('')
  const selected = ref(new Set())
  const anchor = ref('')
  const selecting = ref(false)
  const keys = computed(() => rows.value.map(rowKey))
  const selectedRows = computed(() =>
    rows.value.filter((row) => selected.value.has(rowKey(row))),
  )
  const focusedRow = computed(
    () => rows.value.find((row) => rowKey(row) === focusKey.value) || null,
  )
  const focusValue = computed(() => textParam(route.query[focusParam]))
  let ticket = 0
  let searchTimer = 0

  // ── loading, scroll memory ───────────────────────────────────────────────

  const memoryKey = () => options.memoryKey(route.query)
  function rememberScroll() {
    writeMemory(memoryKey(), {
      top: scroller.value?.scrollTop || 0,
      count: rows.value.length,
    })
  }

  /**
   * Load the list. `more`: the next page. `quiet` (live refresh, after an
   * action): the rows already shown reload in place, keeping focus, selection
   * and scroll. `restore`: the first load of a list (or a return to it): as
   * many rows as were loaded before, then the remembered scroll position.
   */
  async function load({ more = false, quiet = false, restore = false } = {}) {
    const mine = ++ticket
    const remembered = restore ? readMemory(memoryKey()) : null
    const length = loadLength({
      more,
      quiet,
      shown: rows.value.length,
      remembered: remembered?.count,
      page: pageSize,
      max: maxPage,
    })
    loading.value = true
    if (!quiet) problem.value = null
    try {
      const page = await options.fetch({
        start: more ? rows.value.length : 0,
        page_length: length,
        more,
        quiet,
      })
      if (mine !== ticket) return
      rows.value = more ? [...rows.value, ...page.rows] : page.rows
      hasMore.value = Boolean(page.has_more)
      options.onPage?.(page, { more, quiet })
      problem.value = null
      syncFocus()
      pruneSelection()
      if (remembered) restoreScroll(remembered.top)
      else if (restore) revealFocus()
    } catch (error) {
      if (mine === ticket) problem.value = options.problemOf?.(error) || error
    } finally {
      if (mine === ticket) loading.value = false
    }
  }

  function restoreScroll(top) {
    nextTick(() => {
      if (scroller.value && top) scroller.value.scrollTop = top
      revealFocus()
    })
  }

  /** The focused row follows the URL's `foco` (back from a record lands on it). */
  function syncFocus() {
    const row = focusValue.value
      ? rows.value.find((r) => focusOf(r) === focusValue.value)
      : null
    if (row) focusKey.value = rowKey(row)
    else if (!keys.value.includes(focusKey.value)) focusKey.value = ''
  }

  function pruneSelection() {
    const present = new Set(keys.value)
    const kept = [...selected.value].filter((key) => present.has(key))
    if (kept.length !== selected.value.size) selected.value = new Set(kept)
  }

  function revealFocus() {
    nextTick(() => {
      if (!focusKey.value || !scroller.value) return
      scroller.value
        .querySelector(`[data-row-key="${cssValue(focusKey.value)}"]`)
        ?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  function focusRow(row) {
    if (!row) return Promise.resolve()
    focusKey.value = rowKey(row)
    rememberScroll()
    if (focusValue.value === focusOf(row)) return Promise.resolve()
    return Promise.resolve(
      router.replace({
        query: patchQuery(route.query, { [focusParam]: focusOf(row) }),
      }),
    ).catch(() => {})
  }

  /** The list query a record keeps to come back to this row. */
  function returnQuery(row) {
    return patchQuery(route.query, { [focusParam]: focusOf(row) })
  }

  /** Filters push a history entry (back undoes them); the search replaces. */
  function navigate(patch, { replace = false } = {}) {
    const query = patchQuery(route.query, { ...patch, [focusParam]: '' })
    return replace ? router.replace({ query }) : router.push({ query })
  }

  async function openRow(row, extra = undefined) {
    // The list's history entry keeps this row focused, so «back» lands on it.
    await focusRow(row)
    options.open(row, extra)
  }

  function onRowClick(event, row) {
    // A new tab keeps the link; here the focus moves first so going back lands on the row.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return
    event.preventDefault()
    openRow(row)
  }

  // ── selection ──────────────────────────────────────────────────────────

  function toggleRow(row) {
    const key = rowKey(row)
    const next = new Set(selected.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selected.value = next
    anchor.value = key
    focusKey.value = key
  }
  function extendSelection() {
    if (!focusKey.value) return
    const next = new Set(selected.value)
    for (const key of rangeKeys(
      keys.value,
      anchor.value || focusKey.value,
      focusKey.value,
    ))
      next.add(key)
    selected.value = next
  }
  function selectAll() {
    selected.value = new Set(keys.value)
  }
  function clearSelection() {
    selected.value = new Set()
    selecting.value = false
  }

  // ── keyboard: never while typing, never under a sheet ─────────────────────

  registerPageShortcuts('list', () =>
    options.shortcuts ? options.shortcuts() : [],
  )

  function searchInput() {
    return document.querySelector(
      '[data-power-search] input, input[data-power-search]',
    )
  }
  function focusSearch() {
    if (phone.value) {
      searchOpen.value = true
      return
    }
    searchInput()?.focus()
  }

  function moveTo(delta) {
    const key = moveFocus(keys.value, focusKey.value, delta)
    const row = rows.value.find((r) => rowKey(r) === key)
    if (!row) return
    // The keyboard's place is the list (aria-activedescendant): Enter opens the
    // focused row even after a click on a chip or a button left focus there.
    listbox.value?.focus?.({ preventScroll: true })
    focusRow(row)
    revealFocus()
  }

  function onKey(event) {
    if (event.defaultPrevented || !enabled() || paused()) return
    if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
    const action = keyAction(event, options.keys, { apple: appleKeys })
    if (!action) return
    if (isTypingTarget(event.target)) {
      if (action === 'escape' && event.target === searchInput()) {
        event.preventDefault()
        event.target.blur()
      }
      return
    }
    if (
      action === 'open' &&
      event.target?.closest?.('a, button, [role="button"]')
    )
      return
    const row = focusedRow.value
    const handlers = {
      next: () => moveTo(1),
      prev: () => moveTo(-1),
      open: () => row && openRow(row),
      toggle: () => row && selectable() && toggleRow(row),
      range: () => selectable() && extendSelection(),
      all: () => selectable() && selectAll(),
      search: () => focusSearch(),
      escape: () =>
        selected.value.size ? clearSelection() : (focusKey.value = ''),
    }
    const handler =
      handlers[action] ||
      (verbs[action]
        ? () => verbs[action](row, { selectedRows: selectedRows.value })
        : null)
    if (!handler) return
    event.preventDefault()
    handler()
  }

  // ── live: someone (or another tab) changed a record of this list ──────────

  if (options.live?.doctypes?.length)
    useLiveWatch(
      hoyLive(socket),
      options.live.doctypes,
      () => {
        if (enabled() && !paused() && route.name === options.routeName)
          load({ quiet: true })
      },
      { minIntervalMs: options.live.minIntervalMs ?? 5000 },
    )

  watch(search, (value) => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      if (value.trim() !== textParam(route.query.q))
        navigate({ q: value.trim() }, { replace: true })
    }, 250)
  })
  // Only the filters reload the list; the focused row does not.
  watch(
    () => JSON.stringify(options.filters(route.query)),
    () => {
      if (route.name !== options.routeName || !enabled() || paused()) return
      // Back/forward: the search box follows the URL.
      const q = textParam(route.query.q)
      if (search.value.trim() !== q) search.value = q
      clearSelection()
      load({ restore: true })
    },
  )
  watch(focusValue, () => syncFocus())

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.clearTimeout(searchTimer)
  })

  return {
    phone,
    scroller,
    listbox,
    rows,
    hasMore,
    loading,
    problem,
    search,
    searchOpen,
    focusKey,
    focusedRow,
    selected,
    selectedRows,
    selecting,
    load,
    navigate,
    focusRow,
    openRow,
    onRowClick,
    returnQuery,
    rememberScroll,
    revealFocus,
    toggleRow,
    extendSelection,
    selectAll,
    clearSelection,
    rowKey,
    domId: (key) => rowDomId(options.name, key),
    onKey,
  }
}
