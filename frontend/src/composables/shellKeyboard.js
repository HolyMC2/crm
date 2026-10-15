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
} from '@/vendor/muelle-shell/contracts'

// Global shell shortcuts from the shared keymap (Muelle keyboard standard, see
// the shell-contracts README): ⌘K / Ctrl+K «Buscar o ir a…», ⌘G / Ctrl+G
// «Buscar registros», Alt+H (and `?` outside fields) the cheat sheet, `g` +
// letter goes to a module. Pages keep their own list/form keys and declare them
// with registerPageShortcuts() so the sheet lists only keys that work.

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

/**
 * A page declares the keys it implements: `context` ('list' | 'form', or an
 * array; null for neither) turns on that context's KEYMAP rows, and `extra`
 * (Shortcut[], or a getter for keys that depend on state) adds the page's own
 * keys to «En esta página». Called in setup, it lasts until the page unmounts;
 * it also returns the function that removes it.
 */
export function registerPageShortcuts(context, extra = []) {
  const contexts = [context]
    .flat()
    .filter((value) => value && value !== 'global')
  const fallback = contexts[0] || 'global'
  const entry = {
    id: ++nextId,
    contexts,
    extra: () =>
      (typeof extra === 'function' ? extra() : unref(extra) || []).map(
        (shortcut) => ({ context: fallback, ...shortcut }),
      ),
  }
  pages.value = [...pages.value, entry]
  const remove = () => {
    pages.value = pages.value.filter((page) => page !== entry)
  }
  if (getCurrentInstance()) onBeforeUnmount(remove)
  return remove
}

/** What the mounted pages declared: their contexts and their own keys. */
export const pageShortcuts = computed(() => ({
  contexts: [...new Set(pages.value.flatMap((page) => page.contexts))],
  extra: pages.value.flatMap((page) => page.extra()),
}))

// Global keys the shell itself answers; `create` has no shell action yet, so
// the sheet leaves it out. `[` shows or hides the app names in the desktop
// rail. Go-to keys count only for the modules this worker has.
const SHELL_GLOBAL_IDS = new Set([
  'help',
  'palette',
  'records',
  'close',
  'sidebar',
])

/** KEYMAP reduced to the keys that work here (list/form rows need a page). */
export function shellKeymap(modules = []) {
  const reachable = new Set(modules.map((module) => module.key))
  return KEYMAP.filter((shortcut) =>
    shortcut.context !== 'global'
      ? true
      : shortcut.module
        ? reachable.has(shortcut.module)
        : SHELL_GLOBAL_IDS.has(shortcut.id),
  )
}

/** The Alt+H sheet sections for the current page (contracts `cheatSheet()`). */
export function shellCheatSheet({
  modules = [],
  page = pageShortcuts.value,
  apple = appleKeys,
  t = shellT,
} = {}) {
  return cheatSheet(shellKeymap(modules), {
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
    const hit = matcher.match(event, {
      apple: appleKeys,
      typing: isTypingTarget(event.target),
    })
    const modals = [...document.querySelectorAll('[aria-modal="true"]')]
    if (modals.length && event.key !== 'Escape') {
      // A dialog or sheet owns the keyboard, except the search keys, and help
      // while only the shell's own layers (palette, sheet) are open.
      const own = modals.every((modal) => modal.matches(SHELL_LAYER))
      const passes =
        hit &&
        (hit.id === 'palette' ||
          hit.id === 'records' ||
          (hit.id === 'help' && own))
      if (!passes) return
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
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
