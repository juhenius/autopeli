import fs from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// mkcert HTTPS for PWA install/offline testing on the iPad (see README):
//   HTTPS_CERT=<ip>.pem HTTPS_KEY=<ip>-key.pem npm run preview
const https =
  process.env.HTTPS_CERT && process.env.HTTPS_KEY
    ? { cert: fs.readFileSync(process.env.HTTPS_CERT), key: fs.readFileSync(process.env.HTTPS_KEY) }
    : undefined

// The multiplayer client connects to same-origin `/ws`; dev and preview forward
// it to the server (`npm run server`, port 5174 — SERVER_PORT overrides for a
// second, private server) so LAN play-testing needs 5173 only.
const wsProxy = { '/ws': { target: `ws://localhost:${process.env.SERVER_PORT ?? '5174'}`, ws: true } }

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'Autopeli',
        short_name: 'Autopeli',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#1d2b3a',
        theme_color: '#1d2b3a',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The ?debug tuning panel (with lil-gui) is a lazy chunk outside the precache.
        globIgnores: ['**/panel-*.js'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, strictPort: true, proxy: wsProxy },
  preview: { port: 5173, strictPort: true, https, proxy: wsProxy },
})
