// frappe-ui's TipTap editor is one 900 KB chunk: the composers and the field
// renderers mount it on demand, so a record page without an open editor never
// downloads it (TextEditorControl.vue is the field-renderer side of this).
import { defineAsyncComponent } from 'vue'

export const TextEditor = defineAsyncComponent(() =>
  import('frappe-ui/experimental').then((m) => m.TextEditor),
)
