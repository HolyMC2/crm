<template>
  <Dialog v-model="open" :options="{ title: title }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-base text-ink-gray-7">{{ plain(reason) }}</p>
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
                'Nobody here can do it yet. The request goes to the administrators with this product attached.',
              )
            }}
          </p>
          <FormControl
            v-if="kind === 'price'"
            v-model="proposed"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            :label="
              priceList
                ? __('Proposed price in {0}', [priceList])
                : __('Proposed price')
            "
          />
          <FormControl
            v-model="note"
            type="textarea"
            :label="__('Note (optional)')"
            :placeholder="placeholder"
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
        <Button :label="__('Close', null, 'Productos')" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Send request')"
          :loading="sending"
          :disabled="
            !options ||
            Boolean(sent) ||
            (options.candidates.length && !assignee)
          "
          @click="send"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  outcomeUnknown,
  plain,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// «Pedir cambio», «Pedir cambio de precio», «Pedir configuración»: a ToDo on
// this product for someone who can do it (or the administrators), through
// the native assignment; the server deduplicates and replays.
const props = defineProps({
  item: { type: String, required: true },
  kind: { type: String, default: 'data' },
  reason: { type: String, default: '' },
  priceList: { type: String, default: '' },
  proposedRate: { type: [String, Number], default: '' },
})
const emit = defineEmits(['sent'])
const open = defineModel({ type: Boolean, default: false })
const options = ref(null)
const loading = ref(false)
const sending = ref(false)
const assignee = ref('')
const note = ref('')
const proposed = ref('')
const problem = ref('')
const sent = ref('')
let rid = requestId()

const title = computed(
  () =>
    ({
      price: __('Ask for a price change'),
      setup: __('Ask for price setup'),
      data: __('Ask for a product change'),
    })[props.kind] || __('Ask for a product change'),
)
const placeholder = computed(() =>
  props.kind === 'data'
    ? __('E.g. the name should include the brand')
    : __('E.g. the supplier raised the cost'),
)

watch(open, async (value) => {
  if (!value) return
  options.value = null
  assignee.value = ''
  note.value = ''
  proposed.value = props.proposedRate ? String(props.proposedRate) : ''
  problem.value = ''
  sent.value = ''
  rid = requestId()
  loading.value = true
  try {
    options.value = await productosApi('request_options', {
      item: props.item,
      kind: props.kind,
      price_list: props.priceList,
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
    const result = await productosApi('request_change', {
      request_id: rid,
      item: props.item,
      kind: props.kind,
      price_list: props.priceList,
      proposed_rate: props.kind === 'price' ? proposed.value : '',
      note: note.value,
      assignee: assignee.value,
    })
    sent.value = result.already
      ? __('Already asked: {0} has it in their pendientes.', [
          result.assigned.join(', '),
        ])
      : __('Request sent to {0}.', [result.assigned.join(', ')])
    emit('sent', result)
  } catch (error) {
    // Same request id on retry after a lost answer: not a second request.
    problem.value = problemOf(error).detail
    if (!outcomeUnknown(error)) rid = requestId()
  } finally {
    sending.value = false
  }
}
</script>
