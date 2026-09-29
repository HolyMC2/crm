<template>
  <section
    class="min-w-0 rounded-lg border border-outline-gray-2 bg-surface-base p-4 space-y-3"
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
        {{ __('Back to report') }}
      </button>
    </div>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'These records use the report’s applied filters and your current permissions.',
        )
      }}
    </p>
    <div v-if="loading" role="status" class="space-y-3">
      <span class="sr-only">{{ __('Loading records…') }}</span>
      <div
        v-for="n in 3"
        :key="n"
        class="h-20 rounded bg-surface-gray-2 motion-safe:animate-pulse"
      />
    </div>
    <div v-if="error" role="alert">
      <p>{{ error }}</p>
      <button class="report-button" :disabled="loading" @click="load(false)">
        {{ __('Retry records') }}
      </button>
    </div>
    <ul
      v-if="drill"
      class="flex flex-wrap gap-x-3 gap-y-1 break-words text-sm text-ink-gray-6"
      :aria-label="__('Record filters')"
    >
      <li>{{ drill.doctype }}</li>
      <li v-for="(text, index) in drillSummary" :key="index">{{ text }}</li>
    </ul>
    <p v-else class="break-words text-sm text-ink-gray-6">
      {{ __('Created {0} through {1}', [filters.from_date, filters.to_date])
      }}<span v-if="filters.owner">
        · {{ __('Owner: {0}', [filters.owner]) }}</span
      ><span v-if="filters.pipeline">
        · {{ __('Pipeline: {0}', [filters.pipeline]) }}</span
      ><span v-if="filters.company">
        · {{ __('Company: {0}', [filters.company]) }}</span
      >
    </p>
    <p v-if="!loading && !error">{{ __('{0} matching records', [total]) }}</p>
    <p
      v-if="!loading && !error && !items.length"
      class="py-6 text-sm text-ink-gray-6"
    >
      {{
        __('No matching records. Return to the report to change the filters.')
      }}
    </p>
    <ul class="space-y-2">
      <li
        v-for="row in items"
        :key="row.name"
        class="min-w-0 rounded border border-outline-gray-2 p-3"
      >
        <component
          :is="genericLink(row).to ? RouterLink : 'a'"
          v-if="drill"
          v-bind="genericLink(row)"
          class="inline-flex min-h-11 max-w-full items-center break-words font-medium underline"
          >{{ row.lead_name || row.full_name || row.name }}</component
        >
        <a
          v-else-if="kind === 'tasks'"
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
        <p v-if="drill" class="break-words text-sm text-ink-gray-6">
          {{
            [row.name, row.status, row.lead_owner || row.deal_owner]
              .filter(Boolean)
              .join(' · ')
          }}
        </p>
        <p v-else class="break-words text-sm text-ink-gray-6">
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { call } from 'frappe-ui'
const props = defineProps({
  filters: { type: Object, required: true },
  bucket: { type: Object, default: () => ({}) },
  kind: { type: String, default: '' },
  // A server drill {doctype, filters, or_filters}: list exactly those records
  // through the standard list API (viewer permissions apply).
  drill: { type: Object, default: null },
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
  if (!more) {
    items.value = []
    hasMore.value = false
    await nextTick()
    heading.value?.focus()
    heading.value?.scrollIntoView?.({ block: 'nearest' })
  }
  try {
    const data = props.drill
      ? await loadDrill(more)
      : await call('crm.api.sales_reports.get_records', {
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
const PAGE = 20
const drillFields = {
  'CRM Lead': ['name', 'lead_name', 'status', 'lead_owner'],
  'CRM Deal': ['name', 'status', 'deal_owner'],
  Contact: ['name', 'full_name'],
}
async function loadDrill(more) {
  const args = {
    doctype: props.drill.doctype,
    filters: props.drill.filters,
    or_filters: props.drill.or_filters?.length ? props.drill.or_filters : [],
  }
  const offset = more ? nextOffset.value : 0
  const [rows, count] = await Promise.all([
    call('frappe.client.get_list', {
      ...args,
      fields: drillFields[args.doctype] || ['name'],
      order_by: 'creation desc',
      limit_start: offset,
      limit_page_length: PAGE,
    }),
    more ? total.value : call('frappe.desk.reportview.get_count', args),
  ])
  return {
    items: rows,
    total: count,
    has_more: offset + rows.length < count,
    next_offset: offset + rows.length,
  }
}
const spaRoutes = {
  'CRM Lead': ['Lead', 'leadId'],
  'CRM Deal': ['Deal', 'dealId'],
  Contact: ['Contact', 'contactId'],
}
function genericLink(row) {
  const spa = spaRoutes[props.drill.doctype]
  if (spa)
    return {
      to: {
        name: spa[0],
        params: { [spa[1]]: row.name },
        query: { returnTo: props.returnTo },
      },
    }
  const slug = props.drill.doctype.toLowerCase().replace(/ /g, '-')
  return {
    href: `/app/${slug}/${encodeURIComponent(row.name)}`,
    target: '_blank',
    rel: 'noopener',
  }
}
function filterText([field, operator, value]) {
  if (Array.isArray(value))
    value =
      value.length > 3
        ? __('{0} records', [value.length])
        : value.join(', ') || '—'
  return `${field} ${operator} ${value}`
}
const drillSummary = computed(() =>
  props.drill
    ? [
        ...props.drill.filters.map(filterText),
        ...(props.drill.or_filters?.length
          ? [
              __('any of: {0}', [
                props.drill.or_filters.map(filterText).join(' · '),
              ]),
            ]
          : []),
      ]
    : [],
)
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
  () => [props.filters, props.kind, props.bucket, props.drill],
  () => load(),
  { immediate: true, deep: true },
)
onBeforeUnmount(() => {
  epoch++
})
</script>

<style scoped>
.report-button {
  @apply min-h-11 max-w-full rounded-md border border-outline-gray-2 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50;
}
</style>
