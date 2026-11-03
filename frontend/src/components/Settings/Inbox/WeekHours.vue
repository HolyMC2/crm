<template>
  <!-- One line per weekday: open or closed, then its time ranges. Edits the
       CRM Service Day rows of the inbox settings in place. -->
  <ul class="divide-y divide-outline-gray-1" :aria-label="__('Office hours')">
    <li
      v-for="day in DAYS"
      :key="day.value"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
    >
      <AjustesSwitch
        :model-value="ranges(day.value).length > 0"
        :label="day.label"
        :disabled="disabled"
        @update:model-value="(open) => toggle(day.value, open)"
      />
      <span class="w-24 text-p-base-medium text-ink-gray-8">{{
        day.label
      }}</span>
      <span
        v-if="!ranges(day.value).length"
        class="text-p-sm text-ink-gray-5"
        >{{ __('Closed') }}</span
      >
      <div v-else class="flex min-w-0 flex-1 flex-col gap-1">
        <div
          v-for="row in ranges(day.value)"
          :key="rowKey(row)"
          class="flex flex-wrap items-center gap-1.5"
        >
          <input
            v-model="row.start_time"
            type="time"
            class="num h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            :aria-label="`${day.label}: ${__('Start Time')}`"
            :disabled="disabled"
          />
          <span class="text-ink-gray-5" aria-hidden="true">–</span>
          <input
            v-model="row.end_time"
            type="time"
            class="num h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            :aria-label="`${day.label}: ${__('End Time')}`"
            :disabled="disabled"
          />
          <button
            v-if="ranges(day.value).length > 1"
            type="button"
            class="press flex size-8 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2"
            :aria-label="__('Remove these hours')"
            :title="__('Remove these hours')"
            :disabled="disabled"
            @click="remove(row)"
          >
            <span class="lucide-x size-4" aria-hidden="true" />
          </button>
          <span
            v-if="backwards(row)"
            role="alert"
            class="w-full text-p-sm text-ink-red-7"
            >{{
              __('Ends before it starts. Change one of the two times.')
            }}</span
          >
        </div>
        <button
          type="button"
          class="press self-start text-p-sm text-ink-gray-7 underline"
          :disabled="disabled"
          @click="add(day.value)"
        >
          {{ __('Add another range (for example after lunch)') }}
        </button>
      </div>
    </li>
  </ul>
</template>
<script setup>
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'

/** The settings document; its working_hours rows are edited in place. */
const doc = defineModel('doc', { type: Object, required: true })
defineProps({ disabled: Boolean })

const DAYS = [
  { value: 'Monday', label: __('Monday') },
  { value: 'Tuesday', label: __('Tuesday') },
  { value: 'Wednesday', label: __('Wednesday') },
  { value: 'Thursday', label: __('Thursday') },
  { value: 'Friday', label: __('Friday') },
  { value: 'Saturday', label: __('Saturday') },
  { value: 'Sunday', label: __('Sunday') },
]
// New rows have no name yet; their keys stay outside the document.
const keys = new WeakMap()
let local = 0
const rows = () => doc.value.working_hours || []
const ranges = (day) => rows().filter((row) => row.workday === day)
function rowKey(row) {
  if (row.name) return row.name
  if (!keys.has(row)) keys.set(row, `new-${++local}`)
  return keys.get(row)
}
const minutes = (value) => {
  const [h, m] = String(value || '').split(':')
  return h === '' || h === undefined ? null : Number(h) * 60 + Number(m || 0)
}
const backwards = (row) => {
  const start = minutes(row.start_time),
    end = minutes(row.end_time)
  return start === null || end === null || start >= end
}

// A day that opens takes the hours of the closest open day before it, so a
// week is set by opening Monday and then each other day.
function toggle(day, open) {
  if (!open) {
    doc.value.working_hours = rows().filter((row) => row.workday !== day)
    return
  }
  const index = DAYS.findIndex((d) => d.value === day)
  const model = DAYS.slice(0, index)
    .reverse()
    .map((d) => ranges(d.value))
    .find((list) => list.length)
  const copies = model?.length
    ? model.map((row) => [row.start_time, row.end_time])
    : [['09:00:00', '18:00:00']]
  for (const [start, end] of copies) push(day, start, end)
}
function push(day, start, end) {
  doc.value.working_hours = [...rows()]
  doc.value.working_hours.push({
    doctype: 'CRM Service Day',
    workday: day,
    start_time: start,
    end_time: end,
  })
}
function add(day) {
  const last = ranges(day).at(-1)
  push(day, last?.end_time || '09:00:00', '20:00:00')
}
function remove(row) {
  doc.value.working_hours = rows().filter((r) => r !== row)
}
</script>
