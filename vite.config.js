import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

function getCommitMessage() {
  try {
    return execSync('git log -1 --pretty=%s').toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  define: {
    __COMMIT_MSG__: JSON.stringify(getCommitMessage()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      manifest: {
        name: 'TIDEO ERP',
        short_name: 'TIDEO ERP',
        description: 'ERP modular multitenant con CRM, operaciones, finanzas, campo móvil, BI e IA.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        lang: 'es',
        background_color: '#EEF2F6',
        theme_color: '#0D1B2E',
        icons: [
          { src: '/icons/tideo-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/tideo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/tideo-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/tideo-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Precachea todos los assets del build (JS, CSS, HTML, imágenes, fuentes)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,webmanifest}'],
        // El bundle principal del ERP supera el límite por defecto de 2 MiB
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        runtimeCaching: [
          // Fuentes de Google — cache-first, 1 año
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheet',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
