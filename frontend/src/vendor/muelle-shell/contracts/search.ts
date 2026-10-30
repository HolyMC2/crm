// Vendored from muelle/workspace/packages/shell-contracts@0.17.0 (5da43992cccc). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Friendly token search: the rule behind the shell's search boxes, its search
// dialogs (K and G) and long dropdowns. Order-independent, accent-blind, and
// each word may match inside a field ("pan sm a04" finds "PAN BLANCO SM A04").
// The one copy for the shell and @muelle/form-vue (0.15.0). KEEP IN SYNC with
// taller/frontend/src/utils/search.ts (matchTokens): same stopwords, same folding.

const STOP = new Set([
  'para', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'a', 'en',
  'un', 'una', 'por', 'sin',
])

/** Lowercase + strip diacritics so "batería" ≈ "bateria". */
export function normalize(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Query → search words (stopwords dropped, capped). Falls back to the raw
 *  words when the query is only stopwords. */
export function tokens(query: string): string[] {
  const raw = normalize(query).trim().split(/[\s,;/]+/).filter(Boolean)
  const kept = raw.filter((w) => !STOP.has(w))
  return (kept.length ? kept : raw).slice(0, 8)
}

/** True when every query word appears in at least one field. Empty query
 *  matches everything. */
export function matchTokens(query: string, ...fields: (string | null | undefined)[]): boolean {
  const toks = tokens(query)
  if (!toks.length) return true
  const hay = fields.map(normalize)
  return toks.every((tok) => hay.some((h) => h.includes(tok)))
}
