import { onBeforeUnmount, onMounted } from 'vue'
import {
  OPEN_LAYER,
  appleKeys,
  ariaKeys,
  keyLabel,
  tabbables,
} from './shellKeyboard'

// Every dialog and sheet answers the keyboard the same way, with no code of
// its own: Ctrl+Enter (⌘↵) presses its one filled button from anywhere in it,
// a textarea included; Enter does the same from a one-line field or a
// checkbox, and walks to the next field while that button is still disabled.
// On a desktop the dialog opens with its first field focused and the filled
// button shows its key. A dialog with its own Ctrl+Enter (a composer) stops
// the event, and this never runs.

/** A dialog or sheet: reka's (frappe-ui Dialog, the kit's BottomSheet) or a hand-made modal. */
export const DIALOG = '[role="dialog"], [role="alertdialog"]'
// The shell's own layers answer their keys themselves (the palette's Enter
// opens a result, the assistant's sends a message).
const OWN_KEYS = [
  'palette',
  'shortcuts',
  'assistant',
  'avisos',
  'more',
  'camera',
]
  .map((layer) => `[data-shell-layer="${layer}"]`)
  .join(', ')
// A page marks an explicit submit when its filled button is not the kit's.
const SUBMIT = '[data-dialog-submit]'
const FILLED = 'button[data-kit-button="solid"]'
const FOOT = '[data-slot="actions"], [data-ui-sheet-actions]'
// Fields where Enter has no meaning of its own. A search or a combobox picks
// a result with it; a textarea starts a new line.
const ONE_LINE = new Set([
  'text',
  'number',
  'email',
  'tel',
  'url',
  'password',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])
const FIELD =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]), textarea, select, [role="combobox"]'

const visible = (el) =>
  typeof el.checkVisibility !== 'function' || el.checkVisibility()
const ownedBy = (dialog) => (el) => el.closest(DIALOG) === dialog
const disabled = (el) =>
  el.disabled || el.getAttribute('aria-disabled') === 'true'

/** The dialog's filled button: its `data-dialog-submit`, else its one filled kit button. */
export function primaryOf(dialog) {
  if (!dialog?.querySelectorAll) return null
  const own = (selector) =>
    [...dialog.querySelectorAll(selector)]
      .filter(ownedBy(dialog))
      .filter(visible)
  const marked = own(SUBMIT)
  if (marked.length === 1) return marked[0]
  const filled = own(FILLED)
  if (filled.length === 1) return filled[0]
  // More than one filled button: the foot's, when it holds exactly one.
  const foot = filled.filter((el) => el.closest(FOOT))
  return foot.length === 1 ? foot[0] : null
}

/** Enter in this element confirms the dialog (it means nothing else there). */
export function enterConfirms(el) {
  if (!el || el.tagName !== 'INPUT') return false
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  if (type === 'checkbox' || type === 'radio') return true
  if (!ONE_LINE.has(type) || el.hasAttribute('list')) return false
  if (
    ['combobox', 'searchbox'].includes(el.getAttribute('role')) ||
    el.hasAttribute('aria-autocomplete') ||
    el.getAttribute('aria-expanded') === 'true'
  )
    return false
  return !el.closest('[data-list-search], [data-enter-keeps]')
}

// A form with a submit button submits on Enter by itself.
function submitsItself(el) {
  const form = el?.form
  return !!form && [...form.elements].some((field) => field.type === 'submit')
}

/** The dialog the key is for: the one holding the focus, else (Ctrl+Enter) the top one. */
export function dialogFor(target, anywhere = false) {
  const own = target?.closest?.(DIALOG)
  if (own) return own
  if (!anywhere || typeof document === 'undefined') return null
  const open = [...document.querySelectorAll(OPEN_LAYER)].filter(
    (el) => el.matches(DIALOG) && visible(el),
  )
  return open[open.length - 1] || null
}

/** The field after `from` in the dialog, or null. */
export function nextField(dialog, from) {
  const fields = tabbables(dialog).filter(
    (el) => el.matches(FIELD) && ownedBy(dialog)(el) && !disabled(el),
  )
  const index = fields.indexOf(from)
  return index >= 0 ? fields[index + 1] || null : null
}

function focusField(el) {
  el.focus({ preventScroll: false })
  if (el.tagName === 'INPUT' && el.value && typeof el.select === 'function')
    try {
      el.select()
    } catch {
      // number inputs in some engines refuse select()
    }
}

/** keydown: answer Enter / Ctrl+Enter for the dialog it belongs to. */
export function onDialogKey(event, apple = appleKeys) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing)
    return false
  const mod = apple ? event.metaKey : event.ctrlKey
  if (event.altKey || (apple ? event.ctrlKey : event.metaKey)) return false
  const target = event.target
  const dialog = dialogFor(target, mod)
  if (!dialog || dialog.matches(OWN_KEYS) || dialog.closest(OWN_KEYS))
    return false
  if (!mod && (!enterConfirms(target) || submitsItself(target))) return false
  const primary = primaryOf(dialog)
  if (!primary) {
    if (!mod || !target?.form) return false
    event.preventDefault()
    target.form.requestSubmit()
    return true
  }
  event.preventDefault()
  if (disabled(primary)) {
    // Not ready yet: Enter goes on to the field still missing.
    const next = !mod && nextField(dialog, target)
    if (next) focusField(next)
    return true
  }
  primary.click()
  return true
}

// ── desktop: the first field takes the focus, the filled button shows its key

const hint = () => keyLabel('mod+enter')

/** Show the key on the dialog's filled button (CSS `[data-key-hint]`). */
export function markPrimary(dialog) {
  const primary = primaryOf(dialog)
  if (!primary || primary.dataset.keyHint) return primary
  primary.dataset.keyHint = hint()
  primary.setAttribute('aria-keyshortcuts', ariaKeys('mod+Enter', appleKeys))
  return primary
}

/** The field a dialog opens on: its `[data-autofocus]`/`[autofocus]`, else its first field you type in. */
export function firstField(dialog) {
  const own = ownedBy(dialog)
  const marked = [
    ...dialog.querySelectorAll('[data-autofocus], [autofocus]'),
  ].find((el) => own(el) && visible(el))
  if (marked)
    return marked.matches(FIELD) ? marked : marked.querySelector(FIELD) || null
  // The first field decides: a picker or a select first keeps the dialog's
  // own focus (opening a list on its own would surprise).
  const first = tabbables(dialog).find(
    (el) => el.matches(FIELD) && own(el) && !disabled(el),
  )
  if (!first || first.readOnly) return null
  if (first.tagName === 'TEXTAREA') return first
  if (first.tagName !== 'INPUT') return null
  const type = (first.getAttribute('type') || 'text').toLowerCase()
  return ONE_LINE.has(type) || type === 'search' ? first : null
}

const typingIn = (dialog) => {
  const active = document.activeElement
  return (
    !!active &&
    dialog.contains(active) &&
    (active.matches(FIELD) || active.isContentEditable)
  )
}

const FOCUS_WINDOW_MS = 1500

/**
 * Install once in the shell. `fine` says whether this device has a mouse and
 * a keyboard to show hints and move the focus for (a phone keeps the sheet's
 * own focus: a field focused there opens the on-screen keyboard).
 */
export function useDialogKeys({
  fine = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: hover) and (pointer: fine)').matches,
} = {}) {
  let observer = null
  let frame = 0
  // Dialogs waiting for their first field (it may arrive with the data).
  const waiting = new Map()
  const seen = new WeakSet()

  function scan() {
    frame = 0
    if (!fine()) return
    const now = Date.now()
    for (const dialog of document.querySelectorAll(DIALOG)) {
      if (dialog.matches(OWN_KEYS) || dialog.closest(OWN_KEYS)) continue
      markPrimary(dialog)
      if (!seen.has(dialog)) {
        seen.add(dialog)
        waiting.set(dialog, now)
      }
    }
    for (const [dialog, since] of waiting) {
      const field =
        dialog.isConnected && !typingIn(dialog) && firstField(dialog)
      if (field) focusField(field)
      if (field || !dialog.isConnected || typingIn(dialog))
        waiting.delete(dialog)
      else if (now - since > FOCUS_WINDOW_MS) waiting.delete(dialog)
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(scan)
  }
  // The worker moved first: their choice stands.
  function stopWaiting(event) {
    for (const dialog of waiting.keys())
      if (dialog.contains(event.target)) waiting.delete(dialog)
  }
  const onKey = (event) => onDialogKey(event)
  onMounted(() => {
    window.addEventListener('keydown', stopWaiting, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', stopWaiting, true)
    if (typeof MutationObserver === 'undefined') return
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', stopWaiting, true)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pointerdown', stopWaiting, true)
    observer?.disconnect()
    if (frame) cancelAnimationFrame(frame)
  })
}
