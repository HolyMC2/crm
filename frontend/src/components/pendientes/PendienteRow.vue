<template>
  <article
    data-key-row
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
        class="flex h-5 w-5 items-center justify-center rounded-full border-2"
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
    <!-- Someone else's work: their initials where the check would be. -->
    <span
      v-else-if="showAssignee && assignee"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-[10px] font-semibold text-ink-gray-8"
      aria-hidden="true"
      >{{ initials }}</span
    >
    <span v-else class="h-6 w-6 shrink-0" aria-hidden="true" />
    <RouterLink
      :to="to"
      data-row-link
      data-row-focus
      class="-my-2.5 min-w-0 flex-1 rounded-lg py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
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
          ><span aria-hidden="true">· </span
          >{{ row.reference_label || row.reference_name }}</span
        >
        <span
          v-if="row.priority === 'High'"
          class="rounded bg-surface-amber-1 px-1.5 text-xs font-medium text-ink-amber-9"
          >{{ priorityLabel(row.priority) }}</span
        >
        <!-- The source only matters where sources mix (not in the team list). -->
        <span
          v-if="row.doctype === 'CRM Task' && !showAssignee"
          class="rounded bg-surface-gray-2 px-1.5 text-xs text-ink-gray-7"
          >{{ sourceLabel(row) }}</span
        >
        <span v-if="showAssignee && !row.mine && assignee" class="truncate">
          {{ __('Assigned to {0}', [assignee]) }}</span
        >
      </p>
    </RouterLink>
    <div
      v-if="actionable && row.status === 'Open'"
      class="-my-2 -mr-2 flex shrink-0 sm:my-0 sm:mr-0"
    >
      <Dropdown :options="menu" placement="right">
        <Button
          variant="ghost"
          class="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7"
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
import { personName } from '@/utils/display'
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
// The person, never the login («jeydici01@gmail.com»).
const assignee = computed(
  () => props.row.assigned_to_name || personName(props.row.assigned_to),
)
const initials = computed(() =>
  assignee.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join(''),
)
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
