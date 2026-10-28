<template>
  <!-- The other apps the worker opened from the rail, one frame each. Hidden
       frames stay alive, so POS keeps its cart and Taller its open order. -->
  <div class="flex min-h-0 min-w-0 flex-1" data-testid="app-frames">
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
import { useRouter } from 'vue-router'
import {
  currentApp,
  openApps,
  restartApp,
  showShell,
} from '@/composables/appStrip'

const router = useRouter()

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
</script>
