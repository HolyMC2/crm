// Build tag — a global side-effect (survives minification, unlike a comment) so
// bumping it forces a fresh content-hashed bundle when an old hash gets poisoned
// in a CDN cache (a 404 cached during a deploy/warm-up window).
window.__CRM_BUILD__ = '2026-06-24a'
import './index.css'
import './utils/resourceConfig'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createDialog } from './utils/dialogs'
import { initSocket } from './socket'
import router from './router'
import { listenForPushNavigation } from './utils/pushNavigate'
import { installTelemetry } from './utils/startupTelemetry'
import translationPlugin from './translation'
import App from './App.vue'

function loadPrintingRuntime() {
  if (
    !Array.isArray(window.installed_apps) ||
    !window.installed_apps.includes('doco')
  ) {
    return
  }
  const src = '/assets/doco/js/printing_runtime.js?v=20260926a'
  const url = new URL(src, document.baseURI).href
  if (Array.from(document.scripts).some((script) => script.src === url)) return
  const printRuntime = document.createElement('script')
  printRuntime.src = src
  document.head.appendChild(printRuntime)
}

import { FrappeUI, Button, frappeRequest } from 'frappe-ui'
import { lazyGlobalComponents, prefetchGlobals } from './utils/lazyGlobals'

// The lucide sprite for Icon.vue / IconPicker loads after first paint (idle).
import { ensureLucideSprite } from './utils/lucideSprite'
import { installSilentUpdate } from './utils/silentUpdate'
import { watchInstallPrompt } from './composables/shellInstall'

let globalComponents = {
  Button,
  ...lazyGlobalComponents,
}

// create a pinia instance
let pinia = createPinia()

let app = createApp(App)

// CRM initializes its boot-aware socket below before mounting consumers.
app.use(FrappeUI, { socketio: false })
app.use(pinia)
app.use(router)
app.use(translationPlugin)
for (let key in globalComponents) {
  app.component(key, globalComponents[key])
}
void installTelemetry(app)

app.config.globalProperties.$dialog = createDialog

let socket
if (import.meta.env.DEV) {
  // Signed-in users get the path-aware boot (Contactos is neutral); a guest
  // falls back to the upstream guest boot, which leads to the login page.
  frappeRequest({
    url: '/api/method/crm.www.crm.get_shell_context_for_dev',
    params: { path: window.location.pathname },
  })
    .catch(() =>
      frappeRequest({ url: '/api/method/crm.www.crm.get_context_for_dev' }),
    )
    .then((values) => {
      for (let key in values) {
        window[key] = values[key]
      }
      loadPrintingRuntime()
      socket = initSocket()
      app.config.globalProperties.$socket = socket
      app.mount('#app')
    })
} else {
  loadPrintingRuntime()
  socket = initSocket()
  app.config.globalProperties.$socket = socket
  app.mount('#app')
}

if (import.meta.env.DEV) {
  window.$dialog = createDialog
}

// Push click → open the conversation in THIS tab. The SW cannot navigate a page it
// does not control (scope trap below), so it posts the URL and we route in-app.
listenForPushNavigation(router)
watchInstallPrompt()

if (!import.meta.env.DEV)
  installSilentUpdate(router, import.meta.url)

  // Warm the icon sprite once the first screen is up (Icon.vue also requests it).
;(window.requestIdleCallback || ((callback) => setTimeout(callback, 1500)))(
  () => {
    ensureLucideSprite()
    prefetchGlobals()
  },
)
