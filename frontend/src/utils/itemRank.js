// The item ranker every product picker shares, here for the products the
// shell ranks on the device (utils/productIndex, Ctrl+K): terms must start a
// word, a number must not run into more digits («13» ≠ «130»), codes match by
// prefix, and the exact model sorts before its longer variants.
//
// A port of doco/docoutils/search.py rank() and term_patterns(). KEEP IN SYNC
// with it and with the Taller and Mercado copies (utils/search.ts):
// tests/unit/itemRank.test.js carries their cases. Unlike those, a record is
// split into its words once (`searchable`) and kept.

const STOP = new Set(
  'para de del la el los las y con a en un una por sin'.split(' '),
)
const WORD = /[a-z0-9]+/g
// «iphone13» → iphone|13, «13pro» → 13|pro; one- and two-letter model codes
// stay whole (a13, g13, s23, xt2343, 5g, 128gb).
const GLUE = /(?<=[a-z]{3})(?=[0-9])|(?<=[0-9])(?=[a-z]{3})/
// Model suffixes written together («promax»); a word splits only when it is
// made entirely of these parts.
const SUFFIX_PARTS = ['pro', 'max', 'plus', 'mini', 'lite', 'ultra']
// Brand codes that are not a prefix of the brand (doco DEVICE_BRAND_ALIASES).
const BRAND_ALIASES = { sm: 'samsung', sams: 'samsung', sammy: 'samsung' }

const EXACT = 1
const PREFIX = 0.8
const LOOSE = 0.35
const CODE_INSIDE = 0.6
const OTHER_FIELD_WEIGHT = 0.6
const PHRASE_BONUS = 15
const ORDER_BONUS = 5
const COVERAGE_BONUS = 10
const LEAD_BONUS = 3

const NOT_ASCII = /[\u0080-\uffff]/
/**
 * Lowercase without accents («Batería» → «bateria»), as the shell's search
 * folds; most names are plain ASCII and skip the Unicode pass.
 */
export function fold(text) {
  const lower = String(text ?? '').toLowerCase()
  return NOT_ASCII.test(lower)
    ? lower.normalize('NFD').replace(/\p{M}/gu, '')
    : lower
}

const isAlpha = (text) => /^[a-z]+$/.test(text)
const isDigits = (text) => /^[0-9]+$/.test(text)
const isDigit = (char) => char !== undefined && char >= '0' && char <= '9'
const unique = (values) => [...new Set(values)]

function splitSuffixes(word) {
  const parts = []
  let rest = word
  while (rest) {
    const part = SUFFIX_PARTS.find((suffix) => rest.startsWith(suffix))
    if (!part) return [word]
    parts.push(part)
    rest = rest.slice(part.length)
  }
  return parts
}

/** Text → search words, split on punctuation and glued model numbers: «iPhone13ProMax» → iphone, 13, pro, max. */
export function words(text) {
  const out = []
  for (const word of fold(text).match(WORD) || [])
    for (const piece of word.split(GLUE))
      if (isAlpha(piece)) out.push(...splitSuffixes(piece))
      else out.push(piece)
  return out
}

/** Spanish plural tolerance: «fundas» → «funda», «celulares» → «celular». */
function stem(token) {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1)
  return token
}

/**
 * Query → terms; each term lists its alternatives (the word, its plural stem,
 * its brand alias). A lone letter before a number joins it: «a 13» → a13.
 */
export function queryTerms(query, maxTerms = 8) {
  const merged = []
  for (const word of words(query)) {
    const last = merged.at(-1)
    if (last?.length === 1 && isAlpha(last) && isDigits(word))
      merged[merged.length - 1] = last + word
    else merged.push(word)
  }
  const kept = merged.filter((word) => !STOP.has(word))
  return unique(kept.length ? kept : merged)
    .map((word) => unique([word, stem(word), BRAND_ALIASES[word] ?? word]))
    .slice(0, maxTerms)
}

/**
 * A record split once for ranking: `name` is its label (item name), `others`
 * the text that counts less (group, brand), `codes` its identifiers (item
 * code), matched by prefix or a long fragment.
 */
export function searchable(name, others = [], codes = []) {
  return {
    name: words(name),
    others: others.filter(Boolean).map(words),
    codes: codes.filter(Boolean).map((code) => words(code).join('')),
  }
}

// How well a query word answers a word of the record, 0 when it does not.
// Negative: only loosely (mid-word, or a number that runs on: «1» → «11»).
function wordQuality(alternative, word) {
  if (word === alternative) return EXACT
  if (word.startsWith(alternative))
    return isDigit(alternative.at(-1)) && isDigit(word[alternative.length])
      ? -LOOSE
      : PREFIX
  if (
    alternative.length >= 3 &&
    !isDigits(alternative) &&
    word.includes(alternative)
  )
    return -LOOSE
  return 0
}

function codeQuality(term, code) {
  if (code === term) return EXACT
  if (term.length >= 3 && code.startsWith(term)) return PREFIX
  if (term.length >= 4 && /[0-9]/.test(term) && code.includes(term))
    return CODE_INSIDE
  return 0
}

/**
 * `[score, strict]` for a `searchable` record, or null when a term matches
 * nothing. Not strict: some term matched only loosely.
 */
export function score(terms, record) {
  if (!terms.length) return [0, true]
  let total = 0
  let strict = true
  let phrase = terms.length > 1
  let ordered = phrase
  let lead = false
  let previous = -1
  const matched = new Set()
  for (let t = 0; t < terms.length; t += 1) {
    const alternatives = terms[t]
    let best = 0
    let bestStrict = false
    let position = -1
    const consider = (fieldWords, weight, inName) => {
      for (let w = 0; w < fieldWords.length; w += 1)
        for (const alternative of alternatives) {
          const raw = wordQuality(alternative, fieldWords[w])
          if (!raw) continue
          const quality = Math.abs(raw) * weight
          const isStrict = raw > 0
          if (quality > best || (quality === best && isStrict && !bestStrict)) {
            best = quality
            bestStrict = isStrict
            position = inName ? w : -1
          }
        }
    }
    consider(record.name, 1, true)
    for (const other of record.others)
      consider(other, OTHER_FIELD_WEIGHT, false)
    for (const code of record.codes) {
      const quality = codeQuality(alternatives[0], code)
      if (quality > best) {
        best = quality
        bestStrict = true
        position = -1
      }
    }
    if (best <= 0) return null
    total += best
    strict = strict && bestStrict
    if (position < 0) {
      phrase = false
      ordered = false
    } else {
      if (t === 0) lead = position === 0
      else {
        if (position !== previous + 1) phrase = false
        if (position <= previous) ordered = false
      }
      previous = position
      matched.add(position)
    }
  }
  let result = (100 * total) / terms.length
  if (phrase) result += PHRASE_BONUS
  else if (ordered) result += ORDER_BONUS
  if (record.name.length && matched.size) {
    result += (COVERAGE_BONUS * matched.size) / record.name.length
    if (lead) result += LEAD_BONUS
  }
  return [result, strict]
}

/**
 * The rows that match `query`, best first. `record(row)` is the row's
 * `searchable` record. The sort is stable, so the rows' order breaks ties
 * (the server's default order: on hand, then last sold). Loose matches count
 * only when nothing matches strictly.
 */
export function rank(rows, query, record = (row) => row.search, limit) {
  const terms = queryTerms(query)
  if (!terms.length) return limit ? rows.slice(0, limit) : [...rows]
  let scored = []
  let anyStrict = false
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const result = score(terms, record(row))
    if (!result) continue
    anyStrict ||= result[1]
    scored.push({ score: result[0], strict: result[1], index, row })
  }
  if (anyStrict) scored = scored.filter((entry) => entry.strict)
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  const ranked = scored.map((entry) => entry.row)
  return limit ? ranked.slice(0, limit) : ranked
}

/**
 * What a record must hold to be worth ranking, per query term (doco
 * term_patterns, the SQL prefilter of rank()): one of `texts` somewhere in a
 * text field, or `code` in the item code, at its start unless `inside`. A
 * term too short for codes has no `code`.
 */
export function termPatterns(query) {
  return queryTerms(query).map((alternatives) => {
    const [term] = alternatives
    return {
      texts: alternatives,
      code: term.length >= 3 ? term : null,
      inside: term.length >= 4 && /[0-9]/.test(term),
    }
  })
}

/**
 * Whether a record passes the prefilter: every pattern is in one of its
 * folded text fields (`texts`, joined by a line break so no match spans two)
 * or in its folded `code`. A superset of what rank() keeps.
 */
export function isCandidate(patterns, texts, code) {
  for (const pattern of patterns) {
    let found = false
    for (const text of pattern.texts)
      if (texts.includes(text)) {
        found = true
        break
      }
    if (found) continue
    if (
      !pattern.code ||
      !(pattern.inside
        ? code.includes(pattern.code)
        : code.startsWith(pattern.code))
    )
      return false
  }
  return true
}
