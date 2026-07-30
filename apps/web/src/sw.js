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
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      // Installers must hit nginx/static — never SPA index.html fallback.
      denylist: [/^\/downloads\//i],
    })
  );
} catch {
  /* ignore if index not in manifest during dev */
}

function isAppleMobile() {
  const ua = self.navigator?.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS desktop UA
  return (
    self.navigator?.platform === 'MacIntel' && (self.navigator?.maxTouchPoints || 0) > 1
  );
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
      const appVisible = all.some((client) => client.visibilityState === 'visible');
      const apple = isAppleMobile();

      // iOS Home Screen requires a user-visible notification for every push.
      // Skipping showNotification can cause Apple to stop delivering further pushes.
      // Non-Apple: skip banner when a visible tab already handles toast/sound.
      if (appVisible && !apple) {
        console.info('[sw-push] skip visible tab', {
          event: data.event || null,
          tag: data.tag || null,
          clients: all.length,
        });
        return;
      }

      const origin = self.location?.origin || '';
      const abs = (path) => {
        if (!path) return undefined;
        if (/^https?:\/\//i.test(path)) return path;
        if (!origin) return path;
        return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
      };

      console.info('[sw-push] showNotification', {
        event: data.event || null,
        tag: data.tag || null,
        appVisible,
        apple,
        clients: all.length,
      });

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: abs(data.icon || '/pwa-192.png'),
        badge: abs(data.badge || '/pwa-192.png'),
        tag: data.tag || 'alfatek',
        data: { url: data.url || '/', event: data.event || null },
        renotify: Boolean(data.event === 'session.closed' || data.event === 'kitchen:staff_call'),
        silent: false,
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
