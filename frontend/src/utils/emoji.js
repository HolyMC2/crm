// Its own module so Icon.vue (rendered in most screens and their unit tests)
// does not pull the utils barrel, whose stores import the router.
//
// A single emoji: a flag (two regional indicators), a keycap, or a pictograph
// with its presentation selector, skin tone, tag characters and ZWJ-joined
// pictographs. Checked against the whole gemoji table; the table itself
// (185 KB) stays in the IconPicker's chunk.
const EMOJI =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|[\u{E0020}-\u{E007F}])*(?:‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)*)*)$/u

export function isEmoji(str) {
  return typeof str === 'string' && EMOJI.test(str)
}
