<template>
  <section
    class="space-y-3 rounded-lg border border-outline-gray-2 bg-surface-base p-4"
    :aria-label="__('Receive a file')"
  >
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-ink-gray-9">
          {{
            target ? __('Receive for {0}', [targetLabel]) : __('Receive a file')
          }}
        </h2>
        <p class="text-sm text-ink-gray-6">
          {{
            target
              ? __('When it arrives, confirm the link to this record.')
              : __('It waits in «To classify» until you link it.')
          }}
        </p>
      </div>
    </div>
    <label
      class="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded bg-surface-gray-10 px-4 text-base font-medium text-ink-base focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4 sm:hidden"
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
    <!-- Drop or choose: the whole box takes the file -->
    <label
      class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4"
      :class="
        dragging
          ? 'border-outline-gray-5 bg-surface-gray-2'
          : file
            ? 'border-outline-gray-3 bg-surface-gray-1'
            : 'border-outline-gray-2 hover:bg-surface-gray-1'
      "
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <FeatherIcon
        :name="file ? 'file-text' : 'upload-cloud'"
        class="h-6 w-6 text-ink-gray-5"
      />
      <span v-if="file" class="max-w-full truncate text-base text-ink-gray-9">
        {{ file.name }} · {{ formatBytes(file.size) }}
      </span>
      <span v-else class="text-base text-ink-gray-8">
        {{ __('Drop a file here or') }}
        <span class="font-medium underline">{{ __('choose one') }}</span>
      </span>
      <span class="text-xs text-ink-gray-5">
        {{ file ? __('Choose another file') : acceptText }}
      </span>
      <input type="file" :accept="ACCEPT" class="sr-only" @change="pick" />
    </label>
    <fieldset class="space-y-1 text-sm text-ink-gray-8">
      <legend class="mb-1 text-sm font-medium text-ink-gray-8">
        {{ __('Who can see it') }}
      </legend>
      <label class="flex min-h-11 items-start gap-2 sm:min-h-0">
        <input v-model="visibility" class="mt-1" type="radio" value="Private" />
        <span>
          {{ __('Only me') }}
          <span class="block text-xs text-ink-gray-5">{{
            __('For personal receipts. You can share it later.')
          }}</span>
        </span>
      </label>
      <label class="flex min-h-11 items-start gap-2 sm:min-h-0">
        <input v-model="visibility" class="mt-1" type="radio" value="Company" />
        <span>
          {{ __('Everyone in {0}', [company]) }}
          <span class="block text-xs text-ink-gray-5">{{
            __('A teammate can review and link it for you.')
          }}</span>
        </span>
      </label>
    </fieldset>
    <p v-if="problemText" role="alert" class="text-sm text-ink-red-7">
      {{ problemText }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
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
      <a
        href="/desk/documentos?clasico=1"
        class="ml-auto inline-flex min-h-11 items-center gap-1 rounded px-2 text-sm text-ink-gray-6 hover:text-ink-gray-9 sm:min-h-8"
        ><FeatherIcon name="paperclip" class="h-3.5 w-3.5" />{{
          __('From an ERP or mail attachment')
        }}</a
      >
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
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
  // A file dropped on the page before this panel opened.
  initialFile: { type: Object, default: null },
})
const emit = defineEmits(['received', 'cancel'])
const file = ref(null),
  visibility = ref('Private'),
  sending = ref(false),
  problemText = ref(''),
  dragging = ref(false)
const targetLabel = computed(
  () => props.target?.title || props.target?.name || '',
)
const acceptText = computed(() =>
  __('PDF, JPG or PNG photo, SAT XML, CSV or TXT · up to {0} MB', [
    props.limitMb,
  ]),
)
function take(chosen) {
  problemText.value = uploadProblem(chosen, props.limitMb)
  file.value = problemText.value ? null : chosen
}
function pick(event) {
  const chosen = event.target.files?.[0] || null
  event.target.value = ''
  take(chosen)
}
function onDrop(event) {
  dragging.value = false
  const chosen = event.dataTransfer?.files?.[0]
  if (chosen) take(chosen)
}
watch(
  () => props.initialFile,
  (value) => value && take(value),
  { immediate: true },
)
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
