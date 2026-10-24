import { gemoji } from 'gemoji'

// Its own module so Icon.vue (rendered in most screens and their unit tests)
// does not pull the utils barrel, whose stores import the router.
const emojiList = new Set(gemoji.map((emoji) => emoji.emoji))

export function isEmoji(str) {
  return emojiList.has(str)
}
