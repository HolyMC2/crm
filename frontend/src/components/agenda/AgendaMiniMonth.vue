<template>
  <div class="ag-mini" :aria-label="__('Choose a date')">
    <div class="ag-mini__head">
      <span class="ag-mini__title">{{ title }}</span>
      <button
        type="button"
        class="ag-mini__nav"
        :aria-label="__('Previous month')"
        @click="shown = shiftMonth(shown, -1)"
      >
        <span class="lucide-chevron-left h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="ag-mini__nav"
        :aria-label="__('Next month')"
        @click="shown = shiftMonth(shown, 1)"
      >
        <span class="lucide-chevron-right h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <div class="ag-mini__grid" role="grid">
      <span
        v-for="day in weeks[0]"
        :key="`w-${day}`"
        class="ag-mini__weekday"
        aria-hidden="true"
        >{{ weekdayLetter(day) }}</span
      >
      <template v-for="week in weeks" :key="week[0]">
        <button
          v-for="day in week"
          :key="day"
          type="button"
          class="ag-mini__day"
          :class="{
            'is-outside': day.slice(0, 7) !== shown.slice(0, 7),
            'is-today': day === today,
            'is-selected': day === selected,
            'is-range': inRange(day),
            'is-range-start': day === range?.[0],
            'is-range-end': day === range?.[range.length - 1],
            'has-events': busy.has(day),
          }"
          :aria-label="longDate(day)"
          :aria-current="day === today ? 'date' : undefined"
          :aria-pressed="day === selected"
          @click="emit('pick', day)"
        >
          {{ Number(day.slice(8)) }}
        </button>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { monthWeeks } from '@/components/agenda/agendaGrid'

const props = defineProps({
  selected: { type: String, required: true },
  today: { type: String, required: true },
  // The dates the main view shows (a week, 4 days…): drawn as a band.
  range: { type: Array, default: null },
  // Dates with something scheduled (from the loaded range).
  busyDates: { type: Array, default: () => [] },
  weekStartsOn: { type: Number, default: 1 },
  locale: { type: String, default: undefined },
})
const emit = defineEmits(['pick'])

const shown = ref(props.selected)
watch(
  () => props.selected,
  (value) => (shown.value = value),
)
const weeks = computed(() => {
  const rows = monthWeeks(shown.value, props.weekStartsOn)
  return rows
})
const busy = computed(() => new Set(props.busyDates))
const fmt = (options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' })
const civil = (date) => new Date(`${date}T12:00:00Z`)
const title = computed(() => {
  const text = fmt({ month: 'long', year: 'numeric' }).format(
    civil(shown.value),
  )
  return text.charAt(0).toUpperCase() + text.slice(1)
})
const weekdayLetter = (date) => fmt({ weekday: 'narrow' }).format(civil(date))
const longDate = (date) =>
  fmt({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(civil(date))
function shiftMonth(date, delta) {
  const [y, m] = date.split('-').map(Number)
  const value = new Date(Date.UTC(y, m - 1 + delta, 1, 12))
  return value.toISOString().slice(0, 10)
}
const inRange = (day) =>
  Boolean(props.range && props.range.length > 1 && props.range.includes(day))
</script>
<style scoped>
.ag-mini {
  padding: 0 4px;
  user-select: none;
}
.ag-mini__head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 0 6px 8px;
}
.ag-mini__title {
  flex: 1 1 auto;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-8);
}
.ag-mini__nav {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-mini__nav:hover {
  background: var(--surface-gray-2);
}
.ag-mini__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 2px;
}
.ag-mini__weekday {
  display: grid;
  place-items: center;
  height: 24px;
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-gray-6);
}
.ag-mini__day {
  position: relative;
  display: grid;
  place-items: center;
  height: 28px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-gray-8);
  border-radius: 999px;
}
.ag-mini__day::before {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 999px;
  z-index: -1;
}
.ag-mini__day:hover::before {
  background: var(--surface-gray-2);
}
.ag-mini__day.is-outside {
  color: var(--ink-gray-5);
}
.ag-mini__day.is-range {
  background: var(--ag-select-tint);
  border-radius: 0;
}
.ag-mini__day.is-range-start {
  border-radius: 999px 0 0 999px;
}
.ag-mini__day.is-range-end {
  border-radius: 0 999px 999px 0;
}
.ag-mini__day.is-selected::before {
  background: var(--ag-select-strong);
}
.ag-mini__day.is-selected {
  color: var(--ag-accent-ink);
}
.ag-mini__day.is-today {
  color: var(--ag-on-accent);
}
.ag-mini__day.is-today::before {
  background: var(--ag-accent);
}
.ag-mini__day.has-events::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 3px;
  height: 3px;
  margin-left: -1.5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.55;
}
.ag-mini__day {
  isolation: isolate;
}
</style>
