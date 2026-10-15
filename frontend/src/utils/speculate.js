// Warm the next full page load (Desk, Taller, Contador…). Chrome and Edge fetch
// the document while the pointer rests on what opens it, so the click starts
// from a page already downloaded. Browsers without speculation rules ignore it.
//
// Prefetch only, never prerender: a prerendered Desk form would run its load
// (view log, socket, boot calls) for a record the worker only hovered.

const KEEP_MS = 30000 // drop the rule after this: a later click fetches fresh
const MAX_ACTIVE = 6

const active = new Map() // href → script element

export function supportsSpeculation() {
  return Boolean(globalThis.HTMLScriptElement?.supports?.('speculationrules'))
}

function rule(body) {
  const script = document.createElement('script')
  script.type = 'speculationrules'
  script.textContent = JSON.stringify(body)
  document.head.append(script)
  return script
}

/** Prefetch one same-origin path now; returns whether a rule was added. */
export function prefetchDocument(href) {
  if (typeof href !== 'string' || !/^\/(?!\/)[^\\]*$/.test(href)) return false
  if (typeof document === 'undefined' || !supportsSpeculation()) return false
  if (active.has(href) || active.size >= MAX_ACTIVE) return false
  active.set(href, rule({ prefetch: [{ source: 'list', urls: [href] }] }))
  setTimeout(() => {
    // Removing the rule discards the prefetched page, bounding its staleness.
    active.get(href)?.remove()
    active.delete(href)
  }, KEEP_MS)
  return true
}

export const PREFETCH_ATTR = 'data-muelle-prefetch'

let linksInstalled = false
/**
 * Links marked with `data-muelle-prefetch` (sibling apps, Desk) prefetch on
 * hover or press — Chrome's «moderate» eagerness. Installed once per page.
 */
export function installLinkPrefetch() {
  if (linksInstalled || typeof document === 'undefined') return false
  if (!supportsSpeculation()) return false
  linksInstalled = true
  rule({
    prefetch: [
      {
        source: 'document',
        where: { selector_matches: `a[${PREFETCH_ATTR}]` },
        eagerness: 'moderate',
      },
    ],
  })
  return true
}

// test-only
export function _reset() {
  for (const script of active.values()) script.remove()
  active.clear()
  linksInstalled = false
}
