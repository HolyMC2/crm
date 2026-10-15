<!--
  Lost reason for a deal dropped on a Lost column of the deals board (S1.4).
  Same rule as Deal 360 (LostStagePrompt): a Lost stage needs its reason, and
  status + reason + notes are written together so CRM Deal.validate_lost_reason
  passes. The board owns the write; this dialog only collects the reason.
-->
<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Motivo de cancelación') }"
    @close="emit('cancel')"
  >
    <template #body-content>
      <div class="-mt-3 mb-4 text-p-base text-ink-gray-7">
        {{ __('Indica el motivo para marcar este trato como perdido.') }}
      </div>
      <div class="flex flex-col gap-3">
        <div>
          <div class="mb-2 text-sm text-ink-gray-5">
            {{ __('Lost Reason') }}
            <span class="text-ink-red-5">*</span>
          </div>
          <Link
            ref="linkRef"
            class="form-control flex-1 truncate"
            :value="lostReason"
            doctype="CRM Lost Reason"
            :onCreate="onCreate"
            @change="(v) => (lostReason = v)"
          />
        </div>
        <div>
          <div class="mb-2 text-sm text-ink-gray-5">
            {{ __('Lost Notes') }}
            <span v-if="lostReason == 'Other'" class="text-ink-red-5">*</span>
          </div>
          <FormControl
            class="form-control flex-1 truncate"
            type="textarea"
            :value="lostNotes"
            @change="(e) => (lostNotes = e.target.value)"
          />
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex items-center justify-between gap-2">
        <div><ErrorMessage :message="error || pendingError" /></div>
        <div class="flex gap-2">
          <Button :label="__('Cancel')" @click="emit('cancel')" />
          <Button
            variant="solid"
            :loading="saving"
            :label="__('Save')"
            @click="save"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import Link from '@/components/Controls/Link.vue'
import { createDocument } from '@/composables/document'
import { Dialog, FormControl, Button, ErrorMessage } from 'frappe-ui'
import { ref, computed, watch } from 'vue'

const props = defineProps({
  // { row, status } while a Lost drop waits for its reason, else null
  pending: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  // the server's refusal of the last attempt, shown in place
  pendingError: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'cancel'])

const linkRef = ref(null)
const lostReason = ref('')
const lostNotes = ref('')
const error = ref('')

const open = computed({
  get: () => !!props.pending,
  set: (v) => {
    if (!v) emit('cancel')
  },
})

watch(
  () => props.pending,
  (p) => {
    if (p) {
      lostReason.value = ''
      lostNotes.value = ''
      error.value = ''
    }
  },
)

function save() {
  if (!lostReason.value) {
    error.value = __('Lost Reason is required')
    return
  }
  if (lostReason.value === 'Other' && !lostNotes.value) {
    error.value = __('Lost Notes are required when Lost Reason is "Other"')
    return
  }
  error.value = ''
  emit('confirm', lostReason.value, lostNotes.value)
}

function onCreate(value, close) {
  createDocument('CRM Lost Reason', { lost_reason: value }, close, (doc) => {
    lostReason.value = doc.name
    linkRef.value?.reload('', true)
  })
}
</script>
