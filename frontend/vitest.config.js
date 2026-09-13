import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

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
  // SFC transform for component tests (doco/forms renderer); pure-JS unit
  // tests are unaffected.
  plugins: [vue(), stubIcons],
  test: {
    globals: true,
    environment: 'happy-dom',
    root: __dirname,
    setupFiles: ['./tests/setup.js'],
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
    },
  },
})
