// One history controller for every open BottomSheet, so the phone's back
// button closes the top sheet and never leaves the page.
//
// Each open sheet owns one extra history entry: the same URL and the same
// vue-router state plus `uiSheet: <token>`. Rules:
// - A pop between the page's own entries (same route, `state.current`) is the
//   sheets' business: a capture listener stops it before vue-router sees it,
//   so no guard runs and no navigation is aborted on a sheet close.
// - Closing a sheet in the UI walks back over its entry. That back is async,
//   so every later push (another sheet, a router navigation) waits for it
//   (`settle`), or the push would be undone by the late pop.
// - A navigation started while sheets are open (a link inside a sheet)
//   replaces the top sheet entry instead of stacking on it, and closes them.

import { sheetGate } from './sheetGate'

const stack = [] // [{ token, onClose, href }]
let pending = null // our own back(): { resolve, timer }
let installedOn = null

function nativeHistory() {
  return typeof window === 'undefined' ? null : window.history
}

function finishPending() {
  if (!pending) return
  clearTimeout(pending.timer)
  const { resolve } = pending
  pending = null
  resolve()
}

/** Resolves once our own back() has landed (or right away). */
export function settle() {
  return pending ? pending.promise : Promise.resolve()
}

function closeAbove(token) {
  // Close every sheet above `token` (all of them when it is not open).
  const index = stack.findIndex((entry) => entry.token === token)
  const closing = stack.splice(index + 1)
  for (const entry of closing.reverse()) entry.onClose('back')
}

function onPopState(event, router) {
  const current = router.currentRoute.value.fullPath
  const samePage = event.state?.current === current
  if (pending && samePage) {
    // The pop our own back() asked for.
    event.stopImmediatePropagation()
    finishPending()
    return
  }
  if (!samePage) {
    // Leaving the page (or a pop we do not own): the router handles it and
    // the sheets go with the page.
    finishPending()
    stack.splice(0).forEach((entry) => entry.onClose('navigate'))
    return
  }
  if (!stack.length && !event.state?.uiSheet) return
  // Back (or forward) between the page and its sheets: not a navigation.
  event.stopImmediatePropagation()
  closeAbove(event.state?.uiSheet)
}

// The popstate listener lives in sheetGate.js (in the entry chunk, ahead of
// vue-router's); this module answers through it once a sheet has mounted.
let activeRouter = null
sheetGate.onPopState = (event) =>
  activeRouter && onPopState(event, activeRouter)

/** Once per router: the router the listener checks, and the navigation guard. */
export function installSheetHistory(router) {
  if (!router || typeof window === 'undefined') return
  activeRouter = router
  if (installedOn === router) return
  installedOn = router
  router.beforeEach(async (to) => {
    await settle()
    const history = nativeHistory()
    if (!stack.length) return
    const onSheetEntry = Boolean(history?.state?.uiSheet)
    stack.splice(0).forEach((entry) => entry.onClose('navigate'))
    // A link inside a sheet: the new page replaces the sheet's entry.
    if (onSheetEntry && !to.redirectedFrom) return { ...to, replace: true }
  })
}

/**
 * A sheet opened: push its entry (after any back still in flight).
 * `onClose` is called when back (or a navigation) closes it.
 */
export async function openSheet(token, onClose) {
  const history = nativeHistory()
  if (!history) return
  const entry = { token, onClose, cancelled: false }
  stack.push(entry)
  await settle()
  if (entry.cancelled || !stack.includes(entry)) return
  history.pushState({ ...history.state, uiSheet: token }, '')
}

/** A sheet closed in the UI: walk back over its entry. */
export function closeSheet(token) {
  const index = stack.findIndex((entry) => entry.token === token)
  if (index < 0) return
  const [entry] = stack.splice(index, 1)
  entry.cancelled = true
  backOver(token)
}

function backOver(token) {
  const history = nativeHistory()
  if (!history) return
  // Another back is still landing: look again once it has.
  if (pending) return void settle().then(() => backOver(token))
  if (history.state?.uiSheet !== token) return
  let resolve
  const promise = new Promise((done) => (resolve = done))
  // If the pop never arrives (an odd browser), do not block navigation.
  pending = { promise, resolve, timer: setTimeout(finishPending, 400) }
  history.back()
}

/** For tests. */
export function _resetSheetHistory() {
  stack.splice(0)
  finishPending()
}
export function _openSheets() {
  return stack.map((entry) => entry.token)
}
