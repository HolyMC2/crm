// A conversation label's colour (CRM Conversation Label.color) as chip classes.
// Literal class names, so Tailwind generates every one.
export const LABEL_COLORS = {
  gray: 'border-outline-gray-2',
  blue: 'border-blue-300 text-blue-700',
  green: 'border-green-300 text-green-700',
  amber: 'border-amber-300 text-amber-700',
  red: 'border-red-300 text-red-700',
  violet: 'border-violet-300 text-violet-700',
  pink: 'border-pink-300 text-pink-700',
  cyan: 'border-cyan-300 text-cyan-700',
}

export const labelColorClass = (color) =>
  LABEL_COLORS[color] || LABEL_COLORS.gray
