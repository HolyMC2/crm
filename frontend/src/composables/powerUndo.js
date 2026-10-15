import { toast } from 'frappe-ui'

// «Guardado · Deshacer»: one toast per saved action that the server can
// revert safely (the server decides whether the undo is still allowed and
// says why when it is not). Same duration as Cobranza's.

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const UNDO_MS = 8000

/** «Pago registrado · Deshacer»: `undo()` runs only when the worker asks. */
export function offerUndo(message, undo) {
  toast.success(message, {
    action: { label: tr('Undo'), onClick: () => undo() },
    duration: UNDO_MS,
  })
}

/**
 * Run an undo and say how it went: `done` on success, the server's sentence
 * on a refusal (`describe(error)`), then `reload()` either way.
 */
export async function runUndo(run, { done, describe, reload } = {}) {
  try {
    await run()
    if (done) toast.success(done)
  } catch (error) {
    toast.error(describe ? describe(error) : error?.message || '')
  } finally {
    await reload?.()
  }
}
