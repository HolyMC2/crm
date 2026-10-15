<template>
  <div v-if="status" class="space-y-2">
    <template v-if="status.available">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-if="!working"
          :variant="status.has_text ? 'subtle' : 'solid'"
          class="min-h-11 sm:min-h-0"
          icon-left="type"
          :label="
            step?.tone === 'error'
              ? __('Try again')
              : status.has_text
                ? __('Read text again (OCR)')
                : __('Read text (OCR)')
          "
          :loading="requesting"
          @click="request"
        />
        <span
          v-if="step"
          class="flex items-center gap-2 text-sm"
          :class="
            step.tone === 'error'
              ? 'text-ink-red-4'
              : step.tone === 'done'
                ? 'text-ink-green-3'
                : 'text-ink-gray-7'
          "
          :role="step.tone === 'error' ? 'alert' : 'status'"
        >
          <LoadingIndicator v-if="step.tone === 'busy'" class="h-4 w-4" />
          <FeatherIcon
            v-else-if="step.tone === 'done'"
            name="check"
            class="h-4 w-4"
          />
          {{ step.label }}
        </span>
      </div>
      <p v-if="stale" class="text-sm text-ink-gray-6">
        {{ __('The archive is still reading. Check again later.') }}
        <button
          type="button"
          class="ml-1 inline-flex min-h-11 items-center underline sm:min-h-0"
          @click="resume"
        >
          {{ __('Check again') }}
        </button>
      </p>
      <p v-if="emptyText" class="text-sm text-ink-gray-6">
        {{ __('The archive found no text in this file.') }}
      </p>
    </template>
    <p v-else-if="status.guard" class="text-sm text-ink-gray-5">
      {{ status.guard }}
    </p>
    <p v-if="problemText" role="alert" class="text-sm text-ink-red-4">
      {{ problemText }}
    </p>
  </div>
  <p v-else-if="problemText" role="alert" class="text-sm text-ink-gray-5">
    {{ problemText }}
  </p>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Button, FeatherIcon, LoadingIndicator } from 'frappe-ui'
import { archivosApi, problem } from '@/composables/useArchivos'
import {
  OCR_POLL_LIMIT_MS,
  OCR_POLL_MS,
  connectorMethod,
  ocrReadable,
  ocrStep,
} from '@/utils/archivosConectores'

// «Read text (OCR)»: sends the original to the company's Paperless and brings
// its text back into the document. The lead places it in ArchivoDetail.
const props = defineProps({
  document: { type: String, required: true },
  mediaType: { type: String, default: '' },
})
const emit = defineEmits(['text'])

const status = ref(null),
  requesting = ref(false),
  problemText = ref(''),
  stale = ref(false),
  watching = ref(false)
// A finished reading that brought no text says so instead of «Text ready».
const emptyText = computed(
  () => ocrStep(status.value?.task)?.tone === 'done' && !status.value?.has_text,
)
const step = computed(() =>
  emptyText.value ? null : ocrStep(status.value?.task),
)
const working = computed(() => step.value?.tone === 'busy')

let timer = null,
  startedAt = 0,
  alive = true
function stop() {
  if (timer) clearTimeout(timer)
  timer = null
}
function schedule() {
  stop()
  if (!alive) return
  if (Date.now() - startedAt > OCR_POLL_LIMIT_MS) {
    stale.value = true
    return
  }
  timer = setTimeout(poll, OCR_POLL_MS)
}
async function poll() {
  try {
    const next = await archivosApi(connectorMethod('ocr_status'), {
      document: props.document,
    })
    if (!alive) return
    status.value = next
    problemText.value = ''
    const tone = ocrStep(next.task)?.tone
    if (tone === 'busy') schedule()
    else if (tone === 'done' && watching.value)
      emit('text', next.extracted_text || '')
  } catch (error) {
    if (!alive) return
    // A dropped poll is retried until the time limit; the state stays shown.
    problemText.value = problem(error).message
    schedule()
  }
}
function follow() {
  watching.value = true
  stale.value = false
  startedAt = Date.now()
  schedule()
}
async function request() {
  requesting.value = true
  problemText.value = ''
  try {
    const next = await archivosApi(connectorMethod('request_ocr'), {
      document: props.document,
    })
    status.value = next
    const tone = ocrStep(next.task)?.tone
    if (tone === 'busy') follow()
    else if (tone === 'done') {
      watching.value = true
      emit('text', next.extracted_text || '')
    }
  } catch (error) {
    problemText.value = problem(error).message
  } finally {
    requesting.value = false
  }
}
function resume() {
  follow()
  poll()
}

onMounted(async () => {
  // Text, CSV and XML files already show their text: no OCR to offer.
  if (props.mediaType && !ocrReadable(props.mediaType)) return
  try {
    status.value = await archivosApi(connectorMethod('ocr_status'), {
      document: props.document,
    })
    // A reading already under way (another tab, an earlier click) is followed.
    if (ocrStep(status.value?.task)?.tone === 'busy') follow()
  } catch (error) {
    problemText.value = problem(error).message
  }
})
onBeforeUnmount(() => {
  alive = false
  stop()
})
</script>
