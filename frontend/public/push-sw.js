// Web Push handlers, imported into the generated workbox service worker via
// vite-plugin-pwa `workbox.importScripts` (spec 1.1). Payload contract matches
// doco_marketing.services.push: { title, body, tag, url }.
self.addEventListener('push', (event) => {
  let data = {}
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/crm/inbox'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes('/crm')) {
          w.focus()
          if ('navigate' in w) w.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
