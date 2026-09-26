<template>
  <section
    class="rounded border border-outline-gray-2 bg-surface-base p-4 space-y-3"
    aria-labelledby="report-records-heading"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2
        id="report-records-heading"
        ref="heading"
        tabindex="-1"
        class="text-lg font-semibold"
      >
        {{ title }}
      </h2>
      <button class="report-button" @click="$emit('close')">
        {{ __('Close records') }}
      </button>
    </div>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'These records use the report’s applied filters and your current permissions.',
        )
      }}
    </p>
    <p v-if="loading" role="status">{{ __('Loading records…') }}</p>
    <div v-if="error" role="alert">
      <p>{{ error }}</p>
      <button class="report-button" :disabled="loading" @click="load(false)">
        {{ __('Retry records') }}
      </button>
    </div>
    <p v-if="!loading && !error">{{ __('{0} matching records', [total]) }}</p>
    <ul class="space-y-2">
      <li
        v-for="row in items"
        :key="row.name"
        class="rounded border border-outline-gray-2 p-3"
      >
        <a
          v-if="kind === 'tasks'"
          :href="`/app/crm-task/${encodeURIComponent(row.name)}`"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-11 max-w-full items-center break-words font-medium underline"
          >{{ row.title || row.name }}</a
        >
        <RouterLink
          v-else
          :to="recordRoute(row)"
          class="inline-flex min-h-11 max-w-full items-center break-words font-medium underline"
          >{{
            row.lead_name || row.deal_name || row.title || row.name
          }}</RouterLink
        >
        <p class="break-words text-sm text-ink-gray-6">
          {{ row.name }} · {{ row.status }} ·
          {{
            row.lead_owner ||
            row.deal_owner ||
            row.assigned_to ||
            __('Unassigned')
          }}
        </p>
        <p v-if="kind === 'tasks'" class="text-sm">
          {{ __('Due') }}: {{ row.due_date || __('No due date') }}
        </p>
        <RouterLink
          v-if="kind === 'tasks' && parentRoute(row)"
          :to="parentRoute(row)"
          class="inline-flex min-h-11 items-center text-sm underline"
          >{{ __('Open related record') }}</RouterLink
        >
      </li>
    </ul>
    <button
      v-if="hasMore"
      class="report-button"
      :disabled="loading"
      @click="load(true)"
    >
      {{ __('Load more records') }}
    </button>
  </section>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { call } from 'frappe-ui'
const props = defineProps({
  filters: { type: Object, required: true },
  bucket: { type: Object, required: true },
  kind: { type: String, required: true },
  title: { type: String, default: '' },
  returnTo: { type: String, required: true },
})
defineEmits(['close'])
const items = ref([]),
  total = ref(0),
  hasMore = ref(false),
  nextOffset = ref(0),
  loading = ref(false),
  error = ref(''),
  heading = ref(null)
let epoch = 0
async function load(more = false) {
  const current = ++epoch
  loading.value = true
  error.value = ''
  if (!more) items.value = []
  try {
    const data = await call('crm.api.sales_reports.get_records', {
      filters: { ...props.filters },
      kind: props.kind,
      bucket: { ...props.bucket },
      offset: more ? nextOffset.value : 0,
    })
    if (current !== epoch) return
    items.value = more ? [...items.value, ...data.items] : data.items
    total.value = data.total
    hasMore.value = data.has_more
    nextOffset.value = data.next_offset
    if (!more) {
      await nextTick()
      heading.value?.focus()
    }
  } catch (err) {
    if (current === epoch)
      error.value =
        err?.exc_type === 'PermissionError'
          ? __('You do not have permission to view these report records.')
          : __(
              'Unable to load records. Retry without changing the report filters.',
            )
  } finally {
    if (current === epoch) loading.value = false
  }
}
function recordRoute(row) {
  return {
    name: props.kind === 'leads' ? 'Lead' : 'Deal',
    params:
      props.kind === 'leads' ? { leadId: row.name } : { dealId: row.name },
    query: { returnTo: props.returnTo },
  }
}
function parentRoute(row) {
  if (
    !['CRM Lead', 'CRM Deal'].includes(row.reference_doctype) ||
    !row.reference_docname
  )
    return null
  return {
    name: row.reference_doctype === 'CRM Lead' ? 'Lead' : 'Deal',
    params:
      row.reference_doctype === 'CRM Lead'
        ? { leadId: row.reference_docname }
        : { dealId: row.reference_docname },
    query: { returnTo: props.returnTo },
  }
}
watch(
  () => [props.filters, props.kind, props.bucket],
  () => load(),
  { immediate: true, deep: true },
)
onBeforeUnmount(() => {
  epoch++
})
</script>
