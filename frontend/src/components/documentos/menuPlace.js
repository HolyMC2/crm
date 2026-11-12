// Where a menu that grows from a button opens (the bolt's «Acciones»): from
// the button's right edge toward the left, as on a list's bar, unless that
// would leave the page; then from its left edge, pushed back inside when the
// page is narrower than the menu.
const WIDTH = 320 // w-80
const GAP = 8

/** The inline style for the menu, absolute inside the button's box. `button`
 * and `room` are { left, right } in viewport pixels (roomFor). */
export function menuPlace(button, room, width = WIDTH) {
  const rightAligned = { right: '0px', transformOrigin: 'top right' }
  const space = room ? room.right - room.left : 0
  // Not laid out (a test, a hidden pane): the usual place.
  if (!button || space <= 0) return rightAligned
  const wide = Math.min(width, space - 2 * GAP)
  const style = wide < width ? { width: `${wide}px` } : {}
  if (button.right - wide >= room.left + GAP)
    return { ...style, ...rightAligned }
  const left =
    Math.max(room.left + GAP, Math.min(button.left, room.right - GAP - wide)) -
    button.left
  return {
    ...style,
    left: `${left}px`,
    transformOrigin: `${(button.right - button.left) / 2 - left}px top`,
  }
}

/** What the menu may cover: the nearest ancestor that clips its content
 * sideways (a page under the rail, a split pane), within the window. */
export function roomFor(el) {
  const view = {
    left: 0,
    right: document.documentElement.clientWidth || window.innerWidth || 0,
  }
  for (let node = el?.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowX === 'visible') continue
    const box = node.getBoundingClientRect()
    return {
      left: Math.max(view.left, box.left),
      right: Math.min(view.right, box.right),
    }
  }
  return view
}
