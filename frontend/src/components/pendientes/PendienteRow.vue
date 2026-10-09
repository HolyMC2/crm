<template>
  <article
    class="group flex min-h-14 items-start gap-3 border-b border-outline-gray-1 px-4 py-2.5 sm:px-6"
  >
    <button
      v-if="actionable"
      type="button"
      role="checkbox"
      :aria-checked="row.status === 'Closed'"
      :aria-label="__('Mark done: {0}', [row.description])"
      class="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      :disabled="busy"
      @click="$emit('complete', row)"
    >
      <span
        class="flex h-5 w-5 items-center justify-center rounded-md border-[1.5px]"
        :class="
          row.status === 'Closed'
            ? 'border-outline-green-4 bg-surface-green-7 text-white'
            : 'border-outline-gray-4 group-hover:border-outline-gray-5'
        "
        ><FeatherIcon
          v-if="row.status === 'Closed'"
          name="check"
          class="h-3.5 w-3.5"
      /></span>
    </button>
    <span v-else class="h-6 w-6 shrink-0" aria-hidden="true" />
    <RouterLink
      :to="to"
      class="min-w-0 flex-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
    >
      <p
        class="line-clamp-2 text-base text-ink-gray-9"
        :class="row.status === 'Closed' ? 'text-ink-gray-5 line-through' : ''"
      >
        {{ row.description }}
      </p>
      <p
        class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-gray-6"
      >
        <span :class="dueClass">{{ dueText(row, today) }}</span>
        <span v-if="row.reference_label || row.reference_name" class="truncate"
          >· {{ row.reference_label || row.reference_name }}</span
        >
        <span
          v-if="row.priority === 'High'"
          class="rounded bg-surface-amber-1 px-1.5 text-xs font-medium text-ink-amber-9"
          >{{ priorityLabel(row.priority) }}</span
        >
        <span
          v-if="row.doctype === 'CRM Task'"
          class="rounded bg-surface-gray-2 px-1.5 text-xs text-ink-gray-7"
          >{{ sourceLabel(row) }}</span
        >
        <span v-if="showAssignee && !row.mine" class="truncate">
          · {{ __('Assigned to {0}', [row.assigned_to]) }}</span
        >
      </p>
    </RouterLink>
    <div
      v-if="actionable && row.status === 'Open'"
      class="hidden shrink-0 sm:flex"
    >
      <Dropdown :options="menu" placement="right">
        <Button
          variant="ghost"
          icon="more-horizontal"
          :aria-label="__('More actions for {0}', [row.description])"
        />
      </Dropdown>
    </div>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { Button, Dropdown, FeatherIcon } from 'frappe-ui'
import {
  datePresets,
  dueText,
  pendienteRoute,
  priorityLabel,
  sourceLabel,
} from '@/composables/usePendientes'

const props = defineProps({
  row: { type: Object, required: true },
  today: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
  showAssignee: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['complete', 'completeNext', 'reschedule'])
const to = computed(() => pendienteRoute(props.row, props.query))
// Team rows open read-only; the owner completes them.
const actionable = computed(() => props.row.mine && !props.row.cancelled)
const dueClass = computed(() =>
  props.row.group === 'overdue'
    ? 'font-medium text-ink-red-7'
    : props.row.group === 'today'
      ? 'font-medium text-ink-amber-9'
      : '',
)
const menu = computed(() => [
  {
    label: __('Done and schedule next'),
    icon: 'check-circle',
    onClick: () => emit('completeNext', props.row),
  },
  ...datePresets(props.today)
    .filter((preset) => preset.value !== props.row.date)
    .map((preset) => ({
      label: __('Reschedule: {0}', [preset.label]),
      icon: 'calendar',
      onClick: () => emit('reschedule', props.row, preset.value),
    })),
])
</script>
