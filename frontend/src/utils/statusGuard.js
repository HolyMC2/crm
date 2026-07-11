import { createDialog } from '@/utils/dialogs'

// Statuses whose ENTRY can auto-send WhatsApp to the customer (taller tracker
// "entregado" template; doco_marketing campaign stage_entered enrollments).
// Three wrong-WABA incidents came from misclicking these in adjacent-option
// pickers — every UI path that sets one of them must pass through
// guardStatusChange so a human explicitly confirms first.
export const GUARDED_STATUSES = ['Completado', 'Entregado']

// Wrap a status change: guarded statuses get an explicit dialog with TWO ways
// through — "Cambiar y avisar" (normal path, auto-sends fire) and, when the
// caller provides opts.onSilent, "Cambiar SIN avisar" (silent path for stale
// orders: status changes, customer gets nothing). Everything else runs straight
// through. Resolves 'changed' | 'silent' | false (cancelled) — callers that
// toast/refresh on success must await the outcome, not the call.
export function guardStatusChange(status, onConfirm, { onSilent } = {}) {
  if (!GUARDED_STATUSES.includes(status)) return Promise.resolve(onConfirm()).then(() => 'changed')
  return new Promise((resolve, reject) => {
    let acted = false
    const run = (fn, outcome) => async (close) => {
      acted = true
      try {
        await fn()
        resolve(outcome)
      } catch (e) {
        reject(e)
      }
      close()
    }
    createDialog({
      title: __('¿Cambiar estado a «{0}»?', [status]),
      message: __(
        'Este estado puede enviar un WhatsApp automático al cliente. Verifica que sea la conversación correcta. Para órdenes viejas/atrasadas usa «Cambiar SIN avisar» — el cliente no recibirá ningún mensaje.',
      ),
      onClose: () => {
        if (!acted) resolve(false)
      },
      actions: [
        {
          label: __('Cambiar y avisar al cliente'),
          variant: 'solid',
          theme: 'green',
          onClick: run(onConfirm, 'changed'),
        },
        ...(onSilent
          ? [
              {
                label: __('Cambiar SIN avisar'),
                variant: 'subtle',
                theme: 'gray',
                onClick: run(onSilent, 'silent'),
              },
            ]
          : []),
      ],
    })
  })
}
