<template>
  <div
    ref="root"
    class="ag-month"
    :class="{ 'is-compact': compact, 'is-dragging': Boolean(gesture?.active) }"
    role="grid"
    :aria-label="__('Month calendar')"
    :style="{ '--ag-cols': columns }"
  >
    <div class="ag-month__weekdays" role="row">
      <div
        v-for="day in weeks[0].filter(visibleDay)"
        :key="`w-${day}`"
        class="ag-month__weekday"
        role="columnheader"
      >
        {{ weekdayText(day) }}
      </div>
    </div>
    <div class="ag-month__weeks">
      <div
        v-for="(week, weekIndex) in model"
        :key="week.dates[0]"
        class="ag-month__week"
        role="row"
        @pointerdown="onWeekDown($event, week)"
      >
        <div
          v-for="(cell, index) in week.dates"
          :key="cell"
          class="ag-month__day"
          :class="{
            'is-outside': cell.slice(0, 7) !== month,
            'is-today': cell === today,
            'is-picked': compact && cell === date_,
            'is-selecting': selecting(cell),
          }"
          :style="{
            left: `${(index / columns) * 100}%`,
            width: `${100 / columns}%`,
          }"
          :data-agenda-date="cell"
          :data-day="cell"
          role="gridcell"
          :aria-label="dayLabel(cell, week)"
          @click="compact && pick(cell)"
        >
          <button
            type="button"
            class="ag-month__num"
            :aria-label="
              compact ? dayLabel(cell, week) : __('Open {0}', [longDate(cell)])
            "
            @click.stop="compact ? pick(cell) : emit('open-day', cell)"
          >
            <span
              v-if="
                !compact && Number(cell.slice(8)) === 1 && weekIndex + index > 0
              "
              >{{ monthShort(cell) }}</span
            >
            {{ Number(cell.slice(8)) }}
          </button>
          <button
            v-if="!compact && week.hidden[index]"
            type="button"
            class="ag-month__more"
            :style="{ top: `${NUM + week.cut * LANE}px` }"
            @click.stop="openMore($event, cell)"
          >
            {{ __('{0} more', [week.hidden[index]]) }}
          </button>
        </div>
        <template v-if="!compact">
          <button
            v-for="item in week.items"
            :key="`i-${item.event.source}:${item.event.id}`"
            type="button"
            class="ag-month__item"
            :class="itemClasses(item)"
            :style="itemStyle(item)"
            :data-event-id="item.event.id"
            :data-event-source="item.event.source"
            :aria-label="ariaLabel(item.event)"
            :title="ariaLabel(item.event)"
            @pointerdown.stop="onItemDown($event, item, week)"
            @click.stop="
              emit(
                'select',
                item.event,
                $event.currentTarget.getBoundingClientRect(),
              )
            "
          >
            <template v-if="item.bar">
              <span
                v-if="item.event.kind === 'task'"
                :class="
                  item.event.status === 'Done'
                    ? 'lucide-circle-check'
                    : 'lucide-circle'
                "
                class="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span class="truncate">{{ item.event.title }}</span>
            </template>
            <template v-else>
              <span
                class="ag-month__dot"
                :style="{ background: colorOf(item.event) }"
              />
              <span class="ag-month__time">{{ startText(item.event) }}</span>
              <span class="truncate">{{ item.event.title }}</span>
            </template>
          </button>
          <div
            v-for="ghost in ghostsFor(week)"
            :key="ghost.key"
            class="ag-month__ghost"
            :style="{
              left: `calc(${(ghost.from / columns) * 100}% + 2px)`,
              width: `calc(${((ghost.to - ghost.from + 1) / columns) * 100}% - 4px)`,
              top: `${NUM}px`,
              background: ghost.color,
              color: textOn(ghost.color),
            }"
          >
            {{ ghost.label }}
          </div>
        </template>
        <div v-else class="ag-month__dots" aria-hidden="true">
          <template v-for="(cell, index) in week.dates" :key="`d-${cell}`">
            <span
              class="ag-month__dotcell"
              :style="{
                left: `${(index / columns) * 100}%`,
                width: `${100 / columns}%`,
              }"
            >
              <span
                v-for="event in week.byDay[index].slice(0, 3)"
                :key="`${event.source}:${event.id}`"
                class="ag-month__pill"
                :style="{
                  background: colorOf(event),
                  color: textOn(colorOf(event)),
                }"
                >{{ event.title }}</span
              >
              <span
                v-if="week.byDay[index].length > 3"
                class="ag-month__pillmore"
                >+{{ week.byDay[index].length - 3 }}</span
              >
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- «N more»: the whole day in a card over the grid -->
    <div
      v-if="more"
      ref="moreCard"
      class="ag-month__card"
      role="dialog"
      :aria-label="longDate(more.date)"
      :style="more.style"
      @pointerdown.stop
    >
      <div class="flex items-start justify-between">
        <div class="flex-1 text-center">
          <div class="text-xs font-medium uppercase text-ink-gray-6">
            {{ weekdayText(more.date) }}
          </div>
          <button
            type="button"
            class="ag-month__cardnum"
            @click="(emit('open-day', more.date), (more = null))"
          >
            {{ Number(more.date.slice(8)) }}
          </button>
        </div>
        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-gray-2"
          :aria-label="__('Close')"
          @click="more = null"
        >
          <span class="lucide-x h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div class="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
        <button
          v-for="event in dayEvents(more.date)"
          :key="`m-${event.source}:${event.id}`"
          type="button"
          class="ag-month__item is-static"
          :class="{ 'is-bar': isBar(event), 'is-task': event.kind === 'task' }"
          :style="isBar(event) ? paint(event) : {}"
          :data-event-id="event.id"
          @click="
            (emit(
              'select',
              event,
              $event.currentTarget.getBoundingClientRect(),
            ),
            (more = null))
          "
        >
          <template v-if="isBar(event)">
            <span class="truncate">{{ event.title }}</span>
          </template>
          <template v-else>
            <span
              class="ag-month__dot"
              :style="{ background: colorOf(event) }"
            />
            <span class="ag-month__time">{{ startText(event) }}</span>
            <span class="truncate">{{ event.title }}</span>
          </template>
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { textOn, withAlpha } from '@/components/agenda/agendaColors'
import {
  dayDiff,
  eventDates,
  isBar,
  monthWeeks,
  wallInstant,
  wallParts,
} from '@/components/agenda/agendaGrid'

const props = defineProps({
  date: { type: String, required: true },
  events: { type: Array, default: () => [] },
  colorOf: { type: Function, required: true },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  today: { type: String, required: true },
  now: { type: Number, default: () => Date.now() },
  weekStartsOn: { type: Number, default: 1 },
  showWeekends: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: true },
  createColor: { type: String, default: '#039be5' },
  draft: { type: Object, default: null },
  selectedKey: { type: String, default: '' },
  dimPast: { type: Boolean, default: true },
})
const emit = defineEmits([
  'select',
  'create',
  'create-day',
  'move-days',
  'open-day',
  'pick',
])

const NUM = 28
const LANE = 22
const root = ref(null)
const height = ref(720)
const gesture = ref(null)
const more = ref(null)
const moreCard = ref(null)
const date_ = computed(() => props.date)
const month = computed(() => props.date.slice(0, 7))
const key = (event) => `${event.source}:${event.id}`

const weekend = (date) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}
const visibleDay = (date) => props.showWeekends || weekend(date) === false
const weeks = computed(() => monthWeeks(props.date, props.weekStartsOn))
const columns = computed(() => weeks.value[0].filter(visibleDay).length)

// --- formatting -------------------------------------------------------------------------
const civil = (date) => new Date(`${date}T12:00:00Z`)
const fmt = (options) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' })
const weekdayFmt = computed(() => fmt({ weekday: 'short' }))
const longFmt = computed(() =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
)
const monthFmt = computed(() => fmt({ month: 'short' }))
const timeFmt = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: props.hour12,
      timeZone: props.timeZone,
    }),
)
const weekdayText = (date) =>
  weekdayFmt.value.format(civil(date)).replace('.', '')
const longDate = (date) => longFmt.value.format(civil(date))
const monthShort = (date) => monthFmt.value.format(civil(date)).replace('.', '')
const startText = (event) =>
  timeFmt.value
    .format(new Date(event.start))
    .replace(/\s?([ap])\.?\s?m\.?/i, '$1')
const ariaLabel = (event) =>
  isBar(event)
    ? `${event.title}, ${__('All day')}`
    : `${event.title}, ${timeFmt.value.format(new Date(event.start))}`

// --- model --------------------------------------------------------------------------------
function spanOf(event) {
  if (event.kind === 'task') return { first: event.date, last: event.date }
  return eventDates(event, props.timeZone)
}
const model = computed(() => {
  const weekH = Math.max(80, (height.value - 28) / weeks.value.length)
  const capacity = Math.max(1, Math.floor((weekH - NUM - 2) / LANE))
  return weeks.value.map((all) => {
    const dates = all.filter(visibleDay)
    const first = dates[0]
    const last = dates[dates.length - 1]
    const rows = []
    for (const event of props.events) {
      const span = spanOf(event)
      if (span.last < first || span.first > last) continue
      let from = dates.findIndex((date) => date >= span.first)
      let to =
        dates.length -
        1 -
        [...dates].reverse().findIndex((date) => date <= span.last)
      if (from < 0 || to >= dates.length || to < from) continue
      rows.push({
        event,
        from,
        to,
        bar: isBar(event),
        before: span.first < dates[from],
        after: span.last > dates[to],
        length: dayDiff(span.first, span.last),
      })
    }
    rows.sort(
      (a, b) =>
        a.from - b.from ||
        b.length - a.length ||
        Number(b.bar) - Number(a.bar) ||
        String(a.event.start || '').localeCompare(String(b.event.start || '')),
    )
    const lanes = []
    for (const row of rows) {
      let lane = lanes.findIndex((busy) =>
        busy.every(
          (used, index) => index < row.from || index > row.to || !used,
        ),
      )
      if (lane < 0) {
        lane = lanes.length
        lanes.push(Array(dates.length).fill(false))
      }
      for (let index = row.from; index <= row.to; index++)
        lanes[lane][index] = true
      row.lane = lane
    }
    const overflow = lanes.length > capacity
    const cut = overflow ? Math.max(0, capacity - 1) : capacity
    const hidden = dates.map(
      (_, index) =>
        rows.filter(
          (row) => row.lane >= cut && row.from <= index && row.to >= index,
        ).length,
    )
    const byDay = dates.map((_, index) =>
      rows
        .filter((row) => row.from <= index && row.to >= index)
        .map((row) => row.event),
    )
    return {
      dates,
      items: rows.filter((row) => row.lane < cut),
      hidden: overflow ? hidden : hidden.map(() => 0),
      cut,
      byDay,
    }
  })
})
function dayEvents(date) {
  for (const week of model.value) {
    const index = week.dates.indexOf(date)
    if (index >= 0) return week.byDay[index]
  }
  return []
}
function dayLabel(date, week) {
  const count = week.byDay[week.dates.indexOf(date)]?.length || 0
  return `${longDate(date)}: ${count ? __('{0} events', [count]) : __('Nothing scheduled')}`
}

// --- styles ---------------------------------------------------------------------------
const isPast = (event) => props.dimPast && Date.parse(event.end) < props.now
function paint(event) {
  const color = props.colorOf(event)
  if (event.kind === 'task')
    return {
      background: 'transparent',
      color: 'var(--ink-gray-8)',
      boxShadow: `inset 0 0 0 1px ${color}`,
      '--ag-dot': color,
    }
  if (event.kind === 'shift' || event.kind === 'my_shift' || event.estimated)
    return {
      background: withAlpha(color, 0.16),
      color: 'var(--ink-gray-9)',
      borderLeft: `3px solid ${color}`,
    }
  if (event.status === 'Cancelled')
    return {
      background: 'transparent',
      color: 'var(--ink-gray-6)',
      boxShadow: `inset 0 0 0 1px ${color}`,
    }
  return { background: color, color: textOn(color) }
}
function itemStyle(item) {
  const n = columns.value
  const dragging =
    gesture.value?.active &&
    gesture.value.item &&
    key(gesture.value.item.event) === key(item.event)
  return {
    left: `calc(${(item.from / n) * 100}% + 2px)`,
    width: `calc(${((item.to - item.from + 1) / n) * 100}% - 4px)`,
    top: `${NUM + item.lane * LANE}px`,
    opacity: dragging ? 0.35 : undefined,
    ...(item.bar ? paint(item.event) : {}),
  }
}
function itemClasses(item) {
  return {
    'is-bar': item.bar,
    'is-task': item.event.kind === 'task',
    'is-past': isPast(item.event),
    'is-done': item.event.status === 'Done',
    'is-cancelled': item.event.status === 'Cancelled',
    'is-selected': props.selectedKey === key(item.event),
    'is-before': item.before,
    'is-after': item.after,
    'is-draggable': Boolean(item.event.draggable),
  }
}

// --- gestures: drag across days selects them; a dragged chip moves days --------------
function dateAtPoint(x, y) {
  const cell = document
    .elementsFromPoint(x, y)
    .find((el) => el.matches?.('[data-agenda-date]'))
  return cell?.dataset.agendaDate || null
}
function begin(state, event) {
  gesture.value = {
    ...state,
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    active: false,
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKey)
}
function cancel() {
  gesture.value = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('keydown', onKey)
}
const onKey = (event) =>
  event.key === 'Escape' && (cancel(), (more.value = null))
function onWeekDown(event, week) {
  if (props.compact || event.button !== 0 || event.pointerType === 'touch')
    return
  if (event.target.closest('.ag-month__item, .ag-month__num, .ag-month__more'))
    return
  const date = dateAtPoint(event.clientX, event.clientY)
  if (!date) return
  event.preventDefault()
  more.value = null
  begin({ type: 'select', from: date, to: date, week }, event)
}
function onItemDown(event, item) {
  if (
    event.button !== 0 ||
    event.pointerType === 'touch' ||
    !item.event.draggable
  )
    return
  const date = dateAtPoint(event.clientX, event.clientY)
  if (!date) return
  begin({ type: 'move', item, from: date, to: date }, event)
}
function onMove(event) {
  const g = gesture.value
  if (!g || event.pointerId !== g.pointerId) return
  if (!g.active) {
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) < 4) return
    g.active = true
  }
  g.to = dateAtPoint(event.clientX, event.clientY) || g.to
}
function swallowClick() {
  const swallow = (click) => {
    click.stopPropagation()
    click.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(
    () => window.removeEventListener('click', swallow, { capture: true }),
    0,
  )
}
function cellRect(date) {
  return (
    root.value
      ?.querySelector(`[data-agenda-date="${date}"]`)
      ?.getBoundingClientRect() || null
  )
}
function onUp(event) {
  const g = gesture.value
  if (!g || event.pointerId !== g.pointerId) return
  cancel()
  if (g.type === 'select') {
    if (!props.canCreate) return
    if (g.active) swallowClick()
    const [from, to] = g.from <= g.to ? [g.from, g.to] : [g.to, g.from]
    if (from === to) return emit('create-day', from, cellRect(from))
    const a = cellRect(from)
    const b = cellRect(to)
    emit('create', {
      start: wallInstant(from, 0, props.timeZone),
      end: wallInstant(to, 1440, props.timeZone),
      allDay: true,
      rect:
        a && b
          ? {
              left: Math.min(a.left, b.left),
              right: Math.max(a.right, b.right),
              top: Math.min(a.top, b.top),
              bottom: Math.max(a.bottom, b.bottom),
              width: Math.abs(b.right - a.left),
              height: a.height,
            }
          : a,
    })
    return
  }
  if (!g.active) return
  swallowClick()
  const delta = dayDiff(g.from, g.to)
  if (delta) emit('move-days', g.item.event, delta)
}

// Draws: the selection being dragged, the draft waiting in quick create, the moving chip.
function ghostsFor(week) {
  const g = gesture.value
  const rows = []
  const index = (date) => week.dates.indexOf(date)
  const range = (first, last, color, label, keyName) => {
    const from = week.dates.findIndex((date) => date >= first)
    const tail = [...week.dates].reverse().findIndex((date) => date <= last)
    const to = tail < 0 ? -1 : week.dates.length - 1 - tail
    if (from >= 0 && to >= from)
      rows.push({ key: keyName, from, to, color, label })
  }
  if (g?.active && g.type === 'move') {
    const span = spanOf(g.item.event)
    const delta = dayDiff(g.from, g.to)
    const first = shiftDate(span.first, delta)
    const last = shiftDate(span.last, delta)
    range(first, last, props.colorOf(g.item.event), g.item.event.title, 'move')
  } else if (!g?.active && props.draft) {
    const first = wallParts(props.draft.start, props.timeZone).date
    const last = props.draft.allDay
      ? wallParts(Date.parse(props.draft.end) - 1, props.timeZone).date
      : first
    range(
      first,
      last,
      props.createColor,
      props.draft.title || __('(No title)'),
      'draft',
    )
  }
  void index
  return rows
}
function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function selecting(date) {
  const g = gesture.value
  if (!g || g.type !== 'select' || !g.active) return false
  const [from, to] = g.from <= g.to ? [g.from, g.to] : [g.to, g.from]
  return date >= from && date <= to
}

// --- «N more» card and phone picking -----------------------------------------------------
function openMore(event, date) {
  const box = event.currentTarget
    .closest('[data-agenda-date]')
    .getBoundingClientRect()
  const host = root.value.getBoundingClientRect()
  const width = Math.max(220, box.width + 24)
  let left = box.left - host.left - 12
  left = Math.max(4, Math.min(left, host.width - width - 4))
  const top = Math.max(4, Math.min(box.top - host.top - 8, host.height - 320))
  more.value = {
    date,
    style: { left: `${left}px`, top: `${top}px`, width: `${width}px` },
  }
}
function pick(date) {
  if (date === props.date && props.canCreate)
    emit('create-day', date, cellRect(date))
  else emit('pick', date)
}
function outside(event) {
  if (more.value && moreCard.value && !moreCard.value.contains(event.target))
    more.value = null
}

let observer
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    height.value = entry.contentRect.height
  })
  if (root.value) observer.observe(root.value)
  window.addEventListener('pointerdown', outside, true)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('pointerdown', outside, true)
  cancel()
})
</script>
<style scoped>
.ag-month {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 420px;
  user-select: none;
}
.ag-month.is-compact {
  min-height: 0;
  height: auto;
}
.ag-month__weekdays {
  display: grid;
  grid-template-columns: repeat(var(--ag-cols), minmax(0, 1fr));
  border-left: 1px solid var(--outline-gray-1);
}
.ag-month__weekday {
  padding: 6px 0 2px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-gray-6);
  border-right: 1px solid var(--outline-gray-1);
}
.ag-month__weeks {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--outline-gray-1);
}
.ag-month__week {
  position: relative;
  flex: 1 1 0;
  min-height: 84px;
  border-bottom: 1px solid var(--outline-gray-1);
}
.is-compact .ag-month__week {
  flex: none;
  min-height: 0;
  height: 64px;
}
.ag-month__day {
  position: absolute;
  top: 0;
  bottom: 0;
  border-right: 1px solid var(--outline-gray-1);
}
.ag-month__day.is-outside {
  background: var(--surface-gray-1);
}
.ag-month__day.is-outside .ag-month__num {
  color: var(--ink-gray-5);
}
.ag-month__day.is-selecting {
  background: var(--ag-select-tint);
}
.ag-month__day.is-picked {
  background: var(--surface-gray-2);
}
.ag-month__num {
  display: block;
  margin: 4px auto 0;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 24px;
  text-align: center;
  color: var(--ink-gray-8);
  white-space: nowrap;
}
.ag-month__num:hover {
  background: var(--surface-gray-2);
}
.ag-month__day.is-today .ag-month__num {
  background: var(--ag-accent);
  color: var(--ag-on-accent);
}
.ag-month__more {
  position: absolute;
  left: 4px;
  right: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-gray-7);
}
.ag-month__more:hover {
  background: var(--surface-gray-2);
}
.ag-month__item {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  color: var(--ink-gray-8);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}
.ag-month__item:not(.is-bar):hover,
.ag-month__item.is-static:not(.is-bar):hover {
  background: var(--surface-gray-2);
}
.ag-month__item.is-static {
  position: relative;
  flex: none;
  width: 100%;
}
.ag-month__item.is-bar {
  font-weight: 500;
}
.ag-month__item.is-task .lucide-circle,
.ag-month__item.is-task .lucide-circle-check {
  color: var(--ag-dot);
}
.ag-month__item.is-draggable {
  cursor: grab;
}
.ag-month__item.is-before {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.ag-month__item.is-after {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.ag-month__item.is-past {
  opacity: 0.62;
}
.ag-month__item.is-done,
.ag-month__item.is-cancelled {
  text-decoration: line-through;
}
.ag-month__item.is-selected {
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.45);
  z-index: 5;
}
.ag-month__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.ag-month__time {
  flex: none;
  color: var(--ink-gray-6);
}
.ag-month__ghost {
  position: absolute;
  z-index: 6;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  pointer-events: none;
  box-shadow: 0 6px 16px -4px rgba(0, 0, 0, 0.35);
}
.ag-month__dots {
  position: absolute;
  inset: 30px 0 0;
  pointer-events: none;
}
.ag-month__dotcell {
  position: absolute;
  top: 0;
  bottom: 2px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 2px;
  overflow: hidden;
}
.ag-month__pill {
  display: block;
  height: 9px;
  padding: 0 2px;
  border-radius: 2px;
  font-size: 7px;
  line-height: 9px;
  white-space: nowrap;
  overflow: hidden;
}
.ag-month__pillmore {
  font-size: 9px;
  line-height: 9px;
  color: var(--ink-gray-6);
}
.ag-month__card {
  position: absolute;
  z-index: 50;
  padding: 10px 10px 12px;
  border-radius: 12px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow:
    0 12px 32px -8px rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--outline-gray-1);
}
.ag-month__cardnum {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  font-size: 22px;
  color: var(--ink-gray-8);
}
.ag-month__cardnum:hover {
  background: var(--surface-gray-2);
}
</style>
