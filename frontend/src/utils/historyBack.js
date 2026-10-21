// Back for the phone inbox. A deep link (?deal=…) opens with no in-app history entry, so
// history.back() does nothing and the ‹ looks dead. Go to the fallback instead when there
// is no entry to return to (vue-router stores `back` on every entry it pushed itself).
export function mobileBackOr(fallback) {
  if (window.history.state?.back) window.history.back()
  else fallback()
}

// The arrow's second case, after the router's own back. A page opened from another page of this
// origin (the Desk, another app) has no vue-router entry behind it, but the browser's previous
// entry is that page, so Back returns there. Not for the sign-in step, and not in a window with
// one entry (opened from a page: nothing behind it).
export function canReturnToReferrer({ referrer, origin, historyLength }) {
  if (!referrer || historyLength < 2) return false
  const from = new URL(referrer)
  return from.origin === origin && !from.pathname.startsWith('/login')
}
