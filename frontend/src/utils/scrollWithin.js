// Bring an element into view by scrolling only the list that holds it.
// `scrollIntoView` also scrolls every scrolling ancestor, the shell's page and
// the document included: opening a conversation in the Bandeja lifted the whole
// screen by a few hundred px and left a blank band under it (2026-11-12).

/** The nearest ancestor that scrolls vertically and has something to scroll. */
export function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight
    )
      return p
  }
  return null
}

/**
 * @param {Element} el
 * @param {{ block?: 'start' | 'end', behavior?: ScrollBehavior }} [options]
 *   `end` puts the element's bottom at the list's bottom (a chat's latest
 *   message); `start` its top at the list's top.
 * @returns {boolean} whether a list scrolled
 */
export function scrollWithin(
  el,
  { block = 'start', behavior = 'smooth' } = {},
) {
  const box = scrollParent(el)
  if (!box) return false
  const top =
    box.scrollTop +
    el.getBoundingClientRect().top -
    box.getBoundingClientRect().top
  const target =
    block === 'end'
      ? top + el.getBoundingClientRect().height - box.clientHeight
      : top
  box.scrollTo({ top: Math.max(0, target), behavior })
  return true
}
