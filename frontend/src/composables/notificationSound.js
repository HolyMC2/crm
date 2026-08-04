// Inbox notification ping + on/off toggle. Web Audio (no asset) — a two-tone
// "pop" approximating a message notification; we can't bundle the real WhatsApp
// sound (copyrighted). Preference persists in localStorage. Browsers block audio
// until a user gesture, so toggleSound() (a click) unlocks the AudioContext and
// plays a confirmation ping.
import { ref } from 'vue'

// Per-user key: shared machines (the shop counter) must not leak one operator's
// sound preference to the next login. user_id cookie is set by Frappe on login.
function currentUser() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
    return m ? decodeURIComponent(m[1]) : 'guest'
  } catch {
    return 'guest'
  }
}
const LEGACY_KEY = 'inbox_sound_enabled'
const STORAGE_KEY = `${LEGACY_KEY}:${currentUser()}`

function initialEnabled() {
  if (typeof localStorage === 'undefined') return false
  const v = localStorage.getItem(STORAGE_KEY)
  if (v !== null) return v === '1'
  // one-time migration from the pre-namespaced key
  return localStorage.getItem(LEGACY_KEY) === '1'
}

export const soundEnabled = ref(initialEnabled())

let audioCtx = null
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

export function playPing() {
  if (!soundEnabled.value) return
  try {
    const ac = ctx()
    if (ac.state === 'suspended') ac.resume()
    const t = ac.currentTime
    for (const [freq, start, dur] of [
      [880, t, 0.09],
      [1175, t + 0.07, 0.13],
    ]) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(start + dur + 0.03)
    }
  } catch (e) {
    /* autoplay policy / no audio — ignore */
  }
}

export function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  try {
    localStorage.setItem(STORAGE_KEY, soundEnabled.value ? '1' : '0')
  } catch (e) {
    /* private mode / storage disabled — keep the in-memory preference */
  }
  if (soundEnabled.value) {
    // this runs inside the toggle click (a user gesture): unlock + confirm.
    try {
      const ac = ctx()
      if (ac.state === 'suspended') ac.resume()
    } catch (e) {
      /* ignore */
    }
    playPing()
  }
}
