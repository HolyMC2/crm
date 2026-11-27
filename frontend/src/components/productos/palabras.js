// «Palabras que significan lo mismo» (pages/PalabrasTienda.vue): the edits the
// screen makes to the shop's word list before it is saved (doco
// workspaces.palabras). A group is a list of words as the owner wrote them; the
// server keeps the same rules (palabras.clean_groups): commas separate words,
// a word repeated in its group (case and accents aside) is dropped, a group
// needs two words.

const SEPARATORS = /[,;]/
const fold = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()

/** A word as typed → as it is kept: spaces trimmed and collapsed. */
export function cleanWord(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Typed text → its words: «funda, case» is two. */
export function splitWords(text) {
  return String(text ?? '')
    .split(SEPARATORS)
    .map(cleanWord)
    .filter(Boolean)
}

/** `group` with the words of `text` added, the ones it already has left out. */
export function addWords(group, text) {
  const out = [...group]
  const have = new Set(out.map(fold))
  for (const word of splitWords(text))
    if (!have.has(fold(word))) {
      have.add(fold(word))
      out.push(word)
    }
  return out
}

export function withWords(groups, index, text) {
  return groups.map((group, i) => (i === index ? addWords(group, text) : group))
}

export function withoutWord(groups, index, word) {
  return groups.map((group, i) =>
    i === index ? group.filter((entry) => entry !== word) : group,
  )
}

export function withoutGroup(groups, index) {
  return groups.filter((_group, i) => i !== index)
}

/** What the server is sent: empty groups left out. */
export function toSave(groups) {
  return groups.filter((group) => group.length)
}

/** Groups that cannot be saved yet: one word and nothing it means the same as. */
export function lonelyGroups(groups) {
  return groups.flatMap((group, index) => (group.length === 1 ? [index] : []))
}

export function sameGroups(a, b) {
  return JSON.stringify(toSave(a)) === JSON.stringify(toSave(b))
}
