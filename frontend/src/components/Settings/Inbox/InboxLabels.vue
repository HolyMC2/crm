<template>
  <section :aria-labelledby="`${id}-labels`" class="flex flex-col gap-2">
    <h3 :id="`${id}-labels`" class="title-face text-lg font-semibold">
      {{ __('Conversation labels') }}
    </h3>
    <p class="text-p-sm text-ink-gray-5">
      {{
        __(
          'The team sorts and finds conversations with them. Deleting a label takes it off every conversation.',
        )
      }}
    </p>
    <p v-if="error" role="alert" class="text-p-sm text-ink-red-7">
      {{ error }}
    </p>
    <ul v-if="labels.length" class="divide-y divide-outline-gray-1">
      <li
        v-for="item in labels"
        :key="item.name"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
      >
        <span
          class="inline-flex max-w-full items-center rounded-4 border px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]"
          :class="labelColorClass(item.color)"
          >{{ item.name }}</span
        >
        <select
          :value="item.color || 'gray'"
          class="h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
          :aria-label="`${item.name}: ${__('Color')}`"
          :disabled="busy"
          @change="(event) => update(item, { color: event.target.value })"
        >
          <option v-for="c in COLORS" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </select>
        <input
          :value="item.description"
          class="h-8 min-w-0 flex-1 basis-40 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
          :placeholder="__('What it is for (optional)')"
          :aria-label="`${item.name}: ${__('Description')}`"
          :disabled="busy"
          @change="(event) => update(item, { description: event.target.value })"
        />
        <button
          type="button"
          class="press flex h-8 items-center justify-center rounded-4 px-2 text-sm"
          :class="
            confirming === item.name
              ? 'bg-surface-red-2 text-ink-red-7'
              : 'text-ink-gray-6 hover:bg-surface-gray-2'
          "
          :aria-label="
            confirming === item.name
              ? __('Delete {0}', [item.name])
              : __('Delete label')
          "
          :title="__('Delete label')"
          :disabled="busy"
          @click="remove(item)"
        >
          <span v-if="confirming === item.name">{{ __('Delete') }}</span>
          <span v-else class="lucide-trash-2 size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-p-sm text-ink-gray-6">
      {{
        __(
          'No labels yet. Create the ones your team uses, for example «Factura», «Garantía» or «Mayoreo».',
        )
      }}
    </p>
    <form class="flex flex-wrap items-end gap-2 pt-1" @submit.prevent="create">
      <FormControl
        v-model="draft.name"
        class="min-w-0 flex-1 basis-40"
        :label="__('New label')"
        :maxlength="40"
        :placeholder="__('For example: Garantía')"
      />
      <FormControl
        v-model="draft.color"
        type="select"
        class="w-32"
        :label="__('Color')"
        :options="COLORS"
      />
      <Button
        type="submit"
        class="press"
        variant="subtle"
        :label="__('Create label')"
        :disabled="!draft.name.trim() || busy"
      />
    </form>
  </section>
</template>
<script setup>
import { onMounted, reactive, ref, useId } from 'vue'
import { Button, FormControl, call } from 'frappe-ui'
import { labelColorClass } from '@/components/Inbox/labelColors'

const DOCTYPE = 'CRM Conversation Label'
const COLORS = [
  { value: 'gray', label: __('Gray') },
  { value: 'blue', label: __('Blue') },
  { value: 'green', label: __('Green') },
  { value: 'amber', label: __('Amber') },
  { value: 'red', label: __('Red') },
  { value: 'violet', label: __('Violet') },
  { value: 'pink', label: __('Pink') },
  { value: 'cyan', label: __('Cyan') },
]
const emit = defineEmits(['changed'])
const id = useId()
const labels = ref([]),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  confirming = ref('')
const draft = reactive({ name: '', color: 'gray' })
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback

async function load() {
  loading.value = true
  try {
    labels.value = (await call('crm.api.inbox.list_labels')) || []
    emit('changed', labels.value)
  } catch (e) {
    error.value = message(e, __('The labels could not be loaded.'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function run(work, fallback) {
  busy.value = true
  error.value = ''
  try {
    await work()
    await load()
    return true
  } catch (e) {
    error.value = message(e, fallback)
    return false
  } finally {
    busy.value = false
  }
}
function update(item, fieldname) {
  return run(
    () =>
      call('frappe.client.set_value', {
        doctype: DOCTYPE,
        name: item.name,
        fieldname,
      }),
    __('The label was not saved. Try again.'),
  )
}
async function create() {
  const name = draft.name.trim()
  if (!name) return
  const ok = await run(
    () =>
      call('frappe.client.insert', {
        doc: { doctype: DOCTYPE, label_name: name, color: draft.color },
      }),
    __('The label was not created. Try again.'),
  )
  if (ok) Object.assign(draft, { name: '', color: 'gray' })
}
function remove(item) {
  if (confirming.value !== item.name) {
    confirming.value = item.name
    return
  }
  confirming.value = ''
  run(
    () => call('frappe.client.delete', { doctype: DOCTYPE, name: item.name }),
    __('The label was not deleted. Try again.'),
  )
}
</script>
