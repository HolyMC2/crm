// Push-notification click → in-app route.
//
// The service worker (scoped to /assets/crm/frontend/, never controlling /crm
// pages) cannot navigate the SPA tab, so on click it posts
// `{ type: 'crm:navigate', url }` (public/push-sw.js) and the page routes itself.
// This module turns the server-built URL (`/crm/inbox?deal=…`) into the router
// path the SPA understands (`/inbox?deal=…`) — and refuses anything that is not a
// same-origin /crm URL, since the message channel is reachable by any SW on the
// origin.

const CRM_BASE = '/crm'

export function toInAppRoute(url, origin = globalThis.location?.origin) {
  if (typeof url !== 'string' || !url) return null
  let u
  try {
    u = new URL(url, origin)
  } catch (e) {
    return null
  }
  if (origin && u.origin !== origin) return null
  if (u.pathname !== CRM_BASE && !u.pathname.startsWith(CRM_BASE + '/'))
    return null
  const path = u.pathname.slice(CRM_BASE.length) || '/'
  return path + u.search + u.hash
}

export function isNavigateMessage(data) {
  return !!data && data.type === 'crm:navigate' && typeof data.url === 'string'
}

// Wire once at boot. Returns the unsubscribe for tests.
export function listenForPushNavigation(
  router,
  container = globalThis.navigator?.serviceWorker,
) {
  if (!container || typeof container.addEventListener !== 'function')
    return () => {}
  const onMessage = (e) => {
    if (!isNavigateMessage(e.data)) return
    const route = toInAppRoute(e.data.url)
    if (!route) return
    // NavigationDuplicated (same conversation clicked twice) is not an error here
    router.push(route).catch(() => {})
  }
  container.addEventListener('message', onMessage)
  return () => container.removeEventListener('message', onMessage)
}
