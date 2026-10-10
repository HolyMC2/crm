// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// One keyboard map for every Muelle surface (spec §3.3, §8.2, and the Muelle
// keyboard standard of 2026-10-10, see README «Keyboard standard»): the same key
// means the same thing on Desk, the shell and the sibling apps. ⌘K / Ctrl+K is
// «Buscar o ir a…», ⌘G / Ctrl+G «Buscar registros», Alt+H the cheat sheet.
// While typing, only shortcuts marked `whileTyping` fire, and only through a
// combo with ⌘/Ctrl or Alt (never a bare key, never text editing such as ⌘A).
// Ctrl/⌘+Shift+G (Frappe's theme switcher) and Alt+digits (module-internal
// views) are reserved.
import { esMx, type Translate } from './messages'
import { moduleMeta, SHELL_MODULES, type ShellModuleKey } from './registry'

export type ShortcutContext = 'global' | 'list' | 'form'

export interface Shortcut {
  id: string
  /** Normalized combos (`mod+k`, `shift+x`, `?`) or a two-key sequence `g h`. */
  keys: string[]
  /** English source for `__()`; `{0}` is the module label for go-to entries. */
  description: string
  context: ShortcutContext
  /** Module a go-to sequence opens. */
  module?: ShellModuleKey
  /**
   * Also fires inside text fields, through those of its `keys` that carry ⌘/Ctrl
   * or Alt (`/` and `?` stay outside-only). Text-editing combos never fire there.
   */
  whileTyping?: boolean
}

const goTo: Shortcut[] = SHELL_MODULES.filter((m) => m.go).map((m) => ({
  id: `go.${m.key}`,
  keys: [`g ${m.go}`],
  description: 'Go to {0}',
  context: 'global',
  module: m.key,
}))

export const KEYMAP: readonly Shortcut[] = Object.freeze([
  { id: 'help', keys: ['alt+h', '?'], description: 'Show keyboard shortcuts', context: 'global', whileTyping: true },
  { id: 'palette', keys: ['mod+k'], description: 'Search or go to…', context: 'global', whileTyping: true },
  { id: 'records', keys: ['mod+g'], description: 'Search records', context: 'global', whileTyping: true },
  { id: 'search', keys: ['/', 'mod+shift+k'], description: 'Focus the list search', context: 'list', whileTyping: true },
  ...goTo,
  { id: 'create', keys: ['c'], description: 'Create', context: 'global' },
  { id: 'row.next', keys: ['j', 'arrowdown'], description: 'Next row', context: 'list' },
  { id: 'row.prev', keys: ['k', 'arrowup'], description: 'Previous row', context: 'list' },
  { id: 'row.open', keys: ['enter'], description: 'Open record', context: 'list' },
  { id: 'row.split', keys: ['mod+enter'], description: 'Open beside the list', context: 'list' },
  { id: 'select.toggle', keys: ['x'], description: 'Toggle selection', context: 'list' },
  { id: 'select.range', keys: ['shift+x'], description: 'Extend selection', context: 'list' },
  { id: 'select.page', keys: ['mod+a'], description: 'Select the visible page', context: 'list' },
  { id: 'edit', keys: ['e'], description: 'Edit', context: 'form' },
  { id: 'save', keys: ['mod+enter'], description: 'Save or submit the form', context: 'form', whileTyping: true },
  { id: 'close', keys: ['escape'], description: 'Close the top layer', context: 'global', whileTyping: true },
  { id: 'sidebar', keys: ['['], description: 'Show or hide the sidebar', context: 'global' },
] satisfies Shortcut[])

/** The «Atajos rápidos» rows: same key, meaning and copy on every surface, in this order. */
export const UNIVERSAL_SHORTCUT_IDS = Object.freeze(['help', 'palette', 'records', 'search', 'save', 'close'] as const)
export type UniversalShortcutId = (typeof UNIVERSAL_SHORTCUT_IDS)[number]

/** Combos no Muelle shortcut may claim. */
export const RESERVED_COMBOS: readonly string[] = Object.freeze([
  'mod+shift+g', // Frappe's theme switcher on Desk
  ...Array.from({ length: 9 }, (_, i) => `alt+${i + 1}`), // module-internal views
])

/** Text-editing combos that never fire a shortcut inside a text field. */
const TEXT_EDITING_COMBOS = new Set(['mod+a', 'mod+c', 'mod+v', 'mod+x', 'mod+z', 'mod+y', 'mod+shift+z'])

/**
 * A combo may fire while typing only with ⌘/Ctrl or Alt and when it is not a
 * text-editing combo. Esc is the one bare key allowed: it never types text, and
 * the standard closes the top layer from inside a field too.
 */
function firesWhileTyping(combo: string): boolean {
  if (combo === 'escape') return true
  const parts = combo.split('+')
  return (parts.includes('mod') || parts.includes('alt')) && !TEXT_EDITING_COMBOS.has(combo)
}

export interface KeyEventLike {
  key: string
  /** Physical key (`KeyH`, `Digit1`); macOS types ⌥H as `˙`, so an Alt combo falls back to it. */
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}

/**
 * `mod+k`, `shift+x`, `alt+h`, `?`, `arrowdown` … `mod` is ⌘ on Apple platforms
 * and Ctrl elsewhere. Shift is folded into printable symbols (`?`, `[`). When
 * Alt turns the key into another character (macOS types ⌥H as `˙`), the letter
 * or digit comes from `code`.
 */
export function normalizeCombo(event: KeyEventLike, apple = false): string {
  let key = event.key === ' ' ? 'space' : event.key.toLowerCase()
  const altered = event.altKey && !/^[a-z0-9]$/i.test(event.key)
  const physical = altered ? /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code ?? '') : null
  if (physical) key = (physical[1] ?? physical[2] ?? key).toLowerCase()
  const parts: string[] = []
  const mod = apple ? event.metaKey : event.ctrlKey
  if (mod) parts.push('mod')
  if (apple ? event.ctrlKey : event.metaKey) parts.push(apple ? 'ctrl' : 'meta')
  if (event.altKey) parts.push('alt')
  const symbol = !physical && event.key.length === 1 && !/[a-z0-9]/i.test(event.key)
  if (event.shiftKey && !symbol) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

export interface EditableLike {
  tagName?: string
  type?: string
  isContentEditable?: boolean
  getAttribute?(name: string): string | null
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'])

export function isTypingTarget(target: EditableLike | null | undefined): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = (target.tagName ?? '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return !NON_TEXT_INPUTS.has((target.type ?? 'text').toLowerCase())
  return target.getAttribute?.('role') === 'textbox'
}

export interface MatchOptions {
  /** Contexts active on the current page; `global` is always active. */
  contexts?: readonly ShortcutContext[]
  typing?: boolean
  apple?: boolean
  /** Monotonic ms timestamp; tests pass it explicitly. */
  now?: number
}

export const SEQUENCE_TIMEOUT_MS = 1500

/**
 * Stateful matcher for one SPA. `match` returns the shortcut a key event
 * triggers, or `null`. A `g` press arms the go-to sequence for 1.5 s.
 */
export function createShortcutMatcher(keymap: readonly Shortcut[] = KEYMAP) {
  let pending: { key: string; at: number } | null = null
  return {
    match(event: KeyEventLike, options: MatchOptions = {}): Shortcut | null {
      if (event.isComposing) return null
      const now = options.now ?? Date.now()
      const combo = normalizeCombo(event, options.apple)
      const contexts = new Set<ShortcutContext>(['global', ...(options.contexts ?? [])])
      if (options.typing) pending = null
      if (RESERVED_COMBOS.includes(combo)) return null
      // While typing, only `whileTyping` shortcuts fire, and only through a ⌘/Ctrl or
      // Alt combo: never a bare letter, `/` or `?`, and never ⌘A or another editing combo.
      if (options.typing && !firesWhileTyping(combo)) return null
      const candidates = keymap.filter((s) => contexts.has(s.context) && (!options.typing || s.whileTyping))
      if (pending && now - pending.at <= SEQUENCE_TIMEOUT_MS) {
        const sequence = `${pending.key} ${combo}`
        pending = null
        const hit = candidates.find((s) => s.keys.includes(sequence))
        if (hit) return hit
      }
      pending = null
      if (candidates.some((s) => s.keys.some((k) => k.startsWith(combo + ' ')))) {
        pending = { key: combo, at: now }
        return null
      }
      // A form's save outranks a list's split-open when both contexts are active.
      const hits = candidates.filter((s) => s.keys.includes(combo))
      return hits.find((s) => s.context === 'form') ?? hits[0] ?? null
    },
    reset() {
      pending = null
    },
  }
}

/** Display form: `mod+k` → `⌘K` on Apple, `Ctrl+K` elsewhere; `g h` → `G → H`. */
export function formatCombo(combo: string, apple = false): string {
  return combo
    .split(' ')
    .map((step) =>
      step
        .split('+')
        .map((part) => {
          if (part === 'mod') return apple ? '⌘' : 'Ctrl'
          if (part === 'shift') return apple ? '⇧' : 'Shift'
          if (part === 'alt') return apple ? '⌥' : 'Alt'
          if (part === 'enter') return '↵'
          if (part === 'escape') return 'Esc'
          if (part === 'arrowdown') return '↓'
          if (part === 'arrowup') return '↑'
          return part.length === 1 ? part.toUpperCase() : part
        })
        .join(apple ? '' : '+'),
    )
    .join(' → ')
}

export type CheatSheetSectionId = 'quick' | 'page' | 'app'

export interface CheatSheetRow {
  /** Shortcut id of the first entry behind the row. */
  id: string
  /** Display labels, one per key (`formatCombo`): `⌥H`, `?` / `Alt+H`, `?`. */
  keys: string[]
  /** Translated description. */
  description: string
}

export interface CheatSheetSection {
  id: CheatSheetSectionId
  /** Translated title: «Atajos rápidos», «En esta página», «En todo {app}». */
  title: string
  rows: CheatSheetRow[]
}

export interface CheatSheetOptions {
  /** Contexts active on the current page; `global` is always active. */
  contexts?: readonly ShortcutContext[]
  apple?: boolean
  /** Keys the current page registered itself (Agenda t/d/w/m/l); they land in «En esta página». */
  extra?: readonly Shortcut[]
  /** App name for «En todo {0}»; default «Muelle». */
  app?: string
  /** Frappe's `__`; default the es-MX catalog. */
  t?: Translate
}

/**
 * The Alt+H cheat sheet, generated from a keymap so only registered keys appear:
 * «Atajos rápidos» (the universal rows, in UNIVERSAL_SHORTCUT_IDS order), «En
 * esta página» (active list/form keys, then the page's `extra` keys) and «En todo
 * {app}» (the remaining global keys). Keys of inactive contexts never appear, a
 * shortcut id appears once (the keymap's entry wins over an `extra` one), rows
 * with the same description in a section merge their keys, and empty sections
 * are left out.
 */
export function cheatSheet(keymap: readonly Shortcut[] = KEYMAP, options: CheatSheetOptions = {}): CheatSheetSection[] {
  const t = options.t ?? esMx
  const contexts = new Set<ShortcutContext>(['global', ...(options.contexts ?? [])])
  const universal = new Set<string>(UNIVERSAL_SHORTCUT_IDS)
  const seen = new Set<string>()
  const placed: Record<CheatSheetSectionId, Shortcut[]> = { quick: [], page: [], app: [] }
  const entries = [...keymap.map((s) => ({ s, extra: false })), ...(options.extra ?? []).map((s) => ({ s, extra: true }))]
  for (const { s, extra } of entries) {
    if (seen.has(s.id) || !contexts.has(s.context) || s.keys.length === 0) continue
    seen.add(s.id)
    if (universal.has(s.id) && !extra) placed.quick.push(s)
    else if (extra || s.context !== 'global') placed.page.push(s)
    else placed.app.push(s)
  }
  placed.quick.sort((a, b) => UNIVERSAL_SHORTCUT_IDS.indexOf(a.id as UniversalShortcutId) - UNIVERSAL_SHORTCUT_IDS.indexOf(b.id as UniversalShortcutId))

  const describe = (s: Shortcut) => t(s.description, s.module ? [moduleMeta(s.module)?.label ?? s.module] : [])
  const rowsOf = (list: Shortcut[]): CheatSheetRow[] => {
    const rows: CheatSheetRow[] = []
    for (const s of list) {
      const description = describe(s)
      const labels = s.keys.map((k) => formatCombo(k, options.apple))
      const row = rows.find((r) => r.description === description)
      if (row) row.keys.push(...labels.filter((label) => !row.keys.includes(label)))
      else rows.push({ id: s.id, keys: [...new Set(labels)], description })
    }
    return rows
  }
  const titles: Record<CheatSheetSectionId, string> = {
    quick: t('Quick shortcuts'),
    page: t('On this page'),
    app: t('Across {0}', [options.app ?? 'Muelle']),
  }
  return (['quick', 'page', 'app'] as const)
    .map((id) => ({ id, title: titles[id], rows: rowsOf(placed[id]) }))
    .filter((section) => section.rows.length > 0)
}
