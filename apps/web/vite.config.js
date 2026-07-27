import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** SPA navigations must not hit the API proxy. */
function spaBypass(req) {
  const mode = req.headers['sec-fetch-mode'];
  const dest = req.headers['sec-fetch-dest'];
  if (mode === 'navigate' || dest === 'document') {
    return '/index.html';
  }
  if (req.headers.accept?.includes('text/html')) {
    return '/index.html';
  }
}

export default defineConfig(({ command, mode }) => {
  const enableDevHttps = command === 'serve' && mode === 'development';

  return {
    plugins: [
      react(),
      // HTTPS only for Vite DEV (`npm run dev`) — production build / preview untouched
      enableDevHttps && basicSsl(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        // Manual register via virtual:pwa-register (logs + toast)
        injectRegister: false,
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'favicon-96x96.png',
          'apple-touch-icon.png',
          'alfatek.png',
          'pwa-192.png',
          'pwa-512.png',
        ],
        manifest: {
          name: 'Alfatek Sipariş',
          short_name: 'Alfatek',
          description:
            'Teknik ve Operasyon ofisleri için gerçek zamanlı toplu içecek sipariş sistemi',
          theme_color: '#0f3d2e',
          background_color: '#f3f5f4',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          lang: 'tr',
          icons: [
            {
              src: 'pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ].filter(Boolean),
    server: {
      host: true,
      port: 5173,
      // Dev HTTPS: basicSsl() supplies certs; https:true keeps intent explicit
      ...(enableDevHttps ? { https: true } : {}),
      proxy: {
        '/auth': 'http://localhost:4000',
        '/sessions': 'http://localhost:4000',
        '/kitchen': {
          target: 'http://localhost:4000',
          bypass: spaBypass,
        },
        '/admin': {
          target: 'http://localhost:4000',
          bypass: spaBypass,
        },
        '/menu': 'http://localhost:4000',
        '/notifications': 'http://localhost:4000',
        '/announcements': 'http://localhost:4000',
        '/health': 'http://localhost:4000',
        '/version': 'http://localhost:4000',
        '/docs': 'http://localhost:4000',
        '/openapi.json': 'http://localhost:4000',
        '/socket.io': {
          target: 'http://localhost:4000',
          ws: true,
        },
      },
    },
  };
});
