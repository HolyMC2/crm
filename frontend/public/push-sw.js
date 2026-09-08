// Web Push handlers, imported into the generated workbox service worker via
// vite-plugin-pwa `workbox.importScripts` (spec 1.1). Payload contract matches
// doco_marketing.services.push: { title, body, tag, url }.
self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CRM', {
      body: data.body || '',
      icon: '/assets/crm/manifest/manifest-icon-192.maskable.png',
      badge: '/assets/crm/manifest/manifest-icon-192.maskable.png',
      // same tag per conversation → OS stacks instead of spamming
      tag: data.tag || 'crm',
      renotify: true,
      data: { url: data.url || '/crm/inbox' },
    }),
  )
})

// A CRM SPA tab: /crm or /crm/... — NOT the Desk (/app/crm-deal/... also contains
// "/crm", which is how a click used to focus a Desk tab and go nowhere).
function isCrmWindow(url) {
  try {
    const p = new URL(url).pathname
    return p === '/crm' || p.startsWith('/crm/')
  } catch (e) {
    return false
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url =
    (event.notification.data && event.notification.data.url) || '/crm/inbox'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (wins) => {
        const crm = wins.filter((w) => isCrmWindow(w.url))
        // prefer the tab the operator is already looking at
        const target =
          crm.find((w) => w.focused) ||
          crm.find((w) => w.visibilityState === 'visible') ||
          crm[0]
        if (!target) return self.clients.openWindow(url)
        try {
          await target.focus()
        } catch (e) {
          /* focus can be refused; the message below still lands */
        }
        // This SW is scoped to /assets/crm/frontend/ and never controls /crm pages
        // (see composables/push.js), so WindowClient.navigate() rejects there — that
        // rejection was the "click and nothing happens" (Marco 2026-09-08). Try it
        // for a controlled client, otherwise hand the URL to the page: main.js routes
        // in-app, no reload, drafts survive.
        try {
          if ('navigate' in target) {
            await target.navigate(url)
            return
          }
        } catch (e) {
          /* uncontrolled client — expected */
        }
        target.postMessage({ type: 'crm:navigate', url })
      }),
  )
})
