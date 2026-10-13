<template>
  <Dialog
    :model-value="modelValue"
    :options="{ title: __(`Don't approve`) }"
    @update:model-value="close"
  >
    <template #body-content>
      <div class="space-y-3">
        <p v-if="title" class="text-base text-ink-gray-8">{{ title }}</p>
        <FormControl
          v-model="reason"
          type="textarea"
          :rows="3"
          :maxlength="1000"
          :label="__('Why not? The person who asked will read it.')"
          :aria-invalid="missing ? 'true' : undefined"
        />
        <p v-if="missing" role="alert" class="text-sm text-ink-red-7">
          {{ __('Write why, so they know what to change.') }}
        </p>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Cancel')"
          @click="close(false)"
        />
        <Button
          variant="solid"
          theme="red"
          class="min-h-11 sm:min-h-8"
          :loading="busy"
          :label="__(`Don't approve`)"
          @click="send"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  aprobacionesApi,
  approvalError,
  requestId,
} from '@/composables/useAprobaciones'

// «No aprobar» on an ask: the reason is required and goes to whoever asked.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  todo: { type: String, default: '' },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'declined'])
const reason = ref(''),
  missing = ref(false),
  problem = ref(null),
  busy = ref(false)
// One id per answer: a retry after a lost response is the same «No aprobar».
let attempt = null

watch(
  () => [props.modelValue, props.todo],
  ([open]) => {
    if (open) return
    reason.value = ''
    missing.value = false
    problem.value = null
    attempt = null
  },
)

function close(value) {
  if (!value && !busy.value) emit('update:modelValue', false)
}

async function send() {
  if (busy.value) return
  problem.value = null
  missing.value = !reason.value.trim()
  if (missing.value) return
  busy.value = true
  attempt ||= requestId()
  try {
    const answer = await aprobacionesApi('decline', {
      todo: props.todo,
      reason: reason.value.trim(),
      request_id: attempt,
    })
    emit('declined', answer)
    emit('update:modelValue', false)
  } catch (error) {
    problem.value = approvalError(error)
  } finally {
    busy.value = false
  }
}
</script>
