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
import { call } from 'frappe-ui'

export const pushState = ref('unsupported')
export const pushBusy = ref(false)

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
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
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
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
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key),
    })
    await call('doco_marketing.api.push.subscribe', {
      subscription: JSON.stringify(sub.toJSON()),
      user_agent: navigator.userAgent,
    })
    pushState.value = 'on'
  } catch (e) {
    // subscribe can throw on private windows / policy blocks — stay off, no crash
    pushState.value = 'off'
  } finally {
    pushBusy.value = false
  }
}

export async function disablePush() {
  if (pushBusy.value || !supported()) return
  pushBusy.value = true
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
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
