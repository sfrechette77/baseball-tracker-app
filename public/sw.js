// Service worker for push notifications.
// Lives at /sw.js so it can control the whole origin.

self.addEventListener('install', (event) => {
  // Activate immediately rather than waiting for old tabs to close
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all open tabs immediately
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // Parse the payload. We expect JSON like:
  // { title: "Game On", body: "Coaches arriving at 8am", url: "/event/abc-123" }
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    // Fallback for non-JSON payloads
    data = { title: 'Chicago Elite', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Chicago Elite'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'broadcast',
    // tag with renotify ensures iOS shows the update even for same tag
    renotify: true,
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If the app is already open, focus that window and navigate
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            client.navigate(url).catch(() => {})
          }
          return
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
