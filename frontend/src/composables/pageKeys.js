import { unref } from 'vue'
import { registerPageKeys } from '@/composables/shellKeyboard'

// List and form keys of the keyboard standard (shell-contracts KEYMAP), wired
// once for every shell page. A page marks its markup and says which keys it
// supports; the composable answers them and registers exactly those with the
// Alt+H sheet («En esta página»), so the sheet always matches what works.
//
// Markup, inside the page's `root`:
//   data-key-row     one per list row (focusable; gets tabindex=-1 if needed)
//   data-row-link    the row's open target (default: the row itself)
//   data-row-check   the row's selection checkbox (x, Shift+X, Ctrl+A)
//   data-row-focus   what in the row takes the focus (default: the row)
//   data-row-current the row the worker last opened (j/k start there)
//   data-select-page the list's «select all on this page» checkbox (Ctrl+A)
//   data-list-search the list search (an input, or a wrapper of one)
// A key a page cannot support (no selection, no pane beside the list) is
// simply not passed, so it is neither answered nor listed.

const LIST = ['search', 'row.next', 'row.prev', 'row.open']
const ROWS = ['row.next', 'row.prev', 'row.open']
const SELECT = ['select.toggle', 'select.range', 'select.page']

/**
 * What each shell page answers (before its `when` conditions): the review
 * sheet of the keyboard standard. useListKeys/useFormKeys refuse, in
 * development and tests, a page whose handlers differ from its row here, so
 * this table, the Alt+H sheet and the handlers cannot drift apart.
 * Cobranza, Compras, Gastos and Garantías are power lists (usePowerList /
 * useCobranza): they answer their list keys themselves and declare them with
 * registerPageShortcuts('list'), so they have no row here; «c» there is the
 * shell's create target of the module.
 */
export const PAGE_KEYS = Object.freeze({
  hoy: ROWS,
  contactos: [...LIST, 'create'],
  ventas: [...LIST, ...SELECT, 'create'],
  deal: ['edit', 'close'],
  pendientes: [...LIST, 'create'],
  archivos: [...LIST, 'create', 'close'],
  avisos: LIST,
  workload: [...ROWS, ...SELECT],
  inbox: [...LIST, 'create'],
  'inbox-conversations': ROWS,
})

function checkPage(page, keys) {
  if (!page || !import.meta.env?.DEV) return
  const want = [...(PAGE_KEYS[page] || [])].sort().join()
  const have = Object.keys(keys).sort().join()
  if (want !== have)
    throw new Error(
      `pageKeys: ${page} answers [${have}], PAGE_KEYS says [${want}]`,
    )
}

export const ROW = '[data-key-row]'
const ANCHORS = '[data-row-link],[data-row-check],[data-row-focus]'

// Without a root, the shell's content area (one routed page at a time).
function element(root) {
  const value = typeof root === 'function' ? root() : unref(root)
  if (value) return value.$el ?? value
  if (root || typeof document === 'undefined') return null
  return document.getElementById('muelle-content') || document.body
}

/** The rows of a list root, in document order, leaving out hidden ones. */
export function listRows(root) {
  const el = element(root)
  if (!el?.querySelectorAll) return []
  return [...el.querySelectorAll(ROW)].filter(
    (row) => !row.closest('[hidden],[aria-hidden="true"]'),
  )
}

const focusTarget = (row) => row.querySelector('[data-row-focus]') || row

function focusable(el) {
  return (
    el.tabIndex >= 0 ||
    el.hasAttribute('tabindex') ||
    /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
  )
}

/** Focus a row (its `data-row-focus`, else the row) and keep it in view. */
export function focusRow(row) {
  const target = focusTarget(row)
  if (!focusable(target)) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  target.scrollIntoView?.({ block: 'nearest' })
}

/** The row holding the focus, or null. */
export function currentRow(root, active = document.activeElement) {
  if (!active) return null
  return listRows(root).find((row) => row.contains(active)) || null
}

/** The focus is on the row itself or one of its anchors (not a row button). */
function onRow(row, active = document.activeElement) {
  return (
    !!row &&
    (active === row || (row.contains(active) && active.matches?.(ANCHORS)))
  )
}

const linkOf = (row) => row.querySelector('[data-row-link]') || row
const checkOf = (row) => row.querySelector('[data-row-check]')
const isChecked = (check) =>
  check?.checked ?? check?.getAttribute('aria-checked') === 'true'

/**
 * Move the row cursor by `step`. Without one, start at the row the worker
 * came back from (`data-row-current`), else the first (or last) row.
 */
export function moveRow(root, step) {
  const rows = listRows(root)
  if (!rows.length) return false
  const index = rows.indexOf(currentRow(root))
  const back = rows.findIndex((row) => row.hasAttribute('data-row-current'))
  const next =
    index < 0
      ? back >= 0
        ? back
        : step > 0
          ? 0
          : rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, index + step))
  focusRow(rows[next])
  return true
}

/** Focus the list search: `/` outside fields, Ctrl+Shift+K anywhere. */
export function focusSearch(root) {
  const el = element(root)
  const box = el?.querySelector?.('[data-list-search]')
  const input = box?.matches?.('input,textarea')
    ? box
    : box?.querySelector?.('input,textarea')
  if (!input) return false
  input.focus()
  input.select?.()
  return true
}

/**
 * List keys for a page. Options (each key only when given):
 * - root: element or ref of the list area (rows, search, checks live in it);
 *   default the shell content area
 * - search: true (the `data-list-search` field) or a function
 * - rows: true for j/k/↑↓ on `data-key-row`
 * - open: true (click the row's `data-row-link`) or fn(row) — Enter
 * - split: fn(row) — Ctrl+Enter, open beside the list (only with a pane)
 * - select: true — x, Shift+X and Ctrl+A on the rows' `data-row-check`
 * - create: fn — `c`, the page's own create (beats the shell's target)
 * - close: fn returning false when nothing was open — Esc
 * - page: its PAGE_KEYS row (checked in development and tests)
 * - when: { id: () => boolean } — a key that is answered and listed only
 *   while allowed (`create: () => canCreate.value`)
 * - extra, enabled: as registerPageKeys
 */
export function useListKeys(options = {}) {
  const keys = listKeyHandlers(options)
  checkPage(options.page, keys)
  return registerPageKeys({
    root: options.root,
    enabled: options.enabled,
    extra: options.extra,
    keys: allowed(keys, options.when),
  })
}

function allowed(keys, when = {}) {
  return () =>
    Object.fromEntries(
      Object.entries(keys).filter(([id]) => !when[id] || when[id]()),
    )
}

/** The handlers useListKeys registers (exported for the page-context tests). */
export function listKeyHandlers({
  root,
  search,
  rows,
  open,
  split,
  select,
  create,
  close,
} = {}) {
  const keys = {}
  if (search)
    keys.search = () =>
      typeof search === 'function' ? search() : focusSearch(root)
  if (rows) {
    // Arrow keys keep their native meaning in other controls (a select, a
    // radio group); j/k move the cursor from anywhere outside fields.
    const step = (by) => (event) => {
      const arrow = event.key.startsWith('Arrow')
      if (arrow && !currentRow(root)) return false
      return moveRow(root, by)
    }
    keys['row.next'] = step(1)
    keys['row.prev'] = step(-1)
  }
  if (open)
    keys['row.open'] = () => {
      const row = currentRow(root)
      if (!onRow(row)) return false
      if (typeof open === 'function') return open(row)
      linkOf(row).click()
    }
  if (split)
    keys['row.split'] = () => {
      const row = currentRow(root)
      return row ? split(row) : false
    }
  if (select) {
    let anchor = null
    keys['select.toggle'] = () => {
      const row = currentRow(root)
      const check = row && checkOf(row)
      if (!check) return false
      check.click()
      anchor = row
    }
    keys['select.range'] = () => {
      const row = currentRow(root)
      const list = listRows(root)
      if (!row || !checkOf(row)) return false
      const from = anchor && list.includes(anchor) ? anchor : row
      const want =
        from === row ? !isChecked(checkOf(row)) : isChecked(checkOf(from))
      const [a, b] = [list.indexOf(from), list.indexOf(row)].sort(
        (x, y) => x - y,
      )
      for (const r of list.slice(a, b + 1)) {
        const check = checkOf(r)
        if (check && isChecked(check) !== want) check.click()
      }
      anchor = row
    }
    keys['select.page'] = () => {
      const all = element(root)?.querySelector?.('[data-select-page]')
      if (all) {
        if (!isChecked(all)) all.click()
        return
      }
      const checks = listRows(root).map(checkOf).filter(Boolean)
      if (!checks.length) return false
      for (const check of checks) if (!isChecked(check)) check.click()
    }
  }
  if (typeof create === 'function') keys.create = create
  if (typeof close === 'function') keys.close = close
  return keys
}

/**
 * Form keys for a record page: `e` edit, Ctrl+Enter save or submit, Esc close
 * the page's top layer, `c` create. `when` keeps a key out (unanswered and
 * unlisted) while the record does not allow it: `when: { edit: () => canEdit.value }`.
 */
export function useFormKeys({
  page,
  root,
  edit,
  save,
  close,
  create,
  when,
  enabled,
  extra,
} = {}) {
  const keys = {}
  if (typeof edit === 'function') keys.edit = edit
  if (typeof save === 'function') keys.save = save
  if (typeof close === 'function') keys.close = close
  if (typeof create === 'function') keys.create = create
  checkPage(page, keys)
  return registerPageKeys({ root, enabled, extra, keys: allowed(keys, when) })
}
