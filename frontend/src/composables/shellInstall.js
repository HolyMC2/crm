import { ref } from 'vue'

// «Instalar app» in the user menu / Más: Chrome and Android fire
// beforeinstallprompt only while the PWA is installable and not installed.
export const installAvailable = ref(false)
let deferred = null

export function watchInstallPrompt() {
  if (typeof window === 'undefined' || window.__muelleInstallWatch) return
  window.__muelleInstallWatch = true
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event
    installAvailable.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installAvailable.value = false
  })
}

export async function installApp() {
  const prompt = deferred
  deferred = null
  installAvailable.value = false
  if (!prompt) return
  try {
    prompt.prompt()
    await prompt.userChoice
  } catch {
    // The browser may refuse a repeated prompt; nothing else to do.
  }
}
