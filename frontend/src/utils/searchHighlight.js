// Pure helpers for GlobalSearch (spec 2.6 + 2.7): the snippet-highlight splitter
// and the input debounce. Kept dependency-free + side-effect-free so they unit-test
// in isolation (tests/unit/globalSearch.test.js).

// Split `text` into alternating {text, match} segments around every case-insensitive
// occurrence of `query`. The caller renders `match` segments in <b> and the rest as
// plain text — highlighting WITHOUT v-html, so customer message text is never parsed
// as markup (XSS-safe: the backend returns the snippet un-marked for exactly this).
//
// Index-based scanning (indexOf), never a RegExp, so a query full of regex
// metacharacters (%, (, ., *, …) is matched literally and can't blow up.
export function highlightSegments(text, query) {
  const src = String(text ?? '')
  const q = String(query ?? '').trim()
  if (!src) return []
  if (!q) return [{ text: src, match: false }]
  const lowSrc = src.toLowerCase()
  const lowQ = q.toLowerCase()
  const segments = []
  let i = 0
  while (i < src.length) {
    const hit = lowSrc.indexOf(lowQ, i)
    if (hit === -1) {
      segments.push({ text: src.slice(i), match: false })
      break
    }
    if (hit > i) segments.push({ text: src.slice(i, hit), match: false })
    segments.push({ text: src.slice(hit, hit + q.length), match: true })
    i = hit + q.length
  }
  return segments
}

// Trailing-edge debounce: the wrapped fn runs `wait` ms after the LAST call in a
// burst. `.cancel()` drops a pending run (used on close / unmount so a late search
// never fires into a torn-down component).
export function debounce(fn, wait = 300) {
  let timer = null
  const debounced = (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return debounced
}
