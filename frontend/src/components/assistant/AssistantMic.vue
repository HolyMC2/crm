<template>
  <!-- Press and hold to talk (doco's voice path, assistant/voice_api.py): the
       note is transcribed into the composer, the worker reads it and sends.
       The audio is never stored. Shown only when the site has voice on. -->
  <button
    v-if="voice?.enabled"
    type="button"
    class="flex size-11 flex-none touch-none select-none items-center justify-center rounded-full"
    :class="
      recording
        ? 'bg-surface-red-2 text-ink-red-7'
        : 'text-ink-gray-7 hover:bg-surface-gray-2'
    "
    :aria-label="label"
    :title="label"
    :aria-pressed="recording"
    :disabled="busy"
    data-testid="assistant-mic"
    @pointerdown.prevent="start"
    @pointerup="stop"
    @pointerleave="stop"
    @pointercancel="cancel"
    @keydown.space.prevent="start"
    @keyup.space.prevent="stop"
    @contextmenu.prevent
  >
    <span
      :class="[
        busy ? 'lucide-loader-circle animate-spin' : 'lucide-mic',
        'size-5',
      ]"
      aria-hidden="true"
    />
  </button>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { call } from 'frappe-ui'

const emit = defineEmits(['text', 'error'])
const VOICE_API = 'doco.docoutils.assistant.voice_api'
const voice = ref(null)
const recording = ref(false)
const busy = ref(false)
let recorder = null
let chunks = []
let stream = null
let limit = null
let cancelled = false

const label = computed(() =>
  recording.value
    ? __('Release to stop recording')
    : busy.value
      ? __('Transcribing…')
      : __('Hold to talk'),
)

onMounted(async () => {
  if (typeof window === 'undefined' || !window.MediaRecorder) return
  try {
    voice.value = await call(`${VOICE_API}.status`)
  } catch {
    voice.value = null
  }
})

async function start() {
  if (recording.value || busy.value) return
  cancelled = false
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    emit('error', __('Allow the microphone to talk to Muelle.'))
    return
  }
  chunks = []
  recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (event) =>
    event.data.size && chunks.push(event.data)
  recorder.onstop = upload
  recorder.start()
  recording.value = true
  limit = setTimeout(stop, (voice.value?.max_seconds || 60) * 1000)
}

function release() {
  clearTimeout(limit)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  recording.value = false
}

function stop() {
  if (!recording.value) return
  release()
  if (recorder?.state === 'recording') recorder.stop()
}

function cancel() {
  cancelled = true
  stop()
}

async function upload() {
  if (cancelled || !chunks.length) return
  const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
  const form = new FormData()
  form.append('audio', blob, 'nota.webm')
  busy.value = true
  try {
    const response = await fetch(`/api/method/${VOICE_API}.transcribe`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
    })
    const out = (await response.json())?.message || {}
    if (out.ok && out.text) emit('text', out.text)
    else
      emit(
        'error',
        out.message || __('Muelle could not hear the note. Try again.'),
      )
  } catch {
    emit('error', __('Muelle could not hear the note. Try again.'))
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(cancel)
</script>
