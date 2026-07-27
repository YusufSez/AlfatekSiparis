import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Ofis Sipariş',
        short_name: 'Sipariş',
        description: 'Ofis içecek sipariş sistemi',
        theme_color: '#0F3D2E',
        background_color: '#F3EDE2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'tr',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/sessions': 'http://localhost:4000',
      '/kitchen': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
      '/menu': 'http://localhost:4000',
      '/notifications': 'http://localhost:4000',
      '/announcements': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
      '/version': 'http://localhost:4000',
      '/docs': 'http://localhost:4000',
      '/openapi.json': 'http://localhost:4000',
    },
  },
});
