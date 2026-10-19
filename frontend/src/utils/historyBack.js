// Back for the phone inbox. A deep link (?deal=…) opens with no in-app history entry, so
// history.back() does nothing and the ‹ looks dead. Go to the fallback instead when there
// is no entry to return to (vue-router stores `back` on every entry it pushed itself).
export function mobileBackOr(fallback) {
  if (window.history.state?.back) window.history.back()
  else fallback()
}
