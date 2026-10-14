<template>
  <Dialog v-model="open" :options="{ title }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-sm text-ink-gray-7">
          {{
            task
              ? __(
                  'The count stays the same; another person counts it in Escáner.',
                )
              : __(
                  'Stock is corrected by counting it. The person counts in Escáner and the difference is reviewed before the stock changes.',
                )
          }}
        </p>
        <FormControl
          v-if="!task && groups.length > 1"
          v-model="warehouse"
          type="select"
          :label="__('Store', null, 'Productos')"
          :options="[
            { label: __('Choose a store'), value: '' },
            ...groups.map((g) => ({
              label:
                g.items.length > 1
                  ? __('{0} ({1} products)', [g.label, g.items.length])
                  : g.label,
              value: g.warehouse,
            })),
          ]"
        />
        <p v-if="!task && items.length" class="text-sm text-ink-gray-8">
          {{
            items.length === 1
              ? __('{0} in {1}', [items[0].title || items[0].name, storeLabel])
              : __('{0} products in {1}', [items.length, storeLabel])
          }}
          <span
            v-if="groups.length > 1"
            class="block text-xs text-ink-gray-6"
            >{{
              __(
                'One store at a time: the products of the other stores stay selected.',
              )
            }}</span
          >
        </p>
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Looking for who can count…') }}
        </p>
        <template v-else-if="options && options.mode === 'ask'">
          <p class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7">
            {{ options.reason }}
          </p>
          <FormControl
            v-if="options.managers?.length"
            v-model="assignee"
            type="select"
            :label="__('Who assigns counts there')"
            :options="[
              { label: __('Choose a person'), value: '' },
              ...options.managers.map((m) => ({
                label: m.full_name,
                value: m.user,
              })),
            ]"
          />
          <p v-else class="rounded-lg bg-surface-gray-2 p-3 text-sm">
            {{
              __(
                'Nobody manages counts in this store yet: the request goes to the administrators.',
              )
            }}
          </p>
          <FormControl
            v-model="note"
            type="textarea"
            :label="__('Note (optional)')"
            :placeholder="__('E.g. we sold more than we had')"
          />
        </template>
        <template v-else-if="options">
          <FormControl
            v-if="options.workers?.length"
            v-model="assignee"
            type="select"
            :label="__('Who counts')"
            :options="[
              { label: __('Choose a person'), value: '' },
              ...options.workers
                .filter((w) => !task || w.user !== task.assigned_to)
                .map((w) => ({
                  label: workerLabel(w),
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
          <template v-if="!task">
            <FormControl
              v-model="day"
              type="date"
              :label="__('Count on')"
              :min="options.today"
              :max="options.max_date"
            />
            <FormControl
              v-model="note"
              type="textarea"
              :label="__('Note (optional)')"
              :placeholder="__('E.g. check the back shelf too')"
            />
          </template>
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
        <div v-if="sent" role="status" class="text-sm text-ink-green-7">
          <p>{{ sent.text }}</p>
          <p
            v-for="row in sent.skipped"
            :key="row.item"
            class="text-ink-gray-7"
          >
            {{ __('{0}: {1}', [row.item, row.reason]) }}
          </p>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="__('Close', null, 'Productos')"
          class="min-h-11 sm:min-h-8"
          @click="open = false"
        />
        <Button
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="sendLabel"
          :loading="sending"
          :disabled="!canSend"
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
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// «Pedir conteo a…» for one or many products of a store: Escáner's own
// recount (its manager gate, counter rules and drift guard), optionally for a
// later day. A worker who cannot assign counts asks the store's conteo
// manager instead (a ToDo on the store). With `task`, «Reasignar» an open
// count. The review in Escáner turns a count into a Stock Reconciliation.
const props = defineProps({
  // [{ warehouse, label, items: [{ name, title }] }]
  groups: { type: Array, default: () => [] },
  store: { type: String, default: '' },
  // { task, warehouse, warehouse_label, assigned_to } to reassign it
  task: { type: Object, default: null },
})
const emit = defineEmits(['sent'])
const open = defineModel({ type: Boolean, default: false })
const warehouse = ref('')
const options = ref(null)
const loading = ref(false)
const sending = ref(false)
const assignee = ref('')
const note = ref('')
const day = ref('')
const problem = ref('')
const sent = ref(null)
let rid = requestId()

const group = computed(() =>
  props.groups.find((g) => g.warehouse === warehouse.value),
)
const items = computed(() => group.value?.items || [])
const storeLabel = computed(
  () =>
    group.value?.label || props.task?.warehouse_label || warehouse.value || '',
)
const title = computed(() =>
  props.task
    ? __('Reassign the count')
    : options.value?.mode === 'ask'
      ? __('Ask the manager for a count')
      : __('Ask for a count'),
)
const sendLabel = computed(() =>
  props.task
    ? __('Reassign')
    : options.value?.mode === 'ask'
      ? __('Send the request')
      : __('Ask for the count'),
)
const canSend = computed(() => {
  if (sent.value || !warehouse.value || !options.value) return false
  if (props.task) return Boolean(assignee.value)
  if (!items.value.length) return false
  if (options.value.mode === 'ask')
    return Boolean(assignee.value || !options.value.managers?.length)
  return Boolean(assignee.value)
})

function workerLabel(worker) {
  const conflicts = worker.conflicts?.length || 0
  if (worker.open_task && conflicts)
    return __('{0} (has a count today; counted the last difference of {1})', [
      worker.full_name,
      conflicts,
    ])
  if (worker.open_task) return __('{0} (has a count today)', [worker.full_name])
  if (conflicts)
    return __('{0} (counted the last difference of {1})', [
      worker.full_name,
      conflicts,
    ])
  return worker.full_name
}

watch(open, (value) => {
  if (!value) return
  sent.value = null
  problem.value = ''
  rid = requestId()
  const preferred = props.task?.warehouse || props.store
  warehouse.value = props.groups.some((g) => g.warehouse === preferred)
    ? preferred
    : props.task?.warehouse ||
      (props.groups.length === 1 ? props.groups[0].warehouse : '')
  if (warehouse.value) loadOptions()
  else options.value = null
})
watch(warehouse, (value, previous) => {
  if (open.value && value && value !== previous) loadOptions()
})

async function loadOptions() {
  const keep = assignee.value
  options.value = null
  problem.value = ''
  loading.value = true
  try {
    options.value = await productosApi('count_options', {
      warehouse: warehouse.value,
      items: props.task ? [] : items.value.map((item) => item.name),
    })
    const people =
      options.value.mode === 'ask'
        ? options.value.managers || []
        : options.value.workers || []
    // The chosen person survives a reload when they are still offered.
    assignee.value = people.some((p) => p.user === keep) ? keep : ''
    if (!day.value || day.value < options.value.today)
      day.value = options.value.today || ''
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
    if (props.task) {
      const result = await productosApi('reassign_count', {
        request_id: rid,
        task: props.task.task,
        assignee: assignee.value,
      })
      sent.value = {
        text: __('Count reassigned to {0}.', [result.assigned_to_name]),
        skipped: [],
      }
      emit('sent', { ...result, kind: 'reassign' })
    } else if (options.value.mode === 'ask') {
      const result = await productosApi('ask_count', {
        request_id: rid,
        warehouse: warehouse.value,
        items: items.value.map((item) => item.name),
        assignee: assignee.value,
        note: note.value,
      })
      sent.value = {
        text: result.already
          ? __(
              '{0} already had a request for this store; your list was added to it.',
              [result.assigned.join(', ')],
            )
          : __('Asked of {0}.', [result.assigned.join(', ')]),
        skipped: result.skipped || [],
      }
      emit('sent', { ...result, kind: 'ask' })
    } else {
      const result = await productosApi('request_counts', {
        request_id: rid,
        warehouse: warehouse.value,
        items: items.value.map((item) => item.name),
        assignee: assignee.value,
        note: note.value,
        date: day.value === options.value.today ? '' : day.value,
      })
      sent.value = {
        text:
          result.date === options.value.today
            ? __('Count of {0} product(s) asked of {1} for today.', [
                result.done.length,
                result.assigned_to_name,
              ])
            : __('Count of {0} product(s) asked of {1} for {2}.', [
                result.done.length,
                result.assigned_to_name,
                result.date,
              ]),
        skipped: result.skipped || [],
      }
      emit('sent', { ...result, kind: 'count' })
    }
  } catch (error) {
    // The choice and the note stay; a lost answer keeps its request id.
    problem.value = problemOf(error).detail
    if (!outcomeUnknown(error)) rid = requestId()
  } finally {
    sending.value = false
  }
}
</script>
