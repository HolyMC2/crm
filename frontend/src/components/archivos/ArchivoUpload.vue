<template>
  <section
    class="space-y-3 rounded-lg border border-outline-gray-2 bg-surface-base p-4"
    :aria-label="__('Receive a file')"
  >
    <div class="flex flex-wrap items-center gap-2">
      <label
        class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded bg-surface-gray-7 px-4 text-base font-medium text-ink-base focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4 sm:hidden"
      >
        <FeatherIcon name="camera" class="h-4 w-4" />{{ __('Take photo') }}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          @change="pick"
        />
      </label>
      <label
        class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-outline-gray-2 px-4 text-base text-ink-gray-8 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4 sm:min-h-8"
      >
        <FeatherIcon name="upload" class="h-4 w-4" />{{ __('Choose file') }}
        <input type="file" :accept="ACCEPT" class="sr-only" @change="pick" />
      </label>
      <a
        href="/desk/documentos?clasico=1"
        class="inline-flex min-h-11 items-center gap-2 rounded px-2 text-sm text-ink-gray-7 underline hover:text-ink-gray-9 sm:min-h-8"
        >{{ __('From an ERP or mail attachment') }}</a
      >
      <span v-if="file" class="min-w-0 truncate text-sm text-ink-gray-7">
        {{ file.name }} · {{ formatBytes(file.size) }}
      </span>
    </div>
    <fieldset class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-gray-8">
      <legend class="mb-1 text-sm text-ink-gray-6">
        {{ __('Who can see it') }}
      </legend>
      <label class="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
        <input v-model="visibility" type="radio" value="Private" />
        {{ __('Only me (I can share it later)') }}
      </label>
      <label class="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
        <input v-model="visibility" type="radio" value="Company" />
        {{ __('Everyone in {0}', [company]) }}
      </label>
    </fieldset>
    <p v-if="problemText" role="alert" class="text-sm text-ink-red-7">
      {{ problemText }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        variant="solid"
        class="min-h-11 sm:min-h-0"
        :label="
          target ? __('Receive for {0}', [targetLabel]) : __('Receive file')
        "
        :loading="sending"
        :disabled="!file"
        @click="send"
      />
      <Button
        variant="ghost"
        class="min-h-11 sm:min-h-0"
        :label="__('Cancel')"
        @click="$emit('cancel')"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import {
  ACCEPT,
  archivosApi,
  formatBytes,
  problem,
  readBase64,
  uploadName,
  uploadProblem,
} from '@/composables/useArchivos'

const props = defineProps({
  company: { type: String, required: true },
  target: { type: Object, default: null },
  limitMb: { type: Number, default: 10 },
})
const emit = defineEmits(['received', 'cancel'])
const file = ref(null),
  visibility = ref('Private'),
  sending = ref(false),
  problemText = ref('')
const targetLabel = computed(
  () => props.target?.title || props.target?.name || '',
)
function pick(event) {
  const chosen = event.target.files?.[0] || null
  event.target.value = ''
  problemText.value = uploadProblem(chosen, props.limitMb)
  file.value = problemText.value ? null : chosen
}
async function send() {
  if (!file.value || sending.value) return
  // Send exactly what was chosen at the tap: a photo captured while this one is
  // on its way stays selected for its own send instead of being cleared.
  const submitted = file.value,
    company = props.company,
    shared = visibility.value
  sending.value = true
  problemText.value = ''
  try {
    // The same bytes always resolve to the same evidence, so a retry after a
    // dropped connection never creates a second original.
    const detail = await archivosApi('upload', {
      company,
      filename: uploadName(submitted),
      content: await readBase64(submitted),
      visibility: shared,
    })
    const pending = file.value !== submitted
    if (!pending) file.value = null
    emit('received', detail, { pending })
  } catch (error) {
    problemText.value = problem(error).message
  } finally {
    sending.value = false
  }
}
</script>
