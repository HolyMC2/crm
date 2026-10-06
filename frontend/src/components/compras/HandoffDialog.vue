<template>
  <Dialog v-model="open" :options="{ title: title }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-base text-ink-gray-7">{{ reason }}</p>
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Looking for who can help…') }}
        </p>
        <template v-else-if="options">
          <FormControl
            v-if="options.candidates.length"
            v-model="assignee"
            type="select"
            :label="__('Who should do it')"
            :options="[
              { label: __('Choose a person'), value: '' },
              ...options.candidates.map((c) => ({
                label: c.full_name,
                value: c.user,
              })),
            ]"
          />
          <p v-else class="rounded-lg bg-surface-gray-2 p-3 text-sm">
            {{
              __(
                'Nobody here can do it yet. The request goes to the administrators with this purchase attached.',
              )
            }}
          </p>
          <FormControl
            v-model="note"
            type="textarea"
            :label="__('Note (optional)')"
            :placeholder="__('E.g. the supplier delivers on Monday')"
          />
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
        <p v-if="sent" role="status" class="text-sm text-ink-green-7">
          {{ sent }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, 'Compras')" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Send request')"
          :loading="sending"
          :disabled="!options || (options.candidates.length && !assignee)"
          @click="send"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import { comprasApi, problemOf, requestId } from '@/composables/useCompras'

// «Pedir confirmación / acceso / revisión»: a ToDo on this exact purchase for an
// eligible person (or the administrators), deduplicated by the server.
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  action: { type: String, default: '' },
  title: { type: String, default: '' },
  reason: { type: String, default: '' },
})
const emit = defineEmits(['sent'])
const open = defineModel({ type: Boolean, default: false })
const options = ref(null)
const loading = ref(false)
const sending = ref(false)
const assignee = ref('')
const note = ref('')
const problem = ref('')
const sent = ref('')
let rid = requestId()

watch(open, async (value) => {
  if (!value) return
  options.value = null
  assignee.value = ''
  problem.value = ''
  sent.value = ''
  rid = requestId()
  loading.value = true
  try {
    options.value = await comprasApi('handoff_options', {
      doctype: props.doctype,
      name: props.name,
      action: props.action,
    })
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
})
async function send() {
  sending.value = true
  problem.value = ''
  try {
    const result = await comprasApi('request_handoff', {
      request_id: rid,
      doctype: props.doctype,
      name: props.name,
      action: props.action,
      assignee: assignee.value,
      note: note.value,
    })
    sent.value = __('Request sent to {0}.', [result.assigned.join(', ')])
    emit('sent', result)
  } catch (error) {
    // Same request id on retry: a lost answer is not a second request.
    problem.value = problemOf(error).detail
  } finally {
    sending.value = false
  }
}
</script>
