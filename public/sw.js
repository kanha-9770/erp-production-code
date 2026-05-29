/* eslint-disable no-restricted-globals */
/**
 * Service Worker — Web Push delivery.
 *
 * Lives at the root of the origin so its scope covers the entire app. The
 * registration code on the client picks it up from `/sw.js` and asks the
 * browser to enrol the device with the push service (FCM / autopush / APNs).
 *
 * Two handlers do the work:
 *
 *   - `push`            — the push service wakes the worker with an encrypted
 *                         payload (already decrypted by the time we see it).
 *                         We surface it as a native OS notification via
 *                         `registration.showNotification`.
 *
 *   - `notificationclick` — when the user taps the notification, focus an
 *                           existing tab that matches the deep link or open a
 *                           new one. This is what makes the notification act
 *                           "like an app" instead of being a dead-end banner.
 *
 * Payload shape (server side keeps this in sync):
 *   { title: string, body?: string, url?: string, icon?: string, tag?: string }
 */

self.addEventListener('install', (event) => {
  // Activate immediately on first install so the very first push doesn't get
  // dropped while an older worker is still claiming the scope.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any tabs that were already open before this worker
  // installed, so they can subscribe / receive pushes without a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Notification', body: '', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (e) {
    // Some pushes are text-only; fall back to plain text so the notification
    // still surfaces instead of being silently swallowed.
    try {
      payload.body = event.data ? event.data.text() : '';
    } catch (_) {
      // Ignore — we'll show the default title with an empty body.
    }
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/placeholder-logo.png',
    badge: payload.badge || '/placeholder-logo.png',
    data: { url: payload.url || '/' },
    // `tag` lets a newer notification replace a stale one (e.g. same OT toggle
    // fired twice in quick succession won't pile up as two banners).
    tag: payload.tag || undefined,
    // When a tagged notification replaces an existing one, `renotify` forces
    // the device to alert again (sound + heads-up / lock-screen banner)
    // instead of updating the tray entry silently. Without this, a second
    // push sharing a tag arrives but never re-pops on a locked phone.
    renotify: Boolean(payload.tag),
    // Slight vibration on phones so the user notices without being yelled at.
    vibrate: [120, 60, 120],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        // Prefer to focus an existing tab pointed at our origin instead of
        // opening yet another one. We don't strict-match on URL — the user
        // probably wants whatever tab is already open to navigate.
        for (const client of clientsArr) {
          if ('focus' in client) {
            client.navigate(target).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
        return undefined;
      }),
  );
});
