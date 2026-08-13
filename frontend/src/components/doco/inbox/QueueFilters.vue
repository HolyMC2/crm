<!--
  Inbox filter panel (Marco 2026-08-13). The tab pills are channel/urgency views;
  this is the record filter set: estado del trato, estado del lead, estado de la
  reparación (taller-only) and a date range on the conversation's last activity.
  One trigger + one panel because the queue pane is 286px wide — three separate
  popovers wouldn't fit. Filters are server-side (api.inbox.get_conversation_queue),
  so they apply across the WHOLE queue, not the loaded page.
-->
<template>
  <div class="relative">
    <div class="flex items-center gap-1.5">
      <button
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        :class="
          queueFilterCount
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
        "
        :aria-expanded="open"
        :title="__('Filtrar por estado, reparación o fecha')"
        @click="open = !open"
      >
        <LucideSlidersHorizontal class="h-3 w-3" />
        {{ __('Filtros') }}
        <span v-if="queueFilterCount" class="text-[10px] opacity-80">{{ queueFilterCount }}</span>
      </button>
      <button
        v-if="queueFilterCount"
        class="text-[10.5px] text-ink-gray-5 underline hover:text-ink-gray-8"
        @click="clearQueueFilters"
      >
        {{ __('Limpiar') }}
      </button>
    </div>

    <!-- active filters, so a narrowed queue can never look like an empty inbox -->
    <div v-if="chips.length" class="mt-1.5 flex flex-wrap gap-1">
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1 rounded-full bg-surface-gray-2 px-2 py-[3px] text-[10px] font-medium text-ink-gray-7"
      >
        {{ c.label }}
        <button class="text-[11px] leading-none" :aria-label="__('Quitar filtro') + ' ' + c.label" @click="c.remove()">×</button>
      </span>
    </div>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute left-0 z-[100] mt-1.5 w-[262px] overflow-hidden rounded-[10px] border border-outline-gray-2 bg-surface-base"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.14)"
      >
        <div class="scb max-h-[62vh] overflow-y-auto">
          <Group
            :title="__('Estado del trato')"
            :options="dealOptions"
            :selected="queueDealStatus"
            @update="setQueueFilters({ deal_status: $event })"
          />
          <Group
            :title="__('Estado del lead')"
            :options="leadOptions"
            :selected="queueLeadStatus"
            @update="setQueueFilters({ lead_status: $event })"
          />
          <Group
            v-if="repairOptions.length"
            :title="__('Estado de la reparación')"
            :options="repairOptions"
            :selected="queueRepairStatus"
            @update="setQueueFilters({ repair_status: $event })"
          />
          <div class="px-3 py-2">
            <div class="pb-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-ink-gray-4">
              {{ __('Última actividad') }}
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="date"
                :value="queueDateFrom"
                :aria-label="__('Desde')"
                class="w-full rounded-md border border-outline-gray-2 bg-surface-base px-1.5 py-1 text-[11px] text-ink-gray-8 focus:outline-none focus:ring-1 focus:ring-outline-gray-3"
                @change="setQueueFilters({ date_from: $event.target.value })"
              />
              <span class="flex-none text-[10px] text-ink-gray-4">→</span>
              <input
                type="date"
                :value="queueDateTo"
                :aria-label="__('Hasta')"
                class="w-full rounded-md border border-outline-gray-2 bg-surface-base px-1.5 py-1 text-[11px] text-ink-gray-8 focus:outline-none focus:ring-1 focus:ring-outline-gray-3"
                @change="setQueueFilters({ date_to: $event.target.value })"
              />
            </div>
          </div>
        </div>
        <div class="flex justify-between border-t border-outline-gray-1 px-3 py-2">
          <button class="text-[11.5px] text-ink-gray-5" @click="clearQueueFilters">{{ __('Limpiar todo') }}</button>
          <button class="text-[11.5px] font-semibold text-ink-green-7" @click="open = false">{{ __('Listo') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import LucideSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import {
  queueFilterOptions,
  queueFilterCount,
  queueDealStatus,
  queueLeadStatus,
  queueRepairStatus,
  queueDateFrom,
  queueDateTo,
  setQueueFilters,
  clearQueueFilters,
} from '@/composables/inbox'

const open = ref(false)

const dealOptions = computed(() =>
  (queueFilterOptions.data?.deal_statuses || []).map((s) => ({ value: s.name, label: s.name, color: s.color })),
)
const leadOptions = computed(() =>
  (queueFilterOptions.data?.lead_statuses || []).map((s) => ({ value: s.name, label: s.name, color: s.color })),
)
const repairOptions = computed(() =>
  (queueFilterOptions.data?.repair_statuses || []).map((s) => ({ value: s, label: s })),
)

const chips = computed(() => {
  const out = []
  const drop = (arr, key, v) => () => setQueueFilters({ [key]: arr.value.filter((x) => x !== v) })
  for (const v of queueDealStatus.value) out.push({ key: `d:${v}`, label: v, remove: drop(queueDealStatus, 'deal_status', v) })
  for (const v of queueLeadStatus.value) out.push({ key: `l:${v}`, label: v, remove: drop(queueLeadStatus, 'lead_status', v) })
  for (const v of queueRepairStatus.value) out.push({ key: `r:${v}`, label: `🔧 ${v}`, remove: drop(queueRepairStatus, 'repair_status', v) })
  if (queueDateFrom.value)
    out.push({ key: 'from', label: `≥ ${queueDateFrom.value}`, remove: () => setQueueFilters({ date_from: '' }) })
  if (queueDateTo.value)
    out.push({ key: 'to', label: `≤ ${queueDateTo.value}`, remove: () => setQueueFilters({ date_to: '' }) })
  return out
})

// Small render-function group so the three status blocks stay one implementation
// (checkbox rows + a colour dot) without a second file for ~15 lines of markup.
const Group = (props, { emit }) =>
  h('div', { class: 'border-b border-outline-gray-1 px-3 py-2 last:border-b-0' }, [
    h('div', { class: 'pb-1 text-[10px] font-bold uppercase tracking-[.07em] text-ink-gray-4' }, props.title),
    ...props.options.map((o) =>
      h(
        'label',
        { class: 'flex cursor-pointer items-center gap-2 py-[3px] text-[12px] text-ink-gray-8', key: o.value },
        [
          h('input', {
            type: 'checkbox',
            checked: props.selected.includes(o.value),
            style: 'accent-color: var(--brand)',
            onChange: () =>
              emit(
                'update',
                props.selected.includes(o.value)
                  ? props.selected.filter((x) => x !== o.value)
                  : [...props.selected, o.value],
              ),
          }),
          o.color ? h('span', { class: 'h-2 w-2 flex-none rounded-full', style: `background:${o.color}` }) : null,
          h('span', { class: 'truncate' }, o.label),
        ],
      ),
    ),
    props.options.length ? null : h('div', { class: 'py-1 text-[11px] text-ink-gray-4' }, __('Sin opciones')),
  ])
Group.props = ['title', 'options', 'selected']
Group.emits = ['update']
</script>
