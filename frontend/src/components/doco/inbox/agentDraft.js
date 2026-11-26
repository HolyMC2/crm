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
  return __('Asistente para clientes')
}
