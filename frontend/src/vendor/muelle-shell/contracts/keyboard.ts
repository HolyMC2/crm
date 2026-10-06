// Vendored from muelle/workspace/packages/shell-contracts@0.2.0 (cd63cbd0639f). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// One keyboard map for every Muelle SPA (spec §3.3, §8.2). ⌘K / Ctrl+K is the
// global palette everywhere. Shortcuts never fire while typing unless they
// include ⌘/Ctrl. Alt+digits are reserved for module-internal views (Clínica),
// and Ctrl/⌘+Shift+K stays Taller's order search.
import { SHELL_MODULES, type ShellModuleKey } from './registry'

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
  /** Fires inside inputs too. Only ⌘/Ctrl combos that never mean text editing. */
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
  { id: 'palette', keys: ['mod+k'], description: 'Open the command palette', context: 'global', whileTyping: true },
  { id: 'search', keys: ['/'], description: 'Focus the list search', context: 'list' },
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
  { id: 'save', keys: ['mod+enter'], description: 'Save', context: 'form', whileTyping: true },
  { id: 'close', keys: ['escape'], description: 'Close the top layer', context: 'global' },
  { id: 'sidebar', keys: ['['], description: 'Show or hide the sidebar', context: 'global' },
  { id: 'help', keys: ['?'], description: 'Keyboard shortcuts', context: 'global' },
] satisfies Shortcut[])

/** Combos no shell shortcut may claim. */
export const RESERVED_COMBOS: readonly string[] = Object.freeze([
  'mod+shift+k', // Taller order search
  ...Array.from({ length: 9 }, (_, i) => `alt+${i + 1}`), // module-internal views
])

export interface KeyEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}

/**
 * `mod+k`, `shift+x`, `?`, `arrowdown` … `mod` is ⌘ on Apple platforms and
 * Ctrl elsewhere. Shift is folded into printable symbols (`?`, `[`).
 */
export function normalizeCombo(event: KeyEventLike, apple = false): string {
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase()
  const parts: string[] = []
  const mod = apple ? event.metaKey : event.ctrlKey
  if (mod) parts.push('mod')
  if (apple ? event.ctrlKey : event.metaKey) parts.push(apple ? 'ctrl' : 'meta')
  if (event.altKey) parts.push('alt')
  const symbol = event.key.length === 1 && !/[a-z0-9]/i.test(event.key)
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
      if (RESERVED_COMBOS.includes(combo)) return null
      // While typing, only ⌘/Ctrl shortcuts marked safe fire (never ⌘A or a bare letter).
      const candidates = keymap.filter(
        (s) => contexts.has(s.context) && (!options.typing || (s.whileTyping && s.keys.every((k) => k.startsWith('mod+')))),
      )
      if (options.typing) pending = null
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
