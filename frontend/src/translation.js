import { ref } from 'vue'
import { getConfig } from 'frappe-ui'

// Moves when a newer dictionary replaces the one the first render used
// (utils/translationsReady.js mounts with the browser's last dictionary while
// a new version downloads): every render that translated reads it, so each
// one repaints with the new words.
export const dictionaryRevision = ref(0)

// While the app runs on the dictionary's first part, the keys a render asked
// for and did not find: when the whole set arrives the app repaints only if it
// translates one of them (utils/translationsReady.js applyNewer).
let misses = null

/** Starts noting the keys renders do not find. */
export function noteMisses() {
  misses = new Set()
}

/** The keys noted since noteMisses (null when none were noted), and stops noting. */
export function takeMisses() {
  const noted = misses
  misses = null
  return noted
}

export default function translationPlugin(app) {
  app.config.globalProperties.__ = translate
  window.__ = translate
}

function format(message, replace) {
  // A missing/short args array leaves the placeholder literal instead of
  // throwing — one bad __() call must never white-screen a whole route.
  return message.replace(/{(\d+)}/g, function (match, number) {
    return typeof replace?.[number] != 'undefined' ? replace[number] : match
  })
}

function translate(message, replace, context = null) {
  void dictionaryRevision.value
  let translatedMessages = getConfig('translatedMessages') || {}
  let translatedMessage = ''

  if (context) {
    let key = `${message}:${context}`
    if (translatedMessages[key]) {
      translatedMessage = translatedMessages[key]
    } else {
      misses?.add(key)
    }
  }

  if (!translatedMessage) {
    translatedMessage = translatedMessages[message] || message
    if (misses && !translatedMessages[message]) misses.add(message)
  }

  const hasPlaceholders = /{\d+}/.test(message)
  if (!hasPlaceholders) {
    return translatedMessage
  }

  return format(translatedMessage, replace)
}
