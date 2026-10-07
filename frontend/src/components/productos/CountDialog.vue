<template>
  <Dialog v-model="open" :options="{ title: __('Ask for a count') }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'Stock is corrected by counting it. The person counts in Escáner and the difference is reviewed before the stock changes.',
            )
          }}
        </p>
        <FormControl
          v-model="warehouse"
          type="select"
          :label="__('Store', null, 'Productos')"
          :options="[
            { label: __('Choose a store'), value: '' },
            ...stores.map((row) => ({
              label: row.label,
              value: row.warehouse,
            })),
          ]"
        />
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Looking for who can count…') }}
        </p>
        <template v-else-if="options">
          <FormControl
            v-if="options.workers?.length"
            v-model="assignee"
            type="select"
            :label="__('Who counts')"
            :options="[
              { label: __('Choose a person'), value: '' },
              ...options.workers.map((w) => ({
                label: w.open_task
                  ? __('{0} (has a count today)', [w.full_name])
                  : w.full_name,
                value: w.user,
              })),
            ]"
          />
          <p v-else class="rounded-lg bg-surface-gray-2 p-3 text-sm">
            {{
              __(
                'Nobody can count in this store yet. Ask your manager to give a counter access to it in Escáner.',
              )
            }}
          </p>
          <p
            v-for="row in options.excluded || []"
            :key="row.user"
            class="text-sm text-ink-gray-6"
          >
            {{ __('{0}: {1}', [row.full_name, row.reason]) }}
          </p>
          <FormControl
            v-model="note"
            type="textarea"
            :label="__('Note (optional)')"
            :placeholder="__('E.g. check the back shelf too')"
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
          :label="__('Ask for the count')"
          :loading="sending"
          :disabled="!warehouse || !assignee || Boolean(sent)"
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
  outcomeUnknown,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// «Pedir conteo»: Escáner's own recount task for one store; its manager gate
// and counter rules decide, the review turns it into a Stock Reconciliation.
const props = defineProps({
  item: { type: String, required: true },
  stores: { type: Array, default: () => [] },
  store: { type: String, default: '' },
})
const emit = defineEmits(['sent'])
const open = defineModel({ type: Boolean, default: false })
const warehouse = ref('')
const options = ref(null)
const loading = ref(false)
const sending = ref(false)
const assignee = ref('')
const note = ref('')
const problem = ref('')
const sent = ref('')
let rid = requestId()

watch(open, (value) => {
  if (!value) return
  sent.value = ''
  problem.value = ''
  note.value = ''
  rid = requestId()
  warehouse.value =
    props.store || (props.stores.length === 1 ? props.stores[0].warehouse : '')
  if (warehouse.value) loadOptions()
})
watch(warehouse, (value, previous) => {
  if (open.value && value && value !== previous) loadOptions()
})

async function loadOptions() {
  options.value = null
  assignee.value = ''
  problem.value = ''
  loading.value = true
  try {
    options.value = await productosApi('count_options', {
      item: props.item,
      warehouse: warehouse.value,
    })
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}
async function send() {
  sending.value = true
  problem.value = ''
  try {
    const result = await productosApi('request_count', {
      request_id: rid,
      item: props.item,
      warehouse: warehouse.value,
      assignee: assignee.value,
      note: note.value,
    })
    sent.value = __('Count asked of {0}.', [result.assigned_to_name])
    emit('sent', result)
  } catch (error) {
    problem.value = problemOf(error).detail
    if (!outcomeUnknown(error)) rid = requestId()
  } finally {
    sending.value = false
  }
}
</script>
