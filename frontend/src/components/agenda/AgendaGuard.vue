<template>
  <section
    :role="warning ? 'status' : 'alert'"
    class="rounded-lg border p-3 text-base"
    :class="
      warning
        ? 'border-outline-amber-1 bg-surface-amber-1 text-ink-amber-3'
        : 'border-outline-red-1 bg-surface-red-1 text-ink-red-4'
    "
  >
    <p class="font-semibold">{{ heading }}</p>
    <ul class="mt-1 space-y-1">
      <li v-for="(row, index) in constraints" :key="`${row.code}-${index}`">
        {{ row.message }}
      </li>
    </ul>
    <p v-if="hint" class="mt-1 text-sm">{{ hint }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        v-for="(action, index) in actions"
        :key="action"
        :variant="index === 0 ? 'solid' : 'subtle'"
        :label="labels[action] || __('Try again')"
        :loading="busy && index === 0"
        class="min-h-11"
        @click="emit('action', action)"
      />
      <Button
        variant="ghost"
        class="min-h-11"
        :label="__('Dismiss')"
        @click="emit('dismiss')"
      />
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { constraintActions, isWarningOnly } from '@/composables/useAgenda'

const props = defineProps({
  constraints: { type: Array, required: true },
  busy: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  // Actions the caller cannot perform in its context (for example «edit» inside the form).
  exclude: { type: Array, default: () => [] },
})
const emit = defineEmits(['action', 'dismiss'])
const warning = computed(() => isWarningOnly(props.constraints))
const heading = computed(() =>
  warning.value
    ? __('Check before saving')
    : __('We could not save this change'),
)
const actions = computed(() => {
  const ids = []
  for (const row of props.constraints)
    for (const id of constraintActions(row))
      if (!ids.includes(id) && !props.exclude.includes(id)) ids.push(id)
  return ids
})
const labels = {
  retry: __('Try again'),
  move_series: __('Move the whole series'),
  open: __('Open event'),
  edit: __('Edit series'),
  confirm: __('Schedule anyway'),
  pick_time: __('Choose another time'),
  request_change: __('Ask the organizer'),
  open_native: __('Open the event form'),
  open_turnos: __('Open Turnos'),
  request_access: __('Request access'),
  refresh: __('Refresh agenda'),
  shorter_range: __('View one day'),
}
</script>
