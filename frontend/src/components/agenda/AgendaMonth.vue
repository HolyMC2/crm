<template>
  <div
    class="agenda-month select-none"
    role="region"
    :aria-label="__('Month calendar')"
  >
    <div class="grid grid-cols-7" aria-hidden="true">
      <div
        v-for="day in weeks[0]"
        :key="`head-${day.date}`"
        class="pb-1.5 text-center text-xs font-medium uppercase text-ink-gray-6"
      >
        {{ weekday(day.date) }}
      </div>
    </div>

    <!-- Phone: compact days with dots; the chosen day's list renders below the grid. -->
    <div
      v-if="compact"
      class="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-outline-gray-2 bg-outline-gray-1"
    >
      <button
        v-for="day in days"
        :key="day.date"
        type="button"
        :data-day="day.date"
        class="flex min-h-12 flex-col items-center justify-center gap-1 bg-surface-white py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-outline-gray-4"
        :class="day.outside ? 'bg-surface-gray-1 text-ink-gray-5' : ''"
        :aria-pressed="day.date === date"
        :aria-label="dayLabel(day)"
        @click="pick(day.date)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums"
          :class="numberClass(day)"
          >{{ day.number }}</span
        >
        <span class="flex h-1.5 items-center gap-0.5" aria-hidden="true">
          <span
            v-for="n in Math.min(day.entries.length, 3)"
            :key="n"
            class="h-1.5 w-1.5 rounded-full"
            :class="
              day.date === date ? 'bg-surface-gray-10' : 'bg-surface-blue-6'
            "
          />
          <span
            v-if="day.entries.length > 3"
            class="text-[10px] leading-none text-ink-gray-6"
            >+{{ day.entries.length - 3 }}</span
          >
        </span>
      </button>
    </div>

    <!-- Desktop: chips per day; empty space creates, chips drag to another day. -->
    <div
      v-else
      class="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-outline-gray-2 bg-outline-gray-1"
    >
      <div
        v-for="day in days"
        :key="day.date"
        role="group"
        class="flex min-h-28 min-w-0 flex-col bg-surface-white p-1"
        :class="day.outside ? 'bg-surface-gray-1' : ''"
        :data-agenda-date="day.date"
        :aria-label="dayLabel(day)"
      >
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm tabular-nums hover:bg-surface-gray-2"
            :class="numberClass(day)"
            :aria-label="__('Open {0}', [fullDate(day.date)])"
            @click="emit('open-day', day.date)"
          >
            {{ day.number }}
          </button>
        </div>
        <button
          v-for="entry in day.entries.slice(0, visibleChips(day))"
          :key="key(entry.event)"
          type="button"
          class="mt-0.5 flex min-h-6 w-full min-w-0 items-center gap-1 rounded px-1.5 text-left text-xs"
          :class="chipClass(entry.event)"
          :data-event-id="entry.event.id"
          :data-event-source="entry.event.source"
          :aria-current="selected === key(entry.event) ? 'true' : undefined"
          :title="chipTitle(entry)"
          @click="emit('select', entry.event)"
        >
          <span
            v-if="chipTime(entry)"
            class="shrink-0 tabular-nums text-ink-gray-6"
            >{{ chipTime(entry) }}</span
          >
          <span
            class="truncate font-medium"
            :class="entry.event.status === 'Done' ? 'line-through' : ''"
            >{{ entry.event.title }}</span
          >
        </button>
        <button
          v-if="day.entries.length > visibleChips(day)"
          type="button"
          class="mt-0.5 min-h-6 rounded px-1.5 text-left text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
          @click="emit('open-day', day.date)"
        >
          {{ __('+{0} more', [day.entries.length - visibleChips(day)]) }}
        </button>
        <button
          v-if="canCreate"
          type="button"
          class="agenda-month__add mt-0.5 flex min-h-6 flex-1 items-start justify-end rounded px-1 text-ink-gray-5"
          :aria-label="__('Schedule on {0}', [fullDate(day.date)])"
          @click="emit('create', day.date)"
        >
          <span class="lucide-plus h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { calendarRange, eventsForDay } from '@/vendor/muelle-calendar/core'
import { eventKey } from '@/composables/useAgenda'

const MAX_CHIPS = 3
const props = defineProps({
  events: { type: Array, required: true },
  date: { type: String, required: true },
  today: { type: String, required: true },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  weekStartsOn: { type: Number, default: 1 },
  compact: { type: Boolean, default: false },
  selected: { type: String, default: '' },
  canCreate: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'create', 'pick', 'open-day'])
const key = eventKey

const civil = (date, options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
const weekday = (date) =>
  civil(date, { weekday: props.compact ? 'narrow' : 'short' })
const fullDate = (date) =>
  civil(date, { weekday: 'long', day: 'numeric', month: 'long' })

// The fetched range is the six-week grid; weeks wholly in another month are not drawn.
const weeks = computed(() => {
  const month = props.date.slice(0, 7)
  const { dates } = calendarRange(
    props.date,
    'month',
    props.timeZone,
    props.weekStartsOn,
  )
  const rows = []
  for (let index = 0; index < dates.length; index += 7) {
    const week = dates.slice(index, index + 7)
    if (!week.some((date) => date.slice(0, 7) === month)) continue
    rows.push(
      week.map((date) => ({
        date,
        number: Number(date.slice(8)),
        outside: date.slice(0, 7) !== month,
        entries: eventsForDay(props.events, date, props.timeZone).sort(
          (a, b) =>
            Number(Boolean(b.event.allDay)) - Number(Boolean(a.event.allDay)) ||
            a.start - b.start,
        ),
      })),
    )
  }
  return rows
})
const days = computed(() => weeks.value.flat())

// «+N más» replaces the last chip rather than adding a fourth row.
const visibleChips = (day) =>
  day.entries.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS

function pick(date) {
  // A second tap on the chosen day schedules on it.
  if (date === props.date && props.canCreate) emit('create', date)
  else emit('pick', date)
}
function numberClass(day) {
  if (day.date === props.today)
    return 'bg-surface-gray-10 font-semibold text-ink-base'
  if (props.compact && day.date === props.date)
    return 'bg-surface-gray-3 font-semibold text-ink-gray-9'
  return day.outside ? 'text-ink-gray-5' : 'text-ink-gray-8'
}
function dayLabel(day) {
  const date = fullDate(day.date)
  const count = day.entries.length
  if (!count) return __('{0}, nothing scheduled', [date])
  if (count === 1) return __('{0}, 1 event', [date])
  return __('{0}, {1} events', [date, count])
}
const isShift = (event) => event.kind === 'shift' || event.kind === 'my_shift'
function chipClass(event) {
  const base =
    props.selected === key(event)
      ? 'ring-2 ring-outline-gray-4 '
      : 'hover:brightness-95 '
  if (isShift(event)) return `${base}bg-surface-gray-2 text-ink-gray-8`
  if (event.status === 'Cancelled')
    return `${base}bg-surface-gray-1 text-ink-gray-5`
  return `${base}bg-surface-blue-1 text-ink-gray-9`
}
const time = (instant) =>
  new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: props.hour12,
  }).format(new Date(instant))
const chipTime = (entry) =>
  entry.event.allDay || entry.continuesBefore ? '' : time(entry.event.start)
const chipTitle = (entry) =>
  [chipTime(entry), entry.event.title].filter(Boolean).join(' · ')
</script>
<style scoped>
.agenda-month__add:hover,
.agenda-month__add:focus-visible {
  background: var(--surface-gray-1);
  color: var(--text-ink-gray-7);
}
.agenda-month__add span {
  opacity: 0;
}
.agenda-month__add:hover span,
.agenda-month__add:focus-visible span {
  opacity: 1;
}
</style>
