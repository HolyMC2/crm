// Vendored from muelle/workspace/packages/ui@0.1.0 (b818ee2ed986). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The search panel's toggle chip: 44 px pill, green when on.
export function chipClass(active) {
  return [
    'press inline-flex min-h-11 flex-none items-center gap-1 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold',
    active
      ? 'bg-surface-green-2 text-ink-green-8'
      : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3',
  ]
}

// The «all» option leads its row of chips, a scope or a set of tabs: it is the
// way back from any view, so it is never the one left past the edge of a row
// that scrolls or behind «+N más» (Marco, 2026-11-16). FilterChips and
// ChipGroup put it first themselves; a page that draws its own row lists it
// first.
export function allFirst(options, allValue = '') {
  const at = (options || []).findIndex((o) => o?.value === allValue)
  return at > 0
    ? [options[at], ...options.slice(0, at), ...options.slice(at + 1)]
    : options || []
}

// A chip's colour dot. Statuses carry either a CSS colour (#hex, rgb()) or an
// ink class (`text-ink-blue-5`, from the statuses store): the class paints the
// dot through bg-current.
export function dotBinding(color) {
  return /^(#|rgb|hsl)/u.test(color || '')
    ? { class: 'size-1.5 flex-none rounded-full', style: { background: color } }
    : { class: ['size-1.5 flex-none rounded-full bg-current', color] }
}
