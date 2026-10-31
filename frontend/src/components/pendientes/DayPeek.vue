<template>
  <!-- The pendiente's day in the Agenda: what is already there and the free hours,
       so picking the time is one tap; «Abrir en Agenda» shows the whole day. -->
  <section
    v-if="loaded"
    class="rounded-6 bg-surface-gray-1 px-3 py-2"
    data-testid="pendiente-day-peek"
    :aria-label="__('On your agenda that day')"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-ink-gray-5">{{
        __('On your agenda that day')
      }}</span>
      <RouterLink
        v-if="linkable"
        :to="agendaTo"
        class="press flex min-h-11 items-center text-sm font-medium text-ink-gray-8 sm:min-h-8"
        data-testid="pendiente-day-agenda"
        @click="$emit('leave')"
        >{{ __('Open in Agenda') }}</RouterLink
      >
    </div>
    <ul v-if="items.length" class="space-y-0.5">
      <li
        v-for="item in items.slice(0, SHOWN)"
        :key="item.key"
        class="flex items-baseline gap-2 text-sm"
      >
        <span class="num min-w-12 shrink-0 text-ink-gray-6">{{
          item.time || __('All day')
        }}</span>
        <span
          v-if="item.task"
          class="lucide-circle size-3 shrink-0 self-center text-ink-gray-5"
          aria-hidden="true"
        />
        <span class="truncate text-ink-gray-8">{{ item.title }}</span>
      </li>
      <li v-if="items.length > SHOWN" class="text-sm text-ink-gray-5">
        {{ __('{0} more', [items.length - SHOWN]) }}
      </li>
    </ul>
    <p v-else class="text-sm text-ink-gray-6">
      {{ __('Nothing on your agenda that day.') }}
    </p>
    <div
      v-if="hours.length"
      class="mt-2 flex flex-wrap items-center gap-2"
      role="group"
      :aria-label="__('Free at')"
    >
      <span class="text-xs text-ink-gray-5">{{ __('Free at') }}</span>
      <button
        v-for="hour in hours"
        :key="hour"
        type="button"
        class="press num min-h-11 rounded-full border px-3 text-sm sm:min-h-8"
        :class="
          time === hour
            ? 'border-transparent bg-surface-green-2 text-ink-green-8'
            : 'border-outline-gray-2 text-ink-gray-7'
        "
        :aria-pressed="String(time === hour)"
        :data-testid="`pendiente-libre-${hour}`"
        @click="$emit('pick', hour)"
      >
        {{ hour }}
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { queryTasks, querySources, rangeFor } from '@/composables/useAgenda'
import { freeHours, peekItems } from '@/components/pendientes/dayPeek'

const props = defineProps({
  date: { type: String, required: true },
  time: { type: String, default: '' },
  today: { type: String, default: '' },
  /** The edited pendiente's calendar id («ToDo:12»): left out of its own day. */
  skipId: { type: String, default: '' },
  /** «Abrir en Agenda» leaves the sheet, so only when nothing would be lost. */
  linkable: { type: Boolean, default: false },
})
defineEmits(['pick', 'leave'])

const SHOWN = 5
// One read per day while the sheet is used; a minute later the day is read again.
const cache = new Map()
const FRESH_MS = 60000

const loaded = ref(false),
  events = ref([]),
  timeZone = ref('')
let timer,
  generation = 0

async function read(date) {
  const hit = cache.get(date)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit
  const zone =
    window.timezone?.system || Intl.DateTimeFormat().resolvedOptions().timeZone
  const range = rangeFor({ view: 'day', date }, zone)
  const [calendar, tasks] = await Promise.all([
    querySources(['Event'], range).catch(() => null),
    queryTasks(range, zone, { done: false }).catch(() => null),
  ])
  const failed = (!calendar || calendar.problems.length) && !tasks
  const value = {
    at: Date.now(),
    failed,
    timeZone: calendar?.timeZone || zone,
    events: [...(calendar?.events || []), ...(tasks || [])],
  }
  if (!failed) cache.set(date, value)
  return value
}

watch(
  () => props.date,
  (date) => {
    clearTimeout(timer)
    if (!date) return (loaded.value = false)
    timer = setTimeout(async () => {
      const current = ++generation
      const value = await read(date)
      if (current !== generation) return
      events.value = value.events
      timeZone.value = value.timeZone
      // No Agenda for this person (or it did not answer): the sheet works without it.
      loaded.value = !value.failed
    }, 250)
  },
  { immediate: true },
)

const items = computed(() =>
  peekItems(events.value, timeZone.value, props.skipId),
)
const hours = computed(() => {
  const now = new Date()
  return freeHours(items.value, {
    date: props.date,
    today: props.today,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  })
})
const agendaTo = computed(() => ({
  path: '/agenda',
  query: {
    view: 'day',
    date: props.date,
    ...(props.skipId ? { event: `tasks:${props.skipId}` } : {}),
  },
}))
</script>
