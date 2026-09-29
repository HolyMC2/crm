// Status colours as theme token classes. A CRM Lead/Deal Status `color` is a
// name from its Select (black, gray, blue, …); the statuses store turns it into
// a text class (`!text-red-600`, see utils parseColor) and pipeline stages send
// the raw name. Both map here onto surface tokens, so bars and dots follow the
// theme (dark mode included) and never fall back to an unset CSS colour.

const NAMES = [
  'black',
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
]

// Literal class strings, so Tailwind emits every one of them.
const FUNNEL = {
  black: { bar: 'bg-surface-gray-4', dot: 'bg-surface-gray-9' },
  gray: { bar: 'bg-surface-gray-3', dot: 'bg-surface-gray-6' },
  blue: { bar: 'bg-surface-blue-3', dot: 'bg-surface-blue-7' },
  green: { bar: 'bg-surface-green-3', dot: 'bg-surface-green-7' },
  red: { bar: 'bg-surface-red-3', dot: 'bg-surface-red-7' },
  pink: { bar: 'bg-surface-pink-3', dot: 'bg-surface-pink-7' },
  orange: { bar: 'bg-surface-orange-3', dot: 'bg-surface-orange-7' },
  amber: { bar: 'bg-surface-amber-3', dot: 'bg-surface-amber-7' },
  yellow: { bar: 'bg-surface-yellow-3', dot: 'bg-surface-yellow-7' },
  cyan: { bar: 'bg-surface-cyan-3', dot: 'bg-surface-cyan-7' },
  teal: { bar: 'bg-surface-teal-3', dot: 'bg-surface-teal-7' },
  violet: { bar: 'bg-surface-violet-3', dot: 'bg-surface-violet-7' },
  purple: { bar: 'bg-surface-purple-3', dot: 'bg-surface-purple-7' },
}
export const NEUTRAL_FUNNEL_COLORS = {
  bar: 'bg-surface-gray-3',
  dot: 'bg-surface-gray-5',
}

/** The colour name behind a status colour (raw name or parsed class), else ''. */
export function statusColorName(color) {
  if (typeof color !== 'string') return ''
  const c = color.trim().toLowerCase()
  if (NAMES.includes(c)) return c
  // parseColor('black') is the one that does not keep its name
  if (/(^|[^a-z-])text-ink-gray-9$/.test(c)) return 'black'
  const m = c.match(/(?:^|[\s!:])(?:text|bg)-(?:ink-|surface-)?([a-z]+)-\d+$/)
  return m && NAMES.includes(m[1]) ? m[1] : ''
}

/** {bar, dot} background token classes for a status colour; neutral if unknown. */
export function funnelColorClasses(color) {
  return FUNNEL[statusColorName(color)] || NEUTRAL_FUNNEL_COLORS
}
