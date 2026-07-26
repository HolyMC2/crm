// Per-user localStorage key scoping (shared-terminal privacy — audit M2 class).
// Saved views / column layouts can embed customer identifiers in their `search`
// terms, so like the queue cache and outbox they must be (a) namespaced per user
// and (b) swept on logout (stores/session.js purges the doco_leads_/doco_deals_
// prefixes). Use for ANY new persisted operator state.
export function userScopedKey(base) {
  let user = 'guest'
  try {
    const m = document.cookie.match(/user_id=([^;]+)/)
    if (m) user = decodeURIComponent(m[1])
  } catch (e) {
    /* cookie unreadable → guest bucket, still swept on logout */
  }
  return `${base}:${user}`
}
