import { confirmDialog } from '@/utils/dialogs'

// Statuses whose ENTRY can auto-send WhatsApp to the customer (taller tracker
// "entregado" template; doco_marketing campaign stage_entered enrollments).
// Three wrong-WABA incidents came from misclicking these in adjacent-option
// pickers — every UI path that sets one of them must pass through
// guardStatusChange so a human explicitly confirms first.
export const GUARDED_STATUSES = ['Completado', 'Entregado']

// Wrap a status change: guarded statuses get an explicit confirm dialog
// (mentioning the auto-WhatsApp consequence), everything else runs straight
// through. Resolves true when the change ran, false when the user cancelled —
// callers that toast/refresh on success must await the outcome, not the call.
export function guardStatusChange(status, onConfirm) {
  if (!GUARDED_STATUSES.includes(status)) return Promise.resolve(onConfirm()).then(() => true)
  return new Promise((resolve, reject) => {
    confirmDialog({
      title: __('¿Cambiar estado a «{0}»?', [status]),
      message: __(
        'Este estado puede enviar un WhatsApp automático al cliente. Verifica que sea la conversación correcta antes de confirmar.',
      ),
      confirmLabel: __('Sí, cambiar estado'),
      theme: 'green',
      onConfirm: async () => {
        try {
          await onConfirm()
          resolve(true)
        } catch (e) {
          reject(e)
        }
      },
      onCancel: () => resolve(false),
    })
  })
}
