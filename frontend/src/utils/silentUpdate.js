import {
  createBundleWatcher,
  isChunkLoadError,
  registerSwapBlocker,
} from '@/vendor/muelle-shell/live-sync'
import { toast } from 'frappe-ui'

// Silent update (spec §2.6): @muelle/live-sync moves the tab to a new build at
// a safe moment (hidden, idle or the next route change), never with typed
// text, an open dialog or an unsaved draft, and recovers lazy chunks that
// vanished after a deploy. A prompt only when a vanished chunk cannot be
// recovered silently (recoverChunk). Components with unsaved in-memory
// edits or a live call add their own blockers (editSwapBlocker, callSwapBlocker).
export function installSwapBlockers() {
  return [
    registerSwapBlocker('muelle-drafts', () =>
      Boolean(window.__MUELLE_HAS_DRAFT__),
    ),
  ]
}

export const NEW_VERSION_TOAST = 'crm-new-version'
let reloading = false
let promptedAt = 0

function showNewVersion(target) {
  toast.info('Hay una versión nueva de Muelle', {
    id: NEW_VERSION_TOAST,
    description: 'Recarga para seguir; te quedas en esta página.',
    duration: Infinity,
    action: {
      label: 'Recargar',
      onClick: () => window.location.assign(target),
    },
  })
}

/**
 * A lazy chunk of this tab's build failed to load: the deploy outran the
 * retention of old builds (retain-builds.mjs) or the server is restarting.
 * When it is safe the tab silently reloads the same route. Otherwise the
 * worker's action (Ctrl+K, Alt+H, a page) just did nothing, so say why and
 * offer the reload (CRM program D5) instead of failing silently. Never routes
 * anywhere else: a missing chunk is not a permission problem.
 */
export function recoverChunk(watcher, target, notify = showNewVersion) {
  if (reloading) return 'reload'
  // One failure reaches us twice (router.onError and vite:preloadError): the
  // first target wins, and the watcher still moves to it once it is safe.
  if (Date.now() - promptedAt < 1000) return 'prompt'
  if (watcher.recoverChunkError(target)) {
    reloading = true
    return 'reload'
  }
  promptedAt = Date.now()
  notify(target)
  return 'prompt'
}

export function resetChunkRecoveryForTests() {
  reloading = false
  promptedAt = 0
}

function currentHref() {
  const { pathname, search, hash } = window.location
  return pathname + search + hash
}

// `runningEntry` is the entry chunk's import.meta.url (passed from main.js).
export function installSilentUpdate(router, runningEntry) {
  const watcher = createBundleWatcher({
    versionUrl: '/assets/crm/frontend/version.json',
    runningEntry,
    app: 'crm',
  })
  installSwapBlockers()
  router.beforeEach((to) => {
    if (watcher.navigateIfStale('/crm' + to.fullPath)) return false
  })
  router.onError((error, to) => {
    if (isChunkLoadError(error)) recoverChunk(watcher, '/crm' + to.fullPath)
  })
  // Lazy components outside the router (command palette, shortcut sheet,
  // notifications, the Ventas frame) fail here; Vite reports every failed
  // dynamic import and preload as `vite:preloadError`. A failed route chunk
  // fires it too: wait a task so router.onError recovers to the route the
  // worker was going to, not the one they are leaving.
  window.addEventListener('vite:preloadError', () => {
    setTimeout(() => recoverChunk(watcher, currentHref()), 0)
  })
  // The SW's scope is /assets/crm/frontend/ and never controls /crm: ask for
  // that scope explicitly so its precache stays current.
  navigator.serviceWorker
    ?.getRegistration('/assets/crm/frontend/')
    .then((registration) => registration?.update())
    .catch(() => {})
  return watcher
}
