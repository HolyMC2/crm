// Mi cuenta's «Historial» pages (capability «history»): Boat's my_history through
// miplan.call, PAGE events at a time, newest first. Each page asks with the
// cursor the previous one answered; a repeat of an event already shown is
// dropped. A refusal or a failed read keeps what is shown and says why.
import { ref } from 'vue'
import { seam as defaultSeam } from './api'
import { failureText, refusalView } from './autoservicio'

export function createHistory({ seam = defaultSeam } = {}) {
  const events = ref([])
  const cursor = ref(null)
  const done = ref(false)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref('')
  let seq = 0

  async function load({ reset = false } = {}) {
    if (busy.value && !reset) return
    if (!reset && done.value) return
    const mine = ++seq
    busy.value = true
    error.value = ''
    const payload = !reset && cursor.value ? { cursor: cursor.value } : {}
    try {
      const out = await seam('my_history', payload)
      if (mine !== seq) return
      if (out?.ok !== true || !Array.isArray(out.events)) {
        error.value = refusalView(out).text
        return
      }
      const seen = new Set(reset ? [] : events.value.map((e) => e?.id))
      const fresh = out.events.filter((e) => e && !seen.has(e.id))
      events.value = reset ? fresh : [...events.value, ...fresh]
      cursor.value =
        typeof out.cursor === 'string' && out.cursor ? out.cursor : null
      done.value = !cursor.value
      loaded.value = true
    } catch (err) {
      if (mine === seq) error.value = failureText(err)
    } finally {
      if (mine === seq) busy.value = false
    }
  }

  return { events, cursor, done, loaded, busy, error, load }
}
