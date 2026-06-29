<!--
  Inbox Lost-Reason prompt. The inbox writes deal status via frappe.client.set_value
  (composables/inbox.setStage), not a document resource, so it can't reuse the
  document-coupled Modals/LostReasonModal.vue. This is the inbox-native equivalent:
  driven by the shared `lostStagePrompt` state (set by requestStage when a Lost-type
  status is picked) and commits status + reason + notes together via commitLostStage,
  so CRM Deal.validate_lost_reason passes instead of silently rejecting the change.
-->
<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Motivo de cancelación') }"
    @close="onCancel"
  >
    <template #body-content>
      <div class="-mt-3 mb-4 text-p-base text-ink-gray-7">
        {{ __('Indica el motivo para marcar este trato como perdido.') }}
      </div>
      <div class="flex flex-col gap-3">
        <div>
          <div class="mb-2 text-sm text-ink-gray-5">
            {{ __('Lost Reason') }}
            <span class="text-ink-red-2">*</span>
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
            <span v-if="lostReason == 'Other'" class="text-ink-red-2">*</span>
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
        <div><ErrorMessage :message="error" /></div>
        <div class="flex gap-2">
          <Button :label="__('Cancel')" @click="onCancel" />
          <Button variant="solid" :loading="saving" :label="__('Save')" @click="save" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import Link from '@/components/Controls/Link.vue'
import { createDocument } from '@/composables/document'
import { Dialog } from 'frappe-ui'
import { ref, computed, watch } from 'vue'
import { lostStagePrompt, commitLostStage, cancelLostStage } from '@/composables/inbox'

const linkRef = ref(null)
const lostReason = ref('')
const lostNotes = ref('')
const error = ref('')
const saving = ref(false)

// The Dialog is open whenever a Lost stage is pending. Closing it (X / esc / Cancel)
// routes through cancelLostStage so the stage is abandoned, not half-applied.
const open = computed({
  get: () => !!lostStagePrompt.value,
  set: (v) => {
    if (!v) cancelLostStage()
  },
})

// Reset the fields each time a fresh prompt opens.
watch(lostStagePrompt, (p) => {
  if (p) {
    lostReason.value = ''
    lostNotes.value = ''
    error.value = ''
    saving.value = false
  }
})

function onCancel() {
  cancelLostStage()
}

async function save() {
  if (!lostReason.value) {
    error.value = __('Lost Reason is required')
    return
  }
  if (lostReason.value === 'Other' && !lostNotes.value) {
    error.value = __('Lost Notes are required when Lost Reason is "Other"')
    return
  }
  error.value = ''
  saving.value = true
  try {
    await commitLostStage(lostReason.value, lostNotes.value)
  } catch (e) {
    error.value = e?.messages?.[0] || e?.message || __('No se pudo guardar.')
    saving.value = false
    return
  }
  saving.value = false
}

function onCreate(value, close) {
  createDocument('CRM Lost Reason', { lost_reason: value }, close, (doc) => {
    lostReason.value = doc.name
    linkRef.value?.reload('', true)
  })
}
</script>
