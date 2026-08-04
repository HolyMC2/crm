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
// injects the lucide SVG sprite into the DOM so the IconPicker and lucide Icons
// (used for view icons) can render from it
import { spritePlugin } from 'frappe-ui/icons'

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
app.use(spritePlugin)
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

// Deploy-staleness guard: the inbox is a long-lived tab (never navigates), so a
// deploy leaves it on the old bundle until a manual F5 — and the SW (scoped to
// /assets/crm/frontend/) can't swap the page for us. Two layers, polled every
// 30 min and whenever the tab regains focus:
//   1. SW registration update() — keeps the (minor) SW layer fresh.
//   2. build.json vs the baked-in __BUILD_ID__ — when they differ a newer build
//      was deployed, so hard-reload to pick it up. The cache-buster query keeps
//      Cloudflare/browser caches out of the check.
if (!import.meta.env.DEV) {
  const checkForSwUpdate = () =>
    // The SW's scope is /assets/crm/frontend/ and never controls /crm, so a bare
    // getRegistration() here resolves undefined and update() never ran (the same
    // scope trap that broke push subscribe). Ask for the scope explicitly.
    navigator.serviceWorker
      ?.getRegistration('/assets/crm/frontend/')
      .then((r) => r?.update())
      .catch(() => {})
  // Draft-safe reload (batch 5): a hard reload mid-message would eat the
  // operator's typing. When a new build lands while any textarea holds text,
  // defer — the next check (30-min tick / tab refocus / composer emptied on
  // send) applies it. One quiet toast tells them an update is pending.
  const hasDraftText = () => {
    // textareas only: those hold real message/note drafts. Search/filter inputs
    // keep text for days and would defer the update forever.
    try {
      return Array.from(document.querySelectorAll('textarea')).some(
        (el) => (el.value || '').trim().length > 0,
      )
    } catch (e) {
      return false
    }
  }
  let updateToastShown = false
  const applyOrDeferUpdate = () => {
    if (!hasDraftText()) {
      window.location.reload()
      return
    }
    if (!updateToastShown) {
      updateToastShown = true
      import('frappe-ui')
        .then(({ toast }) =>
          toast.info(__('🔄 Nueva versión lista — se aplicará cuando termines de escribir')),
        )
        .catch(() => {})
    }
  }
  const checkBuild = () =>
    fetch(`/assets/crm/frontend/build.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.id && b.id !== __BUILD_ID__) applyOrDeferUpdate()
      })
      .catch(() => {})
  const checkStaleness = () => {
    checkForSwUpdate()
    checkBuild()
  }
  setInterval(checkStaleness, 30 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkStaleness()
  })
}
