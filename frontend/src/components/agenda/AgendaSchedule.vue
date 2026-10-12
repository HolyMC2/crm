<template>
  <div class="ag-sch" :aria-label="__('Schedule view')">
    <button
      type="button"
      class="ag-sch__edge"
      data-no-swipe
      @click="emit('earlier')"
    >
      <span class="lucide-chevron-up h-4 w-4" aria-hidden="true" />
      {{ __('Earlier days') }}
    </button>
    <template v-for="block in blocks" :key="block.key">
      <h2 v-if="block.type === 'month'" class="ag-sch__month">
        {{ block.label }}
      </h2>
      <p v-else-if="block.type === 'week'" class="ag-sch__week">
        {{ block.label }}
      </p>
      <section
        v-else
        class="ag-sch__day"
        :class="{ 'is-today': block.date === today }"
        :aria-labelledby="`ag-sch-${block.date}`"
        :data-day="block.date"
      >
        <button
          :id="`ag-sch-${block.date}`"
          type="button"
          class="ag-sch__date"
          :aria-label="__('Open {0}', [longDate(block.date)])"
          @click="emit('open-day', block.date)"
        >
          <span class="ag-sch__weekday">{{ weekday(block.date) }}</span>
          <span class="ag-sch__num">{{ Number(block.date.slice(8)) }}</span>
        </button>
        <ul class="ag-sch__events">
          <template v-for="row in block.rows" :key="row.key">
            <li v-if="row.now" class="ag-sch__now" aria-hidden="true">
              <span class="ag-sch__nowdot" />
            </li>
            <li v-else>
              <button
                type="button"
                class="ag-sch__pill"
                :class="pillClasses(row.event)"
                :style="pillStyle(row.event)"
                :aria-current="selected === key(row.event) ? 'true' : undefined"
                :data-event-id="row.event.id"
                @click="
                  emit(
                    'select',
                    row.event,
                    $event.currentTarget.getBoundingClientRect(),
                  )
                "
              >
                <span class="ag-sch__title">
                  <span
                    v-if="row.event.kind === 'task'"
                    :class="
                      row.event.status === 'Done'
                        ? 'lucide-circle-check'
                        : 'lucide-circle'
                    "
                    class="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ row.event.title }}</span>
                </span>
                <span v-if="row.caption" class="ag-sch__time">{{
                  row.caption
                }}</span>
              </button>
            </li>
          </template>
          <li v-if="!block.rows.some((row) => !row.now)">
            <button
              type="button"
              class="ag-sch__empty"
              :disabled="!canCreate"
              @click="emit('create', block.date)"
            >
              {{
                canCreate
                  ? __('Nothing planned today. Tap to schedule.')
                  : __('Nothing scheduled')
              }}
            </button>
          </li>
        </ul>
      </section>
    </template>
    <div ref="sentinel" class="ag-sch__sentinel" aria-hidden="true" />
    <button
      type="button"
      class="ag-sch__edge"
      data-no-swipe
      @click="emit(full ? 'later' : 'more')"
    >
      {{ full ? __('Next days') : __('Show more days') }}
      <span class="lucide-chevron-down h-4 w-4" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { textOn, withAlpha } from '@/components/agenda/agendaColors'
import { eventDates } from '@/components/agenda/agendaGrid'
import { eventKey } from '@/composables/useAgenda'

// The phone schedule, as a native calendar draws it: the date on the left (today in a
// circle), each event a colored pill with its time, a line where «now» is, week and month
// headings, and days without plans left out (today always shows). Multi-day events show on
// every day they cover. Reaching the end loads more days.
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
  colorOf: { type: Function, required: true },
  weekStartsOn: { type: Number, default: 1 },
  // No more days fit in one load: the end offers the next range instead.
  full: { type: Boolean, default: false },
  dimPast: { type: Boolean, default: true },
})
const emit = defineEmits([
  'select',
  'create',
  'open-day',
  'more',
  'later',
  'earlier',
])
const key = eventKey
const sentinel = ref(null)

const fmt = (options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' })
const civil = (date) => new Date(`${date}T12:00:00Z`)
const weekdayFmt = computed(() => fmt({ weekday: 'short' }))
const monthFmt = computed(() => fmt({ month: 'long', year: 'numeric' }))
const shortFmt = computed(() => fmt({ day: 'numeric', month: 'short' }))
const dayFmt = computed(() => fmt({ day: 'numeric' }))
const longFmt = computed(() =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
)
const timeFmt = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      timeZone: props.timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: props.hour12,
    }),
)
const weekday = (date) => weekdayFmt.value.format(civil(date)).replace('.', '')
const longDate = (date) => longFmt.value.format(civil(date))
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const clean = (text) => text.replace(/\./g, '')

function shift(date, days) {
  const value = civil(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function weekStart(date) {
  const day = civil(date).getUTCDay()
  return shift(date, -((day - props.weekStartsOn + 7) % 7))
}
function weekLabel(first) {
  const last = shift(first, 6)
  if (first.slice(0, 7) === last.slice(0, 7))
    return clean(
      `${dayFmt.value.format(civil(first))} – ${shortFmt.value.format(civil(last))}`,
    )
  return clean(
    `${shortFmt.value.format(civil(first))} – ${shortFmt.value.format(civil(last))}`,
  )
}

function span(event) {
  if (event.kind === 'task') return { first: event.date, last: event.date }
  return eventDates(event, props.timeZone)
}
function caption(event, date) {
  if (event.kind === 'task') return ''
  if (event.allDay) return ''
  const s = span(event)
  const start = timeFmt.value.format(new Date(event.start))
  const end = timeFmt.value.format(new Date(event.end))
  if (s.first === s.last) return `${start} – ${end}`
  if (date === s.first) return __('From {0}', [start])
  if (date === s.last) return __('Until {0}', [end])
  return __('All day')
}

const blocks = computed(() => {
  const dates = props.range.dates || []
  const byDate = new Map(dates.map((date) => [date, []]))
  for (const event of props.events) {
    const s = span(event)
    for (let date = s.first; date <= s.last; date = shift(date, 1)) {
      if (byDate.has(date)) byDate.get(date).push(event)
      if (date > dates[dates.length - 1]) break
    }
  }
  const rows = []
  let month = ''
  let week = ''
  for (const date of dates) {
    const events = byDate.get(date)
    if (!events.length && date !== props.today) continue
    if (date.slice(0, 7) !== month) {
      month = date.slice(0, 7)
      rows.push({
        type: 'month',
        key: `m-${month}`,
        label: capital(monthFmt.value.format(civil(date))),
      })
      week = ''
    }
    const first = weekStart(date)
    if (first !== week) {
      week = first
      rows.push({ type: 'week', key: `w-${date}`, label: weekLabel(first) })
    }
    const sorted = events
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.allDay || b.kind === 'task')) -
            Number(Boolean(a.allDay || a.kind === 'task')) ||
          String(a.start).localeCompare(String(b.start)),
      )
    const items = sorted.map((event) => ({
      key: `${key(event)}|${date}`,
      event,
      caption: caption(event, date),
    }))
    if (date === props.today) {
      // The now line sits after what already started.
      const index = items.findIndex(
        (row) =>
          !row.event.allDay &&
          row.event.kind !== 'task' &&
          Date.parse(row.event.start) > props.now,
      )
      const at = index < 0 ? items.length : index
      if (items.length) items.splice(at, 0, { key: 'now', now: true })
    }
    rows.push({ type: 'day', key: `d-${date}`, date, rows: items })
  }
  return rows
})

function pillStyle(event) {
  const color = props.colorOf(event)
  if (event.kind === 'task')
    return {
      background: 'transparent',
      color: 'var(--ink-gray-9)',
      boxShadow: `inset 0 0 0 1.5px ${color}`,
    }
  if (event.kind === 'shift' || event.kind === 'my_shift' || event.estimated)
    return {
      background: withAlpha(color, 0.18),
      color: 'var(--ink-gray-9)',
      borderLeft: `4px solid ${color}`,
    }
  if (event.status === 'Cancelled')
    return {
      background: 'transparent',
      color: 'var(--ink-gray-6)',
      boxShadow: `inset 0 0 0 1.5px ${color}`,
    }
  return { background: color, color: textOn(color) }
}
const pillClasses = (event) => ({
  'is-past': props.dimPast && Date.parse(event.end) < props.now,
  'is-done': event.status === 'Done' || event.status === 'Cancelled',
  'is-selected': props.selected === key(event),
})

// Reaching the end asks for more days (the page grows the range up to its limit).
let observer
onMounted(() => {
  if (!globalThis.IntersectionObserver || !sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !props.full)
        emit('more')
    },
    { rootMargin: '400px 0px' },
  )
  observer.observe(sentinel.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<style scoped>
.ag-sch {
  display: flex;
  flex-direction: column;
  padding: 0 12px 112px 0;
}
.ag-sch__edge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  margin: 4px 12px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--ink-gray-7);
}
.ag-sch__edge:active {
  background: var(--surface-gray-2);
}
.ag-sch__month {
  padding: 18px 16px 4px 72px;
  font-size: 22px;
  font-weight: 500;
  color: var(--ink-gray-9);
}
.ag-sch__week {
  padding: 10px 16px 4px 72px;
  font-size: 13px;
  color: var(--ink-gray-6);
}
.ag-sch__day {
  display: flex;
  align-items: flex-start;
  padding: 4px 0 6px;
  animation: ag-sch-in 0.22s ease-out both;
}
@keyframes ag-sch-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.ag-sch__date {
  display: flex;
  flex: 0 0 64px;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding-top: 4px;
}
.ag-sch__weekday {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-gray-6);
}
.ag-sch__num {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  font-size: 22px;
  color: var(--ink-gray-9);
}
.ag-sch__day.is-today .ag-sch__weekday {
  color: var(--ag-accent-ink);
}
.ag-sch__day.is-today .ag-sch__num {
  background: var(--ag-select-strong);
  color: var(--ag-accent-ink);
  font-weight: 600;
}
.ag-sch__events {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: 4px;
}
.ag-sch__pill {
  display: flex;
  width: 100%;
  min-height: 44px;
  flex-direction: column;
  justify-content: center;
  padding: 6px 14px;
  border-radius: 12px;
  text-align: left;
  transition:
    transform 0.12s,
    filter 0.12s;
}
.ag-sch__pill:active {
  transform: scale(0.98);
  filter: brightness(0.92);
}
.ag-sch__pill.is-past {
  opacity: 0.6;
}
.ag-sch__pill.is-done .ag-sch__title {
  text-decoration: line-through;
}
.ag-sch__pill.is-selected {
  box-shadow: 0 0 0 2px var(--ag-accent);
}
.ag-sch__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 20px;
}
.ag-sch__time {
  font-size: 13px;
  line-height: 18px;
  opacity: 0.9;
}
.ag-sch__now {
  position: relative;
  height: 2px;
  margin: 2px 0;
  background: var(--ink-gray-8);
}
.ag-sch__nowdot {
  position: absolute;
  left: -6px;
  top: -5px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--ink-gray-8);
}
.ag-sch__empty {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 14px;
  color: var(--ink-gray-6);
  text-align: left;
}
.ag-sch__empty:not(:disabled):active {
  background: var(--surface-gray-2);
}
.ag-sch__sentinel {
  height: 1px;
}
</style>
