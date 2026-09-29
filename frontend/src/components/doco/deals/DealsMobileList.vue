<!--
  The Deals list on a phone: one card per deal instead of a squeezed table
  (title, customer/phone, stage, repair status, value and the next step), a
  «Load more» button under the thumb, and the row menu on its own hit area.
  Rows are the raw get_data rows, virtual `_v_*` values included when the view
  shows those columns.
-->
<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
    <div
      v-if="loading && !rows.length"
      class="py-10 text-center text-sm text-ink-gray-4"
    >
      {{ __('Loading...') }}
    </div>
    <MobileRecordCard
      v-for="r in rows"
      :key="r.name"
      :title="titleOf(r)"
      :subtitle="subtitleOf(r)"
      :time="r.modified ? timeAgo(r.modified) : ''"
      :menu="menuFor(r.name)"
      @open="emit('open', r.name)"
    >
      <template #chips>
        <span
          v-if="r.status"
          class="inline-flex items-center gap-1 rounded-md bg-surface-gray-2 px-1.5 py-[2px] text-xs font-medium text-ink-gray-7"
        >
          <IndicatorIcon :class="statusColor(r.status)" />
          {{ __(r.status) }}
        </span>
        <span
          v-if="resolveChip(r._v_repair_status)"
          class="rounded-md px-1.5 py-[2px] text-xs font-medium"
          :class="resolveChip(r._v_repair_status).class"
        >
          {{ resolveChip(r._v_repair_status).label }}
        </span>
        <span
          v-if="virtualText(r._v_device)"
          class="truncate text-xs text-ink-gray-6"
          >{{ virtualText(r._v_device) }}</span
        >
        <span
          v-if="valueOf(r)"
          class="ml-auto flex-none text-sm font-semibold text-ink-gray-8"
        >
          {{ valueOf(r) }}
        </span>
        <div v-if="r._v_next_step?.task" class="w-full">
          <NextActivityChip
            :at="r._v_next_step.at || ''"
            :title="r._v_next_step.title || ''"
            :type="r._v_next_step.type || ''"
            :empty-label="__('Pending, no date')"
          />
        </div>
      </template>
    </MobileRecordCard>
    <div v-if="hasMore" class="px-3.5 py-3">
      <Button
        class="h-11 w-full"
        :label="__('Load More')"
        :loading="loading"
        @click="emit('loadMore')"
      />
    </div>
    <div class="h-16" aria-hidden="true" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import MobileRecordCard from '@/components/doco/MobileRecordCard.vue'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import { timeAgo, formatPhone } from '@/composables/crmFormat'
import { resolveChip, virtualText } from '@/utils/listColumns'
import { money } from '@/utils/numberFormat'
import { statusesStore } from '@/stores/statuses'

defineProps({
  rows: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  // name → Dropdown options (open, note, task…)
  menuFor: { type: Function, default: () => [] },
})
const emit = defineEmits(['open', 'loadMore'])

const { getDealStatus } = statusesStore()
const scroller = ref(null)

function customerOf(r) {
  return virtualText(r._v_customer) || r.organization || r.lead_name || ''
}
function titleOf(r) {
  return r.deal_name || customerOf(r) || r.name
}
// folio + phone under the name: what a shop reads aloud
function subtitleOf(r) {
  const parts = []
  if (customerOf(r) && customerOf(r) !== titleOf(r)) parts.push(customerOf(r))
  else if (titleOf(r) !== r.name) parts.push(r.name)
  const phone = virtualText(r._v_phone) || r.mobile_no
  if (phone) parts.push(formatPhone(phone))
  return parts.join(' · ')
}
function statusColor(status) {
  return getDealStatus(status)?.color || ''
}
function valueOf(r) {
  const n = Number(r.deal_value) || 0
  return n ? money(n, r.currency || null) : ''
}

defineExpose({ scrollElement: () => scroller.value })
</script>
