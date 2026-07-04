// Build tag — a global side-effect (survives minification, unlike a comment) so
// bumping it forces a fresh content-hashed bundle when an old hash gets poisoned
// in a CDN cache (a 404 cached during a deploy/warm-up window).
window.__CRM_BUILD__ = '2026-06-24a'
import './index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createDialog } from './utils/dialogs'
import { initSocket } from './socket'
import { registerPrintListener } from '@/services/doco/printListener'
import router from './router'
import translationPlugin from './translation'
import App from './App.vue'

import {
  FrappeUI,
  Button,
  Input,
  TextInput,
  FormControl,
  ErrorMessage,
  Dialog,
  Alert,
  Badge,
  setConfig,
  frappeRequest,
  FeatherIcon,
} from 'frappe-ui'

import { telemetryPlugin } from 'frappe-ui/frappe'

let globalComponents = {
  Button,
  TextInput,
  Input,
  FormControl,
  ErrorMessage,
  Dialog,
  Alert,
  Badge,
  FeatherIcon,
}

// create a pinia instance
let pinia = createPinia()

let app = createApp(App)

setConfig('resourceFetcher', frappeRequest)
app.use(FrappeUI)
app.use(pinia)
app.use(router)
app.use(translationPlugin)
for (let key in globalComponents) {
  app.component(key, globalComponents[key])
}
app.use(telemetryPlugin, { app_name: 'crm' })

app.config.globalProperties.$dialog = createDialog

let socket
if (import.meta.env.DEV) {
  frappeRequest({ url: '/api/method/crm.www.crm.get_context_for_dev' }).then(
    (values) => {
      for (let key in values) {
        window[key] = values[key]
      }
      socket = initSocket()
      app.config.globalProperties.$socket = socket
      registerPrintListener(socket)
      app.mount('#app')
    },
  )
} else {
  socket = initSocket()
  app.config.globalProperties.$socket = socket
  registerPrintListener(socket)
  app.mount('#app')
}

if (import.meta.env.DEV) {
  window.$dialog = createDialog
}

// PWA staleness guard: the inbox is a long-lived tab (never navigates), so the
// browser's SW update check — which only runs on navigation — never fires and a
// deploy leaves the tab on the old bundle until a manual F5. Poll for a new
// sw.js every 30 min and whenever the tab regains focus; registerSW's
// autoUpdate handles the actual swap once an update is found.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  const checkForSwUpdate = () =>
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  setInterval(checkForSwUpdate, 30 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForSwUpdate()
  })
}
