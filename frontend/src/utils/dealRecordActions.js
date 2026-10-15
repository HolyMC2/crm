// The actions of a CRM Deal on screen (Deal 360 and the Inbox deal workspace,
// both through DealHeader), for useRecordActions: Ctrl+K lists them first and
// the keyed ones are page keys in Alt+H. Every `run` is the header's own
// function, so a key, a palette row and a click do the same thing.
//
// Keys: l call, w WhatsApp, q quotation. Won and lost have no single key (a
// stray letter must not close a deal): palette only, and lost goes through the
// stage request, which asks for the reason first.
// n · p · r · h belong to the next-step keys (CRM-S2), not to this list.

/**
 * @param {object} deal
 * @param {boolean} deal.isDeal      the record is a CRM Deal (leads: none)
 * @param {string}  [deal.mobile]    the contact's mobile number
 * @param {string}  [deal.status]    the deal's current status name
 * @param {Array<{name: string, type?: string}>} [deal.stages] visible statuses
 * @param {Function} deal.call         DealHeader call()
 * @param {Function} deal.focusReply   DealHeader focusReply()
 * @param {Function} deal.prepareQuote what «Preparar cotización» does
 * @param {Function} deal.changeStage  DealHeader changeStage(status)
 * @param {Function} [deal.scheduleNextStep] the next-step dialog (CRM-S2
 *   openNextStep, mode schedule); its key n is S2's, so none here
 */
export function dealRecordActions({
  isDeal,
  mobile,
  status,
  stages = [],
  call,
  focusReply,
  prepareQuote,
  changeStage,
  scheduleNextStep,
} = {}) {
  if (!isDeal) return []
  const typeOf = (name) => stages.find((stage) => stage.name === name)?.type
  const current = typeOf(status)
  const target = (type) =>
    current === type
      ? null
      : stages.find((stage) => stage.type === type)?.name || null
  const won = target('Won')
  const lost = target('Lost')
  return [
    {
      id: 'deal.next-step',
      title: 'Schedule follow-up',
      keywords:
        'programar seguimiento siguiente paso proximo agendar follow up next step',
      icon: 'lucide-calendar-clock',
      run: scheduleNextStep,
    },
    mobile && {
      id: 'deal.call',
      title: 'Call the contact',
      keywords: 'llamar telefono marcar call phone',
      icon: 'lucide-phone',
      keys: ['l'],
      run: call,
    },
    {
      id: 'deal.whatsapp',
      title: 'Write on WhatsApp',
      keywords: 'whatsapp mensaje responder escribir reply message',
      icon: 'lucide-message-circle',
      keys: ['w'],
      run: focusReply,
    },
    {
      id: 'deal.quote',
      title: 'Prepare quotation',
      keywords: 'cotizacion cotizar presupuesto articulos quote quotation',
      icon: 'lucide-file-text',
      keys: ['q'],
      run: prepareQuote,
    },
    won && {
      id: 'deal.won',
      title: 'Mark as won',
      keywords: 'ganado ganar cerrar venta won',
      icon: 'lucide-trophy',
      run: () => changeStage(won),
    },
    lost && {
      id: 'deal.lost',
      title: 'Mark as lost',
      keywords: 'perdido perder cancelar lost',
      icon: 'lucide-circle-x',
      run: () => changeStage(lost),
    },
  ].filter((action) => action && typeof action.run === 'function')
}
