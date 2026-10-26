import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { retainPreviousBuilds } from './scripts/retain-builds.mjs'
import { translationKeys } from './scripts/translation-keys.mjs'

// https://vitejs.dev/config/
export default defineConfig(async () => {
  // Deploy-safe chunks: keep the previous builds' assets (scripts/retain-builds.mjs).
  const retain = retainPreviousBuilds()
  // Silent update: version.json names the entry chunk of this build; open
  // tabs compare it with the entry they booted from (@muelle/live-sync bundle
  // watcher in main.js) and move to a new build at a safe moment.
  const config = {
    plugins: [
      vue(),
      vueJsx(),
      retain,
      // translation-keys.json: the strings the server ships translations for.
      translationKeys(),
      {
        name: 'emit-version-json',
        apply: 'build',
        generateBundle(_, bundle) {
          const entry = Object.values(bundle).find(
            (chunk) => chunk.type === 'chunk' && chunk.isEntry,
          )
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ entry: entry?.fileName || null }),
          })
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        // The service-worker registration inline in the page, not one more
        // script request on every first load (SPEC §4: ≤ 60 scripts).
        injectRegister: 'inline',
        devOptions: {
          enabled: true,
        },
        // No precache (F22): the worker's scope is /assets/crm/frontend/, so it
        // never controls a /crm page and a precache only downloaded every
        // build (465 files, 3.04 MB gzip) on each first visit and deploy. The
        // HTTP cache serves the hashed assets. The worker carries the push
        // handlers; scripts/verify-pwa-build.mjs keeps the precache to the
        // web manifest the plugin always adds.
        includeManifestIcons: false,
        workbox: {
          // Web Push handlers (spec 1.1) — public/push-sw.js sits next to the
          // generated sw.js, so a bare relative import resolves in production.
          importScripts: ['push-sw.js'],
          globPatterns: [],
          navigateFallback: null,
        },
        manifest: {
          display: 'standalone',
          name: 'Muelle',
          short_name: 'Muelle',
          start_url: '/crm',
          scope: '/crm',
          lang: 'es',
          theme_color: '#0f6b78',
          background_color: '#ffffff',
          description: 'Contactos y trabajo diario en Muelle',
          shortcuts: [
            {
              name: 'Hoy',
              short_name: 'Hoy',
              url: '/crm/hoy',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
                  sizes: '192x192',
                },
              ],
            },
            {
              name: 'Contactos',
              short_name: 'Contactos',
              url: '/crm/contactos',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
                  sizes: '192x192',
                },
              ],
            },
            {
              name: 'Inbox',
              url: '/crm/inbox',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
                  sizes: '192x192',
                },
              ],
            },
            {
              name: 'Leads',
              url: '/crm/leads',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
                  sizes: '192x192',
                },
              ],
            },
          ],
          icons: [
            {
              src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-192.maskable.png?v=crm-1',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-512.maskable.png?v=crm-1',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-512.maskable.png?v=crm-1',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // frappe's `ui/` package, vendored (src/framework-ui/SOURCE.json).
        '@framework/ui': path.resolve(__dirname, 'src/framework-ui'),
        // Single-component entry points, so form/dialog widgets that the
        // first screen does not need can load lazily (src/utils/lazyGlobals.js).
        'frappe-ui-components': path.resolve(
          __dirname,
          'node_modules/frappe-ui/src/components',
        ),
      },
      // the editor packages must resolve to one copy each: tiptap imports
      // `@tiptap/pm/model` while prosemirror-state/transform/tables import bare
      // `prosemirror-model`, so a nested install of either throws "multiple
      // versions of prosemirror-model were loaded" on mention insert. Unlike
      // optimizeDeps (dev-only) this also applies to the production build.
      dedupe: [
        'vue',
        'vue-router',
        'frappe-ui',
        'dompurify',
        '@tiptap/core',
        '@tiptap/pm',
        '@tiptap/vue-3',
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-transform',
      ],
    },
    build: {
      rollupOptions: {
        output: {
          // Merge chunks under 2 KB (icons, stores, tiny composables) into
          // their importers: a first route fetched 70+ files, most under 2 KB
          // (SPEC §4: ≤ 60 scripts on a daily route).
          experimentalMinChunkSize: 2 * 1024,
        },
      },
    },
    optimizeDeps: {
      include: [
        'tailwind.config.js',
        'prosemirror-state',
        'prosemirror-view',
        'lowlight',
        'interactjs',
      ],
    },
    server: {
      fs: {
        // allow the bench `apps/` dir: sibling apps are served from there in dev.
        // frappe-ui itself comes from node_modules (1.0.2, no local link).
        allow: [path.resolve(__dirname, '../..')],
      },
    },
  }

  const frappeui = (await import('frappe-ui/vite')).default
  config.plugins.unshift(
    frappeui({
      frappeProxy: true,
      lucideIcons: true,
      jinjaBootData: true,
      buildConfig: {
        indexHtmlPath: '../crm/www/crm.html',
        // Never empty: tabs opened before this build still load its chunks.
        emptyOutDir: false,
        sourcemap: true,
      },
    }),
  )

  return config
})
