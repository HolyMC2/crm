import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'
import { lucideSubset } from './scripts/lucide-subset.mjs'
import { kitControls } from './scripts/kit-controls.mjs'

// `~icons/*` is resolved by unplugin-icons inside the frappe-ui vite plugin,
// which vitest does not load; stub every icon as an empty component so
// modules that import lucide icons (navModel) can be unit-tested.
const stubIcons = {
  name: 'stub-icons',
  enforce: 'pre',
  resolveId: (id) => (id.startsWith('~icons/') ? '\0' + id : null),
  load: (id) =>
    id.startsWith('\0~icons/') ? 'export default { render: () => null }' : null,
}

export default defineConfig({
  // SFC and JSX transforms for component tests, as the build compiles them
  // (src/utils/dialogs.jsx); pure-JS unit tests are unaffected.
  plugins: [kitControls(__dirname), vue(), vueJsx(), stubIcons, lucideSubset()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // Frames (the shell's app strip) stay blank instead of fetching their page.
    environmentOptions: {
      happyDOM: { settings: { disableIframePageLoading: true } },
    },
    root: __dirname,
    setupFiles: ['./tests/setup.js'],
    // Exercise the pinned resource client through Vite's resolution, as the
    // browser build does; its source imports use extensionless TS/JS paths.
    server: { deps: { inline: [/frappe-ui/] } },
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/fieldTransforms.js',
        'src/utils/scriptHelpers.js',
        'src/utils/expressions.js',
        'src/utils/renderFieldLayoutDialog.js',
        'src/composables/inbox.js',
        'src/composables/swipeBack.js',
        'src/composables/push.js',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // frappe's `ui/` package, vendored (src/framework-ui/SOURCE.json).
      '@framework/ui': path.resolve(__dirname, 'src/framework-ui'),
      'frappe-ui-components': path.resolve(
        __dirname,
        'node_modules/frappe-ui/src/components',
      ),
    },
  },
})
