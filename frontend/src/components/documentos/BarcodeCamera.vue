<template>
  <!-- Camera scan for the items editor: full screen, the back camera, the
       browser's own BarcodeDetector (no library). Emits the first code read. -->
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black text-white"
    role="dialog"
    aria-modal="true"
    aria-label="Escanear código de barras"
    data-shell-layer="scanner"
  >
    <div class="flex items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        class="flex size-12 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Cerrar"
        @click="emit('close')"
      >
        <span class="lucide-x size-6" aria-hidden="true" />
      </button>
      <p class="text-base">Apunta al código de barras</p>
    </div>
    <div class="relative min-h-0 flex-1">
      <video
        ref="video"
        class="absolute inset-0 size-full object-cover"
        playsinline
        muted
      />
      <div
        class="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 border-white/80"
        aria-hidden="true"
      />
    </div>
    <p v-if="error" role="alert" class="px-4 py-4 text-base">{{ error }}</p>
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['code', 'close'])
const video = ref(null)
const error = ref('')
let stream = null
let timer = null
let done = false

function stop() {
  clearTimeout(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

onMounted(async () => {
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.()
    const detector = new window.BarcodeDetector(
      formats?.length ? { formats } : undefined,
    )
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    video.value.srcObject = stream
    await video.value.play()
    const tick = async () => {
      if (done || !video.value) return
      try {
        const found = await detector.detect(video.value)
        if (found?.length && found[0].rawValue) {
          done = true
          stop()
          emit('code', found[0].rawValue)
          return
        }
      } catch {
        // keep trying; a frame can fail while the camera focuses
      }
      timer = setTimeout(tick, 200)
    }
    tick()
  } catch (e) {
    error.value =
      e?.name === 'NotAllowedError'
        ? 'Permite el uso de la cámara para escanear, o escribe el código.'
        : 'Este teléfono no puede escanear aquí. Escribe el código en la búsqueda.'
  }
})
onBeforeUnmount(stop)
</script>
