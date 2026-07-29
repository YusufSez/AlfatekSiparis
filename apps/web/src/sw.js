/* Custom service worker — VitePWA injectManifest */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

try {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));
} catch {
  /* ignore if index not in manifest during dev */
}

self.addEventListener('push', (event) => {
  let data = {
    title: 'Alfatek Sipariş',
    body: 'Yeni bildirim',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    url: '/',
    tag: 'alfatek',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      data.body = event.data?.text() || data.body;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Foreground tab → in-app toast/sound via notification:new; skip duplicate banner.
      // Background / killed PWA → show push (iOS Home Screen needs a visible notification).
      const appVisible = all.some((client) => client.visibilityState === 'visible');
      if (appVisible) return;

      const origin = self.location?.origin || '';
      const abs = (path) => {
        if (!path) return undefined;
        if (/^https?:\/\//i.test(path)) return path;
        if (!origin) return path;
        return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
      };

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: abs(data.icon || '/pwa-192.png'),
        badge: abs(data.badge || '/pwa-192.png'),
        tag: data.tag || 'alfatek',
        data: { url: data.url || '/', event: data.event || null },
        renotify: false,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
