import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// On GitHub Pages the site lives at /<repo-name>/. The deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH || '/';

// Content Security Policy for the built site (GitHub Pages can't send headers, so it's a <meta> tag).
// The page may only talk to itself, Gemini and the retry relay on workers.dev, so even injected code
// couldn't send the API key anywhere else. Build only: the dev server needs inline scripts for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://generativelanguage.googleapis.com https://*.workers.dev",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin: Plugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
};

export default defineConfig({
  base,
  plugins: [
    cspPlugin,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'יומן קלוריות',
        short_name: 'קלוריות',
        description: 'יומן קלוריות בכתב חופשי',
        lang: 'he',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#f6f6f3',
        theme_color: '#0e9f6e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Only Hebrew + Latin glyphs are used; skip precaching the other font subsets.
        globIgnores: ['**/rubik-arabic-*', '**/rubik-cyrillic*'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
