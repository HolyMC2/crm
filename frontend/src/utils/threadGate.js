// The open conversation's messages load before the extras around it (intent
// chips, linked threads, the control and review strips, quick replies, the
// contact's other deals). The server answers about four requests at a time, so
// a burst of twenty made the messages wait behind the rest (2026-11-12: ~700 ms
// on doco-mirror against ~180 ms on their own).
//
// The Bandeja holds the gate when a conversation opens and Activities opens it
// when the WhatsApp messages arrive. Nothing waits longer than HOLD_MS, and
// where nobody holds it (a deal's own page) the extras load at once.
export const HOLD_MS = 1500

let gate = Promise.resolve()
let openGate = null

export function holdForThread() {
  openGate?.()
  let resolve
  gate = new Promise((r) => (resolve = r))
  const timer = setTimeout(done, HOLD_MS)
  function done() {
    clearTimeout(timer)
    resolve()
    if (openGate === done) openGate = null
  }
  openGate = done
}

export function threadLoaded() {
  openGate?.()
}

/** Runs `fn` once the open conversation's messages are in (or at once). */
export function afterThread(fn) {
  return gate.then(fn)
}
