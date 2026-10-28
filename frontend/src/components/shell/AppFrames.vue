<template>
  <!-- The other apps the worker opened from the rail, one frame each. Hidden
       frames stay alive, so POS keeps its cart and Taller its open order. -->
  <div ref="root" class="flex min-h-0 min-w-0 flex-1" data-testid="app-frames">
    <iframe
      v-for="app in openApps"
      v-show="app.key === currentApp"
      :key="`${app.key}:${app.rev}`"
      :src="app.src"
      :title="app.label"
      :data-app-frame="app.key"
      allow="camera; microphone; clipboard-read; clipboard-write; geolocation; fullscreen; serial; usb; hid"
      class="min-h-0 min-w-0 flex-1 border-0 bg-surface-base"
      @load="onLoad(app, $event)"
    />
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  currentApp,
  openApps,
  restartApp,
  showShell,
} from '@/composables/appStrip'

const router = useRouter()
const root = ref(null)

// An app that leads back into the shell («Volver a Contactos», a link to a
// deal) opens that page in the shell and starts over at its own first page;
// one that lost its session sends the whole window to sign in again.
function onLoad(app, event) {
  let where
  try {
    where = event.target.contentWindow.location
  } catch {
    return
  }
  const path = where.pathname
  if (path === '/crm' || path.startsWith('/crm/')) {
    restartApp(app.key)
    showShell()
    router.push(`${path.slice(4) || '/'}${where.search}${where.hash}`)
  } else if (path === '/login') {
    window.location.reload()
  }
}

// What a framed app asks of the shell (Escáner, hostedWorkspace.ts), only from
// one of these frames on this origin:
// - `muelle:open {path: '/crm/…'}`: a link to a shell page opens it here and
//   the app keeps its place in its frame;
// - `muelle:workspace-shortcut`: Ctrl/⌘+K and the shell's other keys pressed
//   inside the frame reach the shell as if pressed on it.
const SHORTCUT_FLAGS = ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']
function fromFrame(source) {
  return [...(root.value?.querySelectorAll('[data-app-frame]') || [])].some(
    (frame) => frame.contentWindow === source,
  )
}
function onMessage(event) {
  const data = event.data
  if (
    event.origin !== window.location.origin ||
    !data ||
    typeof data !== 'object'
  )
    return
  if (!fromFrame(event.source)) return
  if (data.type === 'muelle:open') {
    const path = data.path
    if (
      typeof path !== 'string' ||
      !/^\/crm(?:[/?#]|$)/.test(path) ||
      path.startsWith('//')
    )
      return
    showShell()
    router.push(path.slice(4) || '/')
  } else if (data.type === 'muelle:workspace-shortcut') {
    if (typeof data.key !== 'string' || !data.key || data.key.length > 3) return
    const flags = Object.fromEntries(
      SHORTCUT_FLAGS.map((flag) => [flag, data[flag] === true]),
    )
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: data.key,
        ...flags,
        bubbles: true,
        cancelable: true,
      }),
    )
  }
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>
