// A few bytes in the entry chunk: the popstate listener that sheetHistory.js
// (loaded with the first BottomSheet) answers through. It must be registered
// before vue-router's own listener, because on `window` Chrome runs popstate
// listeners in registration order; router.js imports this module first.
export const sheetGate = { onPopState: null }
if (typeof window !== 'undefined')
  window.addEventListener('popstate', (e) => sheetGate.onPopState?.(e), {
    capture: true,
  })
