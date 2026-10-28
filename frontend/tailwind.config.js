import frappeUIPreset from 'frappe-ui/tailwind'
import { withLeanLucide } from './tailwind/lucideIcons.js'
import defaultTheme from 'tailwindcss/defaultTheme.js'

const defaultSans = defaultTheme.fontFamily.sans

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
  // `uppercase`: the shell writes labels in sentence case (Shell SPEC §2.2.7,
  // «no all-caps labels»). Not generating the utility retires the 131 sites
  // (table heads, eyebrows, legacy FCRM chips) and frappe-ui's own in one
  // place; text that must read in capitals is written in capitals.
  blocklist: ['prose-xl', 'prose-2xl', 'uppercase'],
  theme: {
    extend: {
      // frappe-ui 1.0 dropped the named radius aliases (ADR-0006) and kept
      // the numbered scale only. crm's 2 300 `rounded*` sites and 26
      // `@apply rounded*` rules still name the aliases, so they are kept here
      // at beta.29's values, on the preset's own variables (the same mapping
      // frappe-ui's tailwind/migrate-tokens-v2.js applies: sm→1, bare→4,
      // md→5, lg→6, xl→7, 2xl→8). The B9 lane renames the sites and deletes
      // this block.

      // Shell type (index.css «Shell typeface»). frappe-ui sets +0.02em
      // tracking and a 1.35 line-height on every size, which spaces Archivo
      // out and flattens the hierarchy. Same keys and body pixel sizes, so
      // layouts tuned at 305px keep their line breaks: small text keeps a hair
      // of tracking for legibility, body sits at zero, heads tighten, leading
      // opens for reading sizes and closes for display sizes, and the display
      // steps grow apart so a page title is not one pixel off its rows. No
      // fontWeight in the tuples (frappe-ui puts 420 there): a responsive size
      // such as `sm:text-5xl` comes after `font-semibold` in the CSS and would
      // reset it to regular. The body weight is set once on <html> (index.css).
      fontFamily: {
        sans: ['Muelle Archivo', ...defaultSans],
        text: ['Muelle Archivo', ...defaultSans],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4', letterSpacing: '0.012em' }],
        xs: ['12px', { lineHeight: '1.4', letterSpacing: '0.008em' }],
        sm: ['13px', { lineHeight: '1.42', letterSpacing: '0.004em' }],
        base: ['14px', { lineHeight: '1.45', letterSpacing: '0' }],
        md: ['15px', { lineHeight: '1.42', letterSpacing: '-0.002em' }],
        lg: ['16px', { lineHeight: '1.38', letterSpacing: '-0.005em' }],
        xl: ['17px', { lineHeight: '1.32', letterSpacing: '-0.008em' }],
        '2xl': ['19px', { lineHeight: '1.28', letterSpacing: '-0.012em' }],
        '3xl': ['22px', { lineHeight: '1.22', letterSpacing: '-0.016em' }],
        '4xl': ['26px', { lineHeight: '1.16', letterSpacing: '-0.02em' }],
        '5xl': ['30px', { lineHeight: '1.12', letterSpacing: '-0.022em' }],
        '6xl': ['34px', { lineHeight: '1.1', letterSpacing: '-0.024em' }],
        '7xl': ['40px', { lineHeight: '1.06', letterSpacing: '-0.026em' }],
      },
    },
  },
  plugins: [],
}
