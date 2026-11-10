/**
 * What to tell the person when a call fails.
 *
 * frappe-ui rejects with an Error whose `message` is the request
 * (`<method path> <exception class>`) and whose `messages` carry what the
 * server said, or «Internal Server Error» when it said nothing. Only the
 * server's sentences are written for people. A message our own code raised
 * is kept. The request, an exception class, a traceback, the browser's
 * transport wording and a body that failed to parse never reach the screen.
 */

/** frappe-ui's placeholder when the server answered without a sentence. */
const NO_SENTENCE = /^internal server error$/i
/** The browser's own wording for a request that never reached the server. */
const TRANSPORT =
  /failed to fetch|networkerror|load failed|network request failed/i
/** `/api/method/x.y.z` or the dotted method path frappe-ui starts `message` with. */
const REQUEST_TEXT = /\/api\/(method|resource)\/|^[a-z_]\w*(\.\w+){2,}(\s|$)/i
const NOT_PROSE = /Traceback \(most recent|^[A-Z]\w*(Error|Exception)\b/

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/** Server messages may carry markup (`<strong>`, links); the screen prints text. */
function plain(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function isSentence(text) {
  return !!text && !NO_SENTENCE.test(text) && !NOT_PROSE.test(text)
}

/**
 * The server's sentences joined by `separator`, else a sentence the failure
 * carries itself, else `fallback`.
 */
export function errorText(error, fallback = '', separator = ' ') {
  const said = Array.isArray(error?.messages)
    ? [...new Set(error.messages.map(plain).filter(isSentence))]
    : []
  if (said.length) return said.join(separator)
  // A broken response body and a script fault are not something to read out.
  if (error instanceof SyntaxError || error instanceof TypeError)
    return fallback
  const own = plain(typeof error === 'string' ? error : error?.message)
  const excType = typeof error?.exc_type === 'string' ? error.exc_type : ''
  const isRequest =
    REQUEST_TEXT.test(own) || (!!excType && own.includes(excType))
  if (isSentence(own) && !isRequest && !TRANSPORT.test(own)) return own
  return fallback
}
