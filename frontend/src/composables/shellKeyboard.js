import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  unref,
  watch,
} from 'vue'
import {
  KEYMAP,
  SHELL_MESSAGES_ES_MX,
  cheatSheet,
  createShortcutMatcher,
  esMx,
  format,
  formatCombo,
  isTypingTarget,
  normalizeCombo,
} from '@/vendor/muelle-shell/contracts'

// Global shell shortcuts from the shared keymap (Muelle keyboard standard, see
// the shell-contracts README): ⌘K / Ctrl+K «Buscar o ir a…», ⌘G / Ctrl+G
// «Buscar registros», Alt+H (and `?` outside fields) the cheat sheet, `g` +
// letter goes to a module, `c` creates in this module, `[` the rail, Esc the
// page's top layer. Pages answer their list/form keys through registerPageKeys()
// (usually via useListKeys/useFormKeys), so the sheet lists only keys that work.

export const appleKeys = /Mac|iPhone|iPad/.test(
  (typeof navigator !== 'undefined' &&
    (navigator.platform || navigator.userAgent)) ||
    '',
)

/** `mod+k` → «Ctrl+K», or «⌘K» on Apple. */
export const keyLabel = (combo, apple = appleKeys) => formatCombo(combo, apple)

/** `aria-keyshortcuts` value of a normalized combo (`mod+k` → `Control+K`). */
export function ariaKeys(combo, apple = appleKeys) {
  return combo
    .split('+')
    .map((part) =>
      part === 'mod'
        ? apple
          ? 'Meta'
          : 'Control'
        : part === 'alt'
          ? 'Alt'
          : part === 'shift'
            ? 'Shift'
            : part.length === 1
              ? part.toUpperCase()
              : part,
    )
    .join('+')
}

/**
 * Keyboard-standard copy for a Spanish worker is the contracts' reviewed es-MX
 * (the README is the source of truth, and other apps' catalogs translate the
 * same English differently: Frappe's «Show keyboard shortcuts» is «Mostrar
 * atajos de teclado», the standard says «Ver los atajos de teclado»). Any other
 * string, or another language: the app catalog (`__`), then the contracts'
 * copy, so a shared string never reaches a worker in English while its catalog
 * entry is missing. With a `context`, only the contextual catalog entry counts.
 */
export function shellT(source, replace = [], context = null) {
  const lang = typeof window !== 'undefined' ? window.lang : null
  if (/^es\b/i.test(lang || '') && source in SHELL_MESSAGES_ES_MX)
    return esMx(source, replace)
  const tr =
    typeof window !== 'undefined' && typeof window.__ === 'function'
      ? window.__
      : null
  if (tr) {
    const own = tr(source, replace, context)
    const missing = context ? tr(source, replace) : format(source, replace)
    if (own !== missing) return own
  }
  return esMx(source, replace)
}

/** Title and `aria-keyshortcuts` of a search entry: both keys of the dialog. */
export function searchEntryHint(apple = appleKeys) {
  return {
    label: [
      `${shellT('Search or go to…')} (${keyLabel('mod+k', apple)})`,
      `${shellT('Search records')} (${keyLabel('mod+g', apple)})`,
    ].join(' · '),
    aria: `${ariaKeys('mod+k', apple)} ${ariaKeys('mod+g', apple)}`,
  }
}

// --- the page registry ------------------------------------------------------

const pages = shallowRef([])
let nextId = 0

// KEYMAP rows a page may answer: the list/form keys, plus `create` (its own
// create beats the shell's module target) and `close` (Esc closes its panel).
const PAGE_IDS = new Set(
  KEYMAP.filter((s) => s.context !== 'global')
    .map((s) => s.id)
    .concat(['create', 'close']),
)

/**
 * A page declares the keys it answers, and the shell's one keyboard listener
 * calls them (contracts matcher: same typing rules, same `g` sequences).
 * - `keys`: KEYMAP id → handler(event), or a getter of that map. Only these rows of the list/form
 *   contexts appear in «En esta página», so the sheet lists exactly what works.
 *   A handler returns `false` when it did nothing (the key then keeps its
 *   native meaning).
 * - `extra`: the page's own keys (Shortcut[] with `run(event)`, or a getter
 *   for keys that depend on state); `aliases` match without being listed. A
 *   page key claiming a global key (Agenda's «c») replaces that global row.
 * - `root`: element (or ref) of the page's area; when the focus is inside it,
 *   this page answers before the others.
 * - `enabled`: getter; while false the page answers nothing (its own form open).
 * - `answers`: KEYMAP ids the page answers with its own listener (the power
 *   lists' j/k/x…): listed like `keys`, never called by the shell.
 * Called in setup, it lasts until the component unmounts; it also returns the
 * function that removes it.
 */
export function registerPageKeys({
  keys = {},
  extra = [],
  root = null,
  enabled = null,
  answers = [],
} = {}) {
  // `keys` may be a getter: a record whose edit right arrives later lists «e»
  // from then on.
  const handlers = () => {
    const own = {}
    const map = typeof keys === 'function' ? keys() : unref(keys) || {}
    for (const [id, handler] of Object.entries(map))
      if (typeof handler === 'function' && PAGE_IDS.has(id)) own[id] = handler
    return own
  }
  const answered = () => [
    ...new Set([
      ...Object.keys(handlers()),
      ...answers.filter((id) => PAGE_IDS.has(id)),
    ]),
  ]
  const entry = {
    id: ++nextId,
    contexts: () => {
      const own = new Set(answered())
      return [
        ...new Set(
          KEYMAP.filter((s) => own.has(s.id) && s.context !== 'global').map(
            (s) => s.context,
          ),
        ),
      ]
    },
    handlers,
    answered,
    root,
    enabled: () => (typeof enabled === 'function' ? enabled() : true) !== false,
    extra: () =>
      (typeof extra === 'function' ? extra() : unref(extra) || []).filter(
        Boolean,
      ),
  }
  pages.value = [...pages.value, entry]
  const remove = () => {
    pages.value = pages.value.filter((page) => page !== entry)
  }
  if (getCurrentInstance()) onBeforeUnmount(remove)
  return remove
}

/**
 * Keys a page lists and answers with its own listener (H3a API, kept): the
 * power lists declare the «list» context (every KEYMAP list row), record pages
 * and Agenda `null` with only their own keys. `extra` as in registerPageKeys.
 */
export function registerPageShortcuts(context, extra = []) {
  const contexts = new Set(
    [context].flat().filter((value) => value && value !== 'global'),
  )
  const answers = KEYMAP.filter((s) => contexts.has(s.context)).map((s) => s.id)
  return registerPageKeys({ extra, answers })
}

const rootOf = (page) => {
  const el = unref(page.root)
  return el?.$el ?? el ?? null
}

/** Mounted, enabled pages; the one holding the focus first, then in mount order. */
function activePages(focused = null) {
  const live = pages.value.filter((page) => page.enabled())
  if (!focused) return live
  const inside = live.filter((page) => rootOf(page)?.contains?.(focused))
  return [...inside, ...live.filter((page) => !inside.includes(page))]
}

/** What the mounted pages declared: contexts, answered ids and their own keys. */
export const pageShortcuts = computed(() => {
  const live = activePages()
  return {
    contexts: [...new Set(live.flatMap((page) => page.contexts()))],
    ids: [...new Set(live.flatMap((page) => page.answered()))],
    extra: live.flatMap((page) =>
      // The sheet gets the declaration only, not the page's run/aliases.
      page.extra().map((shortcut) => ({
        context: 'global',
        id: shortcut.id,
        keys: shortcut.keys,
        description: shortcut.description,
        ...(shortcut.context ? { context: shortcut.context } : {}),
        ...(shortcut.module ? { module: shortcut.module } : {}),
      })),
    ),
  }
})

// --- shell-level keys: create in this module ---------------------------------

/** Set by the shell: the current module's create action (the palette's), or null. */
export const shellCreate = shallowRef(null)

// Global keys the shell itself answers. Go-to keys count only for the
// modules this worker has; `create` only where this module (or the page) has
// a create action. `[` shows or hides the app names in the desktop rail.
const SHELL_GLOBAL_IDS = new Set([
  'help',
  'palette',
  'records',
  'close',
  'sidebar',
])

/** KEYMAP reduced to the keys that work here. */
export function shellKeymap(
  modules = [],
  page = { ids: [], extra: [] },
  shell = { create: Boolean(shellCreate.value) },
) {
  const reachable = new Set(modules.map((module) => module.key))
  const answered = new Set(page.ids || [])
  // A page's own key for a global combo («c» = «Nuevo evento») replaces it.
  const claimed = new Set((page.extra || []).flatMap((s) => s.keys))
  return KEYMAP.filter((shortcut) => {
    if (shortcut.context !== 'global') return answered.has(shortcut.id)
    if (shortcut.module) return reachable.has(shortcut.module)
    if (shortcut.keys.every((key) => claimed.has(key))) return false
    if (shortcut.id === 'create') return answered.has('create') || shell.create
    return SHELL_GLOBAL_IDS.has(shortcut.id)
  })
}

/** The Alt+H sheet sections for the current page (contracts `cheatSheet()`). */
export function shellCheatSheet({
  modules = [],
  page = pageShortcuts.value,
  shell,
  apple = appleKeys,
  t = shellT,
} = {}) {
  return cheatSheet(shellKeymap(modules, page, shell), {
    contexts: page.contexts,
    extra: page.extra,
    apple,
    app: 'Muelle',
    t,
  })
}

// --- the sheet's open state (any menu or the palette may open it) -----------

export const shortcutSheet = ref({ open: false, focus: 0, trigger: null })

/** Open the cheat sheet; focus returns to `trigger` (default: the focused element). */
export function openShortcutSheet(trigger) {
  const current = shortcutSheet.value
  if (current.open) {
    shortcutSheet.value = { ...current, focus: current.focus + 1 }
    return
  }
  shortcutSheet.value = {
    open: true,
    focus: current.focus + 1,
    trigger:
      trigger ||
      (typeof document !== 'undefined' ? document.activeElement : null),
  }
}

export function closeShortcutSheet() {
  shortcutSheet.value = { ...shortcutSheet.value, open: false }
}

// --- the window listener ------------------------------------------------------

// Layers the shell owns. Over any other dialog only the search keys reach
// through (as before); the sheet never opens on top of a foreign dialog.
const SHELL_LAYER = '[data-shell-layer]'

// --- shell layers keep the focus (palette, sheets, rail menus) ---------------

const TABBABLE =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'

/** What Tab reaches inside `root`, in document order. */
export function tabbables(root) {
  if (!root) return []
  return [...root.querySelectorAll(TABBABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.disabled &&
      el.type !== 'hidden' &&
      !el.closest('[hidden], [inert]') &&
      (typeof el.checkVisibility !== 'function' || el.checkVisibility()),
  )
}

function cycleFocus(root, back) {
  const stops = tabbables(root)
  if (!stops.length) return root.focus?.()
  const current = document.activeElement
  let index = stops.indexOf(current)
  if (index === -1 && current && current !== root && root.contains(current)) {
    // A spot Tab skips (a tabindex="-1" panel): the next stop after it.
    const following = (el) =>
      current.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    const next = back
      ? [...stops].reverse().find((el) => !following(el))
      : stops.find(following)
    return (next || stops[back ? stops.length - 1 : 0]).focus()
  }
  if (index === -1) index = back ? 0 : stops.length - 1
  stops[(index + (back ? -1 : 1) + stops.length) % stops.length].focus()
}

// The open layers, the last one on top.
const layers = []

/**
 * While `open()` (default: while mounted), the layer at `root` keeps the
 * keyboard: Tab and Shift+Tab cycle inside it, and `onKeydown` (Esc, arrows,
 * Enter) answers wherever the focus went, a page link or doco's floating
 * «Ayuda» included. Only the top layer answers; a foreign dialog
 * (`aria-modal` without `data-shell-layer`) keeps its own keys.
 */
export function useShellLayer(root, { open = () => true, onKeydown } = {}) {
  const layer = {}
  let listening = false
  function handle(event) {
    if (event.defaultPrevented || layers[layers.length - 1] !== layer) return
    const el = unref(root)
    if (!el) return
    const target = event.target
    if (
      target instanceof Element &&
      !el.contains(target) &&
      target.closest(`[aria-modal="true"]:not(${SHELL_LAYER})`)
    )
      return
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey) {
      event.preventDefault()
      event.stopPropagation()
      cycleFocus(el, event.shiftKey)
    } else onKeydown?.(event)
  }
  function start() {
    if (listening) return
    listening = true
    layers.push(layer)
    window.addEventListener('keydown', handle, true)
  }
  function stop() {
    if (!listening) return
    listening = false
    layers.splice(layers.indexOf(layer), 1)
    window.removeEventListener('keydown', handle, true)
  }
  watch(open, (value) => (value ? start() : stop()))
  onMounted(() => open() && start())
  onBeforeUnmount(stop)
}

/** The page key (extra) an event presses: bare keys only, never while typing. */
function pageKeyFor(event, live, apple) {
  const combo = normalizeCombo(event, apple)
  for (const page of live)
    for (const shortcut of page.extra())
      if (
        typeof shortcut.run === 'function' &&
        [...shortcut.keys, ...(shortcut.aliases || [])].includes(combo)
      )
        return shortcut
  return null
}

/** Run `id` on the first page that answers it; true when one did. */
function runPageKey(id, event, live) {
  for (const page of live) {
    const handler = page.handlers()[id]
    if (handler && handler(event) !== false) return true
  }
  return false
}

export function useShellKeyboard({
  openPalette,
  openHelp,
  modules,
  router,
  toggleSidebar,
}) {
  const matcher = createShortcutMatcher()
  function onKeydown(event) {
    if (event.defaultPrevented) return
    const typing = isTypingTarget(event.target)
    const live = activePages(
      typeof document !== 'undefined' ? document.activeElement : null,
    )
    const hit = matcher.match(event, {
      apple: appleKeys,
      typing,
      contexts: [...new Set(live.flatMap((page) => page.contexts()))],
    })
    const modals = [...document.querySelectorAll('[aria-modal="true"]')]
    if (modals.length) {
      // A dialog or sheet owns the keyboard (Esc included: it closes itself),
      // except the search keys, and help while only the shell's own layers
      // (palette, sheet) are open.
      const own = modals.every((modal) => modal.matches(SHELL_LAYER))
      const passes =
        hit &&
        (hit.id === 'palette' ||
          hit.id === 'records' ||
          (hit.id === 'help' && own))
      if (!passes) return
    }
    // The page's own keys (Agenda t/d/w…), unless they finish a `g` sequence.
    if (!typing && !hit?.module) {
      const own = pageKeyFor(event, live, appleKeys)
      if (own) {
        if (own.run(event) !== false) event.preventDefault()
        return
      }
    }
    if (!hit) return
    if (hit.id === 'palette' || hit.id === 'records') {
      event.preventDefault()
      openPalette(hit.id === 'records' ? 'records' : 'all')
    } else if (hit.id === 'help') {
      event.preventDefault()
      openHelp()
    } else if (hit.id === 'sidebar') {
      if (!toggleSidebar || toggleSidebar() === false) return
      event.preventDefault()
    } else if (hit.module) {
      const module = modules.value.find((m) => m.key === hit.module)
      if (!module) return
      event.preventDefault()
      router.push(module.to)
    } else if (runPageKey(hit.id, event, live)) {
      event.preventDefault()
    } else if (hit.id === 'create' && shellCreate.value) {
      event.preventDefault()
      shellCreate.value.run()
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
