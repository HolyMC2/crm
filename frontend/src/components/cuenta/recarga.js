// Mi cuenta's way back from a top-up (capability «wallet_return»). Boat sends
// the owner from the processor's page to /crm/cuenta?tab=facturacion&recarga=<ref>;
// this reads that one top-up (Boat tenant_portal.topup_state, through
// miplan.call) every few seconds for a short while. «Recarga acreditada: $X»
// once Boat's wallet holds it, then the page reads the plan again; still not
// there after the last read, «Tu pago está en proceso» (with «te avisamos»
// only where Boat mails when it arrives). No reload button, nothing stored in
// the browser, and a reference Boat does not know for this site shows nothing.
import { ref } from 'vue'
import { formatMoney } from '@/utils/display'

export const RETURN_POLL_MS = 3000
export const RETURN_READS = 10
// The processor's reference as Boat writes it into the return (a Stripe Checkout id).
const REFERENCE = /^cs_[A-Za-z0-9_]{1,252}$/
const t = (text, replace) => __(text, replace, 'Cuenta')

/** The top-up reference of the address (?recarga=), or '' when it is not one. */
export function topupReference(query) {
  const value = query?.recarga
  return typeof value === 'string' && REFERENCE.test(value) ? value : ''
}

function processing(notice) {
  return notice
    ? t(
        'Your payment is being processed; we will let you know when it arrives.',
      )
    : t(
        'Your payment is being processed; you will see it in your balance when it arrives.',
      )
}

/**
 * @param {object} io
 * @param {(reference: string) => Promise<any>} io.read  the topup_state seam
 * @param {(answer: object) => void} [io.onCredited] the money is in: re-read
 * @param {() => void} [io.onDone] the last word is said: drop ?recarga=
 */
export function createRecargaReturn({
  read,
  onCredited = () => {},
  onDone = () => {},
  // Wrapped: a browser's setTimeout called as `timers.set()` throws «Illegal invocation».
  timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
} = {}) {
  /** {tone: checking | credited | processing, text} or null. */
  const view = ref(null)
  let timer = null
  let reads = 0
  let notice = false
  let turn = 0
  let disposed = false

  function stop() {
    if (timer != null) timers.clear(timer)
    timer = null
  }

  function finish(next) {
    stop()
    view.value = next
    onDone()
  }

  async function readOnce(reference, mine) {
    timer = null
    reads += 1
    let answer
    try {
      answer = await read(reference)
    } catch {
      answer = null
    }
    if (disposed || mine !== turn) return
    if (answer?.ok === true && answer.state === 'credited') {
      finish({
        tone: 'credited',
        text: t('Top-up credited: {0}', [
          formatMoney(Number(answer.amount_mxn) || 0, 'MXN'),
        ]),
      })
      onCredited(answer)
      return
    }
    const pending = answer?.ok === true && answer.state === 'processing'
    // A lost answer, or Boat unable to ask the processor now, is no verdict.
    const unknown =
      !answer || (answer.ok === false && answer.reason === 'unavailable')
    // Not this site's top-up, an expired payment, or the seam switched off.
    if (!pending && !unknown) return finish(null)
    if (pending && answer.notice === true) notice = true
    if (reads >= RETURN_READS)
      return finish({ tone: 'processing', text: processing(notice) })
    timer = timers.set(() => readOnce(reference, mine), RETURN_POLL_MS)
  }

  /** Starts reading `reference`; false when there is nothing to read. */
  function start(reference) {
    if (!reference || disposed) return false
    stop()
    turn += 1
    reads = 0
    notice = false
    view.value = { tone: 'checking', text: t('Checking your top-up…') }
    readOnce(reference, turn)
    return true
  }

  function dispose() {
    disposed = true
    stop()
  }

  return { view, start, dispose }
}
