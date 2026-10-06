<template>
  <div class="flex flex-col gap-4 pb-24 sm:pb-6">
    <section
      v-for="group in groups"
      :key="group.date"
      :aria-labelledby="`agenda-day-${group.date}`"
    >
      <h2
        :id="`agenda-day-${group.date}`"
        class="sticky top-0 z-[1] flex items-baseline gap-2 bg-surface-white py-2 text-lg font-semibold text-ink-gray-9"
      >
        <span>{{ dayTitle(group.date) }}</span>
        <span class="text-sm font-normal text-ink-gray-6">{{
          dayCaption(group.date)
        }}</span>
      </h2>
      <ul
        v-if="group.events.length"
        class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-2"
      >
        <li v-for="event in group.events" :key="key(event)">
          <button
            type="button"
            class="flex min-h-16 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4"
            :class="isShift(event) ? 'bg-surface-gray-1' : ''"
            :aria-current="selected === key(event) ? 'true' : undefined"
            @click="emit('select', event)"
          >
            <span
              class="w-20 shrink-0 pt-0.5 text-sm tabular-nums text-ink-gray-7"
            >
              <template v-if="event.allDay">{{ __('All day') }}</template>
              <template v-else>
                {{ time(event.start) }}<br /><span class="text-ink-gray-5">{{
                  time(event.end)
                }}</span>
              </template>
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <span
                  class="truncate text-md font-medium text-ink-gray-9"
                  :class="event.status === 'Done' ? 'line-through' : ''"
                  >{{ event.title }}</span
                >
                <Badge
                  v-if="marker(event)"
                  :theme="marker(event) === 'now' ? 'green' : 'blue'"
                  :label="marker(event) === 'now' ? __('Now') : __('Next')"
                />
              </span>
              <span class="mt-0.5 block truncate text-sm text-ink-gray-6">{{
                meta(event)
              }}</span>
            </span>
            <Badge
              v-if="statusLabel(event)"
              class="mt-0.5 shrink-0"
              :theme="statusTheme(event)"
              :label="statusLabel(event)"
            />
          </button>
        </li>
      </ul>
      <div
        v-else
        class="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-dashed border-outline-gray-2 px-3 text-sm text-ink-gray-6"
      >
        <span>{{ __('Nothing scheduled') }}</span>
        <Button
          v-if="canCreate"
          variant="ghost"
          class="min-h-11"
          :label="__('Schedule')"
          @click="emit('create', group.date)"
        />
      </div>
    </section>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Badge, Button } from 'frappe-ui'
import { groupAgendaEvents } from '@/vendor/muelle-calendar/core'
import { eventKey } from '@/composables/useAgenda'

const props = defineProps({
  events: { type: Array, required: true },
  range: { type: Object, required: true },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  today: { type: String, required: true },
  now: { type: Number, required: true },
  selected: { type: String, default: '' },
  canCreate: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'create'])
const key = eventKey
const groups = computed(() =>
  groupAgendaEvents(props.events, props.range, props.timeZone).map((group) => ({
    ...group,
    // All-day first, then by start; shifts sit with the timed rows.
    events: group.events
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) ||
          a.start.localeCompare(b.start),
      ),
  })),
)
const isShift = (event) => event.kind === 'shift' || event.kind === 'my_shift'
// «Ahora» for what is running, «Siguiente» for the first upcoming timed event today.
const nextKey = computed(() => {
  const upcoming = props.events
    .filter(
      (event) =>
        !event.allDay &&
        !isShift(event) &&
        Date.parse(event.start) > props.now &&
        dateOf(event.start) === props.today,
    )
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  return upcoming ? key(upcoming) : ''
})
function marker(event) {
  if (event.allDay || isShift(event) || event.status !== 'Scheduled') return ''
  if (Date.parse(event.start) <= props.now && props.now < Date.parse(event.end))
    return 'now'
  return key(event) === nextKey.value ? 'next' : ''
}
function dateOf(instant) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: props.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant))
}
const time = (instant) =>
  new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: props.hour12,
  }).format(new Date(instant))
const civil = (date, options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
function dayTitle(date) {
  if (date === props.today) return __('Today')
  const tomorrow = new Date(`${props.today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  if (date === tomorrow.toISOString().slice(0, 10)) return __('Tomorrow')
  return civil(date, { weekday: 'long' })
}
const dayCaption = (date) => civil(date, { day: 'numeric', month: 'long' })
function meta(event) {
  const parts = []
  if (isShift(event))
    parts.push(event.estimated ? __('Estimated shift') : __('Shift'))
  if (event.location) parts.push(event.location)
  if (event.recurrenceLabel) parts.push(event.recurrenceLabel)
  if (event.organizerName && event.canEdit === false && !isShift(event))
    parts.push(__('Organizer: {0}', [event.organizerName]))
  return parts.join(' · ')
}
function statusLabel(event) {
  if (event.status === 'Done') return __('Done')
  if (event.status === 'Cancelled') return __('Cancelled')
  return ''
}
const statusTheme = (event) => (event.status === 'Done' ? 'green' : 'gray')
</script>
