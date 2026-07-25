// Offline outbox (spec 1.4): dead zones — type → queue → auto-send on reconnect.
// TEXT WhatsApp replies only (media/templates need uploads = online). FIFO in
// localStorage (survives app close), per-user key (same privacy contract as the
// queue cache; logout sweeps doco-* keys). Flush on: module boot, window
// 'online', socket:reconnected. Sequential sends keep per-conversation order.
//
// Duplicate caveat (documented, accepted): a flush POST that succeeds but loses
// its response is retried → rare duplicate send, preferred over a lost message.
import { ref } from 'vue'
import { call, toast } from 'frappe-ui'

function _user() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (e) {
    return ''
  }
}
const KEY = `doco-wa-outbox-v1:${_user()}`
const MAX_ATTEMPTS = 5

export const outbox = ref([])
export const outboxFlushing = ref(false)

function _load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    outbox.value = Array.isArray(raw) ? raw : []
  } catch (e) {
    outbox.value = []
  }
}
function _save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(outbox.value.slice(0, 50)))
  } catch (e) {
    /* quota — the in-memory queue still flushes */
  }
}

export function enqueueOutbox(args) {
  outbox.value = [...outbox.value, { ...args, _attempts: 0, _ts: Date.now() }]
  _save()
}

export function discardOutbox(idx) {
  outbox.value = outbox.value.filter((_, i) => i !== idx)
  _save()
}

export async function flushOutbox() {
  if (outboxFlushing.value || !outbox.value.length) return
  if (!navigator.onLine) return
  outboxFlushing.value = true
  let sent = 0
  try {
    while (outbox.value.length && navigator.onLine) {
      const item = outbox.value[0]
      try {
        await call('crm.api.whatsapp.create_whatsapp_message', {
          reference_doctype: item.reference_doctype,
          reference_name: item.reference_name,
          message: item.message,
          to: item.to,
          attach: '',
          reply_to: item.reply_to || '',
          content_type: 'text',
          canned: item.canned || '',
        })
        outbox.value = outbox.value.slice(1)
        _save()
        sent++
      } catch (e) {
        // permanent rejections (perms, closed window) shouldn't loop forever
        const item0 = { ...item, _attempts: (item._attempts || 0) + 1 }
        if (item0._attempts >= MAX_ATTEMPTS) {
          outbox.value = outbox.value.slice(1)
          _save()
          toast.error(
            __('No se pudo enviar un mensaje en cola — revísalo: “{0}”', [
              (item.message || '').slice(0, 60),
            ]),
          )
        } else {
          outbox.value = [item0, ...outbox.value.slice(1)]
          _save()
          break // transient (probably still a bad link) — retry on the next trigger
        }
      }
    }
  } finally {
    outboxFlushing.value = false
  }
  if (sent) toast.success(__('{0} mensaje(s) de la cola enviados', [sent]))
}

// module-level wiring: boot + reconnect triggers (SPA singleton, never torn down).
// Skipped under vitest — tests drive flushOutbox explicitly (stray boot timers
// from reset module instances otherwise fire across test boundaries).
_load()
if (!globalThis.process?.env?.VITEST) {
  window.addEventListener('online', () => setTimeout(flushOutbox, 1200))
  window.addEventListener('socket:reconnected', () => setTimeout(flushOutbox, 800))
  if (navigator.onLine) setTimeout(flushOutbox, 4000) // boot flush after app settles
}
