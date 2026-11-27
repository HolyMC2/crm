import { ref } from 'vue'

// This computer's label printer: Etiquetas prints straight to it through Muelle
// QZ, and the shell's top bar says when it cannot. The printer belongs to the
// computer, so it is kept in this browser. No QZ here: the client loads on use.

const KEY = 'muelle:etiquetas:impresora'

function saved() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

/** This computer's label printer ('' = the browser's print dialog). */
export const labelPrinter = ref(saved())

export function chooseLabelPrinter(name) {
  labelPrinter.value = String(name || '').trim()
  try {
    if (labelPrinter.value) localStorage.setItem(KEY, labelPrinter.value)
    else localStorage.removeItem(KEY)
  } catch {
    // A browser that keeps nothing prints with the dialog after a reload.
  }
}
