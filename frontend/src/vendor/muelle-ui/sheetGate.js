// Vendored from muelle/workspace/packages/ui@0.1.0 (2914c0d19b1b). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// A few bytes in the entry chunk: the popstate listener that sheetHistory.js
// (loaded with the first BottomSheet) answers through. It must be registered
// before vue-router's own listener, because on `window` Chrome runs popstate
// listeners in registration order; router.js imports this module first.
export const sheetGate = { onPopState: null }
if (typeof window !== 'undefined')
  window.addEventListener('popstate', (e) => sheetGate.onPopState?.(e), {
    capture: true,
  })
