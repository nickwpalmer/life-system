import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://nickwpalmer.github.io/life-system/
export default defineConfig({
  base: '/life-system/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Life',
        short_name: 'Life',
        description: 'Nick’s private life system',
        theme_color: '#14111c',
        background_color: '#14111c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/life-system/',
        scope: '/life-system/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Never cache API traffic: private data stays out of the service worker cache.
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
        runtimeCaching: []
      }
    })
  ]
})
