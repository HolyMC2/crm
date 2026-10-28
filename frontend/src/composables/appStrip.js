// The site's other apps (Escáner, POS, Taller…) opened inside the desktop
// shell, like Ferdium: each one lives in its own frame and keeps its page while
// the worker switches between it and the shell's modules.
import { ref, shallowRef } from 'vue'

/** [{ key, label, icon, src, rev }] in the order they were opened. */
export const openApps = shallowRef([])
/** The app on screen; '' while the shell's own page shows. */
export const currentApp = ref('')

/** Shows `app`, opening it at `src` the first time. */
export function openApp(app, src) {
  if (!openApps.value.some((open) => open.key === app.key))
    openApps.value = [
      ...openApps.value,
      { key: app.key, label: app.label, icon: app.icon, src, rev: 0 },
    ]
  currentApp.value = app.key
}

/** Closes `key`'s frame; its page is gone, the next open starts fresh. */
export function closeApp(key) {
  openApps.value = openApps.value.filter((open) => open.key !== key)
  if (currentApp.value === key) currentApp.value = ''
}

/** Back to the shell's page; the open apps wait where they were. */
export function showShell() {
  currentApp.value = ''
}

/** Reloads `key`'s frame at its first page. */
export function restartApp(key) {
  openApps.value = openApps.value.map((open) =>
    open.key === key ? { ...open, rev: open.rev + 1 } : open,
  )
}

/** Tests: nothing open. */
export function resetAppStripForTests() {
  openApps.value = []
  currentApp.value = ''
}
