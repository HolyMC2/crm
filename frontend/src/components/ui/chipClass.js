// Vendored from muelle/workspace/packages/ui@0.4.0 (f299ad1b2cf1). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The kit's one chip (FilterChips, ChipGroup, ChipDrill, DateField and any page
// that draws a chip of its own): 32 px tall in a 44 px target (6 px of margin
// above and below, which `after:` makes part of the tap), 8 px corners
// (--muelle-shape-chip), a hairline, a 14 px label. On, it takes the secondary
// container; a toggle that says so with aria-pressed or aria-checked also gets
// a check (shell.css, .ui-chip-on). Selection is not success: never green.
export function chipClass(active) {
  return [
    "press relative my-1.5 inline-flex min-h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--muelle-shape-chip)] border px-3 text-[14px] font-medium leading-5 after:absolute after:-inset-x-px after:-inset-y-[7px] after:content-['']",
    active
      ? 'ui-chip-on border-transparent bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
      : 'border-outline-gray-2 text-[var(--muelle-on-surface-variant)]',
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
