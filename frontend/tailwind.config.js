import frappeUIPreset from 'frappe-ui/tailwind'

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
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    '../node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/frappe/**/*.{vue,js,ts,jsx,tsx}',
    '../node_modules/frappe-ui/frappe/**/*.{vue,js,ts,jsx,tsx}',
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
  theme: {
    extend: {},
  },
  plugins: [],
}
