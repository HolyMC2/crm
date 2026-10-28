// Vendored from muelle/workspace/packages/ui@0.1.0 (2914c0d19b1b). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The search panel's toggle chip: 44 px pill, green when on.
export function chipClass(active) {
  return [
    'press inline-flex min-h-11 flex-none items-center gap-1 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold',
    active
      ? 'bg-surface-green-2 text-ink-green-8'
      : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3',
  ]
}

// A chip's colour dot. Statuses carry either a CSS colour (#hex, rgb()) or an
// ink class (`text-ink-blue-5`, from the statuses store): the class paints the
// dot through bg-current.
export function dotBinding(color) {
  return /^(#|rgb|hsl)/u.test(color || '')
    ? { class: 'size-1.5 flex-none rounded-full', style: { background: color } }
    : { class: ['size-1.5 flex-none rounded-full bg-current', color] }
}
