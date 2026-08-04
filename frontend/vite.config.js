import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const isDev = mode === 'development'
  // Deploy-staleness guard: every build gets a unique id, baked into the bundle
  // (__BUILD_ID__) AND emitted as build.json next to it. Long-lived tabs compare
  // the two (main.js) and self-reload after a deploy — no reliance on the SW.
  const BUILD_ID = String(Date.now())
  const config = {
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      vue(),
      vueJsx(),
      {
        name: 'emit-build-id',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build.json',
            source: JSON.stringify({ id: BUILD_ID }),
          })
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
        },
        workbox: {
          // Web Push handlers (spec 1.1) — public/push-sw.js sits next to the
          // generated sw.js, so a bare relative import resolves in production.
          importScripts: ['push-sw.js'],
          // Activities chunk + index.css grew past workbox's 2 MiB precache
          // default, which HARD-FAILS the build (not a warning). 5 MiB keeps
          // both precached; revisit if chunks keep growing.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        manifest: {
          display: 'standalone',
          name: 'CRM',
          short_name: 'CRM',
          start_url: '/crm',
          scope: '/crm',
          lang: 'es',
          theme_color: '#16a34a',
          background_color: '#ffffff',
          description:
            'Modern & 100% Open-source CRM tool to supercharge your sales operations',
          shortcuts: [
            {
              name: 'Inbox',
              url: '/crm/inbox',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png',
                  sizes: '192x192',
                },
              ],
            },
            {
              name: 'Leads',
              url: '/crm/leads',
              icons: [
                {
                  src: '/assets/crm/manifest/manifest-icon-192.maskable.png',
                  sizes: '192x192',
                },
              ],
            },
          ],
          icons: [
            {
              src: '/assets/crm/manifest/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/crm/manifest/manifest-icon-512.maskable.png',
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
    optimizeDeps: {
      include: [
        'feather-icons',
        'tailwind.config.js',
        'prosemirror-state',
        'prosemirror-view',
        'lowlight',
        'interactjs',
      ],
    },
    server: {
      fs: {
        // allow the bench `apps/` dir so Vite can serve a linked local frappe-ui
        // checkout when one exists in a sibling app repo
        allow: [path.resolve(__dirname, '../..')],
      },
    },
  }

  const frappeui = await importFrappeUIPlugin(isDev, config)
  config.plugins.unshift(
    frappeui({
      frappeProxy: true,
      lucideIcons: true,
      jinjaBootData: true,
      buildConfig: {
        indexHtmlPath: '../crm/www/crm.html',
        emptyOutDir: true,
        sourcemap: true,
      },
    }),
  )

  return config
})

async function importFrappeUIPlugin(isDev, config) {
  if (isDev) {
    try {
      // Check if local frappe-ui has the vite plugin file
      const fs = await import('node:fs')
      const localVitePluginPath = path.resolve(__dirname, '../frappe-ui/vite')

      if (fs.existsSync(localVitePluginPath)) {
        const module = await import('../frappe-ui/vite')
        console.info('Local frappe-ui vite plugin found, using local plugin')
        config.resolve.alias = getAliases(config)
        return module.default
      } else {
        console.warn('Local frappe-ui vite plugin not found, using npm package')
      }
    } catch (error) {
      console.warn(
        'Local frappe-ui not found, falling back to npm package:',
        error.message,
      )
    }
  }
  // Fall back to npm package if local import fails
  const module = await import('frappe-ui/vite')
  return module.default
}

function getAliases(config) {
  return {
    ...config.resolve.alias,
    'frappe-ui/tailwind': path.resolve(
      __dirname,
      '../frappe-ui/tailwind/preset.js',
    ),
    'frappe-ui/style.css': path.resolve(
      __dirname,
      '../frappe-ui/src/style.css',
    ),
    'frappe-ui/frappe': path.resolve(__dirname, '../frappe-ui/frappe/index.js'),
    // subpath entries must precede the bare `frappe-ui` key: a plain string alias
    // matches by prefix, so without these subpaths would rewrite under
    // `.../src/index.ts`.
    'frappe-ui/icons': path.resolve(__dirname, '../frappe-ui/icons/index.ts'),
    'frappe-ui/editor': path.resolve(
      __dirname,
      '../frappe-ui/src/molecules/editor/index.ts',
    ),
    'frappe-ui/editor-style.css': path.resolve(
      __dirname,
      '../frappe-ui/src/molecules/editor/style.css',
    ),
    'frappe-ui/internals': path.resolve(__dirname, '../frappe-ui/internals.ts'),
    'frappe-ui': path.resolve(__dirname, '../frappe-ui/src/index.ts'),
  }
}
