// Inbox notification ping + on/off toggle. Web Audio (no asset) — a two-tone
// "pop" approximating a message notification; we can't bundle the real WhatsApp
// sound (copyrighted). Preference persists in localStorage. Browsers block audio
// until a user gesture, so toggleSound() (a click) unlocks the AudioContext and
// plays a confirmation ping.
import { ref } from 'vue'

const STORAGE_KEY = 'inbox_sound_enabled'

export const soundEnabled = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1',
)

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
