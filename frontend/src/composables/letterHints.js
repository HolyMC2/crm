import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  formatCombo,
  isTypingTarget,
  moduleMeta,
} from '@/vendor/muelle-shell/contracts'
import { appleKeys, keyLabel, pageShortcuts } from './shellKeyboard'
import { letterHintsOn } from './letterHintsSwitch'
import './letterHints.css'

export { letterHintsOn }

// «Saltar con letras», the browser extensions' link hints inside Muelle: with
// the switch on, `f` puts a letter tag on everything that can be pressed on
// screen (inside the open dialog when there is one), and typing a tag presses
// it; Shift+F opens a link in another tab. A tag also shows the element's own
// key where it has one (`G → H` on the rail, `.` on «⋯», Ctrl+↵ on a dialog's
// button), so the worker learns the real shortcuts while jumping. The switch
// (letterHintsSwitch.js) is per person and per browser, and starts off.

/** Home row first, the letters the browser extensions use. */
export const HINT_LETTERS = 'sadfjklewcmpgh'

/** Tags for `count` targets: all of one length, so no tag starts another. */
export function hintLabels(count, letters = HINT_LETTERS) {
  if (count <= 0) return []
  const base = letters.length
  let length = 1
  while (base ** length < count) length++
  const out = []
  for (let i = 0; i < count; i++) {
    let n = i
    let label = ''
    for (let d = 0; d < length; d++) {
      label = letters[n % base] + label
      n = Math.floor(n / base)
    }
    out.push(label)
  }
  return out
}

const PRESSABLE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-key-row]',
  ...[
    'button',
    'link',
    'tab',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'checkbox',
    'switch',
    'radio',
    'combobox',
    'treeitem',
  ].map((role) => `[role="${role}"]`),
].join(', ')

const off = (el) =>
  el.disabled ||
  el.getAttribute('aria-disabled') === 'true' ||
  !!el.closest('[inert], [aria-hidden="true"], [data-letter-hints]')

const near = (a, b) =>
  Math.abs(a.left - b.left) < 3 &&
  Math.abs(a.top - b.top) < 3 &&
  Math.abs(a.width - b.width) < 3 &&
  Math.abs(a.height - b.height) < 3

function realRect(el) {
  return el.getBoundingClientRect()
}
// Something else (a scrim, a sheet, a sticky bar) covers it at all of these points.
function realHit(box, rect) {
  const points = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + 4, rect.top + 4],
    [rect.right - 4, rect.bottom - 4],
  ]
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
    const hit = document.elementFromPoint(x, y)
    if (hit && (box.contains(hit) || hit.contains(box))) return true
  }
  return false
}

/**
 * What can be pressed and is on screen, in reading order: `{ el, box, rect }`.
 * A visually hidden checkbox is pressed through its label; a wrapper the size
 * of the control inside it gives way to that control.
 */
export function hintTargets(
  root = document,
  { rectOf = realRect, reachable = realHit, width, height } = {},
) {
  const w = width ?? innerWidth
  const h = height ?? innerHeight
  const found = []
  for (const el of root.querySelectorAll(PRESSABLE)) {
    if (off(el)) continue
    let box = el
    let rect = rectOf(el)
    if ((rect.width < 4 || rect.height < 4) && el.tagName === 'INPUT') {
      const label =
        el.closest('label') ||
        (el.id
          ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
          : null)
      if (label) {
        box = label
        rect = rectOf(label)
      }
    }
    if (rect.width < 4 || rect.height < 4) continue
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= h || rect.left >= w)
      continue
    if (
      typeof box.checkVisibility === 'function' &&
      !box.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    )
      continue
    if (!reachable(box, rect)) continue
    found.push({ el, box, rect })
  }
  const kept = found.filter(
    (outer) =>
      !found.some(
        (inner) =>
          inner !== outer &&
          outer.el.contains(inner.el) &&
          near(outer.rect, inner.rect),
      ),
  )
  // Two targets on one box (a label and its own checkbox): one tag.
  const unique = kept.filter(
    (item, index) =>
      kept.findIndex((other) => other.box === item.box) === index,
  )
  return unique.sort(
    (a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left,
  )
}

// "Control+K" (aria-keyshortcuts) as the shell writes it: Ctrl+K, or ⌘K on Apple.
function ariaLabel(aria) {
  const combo = aria
    .split('+')
    .map((part) => part.toLowerCase())
    .map((part) =>
      (part === 'control' && !appleKeys) || (part === 'meta' && appleKeys)
        ? 'mod'
        : part === 'control'
          ? 'ctrl'
          : part,
    )
    .join('+')
  return keyLabel(combo)
}

/** The element's own key, to learn while jumping, or ''. */
export function shortcutOf(el) {
  const own = el.getAttribute('data-shortcut')
  if (own) return formatCombo(own, appleKeys)
  const module = el.getAttribute('data-module')
  if (module && el.getAttribute('data-state') !== 'unavailable') {
    const go = moduleMeta(module)?.go
    if (go) return formatCombo(`g ${go}`, appleKeys)
  }
  if (
    el.closest('[data-list-search]') &&
    pageShortcuts.value.ids.includes('search')
  )
    return '/'
  const aria = el.getAttribute('aria-keyshortcuts')
  return aria ? ariaLabel(aria.trim().split(/\s+/)[0]) : ''
}

/** Press it the way a mouse would: what opens on pointerdown opens, then a click. */
export function pressTarget(el, { newTab = false } = {}) {
  if (newTab && el.matches('a[href]')) {
    window.open(el.href, '_blank', 'noopener')
    return
  }
  if ((isTypingTarget(el) && el.tagName !== 'SELECT') || el.isContentEditable) {
    el.focus()
    if (el.tagName === 'INPUT' && el.value && typeof el.select === 'function')
      try {
        el.select()
      } catch {
        // number inputs in some engines refuse select()
      }
    return
  }
  const rect = el.getBoundingClientRect()
  const at = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }
  const pointer = { ...at, pointerType: 'mouse', isPrimary: true, pointerId: 1 }
  const fire = (Kind, type, init) => {
    if (typeof Kind === 'function') el.dispatchEvent(new Kind(type, init))
  }
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : null
  fire(Pointer, 'pointerover', pointer)
  fire(MouseEvent, 'mouseover', at)
  fire(Pointer, 'pointerdown', { ...pointer, buttons: 1 })
  fire(MouseEvent, 'mousedown', { ...at, buttons: 1 })
  if (el.isConnected) el.focus?.({ preventScroll: true })
  fire(Pointer, 'pointerup', pointer)
  fire(MouseEvent, 'mouseup', at)
  if (el.isConnected) el.click()
}

// ── the tags on screen ─────────────────────────────────────────────────────

/** Tags on screen right now, for the tests: `{ label, shortcut, el }`. */
export const hintsShown = ref([])

let layer = null
let items = []
let typed = ''
let newTabMode = false

function paint() {
  for (const item of items) {
    const match = item.label.startsWith(typed)
    item.tag.hidden = !match
    item.typedEl.textContent = match ? typed : ''
    item.restEl.textContent = match ? item.label.slice(typed.length) : ''
  }
}

// Tags of controls close together would cover each other: one that lands on
// an earlier one moves down (a few steps at most).
function unstack(tags) {
  const placed = []
  for (const tag of tags) {
    let box = tag.getBoundingClientRect()
    for (let tries = 0; tries < 3; tries++) {
      const hit = placed.find(
        (other) =>
          box.left < other.right &&
          other.left < box.right &&
          box.top < other.bottom &&
          other.top < box.bottom,
      )
      if (!hit) break
      tag.style.top = `${parseFloat(tag.style.top) + (hit.bottom - box.top) + 1}px`
      box = tag.getBoundingClientRect()
    }
    placed.push(box)
  }
}

export function hideHints() {
  layer?.remove()
  layer = null
  items = []
  typed = ''
  hintsShown.value = []
}

/** Put the tags on screen; `geometry` is for the tests (jsdom has no layout). */
export function showHints({ newTab = false, geometry } = {}) {
  hideHints()
  const targets = hintTargets(document, geometry)
  if (!targets.length) return false
  newTabMode = newTab
  const labels = hintLabels(targets.length)
  layer = document.createElement('div')
  layer.className = 'letter-hints'
  layer.setAttribute('aria-hidden', 'true')
  layer.setAttribute('data-letter-hints', '')
  const w = geometry?.width ?? innerWidth
  const h = geometry?.height ?? innerHeight
  items = targets.map((target, index) => {
    const tag = document.createElement('span')
    tag.className = 'letter-hint ui-inverse'
    tag.style.left = `${Math.max(0, Math.min(w - 24, target.rect.left))}px`
    tag.style.top = `${Math.max(0, Math.min(h - 18, target.rect.top))}px`
    const typedEl = document.createElement('span')
    typedEl.className = 'letter-hint-typed'
    const restEl = document.createElement('span')
    restEl.className = 'letter-hint-rest'
    tag.append(typedEl, restEl)
    const shortcut = shortcutOf(target.el)
    if (shortcut) {
      const own = document.createElement('span')
      own.className = 'letter-hint-key'
      own.textContent = shortcut
      tag.append(own)
    }
    layer.append(tag)
    return { ...target, label: labels[index], shortcut, tag, typedEl, restEl }
  })
  paint()
  document.body.append(layer)
  unstack(items.map((item) => item.tag))
  hintsShown.value = items.map(({ label, shortcut, el }) => ({
    label,
    shortcut,
    el,
  }))
  return true
}

/** keydown while the tags are on screen: every key is theirs. */
export function onHintKey(event) {
  if (!layer) return false
  // A shortcut with a modifier leaves the tags and keeps its own meaning.
  if (event.ctrlKey || event.metaKey || event.altKey) {
    hideHints()
    return false
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.key === 'Escape') {
    hideHints()
    return true
  }
  if (event.key === 'Backspace') {
    typed = typed.slice(0, -1)
    paint()
    return true
  }
  const letter = event.key.length === 1 ? event.key.toLowerCase() : ''
  if (!letter || !HINT_LETTERS.includes(letter)) return true
  const next = typed + letter
  const matches = items.filter((item) => item.label.startsWith(next))
  if (!matches.length) return true
  typed = next
  if (matches.length === 1 && matches[0].label === typed) {
    const { el } = matches[0]
    const newTab = newTabMode
    hideHints()
    pressTarget(el, { newTab })
    return true
  }
  paint()
  return true
}

/** keydown: `f` (and Shift+F) shows the tags while the switch is on. */
export function onHintTrigger(event) {
  if (
    !letterHintsOn.value ||
    layer ||
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key.toLowerCase() !== 'f' ||
    isTypingTarget(event.target)
  )
    return false
  // A page's own `f` (Compras' «Registrar factura») gives way while it is on:
  // its button gets a tag like any other.
  event.preventDefault()
  event.stopImmediatePropagation()
  showHints({ newTab: event.shiftKey })
  return true
}

/** Install once in the shell. */
export function useLetterHints({ router } = {}) {
  const onKey = (event) => {
    if (!onHintKey(event)) onHintTrigger(event)
  }
  // The page moved under the tags: they would point at nothing.
  const leave = () => hideHints()
  const leaveUnlessTag = () => {
    if (layer) hideHints()
  }
  let stopRoute = null
  onMounted(() => {
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', leave, true)
    window.addEventListener('resize', leave)
    window.addEventListener('blur', leave)
    window.addEventListener('pointerdown', leaveUnlessTag, true)
    stopRoute = router?.afterEach?.(leave) || null
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', leave, true)
    window.removeEventListener('resize', leave)
    window.removeEventListener('blur', leave)
    window.removeEventListener('pointerdown', leaveUnlessTag, true)
    stopRoute?.()
    hideHints()
  })
}
