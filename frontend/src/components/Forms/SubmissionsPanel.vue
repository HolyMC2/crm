<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div
        v-for="s in summary"
        :key="s.key"
        class="rounded-lg border border-outline-gray-2 px-3 py-2.5"
      >
        <div class="text-2xl font-semibold tabular-nums text-ink-gray-9">
          {{ s.value }}
        </div>
        <div class="text-p-sm text-ink-gray-6">{{ s.label }}</div>
      </div>
    </div>

    <div v-if="subs.loading && !rows.length" class="flex justify-center py-10">
      <LoadingIndicator class="size-5 text-ink-gray-5" />
    </div>
    <div
      v-else-if="!rows.length"
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-outline-gray-2 px-4 py-10 text-center"
    >
      <LucideInbox class="size-7 text-ink-gray-4" />
      <div class="text-base font-medium text-ink-gray-8">
        {{ __('No submissions yet') }}
      </div>
      <p class="max-w-sm text-p-sm text-ink-gray-6">
        {{
          published
            ? __(
                'Share the link or QR code. Each submission shows up here and in your {0} list.',
                [isLead ? __('Leads') : __('Deals')],
              )
            : __(
                'Publish the form and share its link. Each submission shows up here.',
              )
        }}
      </p>
      <Button :label="__('Share the form')" @click="$emit('share')" />
    </div>
    <div
      v-else
      class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
    >
      <RouterLink
        v-for="r in rows"
        :key="r.name"
        :to="recordRoute(r)"
        class="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-gray-1 focus-visible:bg-surface-gray-1 focus-visible:outline-none"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-base font-medium text-ink-gray-9">
            {{ r.title }}
          </div>
          <div class="truncate text-p-sm text-ink-gray-5">
            {{ timeAgo(r.creation) }}
            <template v-if="r.utm_source">
              · {{ __('from {0}', [r.utm_source]) }}</template
            >
            <template v-if="r.owner"> · {{ userName(r.owner) }}</template>
            <template v-else> · {{ __('unassigned') }}</template>
          </div>
        </div>
        <span
          v-if="r.deal"
          class="hidden rounded-full bg-surface-green-2 px-2 py-0.5 text-xs font-medium text-ink-green-7 sm:inline"
        >
          {{ __('Deal: {0}', [__(r.deal_status)]) }}
        </span>
        <Badge
          :label="__(r.status)"
          variant="subtle"
          :theme="statusTheme(r.status)"
        />
        <LucideChevronRight class="size-4 shrink-0 text-ink-gray-4" />
      </RouterLink>
    </div>
    <Button
      v-if="rows.length && rows.length % PAGE === 0"
      class="self-center"
      :label="__('Load more')"
      :loading="subs.loading"
      @click="more"
    />
  </div>
</template>

<script setup>
import { Badge, Button, LoadingIndicator, createResource } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { timeAgo } from '@/utils'
import LucideInbox from '~icons/lucide/inbox'
import LucideChevronRight from '~icons/lucide/chevron-right'
import { computed, ref } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  documentType: { type: String, required: true },
  published: { type: Boolean, default: false },
})
defineEmits(['share'])

const PAGE = 50
const { getUser } = usersStore()
const { getLeadStatus, getDealStatus } = statusesStore()
const userName = (email) => getUser(email)?.full_name || email
const isLead = computed(() => props.documentType === 'CRM Lead')

const rows = ref([])
const subs = createResource({
  url: 'crm.api.form.get_form_submissions',
  makeParams: () => ({
    name: props.name,
    start: rows.value.length,
    page_length: PAGE,
  }),
  auto: true,
  onSuccess: (data) => {
    rows.value = [...rows.value, ...(data.rows || [])]
    stats.value = data.stats
  },
})
const stats = ref(null)
function more() {
  subs.fetch()
}
function reload() {
  rows.value = []
  subs.fetch()
}
defineExpose({ reload })

const summary = computed(() => {
  const s = stats.value || {}
  return [
    { key: 'total', value: s.total || 0, label: __('Total') },
    { key: '7', value: s.last_7_days || 0, label: __('Last 7 days') },
    { key: '30', value: s.last_30_days || 0, label: __('Last 30 days') },
    isLead.value
      ? {
          key: 'deals',
          value: s.deals || 0,
          label: s.won
            ? __('became deals · {0} won', [s.won])
            : __('became deals'),
        }
      : { key: 'won', value: s.won || 0, label: __('won') },
  ]
})

// open the record, and carry a way back to this list
function recordRoute(r) {
  const returnTo = `/forms/${encodeURIComponent(props.name)}?tab=submissions`
  return isLead.value
    ? { name: 'Lead', params: { leadId: r.name }, query: { returnTo } }
    : { name: 'Deal', params: { dealId: r.name }, query: { returnTo } }
}

const COLOR_THEME = {
  green: 'green',
  red: 'red',
  orange: 'orange',
  amber: 'orange',
  yellow: 'orange',
  blue: 'blue',
  cyan: 'blue',
  teal: 'green',
}
function statusTheme(status) {
  const s = isLead.value ? getLeadStatus(status) : getDealStatus(status)
  const color = (s?.color || '').replace(
    /^.*?(green|red|orange|amber|yellow|blue|cyan|teal).*$/,
    '$1',
  )
  return COLOR_THEME[color] || 'gray'
}
</script>
