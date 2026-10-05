import { onBeforeUnmount, onMounted } from 'vue'
import {
  createShortcutMatcher,
  isTypingTarget,
} from '@/vendor/muelle-shell/contracts'

// Global shell shortcuts from the shared keymap (spec §3.3): ⌘K / Ctrl+K opens
// the palette everywhere, `g` + letter goes to a module. Pages keep their own
// list/form shortcuts (e.g. `/` in Contactos).
export function useShellKeyboard({ openPalette, modules, router }) {
  const matcher = createShortcutMatcher()
  const apple = /Mac|iPhone|iPad/.test(
    navigator.platform || navigator.userAgent,
  )
  function onKeydown(event) {
    if (event.defaultPrevented) return
    if (
      document.querySelector('[aria-modal="true"]') &&
      event.key !== 'Escape'
    ) {
      // A dialog or sheet owns the keyboard, except the palette shortcut.
      if (
        !(
          (apple ? event.metaKey : event.ctrlKey) &&
          event.key.toLowerCase() === 'k'
        )
      )
        return
    }
    const hit = matcher.match(event, {
      apple,
      typing: isTypingTarget(event.target),
    })
    if (!hit) return
    if (hit.id === 'palette') {
      event.preventDefault()
      openPalette()
    } else if (hit.module) {
      const module = modules.value.find((m) => m.key === hit.module)
      if (!module) return
      event.preventDefault()
      router.push(module.to)
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
