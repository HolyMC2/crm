// In-thread search helpers (spec 2.7) — pure, DOM-independent, tested.

// Case- and diacritic-insensitive normalization ("Qué" matches "que").
export function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Whether a message text matches the query (both normalized). <2 chars = never.
export function matchesQuery(text, query) {
  const q = normalizeSearch(query).trim()
  if (q.length < 2) return false
  return normalizeSearch(text).includes(q)
}

// Wrap-around navigation: next/prev index over `count` matches.
export function stepMatch(current, count, dir) {
  if (count <= 0) return -1
  if (current < 0) return dir > 0 ? 0 : count - 1
  return (current + dir + count) % count
}
