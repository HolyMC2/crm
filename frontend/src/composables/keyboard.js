import { ref } from 'vue'

/**
 * Whether the on-screen keyboard is up. The page asks for
 * `interactive-widget=resizes-content`, so the keyboard shrinks the layout
 * viewport (innerHeight) together with the visual one; compare against the
 * tallest viewport seen for the current orientation instead.
 */
export const keyboardOpen = ref(false)

let tallest = 0
let wide = null
let bound = false

export function measureKeyboard() {
  const vv = window.visualViewport
  if (!vv) return (keyboardOpen.value = false)
  const landscape = window.innerWidth > window.innerHeight + 120
  if (landscape !== wide) {
    wide = landscape
    tallest = 0
  }
  tallest = Math.max(tallest, vv.height, window.innerHeight)
  keyboardOpen.value = vv.height < tallest * 0.75
  return keyboardOpen.value
}

export function watchKeyboard() {
  if (bound || typeof window === 'undefined' || !window.visualViewport) return
  bound = true
  measureKeyboard()
  window.visualViewport.addEventListener('resize', measureKeyboard)
}
