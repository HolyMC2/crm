// Web Push subscribe/unsubscribe flow (spec 1.1). Server side lives in
// doco_marketing.api.push + services/push.py; the SW handlers in public/push-sw.js.
//
// State model (pushState):
//   'unsupported'  — browser lacks SW/Push/Notification APIs
//   'unconfigured' — server has no VAPID keys (feature dark)
//   'denied'       — user blocked notifications at the browser level
//   'off'          — available, not subscribed
//   'on'           — this browser is subscribed
// enablePush() MUST be called from a user gesture (permission prompt rules).
import { ref } from 'vue'
import { call, toast } from 'frappe-ui'

export const pushState = ref('unsupported')
export const pushBusy = ref(false)

const SW_URL = '/assets/crm/frontend/sw.js'
const SW_SCOPE = '/assets/crm/frontend/'

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// The workbox SW registers under /assets/crm/frontend/ (its serving path), which
// does NOT control /crm — `navigator.serviceWorker.ready` therefore NEVER resolves
// on CRM pages and everything awaiting it hangs (prod bug 2026-07-25: the push
// toggle simply never appeared). Push doesn't need page control: fetch the
// registration by its scope, register it ourselves if missing, and wait (bounded)
// for activation.
async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null
  let reg = await navigator.serviceWorker.getRegistration(SW_SCOPE).catch(() => null)
  if (!reg) {
    reg = await navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .catch(() => null)
  }
  if (!reg) return null
  if (reg.active) return reg
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 8000)
    const sw = reg.installing || reg.waiting
    if (!sw) {
      clearTimeout(t)
      resolve()
      return
    }
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') {
        clearTimeout(t)
        resolve()
      }
    })
  })
  return reg.active ? reg : null
}

export async function refreshPushState() {
  if (!supported()) {
    pushState.value = 'unsupported'
    return
  }
  try {
    const st = await call('doco_marketing.api.push.status')
    if (!st?.configured) {
      pushState.value = 'unconfigured'
      return
    }
    if (Notification.permission === 'denied') {
      pushState.value = 'denied'
      return
    }
    // don't block the drawer on SW activation — resolve subscribed state lazily
    const reg = await swRegistration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    pushState.value = sub && st.subscribed ? 'on' : 'off'
  } catch (e) {
    pushState.value = 'unconfigured'
  }
}

export async function enablePush() {
  if (pushBusy.value || !supported()) return
  pushBusy.value = true
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      pushState.value = perm === 'denied' ? 'denied' : 'off'
      return
    }
    const key = await call('doco_marketing.api.push.vapid_public_key')
    if (!key) {
      pushState.value = 'unconfigured'
      return
    }
    const reg = await swRegistration()
    if (!reg) {
      pushState.value = 'off'
      toast.error(__('No se pudo iniciar el service worker — recarga la página e intenta de nuevo'))
      return
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key),
    })
    await call('doco_marketing.api.push.subscribe', {
      subscription: JSON.stringify(sub.toJSON()),
      user_agent: navigator.userAgent,
    })
    pushState.value = 'on'
    toast.success(__('Notificaciones activadas en este dispositivo'))
  } catch (e) {
    // subscribe throws on push-service blocks. Brave ships with its push
    // transport OFF — tell the operator exactly where to flip it.
    pushState.value = 'off'
    const brave = !!navigator.brave
    toast.error(
      brave
        ? __('Brave bloquea push: activa «Usar servicios de Google para mensajería push» en Configuración → Privacidad y vuelve a intentar')
        : __('No se pudo activar push en este navegador'),
    )
  } finally {
    pushBusy.value = false
  }
}

export async function disablePush() {
  if (pushBusy.value || !supported()) return
  pushBusy.value = true
  try {
    const reg = await swRegistration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) {
      await call('doco_marketing.api.push.unsubscribe', { endpoint: sub.endpoint })
      await sub.unsubscribe()
    }
    pushState.value = 'off'
  } catch (e) {
    pushState.value = 'off'
  } finally {
    pushBusy.value = false
  }
}
