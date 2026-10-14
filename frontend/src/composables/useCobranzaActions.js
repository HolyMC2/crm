import { toast } from 'frappe-ui'
import {
  ACTIONS,
  cobranzaApi,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useCobranza'

// Cobranza writes from the queue and the record share one request discipline
// (one request id per pending action: a retry after a lost answer reuses it, so
// the server replays instead of writing twice) and one «Deshacer» toast per
// saved action. The server decides whether an undo is still allowed.

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const UNDO_MS = 8000

/** A caller that keeps one request id per pending key until a definite answer. */
export function createRequests() {
  const pending = {}
  return async function call(key, method, args = {}) {
    pending[key] = pending[key] || requestId()
    try {
      const result = await cobranzaApi(method, {
        request_id: pending[key],
        ...args,
      })
      delete pending[key]
      return result
    } catch (error) {
      if (!outcomeUnknown(error)) delete pending[key]
      throw error
    }
  }
}

/** «Promesa guardada · Deshacer». */
export function offerUndo(message, undo) {
  toast.success(message, {
    action: { label: tr('Undo'), onClick: () => undo() },
    duration: UNDO_MS,
  })
}

/**
 * The toasts after each saved action, each with its «Deshacer»; `reload`
 * refreshes the view after an undo.
 */
export function useCobranzaUndo({ reload, call = createRequests() } = {}) {
  async function undo(done, run) {
    try {
      await run()
      toast.success(done)
      await reload?.()
    } catch (error) {
      toast.error(problemOf(error).detail)
    }
  }
  return {
    call,
    promiseSaved(result) {
      if (!result?.todo) return toast.success(tr('Promise saved'))
      offerUndo(tr('Promise saved'), () =>
        undo(tr('Promise removed'), () =>
          call(`undo-promise:${result.todo}`, `${ACTIONS}.undo_promise`, {
            todo: result.todo,
          }),
        ),
      )
    },
    callSaved(result) {
      if (!result?.comment) return toast.success(tr('Call saved'))
      offerUndo(tr('Call saved'), () =>
        undo(tr('Call note removed'), () =>
          call(`undo-call:${result.comment}`, `${ACTIONS}.undo_call`, {
            comment: result.comment,
          }),
        ),
      )
    },
    paymentSaved(result) {
      const message = tr('Payment {0} registered', [result.payment_entry])
      if (!result.can_cancel) return toast.success(message)
      offerUndo(message, () =>
        undo(tr('Payment {0} cancelled', [result.payment_entry]), () =>
          call(
            `cancel-payment:${result.payment_entry}`,
            `${ACTIONS}.cancel_payment`,
            { payment_entry: result.payment_entry },
          ),
        ),
      )
    },
    followupSaved(result, message) {
      const previous = result?.previous || { collector: '', date: '' }
      offerUndo(message, () =>
        undo(tr('Follow-up put back'), () =>
          call(`followup-undo:${result.customer}`, `${ACTIONS}.set_followup`, {
            customer: result.customer,
            collector: previous.collector || '',
            date: previous.date || '',
            undo: 1,
          }),
        ),
      )
    },
  }
}
