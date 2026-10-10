import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  unref,
} from 'vue'
import {
  KEYMAP,
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
 * The app catalog first (`__`), then the contracts' es-MX copy, so a shared
 * string never reaches a worker in English while its catalog entry is missing.
 * With a `context`, only the contextual entry counts: the catalog's bare
 * «All» is «Todos», the palette chip is «Todo».
 */
export function shellT(source, replace = [], context = null) {
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

// Global keys the shell itself answers; `create` and `sidebar` have no shell
// action yet, so the sheet leaves them out. Go-to keys count only for the
// modules this worker has.
const SHELL_GLOBAL_IDS = new Set(['help', 'palette', 'records', 'close'])

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

export function useShellKeyboard({ openPalette, openHelp, modules, router }) {
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
