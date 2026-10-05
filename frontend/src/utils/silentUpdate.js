import {
  createBundleWatcher,
  isChunkLoadError,
  registerSwapBlocker,
} from '@/vendor/muelle-shell/live-sync'

// Silent update (spec §2.6): @muelle/live-sync moves the tab to a new build at
// a safe moment (hidden, idle or the next route change), never with typed
// text, an open dialog or an unsaved draft, and recovers lazy chunks that
// vanished after a deploy. No prompt. Components with unsaved in-memory
// edits or a live call add their own blockers (editSwapBlocker, callSwapBlocker).
export function installSwapBlockers() {
  return [
    registerSwapBlocker('muelle-drafts', () =>
      Boolean(window.__MUELLE_HAS_DRAFT__),
    ),
  ]
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
    if (isChunkLoadError(error)) watcher.recoverChunkError('/crm' + to.fullPath)
  })
  // The SW's scope is /assets/crm/frontend/ and never controls /crm: ask for
  // that scope explicitly so its precache stays current.
  navigator.serviceWorker
    ?.getRegistration('/assets/crm/frontend/')
    .then((registration) => registration?.update())
    .catch(() => {})
  return watcher
}
