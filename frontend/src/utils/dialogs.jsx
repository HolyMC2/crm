import { Dialog, ErrorMessage } from 'frappe-ui'
import { reactive, ref } from 'vue'

let dialogs = ref([])

export function isDialogOpen() {
  return dialogs.value.some((d) => d.show)
}

export let Dialogs = {
  name: 'Dialogs',
  render() {
    return dialogs.value.map((dialog) => (
      <Dialog
        title={dialog.title}
        size={dialog.size}
        icon={dialog.icon}
        position={dialog.position}
        actions={dialog.actions}
        open={dialog.show}
        onUpdate:open={(val) => {
          dialog.show = val
          if (!val) dialog.onClose?.()
        }}
      >
        {{
          default: () => {
            return [
              dialog.message && (
                <p class="text-p-base text-ink-gray-7">{dialog.message}</p>
              ),
              dialog.html && <div v-html={dialog.html} />,
              dialog.input &&
                (dialog.input.type === 'textarea' ? (
                  <textarea
                    class="mt-1 w-full rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:bg-surface-white focus:outline-none"
                    rows="3"
                    autofocus
                    placeholder={dialog.input.placeholder}
                    value={dialog.inputValue}
                    onInput={(e) => (dialog.inputValue = e.target.value)}
                  />
                ) : (
                  <input
                    class="mt-1 w-full rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:bg-surface-white focus:outline-none"
                    type="text"
                    autofocus
                    placeholder={dialog.input.placeholder}
                    value={dialog.inputValue}
                    onInput={(e) => (dialog.inputValue = e.target.value)}
                    onKeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        submitInput(dialog)
                      }
                    }}
                  />
                )),
              <ErrorMessage class="mt-2" message={dialog.error} />,
            ]
          },
        }}
      </Dialog>
    ))
  },
}

export function createDialog(dialogOptions) {
  let dialog = reactive(dialogOptions)
  dialog.key = 'dialog-' + dialogs.value.length
  dialog.show = false
  setTimeout(() => {
    dialog.show = true
  }, 0)
  dialogs.value.push(dialog)
}

// Styled async confirm — replaces window.confirm (ugly + blocking + not mobile-safe). The
// caller passes already-translated strings + an onConfirm callback run when the user
// confirms; Cancel just closes. Destructive actions default to a red confirm button.
// onCancel fires when the dialog closes any way EXCEPT confirm (X, backdrop, Esc) —
// callers awaiting an outcome need the "no" as much as the "yes".
export function confirmDialog({ title, message, confirmLabel, theme = 'red', onConfirm, onCancel }) {
  let confirmed = false
  createDialog({
    title: title || message,
    message: title ? message : undefined,
    onClose: () => {
      if (!confirmed) onCancel?.()
    },
    actions: [
      {
        label: confirmLabel || 'OK',
        variant: 'solid',
        theme,
        onClick: async (close) => {
          confirmed = true
          await onConfirm?.()
          close()
        },
      },
    ],
  })
}

// Fire the dialog's primary action (used for Enter-to-submit on an input dialog).
function submitInput(dialog) {
  const primary = dialog.actions?.[0]
  if (primary?.onClick) primary.onClick(() => (dialog.show = false))
}

// Styled async text prompt — replaces window.prompt (blocking + unstyled + no dark
// mode). onConfirm gets the trimmed value; Cancel just closes. type:'textarea' for a
// multi-line reason. required:true blocks empty submits with an inline error.
export function inputDialog({
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel,
  theme = 'gray',
  type = 'text',
  required = false,
  requiredMessage,
  onConfirm,
}) {
  const opts = reactive({
    title: title || message,
    message: title ? message : undefined,
    input: { type, placeholder },
    inputValue: defaultValue,
    error: '',
    actions: [
      {
        label: confirmLabel || 'OK',
        variant: 'solid',
        theme,
        onClick: async (close) => {
          const val = (opts.inputValue ?? '').trim()
          if (required && !val) {
            opts.error = requiredMessage || __('Este campo es obligatorio')
            return
          }
          opts.error = ''
          await onConfirm?.(val)
          close()
        },
      },
    ],
  })
  createDialog(opts)
}
