import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function xerogramRoutes(): Plugin {
  const route = (server: {middlewares: import('vite').Connect.Server}) => {
    server.middlewares.use((request, response, next) => {
      const url = request.url || '';
      if (/^\/instagram(?:\/|\?|$)/.test(url)) {
        response.writeHead(307, {Location: url.replace(/^\/instagram/, '/xerogram')}).end();
        return;
      }
      if (/^\/xerogram(?:\/|\?|$)/.test(url)) request.url = '/xerogram.html';
      next();
    });
  };
  return {name: 'xerogram-routes', configureServer: route, configurePreviewServer: route};
}
export default defineConfig(({mode}) => {
  const localEnv = {...loadEnv(mode, process.cwd(), ''),...process.env};
  const apiBase = localEnv.API_BASE_URL || localEnv.API_BASE_URL_1;
  return {
    build: {
      rollupOptions: {input: {main: path.resolve(__dirname, 'index.html'), xerogram: path.resolve(__dirname, 'xerogram.html')}},
    },
    plugins: [
      xerogramRoutes(),
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon-gas.png',
          'favicon-32x32-gas.png',
          'favicon-16x16-gas.png',
          'apple-touch-icon-gas.png',
          'pwa-192x192-gas.png',
          'pwa-512x512-gas.png',
          'pwa-maskable-512x512-gas.png',
        ],
        manifest: {
          id: '/',
          name: 'XeroxYT-NTv7',
          short_name: 'XeroxYT-NTv7',
          description: 'A refined, modern video sharing platform frontend.',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192-gas.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512-gas.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512-gas.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/app-icons/**','**/open.html','**/open-launch.js'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallbackDenylist: [/^\/(?:xerogram|instagram)(?:\/|\?|$)/, /^\/open\.html(?:\?|$)/, /^\/api/, /^\/stream/, /^\/edu/, /^\/360/, /^\/scratch-edu/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: localEnv.XEROGRAM_DEV_API ? {'/api/xerogram': {target: localEnv.XEROGRAM_DEV_API}} : apiBase ? Object.fromEntries(['/api','/stream','/360','/edu','/scratch-edu'].map(prefix=>[prefix,{target:apiBase,changeOrigin:true,configure:(proxy)=>{proxy.on('proxyReq',(outgoing,request)=>{if(localEnv.API_SHARED_SECRET)outgoing.setHeader('Authorization','Bearer '+localEnv.API_SHARED_SECRET);if(!request.headers.origin)outgoing.setHeader('Origin','http://localhost:5173');});}}])) : undefined,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
