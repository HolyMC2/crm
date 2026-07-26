// Install nudge (spec 1.7): after a few real visits, gently offer "instala la
// app". Chrome/Android only fires `beforeinstallprompt` when the PWA is
// installable AND not yet installed — we stash that event and only surface the
// banner once the visit count clears the bar, so a first-time visitor is never
// nagged. Dismissing hides it for good (respecting the choice beats re-asking).
// iOS Safari never fires the event → the banner simply never shows there.
import { ref } from 'vue'

const VISITS_KEY = 'doco-install-visits'
const DISMISSED_KEY = 'doco-install-dismissed'
const MIN_VISITS = 3
// one visit counted per calendar day, so a reload burst isn't "3 visits"
const LAST_VISIT_KEY = 'doco-install-last-visit'

export const installNudgeVisible = ref(false)
let _deferredPrompt = null

function _countVisit() {
  try {
    const today = new Date().toDateString()
    if (localStorage.getItem(LAST_VISIT_KEY) === today) {
      return Number(localStorage.getItem(VISITS_KEY) || 0)
    }
    localStorage.setItem(LAST_VISIT_KEY, today)
    const n = Number(localStorage.getItem(VISITS_KEY) || 0) + 1
    localStorage.setItem(VISITS_KEY, String(n))
    return n
  } catch (e) {
    return 0
  }
}

export function initInstallNudge() {
  let visits = 0
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return
    // already running as an installed app → nothing to offer
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return
    visits = _countVisit()
  } catch (e) {
    return
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress Chrome's mini-infobar; we show our own banner
    _deferredPrompt = e
    if (visits >= MIN_VISITS) installNudgeVisible.value = true
  })
}

export async function acceptInstall() {
  installNudgeVisible.value = false
  const p = _deferredPrompt
  _deferredPrompt = null
  if (!p) return
  try {
    p.prompt()
    await p.userChoice // outcome irrelevant — the browser remembers a refusal
  } catch (e) {}
}

export function dismissInstallNudge() {
  installNudgeVisible.value = false
  _deferredPrompt = null
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch (e) {}
}
