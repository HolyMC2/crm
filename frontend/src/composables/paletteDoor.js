import { ref } from 'vue'

// Opening the shell's palette from anywhere with words already typed: a
// docked list search's «Buscar … en todo Muelle» (ui/AppBar, ui/SearchPanel
// through the kit's `searchAll` host hook, uiHost.js). MuelleShell watches it.
export const paletteRequest = ref(null)

export function openPaletteWith(text = '') {
  paletteRequest.value = { text: String(text || ''), at: Date.now() }
}
