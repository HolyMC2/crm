// What the thread says about who handles a native conversation, and the one or
// two control actions that let the current operator continue. Pure: the strip
// renders it, tests pin it. `control` is crm.api.outbox_bridge.thread_control.

export function controlView(control, t = (s) => s) {
  if (!control?.name) return null
  const allowed = control.allowed_actions || []
  const mine = control.human_owner && control.human_owner === control.actor
  const owner = control.owner_name || control.human_owner
  const offer = (action, label) => (allowed.includes(action) ? [{ action, label }] : [])

  if (!['Ours', 'Not Applicable'].includes(control.provider_control))
    return { tone: 'amber', text: t('Se atiende desde la app de WhatsApp Business'), actions: [] }
  if (control.control_state === 'Bot')
    return { tone: 'blue', text: t('El asistente atiende esta conversación'), actions: offer('take', t('Tomar control')) }
  if (control.control_state === 'Paused')
    return { tone: 'amber', text: t('Conversación en pausa'), actions: offer('take', t('Tomar control')) }
  if (control.control_state === 'Closed')
    return { tone: 'gray', text: t('Conversación cerrada'), actions: offer('reopen', t('Reabrir')) }
  if (mine) {
    const requests = (control.control_requests || []).length
    return {
      tone: 'green',
      text: requests ? t('Atiendes tú · {0} pidió el control', [control.control_requests[0].actor_user]) : t('Atiendes tú esta conversación'),
      actions: offer('release', t('Liberar')),
    }
  }
  if (!control.human_owner)
    return { tone: 'gray', text: t('Sin responsable · al responder tomarás el control'), actions: [] }
  return {
    tone: 'gray',
    text: t('{0} atiende esta conversación', [owner]),
    actions: control.manager_reason_required ? offer('take', t('Tomar control')) : offer('request', t('Solicitar control')),
  }
}

// A manager overriding another person's conversation must say why (apply_control);
// taking over from the assistant, a pause or nobody needs no reason.
export function needsReason(control, action) {
  const othersOwner = !!control?.human_owner && control.human_owner !== control.actor
  return !!control?.manager_reason_required && othersOwner && ['take', 'release', 'reopen'].includes(action)
}
