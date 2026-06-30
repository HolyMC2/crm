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
        options={dialog}
        modelValue={dialog.show}
        onUpdate:modelValue={(val) => (dialog.show = val)}
      >
        {{
          'body-content': () => {
            return [
              dialog.message && (
                <p class="text-p-base text-ink-gray-7">{dialog.message}</p>
              ),
              dialog.html && <div v-html={dialog.html} />,
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
export function confirmDialog({ title, message, confirmLabel, theme = 'red', onConfirm }) {
  createDialog({
    title: title || message,
    message: title ? message : undefined,
    actions: [
      {
        label: confirmLabel || 'OK',
        variant: 'solid',
        theme,
        onClick: async (close) => {
          await onConfirm?.()
          close()
        },
      },
    ],
  })
}
