<template>
  <article
    class="group flex min-h-14 items-center gap-2 px-4 py-1.5 sm:px-5"
    :class="row.status === 'Closed' ? 'opacity-70' : ''"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="row.status === 'Closed'"
      :aria-label="__('Mark done: {0}', [row.description])"
      class="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      :disabled="busy || row.status === 'Closed'"
      @click="$emit('complete', row)"
    >
      <span
        class="flex size-5 items-center justify-center rounded-md border-[1.5px]"
        :class="
          row.status === 'Closed'
            ? 'border-outline-green-4 bg-surface-green-7 text-white'
            : 'border-outline-gray-4 group-hover:border-outline-gray-5'
        "
      >
        <span
          v-if="row.status === 'Closed'"
          class="lucide-check size-3.5"
          aria-hidden="true"
        />
      </span>
    </button>
    <RouterLink
      :to="to"
      class="min-w-0 flex-1 rounded-lg py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
    >
      <p
        class="truncate text-base text-ink-gray-9"
        :class="row.status === 'Closed' ? 'line-through' : ''"
      >
        {{ row.description }}
      </p>
      <p
        class="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-gray-6"
      >
        <span
          class="shrink-0"
          :class="
            row.group === 'overdue'
              ? 'font-medium text-ink-red-7'
              : 'font-medium text-ink-amber-9'
          "
          >{{ dueText(row, today) }}</span
        >
        <span v-if="row.reference_label || row.reference_name" class="truncate"
          >· {{ row.reference_label || row.reference_name }}</span
        >
        <span
          v-if="row.priority === 'High'"
          class="shrink-0 rounded bg-surface-amber-1 px-1.5 text-xs font-medium text-ink-amber-9"
          >{{ priorityLabel(row.priority) }}</span
        >
      </p>
    </RouterLink>
    <Dropdown v-if="row.status === 'Open'" :options="menu" placement="right">
      <Button
        variant="ghost"
        class="min-h-11 shrink-0 sm:min-h-8"
        :disabled="busy"
        :aria-label="__('Reschedule {0}', [row.description])"
      >
        <template #prefix>
          <span class="lucide-calendar-clock size-4" aria-hidden="true" />
        </template>
        <span class="hidden sm:inline">{{ __('Reschedule') }}</span>
      </Button>
    </Dropdown>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { Button, Dropdown } from 'frappe-ui'
import {
  datePresets,
  dueText,
  pendienteRoute,
  priorityLabel,
} from '@/composables/usePendientes'
import { HOY_HOME } from '@/composables/useHoy'

// One «Para ahora» row: Hecho and Reprogramar inline, through the same
// Pendientes endpoints the queue uses; the title opens the pendiente.
const props = defineProps({
  row: { type: Object, required: true },
  today: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['complete', 'completeNext', 'reschedule'])
const to = computed(() =>
  pendienteRoute(props.row, { return_to: HOY_HOME, return_label: 'Hoy' }),
)
const menu = computed(() => [
  ...datePresets(props.today)
    .filter((preset) => preset.value !== props.row.date)
    .map((preset) => ({
      label: preset.label,
      icon: 'calendar',
      onClick: () => emit('reschedule', props.row, preset.value),
    })),
  {
    label: __('Done and schedule next'),
    icon: 'check-circle',
    onClick: () => emit('completeNext', props.row),
  },
])
</script>
