import frappeUIPreset from 'frappe-ui/tailwind'
import { withLeanLucide } from './tailwind/lucideIcons.js'

// Mirrors `colors` in src/utils/index.js (CRM status colour choices).
const colors = [
  'gray',
  'blue',
  'green',
  'red',
  'pink',
  'orange',
  'amber',
  'yellow',
  'cyan',
  'teal',
  'violet',
  'purple',
  'black',
]

export default {
  // Lucide mask icons at a fifth of frappe-ui's bytes (tailwind/lucideIcons.js).
  presets: [withLeanLucide(frappeUIPreset)],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    '../node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    // frappe-ui ships stories, docs examples and tests next to its sources;
    // their classes (hundreds of lucide-* mask icons) never render in the app.
    '!./node_modules/frappe-ui/src/**/stories/**',
    '!./node_modules/frappe-ui/src/**/*.{story,stories,playground}.vue',
    '!./node_modules/frappe-ui/src/**/*.{cy,test,spec}.{js,ts}',
    '!../node_modules/frappe-ui/src/**/stories/**',
  ],
  // Only the classes built at runtime need a safelist: utils/index.js parseColor
  // (`!text-<color>-600/700` for CRM status colours). A pattern over every
  // !text/!bg class with hover/active variants was 87.7% of the CSS (5.5 MB).
  safelist: [
    ...colors.map((color) =>
      ['gray', 'green'].includes(color)
        ? `!text-${color}-700`
        : `!text-${color}-600`,
    ),
    '!text-ink-gray-9',
  ],
  // frappe-ui's editor names prose-xl and prose-2xl in a comment, so Tailwind
  // generates their CSS (766 B gzip) though no crm view applies either class.
  // Remove a name from this list if a view starts using it.
  blocklist: ['prose-xl', 'prose-2xl'],
  theme: {
    extend: {
      // frappe-ui 1.0 dropped the named radius aliases (ADR-0006) and kept
      // the numbered scale only. crm's 2 300 `rounded*` sites and 26
      // `@apply rounded*` rules still name the aliases, so they are kept here
      // at beta.29's values, on the preset's own variables (the same mapping
      // frappe-ui's tailwind/migrate-tokens-v2.js applies: sm→1, bare→4,
      // md→5, lg→6, xl→7, 2xl→8). The B9 lane renames the sites and deletes
      // this block.
      borderRadius: {
        sm: 'var(--radius-1)',
        DEFAULT: 'var(--radius-4)',
        md: 'var(--radius-5)',
        lg: 'var(--radius-6)',
        xl: 'var(--radius-7)',
        '2xl': 'var(--radius-8)',
      },
    },
  },
  plugins: [],
}
