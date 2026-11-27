// Why a reply the customer agent wrote waits for a person (doco_marketing
// customer_agent.decide, stored on the review row as «agent:<reason>»).
export function agentReason(trigger) {
  const reason = String(trigger || '').replace(/^agent:/, '')
  if (reason.startsWith('ungrounded:'))
    return __('Asistente: revisa {0}, no salió de una herramienta', [
      reason.slice('ungrounded:'.length),
    ])
  if (reason === 'promise') return __('Asistente: promete algo al cliente')
  if (reason === 'drafted_something')
    return __('Asistente: registró una solicitud')
  if (reason === 'payment_link') return __('Asistente: lleva un enlace de pago')
  if (reason === 'hold') return __('Asistente: el cliente pide apartar')
  return __('Asistente para clientes')
}

// A hold the customer asked for (doco_marketing customer_holds): «Apartar» places it,
// «No apartar» tells the customer.
export const HOLD_SOURCE = 'customer_hold:apartado'

export function isHold(row) {
  return row?.source === HOLD_SOURCE && row?.action?.kind === 'apartado'
}

/** The hold's two lines: what (with its price) and for whom. */
export function holdLines(action) {
  const what = `${action.qty || 1} × ${action.item || ''}${action.option ? ` (${action.option})` : ''}`
  const who = action.pickup_when
    ? __('Para {0}, pasa {1}', [action.customer_name, action.pickup_when])
    : __('Para {0}', [action.customer_name])
  return { what, price: action.price || '', who }
}

/** What approving a reply also does: the payment link the approver mints. */
export function linkLine(action) {
  if (action?.kind !== 'payment_link') return ''
  return __('Se agrega el enlace de pago por {0} ({1})', [
    action.amount,
    action.folio,
  ])
}

/** The toast after «Apartar»: the folio, and whether the customer heard it. */
export function holdDone(out) {
  if (out?.notified) return { ok: true, text: __('Apartado {0}', [out.order]) }
  return {
    ok: false,
    text: __(
      'Apartado {0}; no se pudo avisar al cliente, escríbele por el chat',
      [out?.order],
    ),
  }
}
