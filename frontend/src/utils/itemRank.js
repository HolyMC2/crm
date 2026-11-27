// The item ranker every product picker shares, here for the products the
// shell ranks on the device (utils/productIndex, Ctrl+K): terms must start a
// word, a number must not run into more digits («13» ≠ «130»), codes match by
// prefix, and the exact model sorts before its longer variants.
//
// A port of doco/docoutils/search.py rank(), term_patterns() and the shop's
// word list. KEEP IN SYNC with it and with the Taller and Mercado copies
// (utils/search.ts):
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

// The shop's word list: a port of doco/docoutils/search.py «the shop's word
// list», KEEP IN SYNC (tests/unit/itemRank.test.js carries the cases of
// test_search_synonyms_pure.py). Groups arrive as the matcher keeps them
// (search.synonym_groups(), in products.palette_index): members folded, stop
// words dropped, a phrase space-joined («centro carga»). A query word answers
// a member when their plural forms meet; a member of several words matches
// its words in a row (stop words between them ignored); a member matches
// whole words only and scores SYNONYM, below the typed word.
const SYNONYM = 0.7

function forms(word) {
  const out = new Set([word, stem(word)])
  if (word.length > 3 && word.endsWith('s')) out.add(word.slice(0, -1))
  return [...out]
}

/** Whether two folded words are one word in the singular or the plural. */
export function sameWord(a, b) {
  if (a === b) return true
  const other = forms(b)
  return forms(a).some((form) => other.includes(form))
}

function synonymMember(text) {
  const found = words(text)
  const kept = found.filter((word) => !STOP.has(word))
  return (kept.length ? kept : found).join(' ')
}

// [first, last] index of the member's words in a row of `fieldWords`, stop
// words between them ignored; null when they are not there.
function phraseSpan(member, fieldWords) {
  const parts = member.split(' ').filter(Boolean)
  if (!parts.length) return null
  const kept = []
  for (let index = 0; index < fieldWords.length; index += 1)
    if (!STOP.has(fieldWords[index])) kept.push([index, fieldWords[index]])
  for (let start = 0; start + parts.length <= kept.length; start += 1)
    if (parts.every((part, offset) => sameWord(part, kept[start + offset][1])))
      return [kept[start][0], kept[start + parts.length - 1][0]]
  return null
}

const indexes = new WeakMap()

function buildIndex(source) {
  const groups = []
  for (const group of source) {
    if (!Array.isArray(group)) continue
    const members = unique(
      group
        .map((member) => synonymMember(String(member ?? '')))
        .filter(Boolean),
    )
    if (members.length > 1) groups.push(members)
  }
  if (!groups.length) return null
  const single = new Map()
  const phrases = []
  groups.forEach((group, id) => {
    for (const member of group) {
      const parts = member.split(' ')
      if (parts.length === 1) {
        for (const form of forms(parts[0])) {
          if (!single.has(form)) single.set(form, new Set())
          single.get(form).add(id)
        }
      } else phrases.push([parts, id])
    }
  })
  phrases.sort((a, b) => b[0].length - a[0].length)
  const membersOf = (ids, typed) => {
    const out = []
    for (const id of [...ids].sort((a, b) => a - b))
      for (const member of groups[id]) {
        const parts = member.split(' ')
        if (
          parts.length === typed.length &&
          parts.every((part, i) => sameWord(part, typed[i]))
        )
          continue
        if (!out.includes(member)) out.push(member)
      }
    return out
  }
  return {
    wordMembers(word) {
      const ids = new Set()
      for (const form of forms(word))
        for (const id of single.get(form) || []) ids.add(id)
      return ids.size ? membersOf(ids, [word]) : []
    },
    phraseAt(sequence, start) {
      let size = 0
      const ids = new Set()
      for (const [parts, id] of phrases) {
        if (size && parts.length < size) break
        if (start + parts.length > sequence.length) continue
        if (
          parts.every((part, offset) =>
            sameWord(part, sequence[start + offset]),
          )
        ) {
          size = parts.length
          ids.add(id)
        }
      }
      return size
        ? [size, membersOf(ids, sequence.slice(start, start + size))]
        : [0, []]
    },
  }
}

function synonymIndex(groups) {
  if (!Array.isArray(groups) || !groups.length) return null
  if (!indexes.has(groups)) indexes.set(groups, buildIndex(groups))
  return indexes.get(groups)
}

// Not enumerable: a term still compares equal to its alternatives.
const term = (alternatives, synonyms) =>
  Object.defineProperty(alternatives, 'synonyms', {
    value: synonyms,
    enumerable: false,
  })

/**
 * Query → terms; each term lists its alternatives (the word, its plural stem,
 * its brand alias). A lone letter before a number joins it: «a 13» → a13.
 * With `synonyms` (the shop's word list) a word, or the words of a phrase, in
 * the list also carries the other members of its groups (`term.synonyms`).
 */
export function queryTerms(query, maxTerms = 8, synonyms = null) {
  const merged = []
  for (const word of words(query)) {
    const last = merged.at(-1)
    if (last?.length === 1 && isAlpha(last) && isDigits(word))
      merged[merged.length - 1] = last + word
    else merged.push(word)
  }
  const filtered = merged.filter((word) => !STOP.has(word))
  const kept = filtered.length ? filtered : merged
  const index = synonymIndex(synonyms)
  const terms = []
  const seen = new Set()
  let i = 0
  while (i < kept.length) {
    const [size, members] = index ? index.phraseAt(kept, i) : [0, []]
    if (size) {
      const typed = kept.slice(i, i + size).join(' ')
      i += size
      if (!seen.has(typed)) {
        seen.add(typed)
        terms.push(term([typed], members))
      }
      continue
    }
    const word = kept[i]
    i += 1
    if (seen.has(word)) continue
    seen.add(word)
    terms.push(
      term(
        unique([word, stem(word), BRAND_ALIASES[word] ?? word]),
        index ? index.wordMembers(word) : [],
      ),
    )
  }
  return terms.slice(0, maxTerms)
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
 * nothing. Not strict: some term matched only loosely. A phrase alternative
 * matches its words in a row; a word-list member matches whole words only and
 * scores below the typed word.
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
    let span = null
    const consider = (fieldWords, weight, inName) => {
      for (let w = 0; w < fieldWords.length; w += 1)
        for (const alternative of alternatives) {
          if (alternative.includes(' ')) continue
          const raw = wordQuality(alternative, fieldWords[w])
          if (!raw) continue
          const quality = Math.abs(raw) * weight
          const isStrict = raw > 0
          if (quality > best || (quality === best && isStrict && !bestStrict)) {
            best = quality
            bestStrict = isStrict
            span = inName ? [w, w] : null
          }
        }
      for (const alternative of alternatives) {
        if (!alternative.includes(' ')) continue
        const hit = phraseSpan(alternative, fieldWords)
        const quality = EXACT * weight
        if (hit && (quality > best || (quality === best && !bestStrict))) {
          best = quality
          bestStrict = true
          span = inName ? hit : null
        }
      }
      const quality = SYNONYM * weight
      if (quality > best || (quality === best && !bestStrict))
        for (const member of alternatives.synonyms || []) {
          const hit = phraseSpan(member, fieldWords)
          if (hit) {
            best = quality
            bestStrict = true
            span = inName ? hit : null
            break
          }
        }
    }
    consider(record.name, 1, true)
    for (const other of record.others)
      consider(other, OTHER_FIELD_WEIGHT, false)
    if (!alternatives[0].includes(' '))
      for (const code of record.codes) {
        const quality = codeQuality(alternatives[0], code)
        if (quality > best) {
          best = quality
          bestStrict = true
          span = null
        }
      }
    if (best <= 0) return null
    total += best
    strict = strict && bestStrict
    if (!span) {
      phrase = false
      ordered = false
    } else {
      if (t === 0) lead = span[0] === 0
      else {
        if (span[0] !== previous + 1) phrase = false
        if (span[0] <= previous) ordered = false
      }
      previous = span[1]
      for (let i = span[0]; i <= span[1]; i += 1) matched.add(i)
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
 * only when nothing matches strictly. `synonyms`: the shop's word list.
 */
export function rank(
  rows,
  query,
  record = (row) => row.search,
  limit,
  synonyms = null,
) {
  const terms = queryTerms(query, 8, synonyms)
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
 * text field, one of `phrases` (words in order), or `code` in the item code,
 * at its start unless `inside`. A term too short for codes, or a phrase, has
 * no `code`. With `synonyms` the members of the term's groups add theirs.
 */
export function termPatterns(query, synonyms = null) {
  return queryTerms(query, 8, synonyms).map((alternatives) => {
    const [first] = alternatives
    const texts = []
    const phrases = []
    for (const text of [
      ...alternatives,
      ...(alternatives.synonyms || []).map((member) =>
        member.includes(' ') ? member : stem(member),
      ),
    ]) {
      if (text.includes(' ')) phrases.push(text.split(' ').map(stem))
      else if (!texts.includes(text)) texts.push(text)
    }
    const word = !first.includes(' ')
    return {
      texts,
      ...(phrases.length ? { phrases } : {}),
      code: word && first.length >= 3 ? first : null,
      inside: word && first.length >= 4 && /[0-9]/.test(first),
    }
  })
}

// Whether `parts` appear in this order in `texts`, within one field.
function inOrder(texts, parts) {
  for (const field of texts.split('\n')) {
    let at = 0
    let found = true
    for (const part of parts) {
      const next = field.indexOf(part, at)
      if (next < 0) {
        found = false
        break
      }
      at = next + part.length
    }
    if (found) return true
  }
  return false
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
    if (!found)
      found = (pattern.phrases || []).some((parts) => inOrder(texts, parts))
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
