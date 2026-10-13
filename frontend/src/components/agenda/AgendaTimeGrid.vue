<template>
  <div
    class="ag-tg"
    :class="{ 'is-dragging': Boolean(gesture?.active), 'is-compact': compact }"
    :style="{ '--ag-hour': `${hourHeight}px`, '--ag-cols': dates.length }"
  >
    <!-- day headings -->
    <div class="ag-tg__head" role="row">
      <div class="ag-tg__zone" :title="timeZone">{{ zoneLabel }}</div>
      <div
        v-for="date in dates"
        :key="`h-${date}`"
        class="ag-tg__dayhead"
        :class="{ 'is-today': date === today, 'is-past': date < today }"
        role="columnheader"
      >
        <span class="ag-tg__weekday">{{ weekdayText(date) }}</span>
        <button
          type="button"
          class="ag-tg__daynum"
          :aria-label="__('Open {0}', [longDate(date)])"
          @click="emit('open-day', date)"
        >
          {{ Number(date.slice(8)) }}
        </button>
      </div>
    </div>

    <!-- all-day lane -->
    <div class="ag-tg__allday" :aria-label="__('All day')">
      <div class="ag-tg__zone ag-tg__alldaylabel">
        <button
          v-if="barModel.lanes > maxLanes"
          type="button"
          class="ag-tg__expand"
          :aria-expanded="expanded"
          :aria-label="expanded ? __('Show less') : __('Show all')"
          @click="expanded = !expanded"
        >
          <span
            :class="expanded ? 'lucide-chevron-up' : 'lucide-chevron-down'"
            class="h-4 w-4"
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        ref="alldayArea"
        class="ag-tg__alldayarea"
        :style="{ height: `${alldayHeight}px` }"
        @pointerdown="onAllDayDown"
      >
        <div
          v-for="(date, index) in dates"
          :key="`a-${date}`"
          class="ag-tg__alldaycell"
          :class="{ 'is-selecting': dayIsSelected(date) }"
          :style="{
            left: `${(index / dates.length) * 100}%`,
            width: `${100 / dates.length}%`,
          }"
          :data-date="date"
        >
          <button
            v-if="hiddenCount(index)"
            type="button"
            class="ag-tg__more"
            @click.stop="expanded = true"
          >
            {{ __('{0} more', [hiddenCount(index)]) }}
          </button>
        </div>
        <div
          v-if="alldayGhost"
          class="ag-ghost ag-ghost--bar"
          :style="{
            left: `calc(${(alldayGhost.from / dates.length) * 100}% + 2px)`,
            width: `calc(${((alldayGhost.to - alldayGhost.from + 1) / dates.length) * 100}% - 4px)`,
            top: '2px',
            background: selectColor,
            color: textOn(selectColor),
          }"
        >
          {{ alldayGhost.label }}
        </div>
        <button
          v-for="bar in visibleBars"
          :key="`b-${bar.event.source}:${bar.event.id}`"
          type="button"
          class="ag-bar"
          :class="barClasses(bar)"
          :style="barStyle(bar)"
          :data-event-id="bar.event.id"
          :data-event-source="bar.event.source"
          :aria-label="ariaLabel(bar.event)"
          :title="ariaLabel(bar.event)"
          @pointerdown.stop="onBarDown($event, bar)"
          @click.stop="clickEvent($event, bar.event)"
        >
          <span
            v-if="bar.event.kind === 'task'"
            :class="
              bar.event.status === 'Done'
                ? 'lucide-circle-check'
                : 'lucide-circle'
            "
            class="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">{{ bar.event.title }}</span>
        </button>
      </div>
    </div>

    <!-- time grid -->
    <div ref="scroller" class="ag-tg__scroll">
      <div
        ref="body"
        class="ag-tg__body"
        :style="{ height: `${hourHeight * 24}px` }"
      >
        <div class="ag-tg__gutter" aria-hidden="true">
          <span
            v-for="hour in 23"
            :key="hour"
            class="ag-tg__hour"
            :style="{ top: `${hour * hourHeight}px` }"
            >{{ hourText(hour) }}</span
          >
        </div>
        <div ref="cols" class="ag-tg__cols">
          <div
            v-for="date in dates"
            :key="`c-${date}`"
            class="ag-tg__col"
            :class="{ 'is-today': date === today }"
            :data-date="date"
            role="group"
            :aria-label="longDate(date)"
            @pointerdown="onColumnDown($event, date)"
          >
            <button
              v-for="item in layout[date]"
              :key="`e-${item.event.source}:${item.event.id}:${item.start}`"
              type="button"
              class="ag-event"
              :class="eventClasses(item)"
              :style="eventStyle(item)"
              :data-event-id="item.event.id"
              :data-event-source="item.event.source"
              :aria-label="ariaLabel(item.event)"
              :title="ariaLabel(item.event)"
              @pointerdown.stop="onEventDown($event, item, date)"
              @click.stop="clickEvent($event, item.event)"
            >
              <!-- The body clips the text to the event's box, so on a phone the
                   button itself can take taps on a 44 px area around it. -->
              <span class="ag-event__body">
                <span class="ag-event__title">{{ item.event.title }}</span>
                <span
                  v-if="item.end - item.start >= 45"
                  class="ag-event__time"
                  >{{ timeRange(item) }}</span
                >
                <span
                  v-if="item.end - item.start >= 75 && item.event.location"
                  class="ag-event__time"
                  >{{ item.event.location }}</span
                >
              </span>
              <span
                v-if="isResizable(item)"
                class="ag-event__handle"
                aria-hidden="true"
                @pointerdown.stop="onResizeDown($event, item, date)"
              />
            </button>
            <div
              v-for="ghost in ghostsFor(date)"
              :key="ghost.key"
              class="ag-ghost"
              :class="{ 'is-move': ghost.move }"
              :style="{
                top: `${(ghost.start / 60) * hourHeight}px`,
                height: `${Math.max(((ghost.end - ghost.start) / 60) * hourHeight - 2, 14)}px`,
                background: ghost.color,
                color: textOn(ghost.color),
              }"
              :data-ghost="ghost.key"
              role="status"
              aria-live="polite"
            >
              <span class="ag-event__title">{{ ghost.title }}</span>
              <span class="ag-event__time">{{ ghost.label }}</span>
            </div>
            <div
              v-if="date === today && nowMinutes !== null"
              class="ag-now"
              :style="{ top: `${(nowMinutes / 60) * hourHeight}px` }"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { textOn, withAlpha } from '@/components/agenda/agendaColors'
import {
  daySegments,
  dayDiff,
  durationText,
  isBar,
  layoutDay,
  packBars,
  snap,
  wallInstant,
  wallParts,
} from '@/components/agenda/agendaGrid'

const props = defineProps({
  dates: { type: Array, required: true },
  events: { type: Array, default: () => [] },
  colorOf: { type: Function, required: true },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  today: { type: String, required: true },
  now: { type: Number, default: () => Date.now() },
  hourHeight: { type: Number, default: 48 },
  scrollHour: { type: Number, default: 8 },
  canCreate: { type: Boolean, default: true },
  createColor: { type: String, default: '#039be5' },
  defaultDuration: { type: Number, default: 60 },
  // { start, end, allDay } of the event being created (quick create open): stays drawn.
  draft: { type: Object, default: null },
  selectedKey: { type: String, default: '' },
  dimPast: { type: Boolean, default: true },
  // Phone: all-day bars become 44 px tap targets (taller lanes).
  compact: { type: Boolean, default: false },
})
const emit = defineEmits([
  'select',
  'create',
  'move',
  'resize',
  'move-days',
  'open-day',
])

const scroller = ref(null)
const body = ref(null)
const cols = ref(null)
const alldayArea = ref(null)
const expanded = ref(false)
const gesture = ref(null)
const maxLanes = 3
const LANE = 24
const COMPACT_LANE = 46
const lane = computed(() => (props.compact ? COMPACT_LANE : LANE))
const STEP = 15
const MOVE_THRESHOLD = 4

const key = (event) => `${event.source}:${event.id}`
const selectColor = computed(() => props.createColor)

// --- formatting -----------------------------------------------------------------------
const weekdayFormat = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
)
const longFormat = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }),
)
const timeFormat = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: props.hour12,
      timeZone: 'UTC',
    }),
)
const hourFormat = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      hour: 'numeric',
      hour12: props.hour12,
      timeZone: 'UTC',
    }),
)
const civil = (date) => new Date(`${date}T12:00:00Z`)
const weekdayText = (date) =>
  weekdayFormat.value.format(civil(date)).replace('.', '')
const longDate = (date) => longFormat.value.format(civil(date))
const minutesText = (minutes) =>
  timeFormat.value.format(new Date(Date.UTC(2024, 0, 1, 0, minutes % 1440)))
const hourText = (hour) =>
  hourFormat.value.format(new Date(Date.UTC(2024, 0, 1, hour)))
const zoneLabel = computed(() => {
  try {
    return (
      new Intl.DateTimeFormat(props.locale, {
        timeZone: props.timeZone,
        timeZoneName: 'shortOffset',
      })
        .formatToParts(new Date(props.now))
        .find((part) => part.type === 'timeZoneName')?.value || ''
    )
  } catch {
    return ''
  }
})
const timeRange = (item) =>
  `${minutesText(item.start)} – ${minutesText(item.end)}`
function ariaLabel(event) {
  if (event.kind === 'task') return `${event.title}, ${__('Task')}`
  if (isBar(event)) return `${event.title}, ${__('All day')}`
  const start = wallParts(event.start, props.timeZone)
  const end = wallParts(event.end, props.timeZone)
  return `${event.title}, ${minutesText(start.minutes)} – ${minutesText(end.minutes)}`
}

// --- layout ---------------------------------------------------------------------------
const layout = computed(() => {
  const segments = daySegments(props.events, props.dates, props.timeZone)
  return Object.fromEntries(
    props.dates.map((date) => [date, layoutDay(segments[date] || [])]),
  )
})
const barModel = computed(() =>
  packBars(props.events, props.dates, props.timeZone),
)
const shownLanes = computed(() =>
  expanded.value
    ? barModel.value.lanes
    : Math.min(barModel.value.lanes, maxLanes),
)
const visibleBars = computed(() =>
  barModel.value.bars.filter(
    (bar) =>
      expanded.value ||
      barModel.value.lanes <= maxLanes ||
      bar.lane < maxLanes - 1,
  ),
)
const alldayHeight = computed(() => {
  const lanes =
    !expanded.value && barModel.value.lanes > maxLanes
      ? maxLanes
      : shownLanes.value
  return Math.max(1, lanes) * lane.value + 6
})
function hiddenCount(index) {
  if (expanded.value || barModel.value.lanes <= maxLanes) return 0
  return barModel.value.bars.filter(
    (bar) => bar.lane >= maxLanes - 1 && bar.from <= index && bar.to >= index,
  ).length
}
const nowMinutes = computed(() => {
  const parts = wallParts(props.now, props.timeZone)
  return parts.date === props.today ? parts.minutes : null
})

// --- styles ---------------------------------------------------------------------------
const isPast = (event) => props.dimPast && Date.parse(event.end) < props.now
function paint(event) {
  const color = props.colorOf(event)
  if (event.kind === 'shift' || event.kind === 'my_shift' || event.estimated)
    return {
      background: withAlpha(color, 0.16),
      color: 'var(--ink-gray-9)',
      borderLeft: `3px solid ${color}`,
    }
  if (event.status === 'Cancelled')
    return {
      background: 'var(--surface-base)',
      color: 'var(--ink-gray-6)',
      border: `1px dashed ${color}`,
    }
  return { background: color, color: textOn(color) }
}
function eventStyle(item) {
  const width = 100 / item.cols
  const top = (item.start / 60) * props.hourHeight
  const height = Math.max(
    ((item.end - item.start) / 60) * props.hourHeight - 2,
    16,
  )
  const dragging =
    gesture.value?.active &&
    gesture.value.item &&
    key(gesture.value.item.event) === key(item.event)
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${item.col * width}% + 1px)`,
    width: `calc(${width * item.span}% - ${item.col + item.span < item.cols ? 0 : 10}px)`,
    zIndex: 2 + item.col,
    opacity: dragging ? 0.35 : undefined,
    ...paint(item.event),
  }
}
function eventClasses(item) {
  const event = item.event
  return {
    'is-short': item.end - item.start < 45,
    'is-past': isPast(event),
    'is-done': event.status === 'Done',
    'is-cancelled': event.status === 'Cancelled',
    'is-selected': props.selectedKey === key(event),
    'is-draggable': Boolean(event.draggable),
    'is-before': item.before,
    'is-after': item.after,
  }
}
function barStyle(bar) {
  const n = props.dates.length
  const dragging =
    gesture.value?.active &&
    gesture.value.bar &&
    key(gesture.value.bar.event) === key(bar.event)
  const base =
    bar.event.kind === 'task'
      ? {
          background: 'transparent',
          color: 'var(--ink-gray-8)',
          boxShadow: `inset 0 0 0 1px ${props.colorOf(bar.event)}`,
        }
      : paint(bar.event)
  return {
    left: `calc(${(bar.from / n) * 100}% + 2px)`,
    width: `calc(${((bar.to - bar.from + 1) / n) * 100}% - 4px)`,
    top: `${bar.lane * lane.value + 2}px`,
    opacity: dragging ? 0.35 : undefined,
    ...base,
    ...(bar.event.kind === 'task'
      ? { '--ag-dot': props.colorOf(bar.event) }
      : {}),
  }
}
function barClasses(bar) {
  return {
    'is-task': bar.event.kind === 'task',
    'is-past': isPast(bar.event),
    'is-done': bar.event.status === 'Done',
    'is-cancelled': bar.event.status === 'Cancelled',
    'is-selected': props.selectedKey === key(bar.event),
    'is-before': bar.before,
    'is-after': bar.after,
    'is-draggable': Boolean(bar.event.draggable),
  }
}
const isResizable = (item) =>
  Boolean(item.event.draggable) && !item.after && item.event.kind !== 'task'

// --- ghosts (selection being dragged, draft waiting in quick create, event being moved)
const ghostsFor = (date) => {
  const rows = []
  const g = gesture.value
  if (g?.active && g.type === 'select' && g.date === date) {
    const [start, end] = [Math.min(g.from, g.to), Math.max(g.from, g.to)]
    const span = Math.max(end, start + STEP)
    rows.push({
      key: 'select',
      start,
      end: span,
      color: selectColor.value,
      title: __('(No title)'),
      label: `${minutesText(start)} – ${minutesText(span)} · ${durationText(span - start)}`,
    })
  } else if (
    g?.active &&
    (g.type === 'move' || g.type === 'resize') &&
    g.date === date
  ) {
    rows.push({
      key: 'move',
      move: true,
      start: g.start,
      end: g.end,
      color: props.colorOf(g.item.event),
      title: g.item.event.title,
      label: `${minutesText(g.start)} – ${minutesText(g.end)}`,
    })
  } else if (!g?.active && props.draft && !props.draft.allDay) {
    const start = wallParts(props.draft.start, props.timeZone)
    const end = wallParts(props.draft.end, props.timeZone)
    if (start.date === date) {
      const stop = end.date === date ? end.minutes : 1440
      rows.push({
        key: 'draft',
        start: start.minutes,
        end: stop,
        color: selectColor.value,
        title: props.draft.title || __('(No title)'),
        label: `${minutesText(start.minutes)} – ${minutesText(stop)}`,
      })
    }
  }
  return rows
}
const alldayGhost = computed(() => {
  const g = gesture.value
  if (g?.active && g.type === 'allday') {
    const from = Math.min(g.from, g.to)
    const to = Math.max(g.from, g.to)
    return { from, to, label: __('(No title)') }
  }
  if (g?.active && g.type === 'bar') {
    const from = Math.max(0, g.bar.from + g.delta)
    const to = Math.min(props.dates.length - 1, g.bar.to + g.delta)
    return to >= from ? { from, to, label: g.bar.event.title } : null
  }
  if (!g?.active && props.draft?.allDay) {
    const first = wallParts(props.draft.start, props.timeZone).date
    const last = wallParts(Date.parse(props.draft.end) - 1, props.timeZone).date
    const from = Math.max(0, dayDiff(props.dates[0], first))
    const to = Math.min(props.dates.length - 1, dayDiff(props.dates[0], last))
    if (to >= from)
      return { from, to, label: props.draft.title || __('(No title)') }
  }
  return null
})
const dayIsSelected = (date) => {
  const ghost = alldayGhost.value
  if (!ghost || gesture.value?.type === 'bar') return false
  const index = props.dates.indexOf(date)
  return index >= ghost.from && index <= ghost.to
}

// --- pointer geometry -------------------------------------------------------------------
function minutesAt(clientY) {
  const box = body.value.getBoundingClientRect()
  return ((clientY - box.top) / props.hourHeight) * 60
}
function dateAt(clientX) {
  const box = cols.value.getBoundingClientRect()
  const index = Math.floor(
    ((clientX - box.left) / box.width) * props.dates.length,
  )
  return props.dates[Math.max(0, Math.min(props.dates.length - 1, index))]
}
function dayIndexAt(clientX) {
  const box = alldayArea.value.getBoundingClientRect()
  const index = Math.floor(
    ((clientX - box.left) / box.width) * props.dates.length,
  )
  return Math.max(0, Math.min(props.dates.length - 1, index))
}
function autoScroll(clientY) {
  const box = scroller.value?.getBoundingClientRect()
  if (!box) return
  if (clientY < box.top + 36) scroller.value.scrollTop -= 14
  else if (clientY > box.bottom - 36) scroller.value.scrollTop += 14
}
function rectOf(selector) {
  const element = selector ? document.querySelector(selector) : null
  return element?.getBoundingClientRect?.() || null
}

// --- gestures ----------------------------------------------------------------------------
function begin(state, event) {
  gesture.value = {
    ...state,
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    active: false,
    touch: event.pointerType === 'touch',
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKey)
}
function cancel() {
  clearTimeout(gesture.value?.hold)
  gesture.value = null
  window.removeEventListener('touchmove', holdScroll, { capture: true })
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('keydown', onKey)
}
function onKey(event) {
  if (event.key === 'Escape') cancel()
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

function onColumnDown(event, date) {
  if (event.button !== 0 || !props.canCreate) return
  if (event.target.closest('.ag-event, .ag-ghost')) return
  const minutes = Math.floor(minutesAt(event.clientY) / STEP) * STEP
  // Touch keeps native scrolling: a tap creates, a drag scrolls.
  if (event.pointerType !== 'touch') event.preventDefault()
  begin({ type: 'select', date, from: minutes, to: minutes + STEP }, event)
}
function onAllDayDown(event) {
  if (event.button !== 0 || !props.canCreate) return
  if (event.target.closest('.ag-bar, .ag-tg__more')) return
  if (event.pointerType !== 'touch') event.preventDefault()
  const index = dayIndexAt(event.clientX)
  begin({ type: 'allday', from: index, to: index }, event)
}
// Touch: hold an event to lift it (a short buzz), then drag it to another time or day,
// as in a native calendar. Moving before the hold is a scroll, as always.
const HOLD_MS = 380
function holdScroll(event) {
  if (!gesture.value?.active) return
  // While an event is lifted the page neither scrolls nor pages to another range.
  event.stopPropagation()
  if (event.cancelable) event.preventDefault()
}
function onEventDown(event, item, date) {
  if (event.button !== 0 || !item.event.draggable) return
  const pointer = minutesAt(event.clientY)
  const start = item.before ? 0 : item.start
  if (event.pointerType === 'touch') {
    begin(
      {
        type: 'move',
        item,
        date,
        origin: date,
        offset: pointer - start,
        start: item.start,
        end: item.end,
      },
      event,
    )
    const g = gesture.value
    g.hold = setTimeout(() => {
      if (gesture.value !== g) return
      g.active = true
      g.lifted = true
      globalThis.navigator?.vibrate?.(12)
      window.addEventListener('touchmove', holdScroll, {
        passive: false,
        capture: true,
      })
    }, HOLD_MS)
    return
  }
  begin(
    {
      type: 'move',
      item,
      date,
      origin: date,
      offset: pointer - start,
      start: item.start,
      end: item.end,
    },
    event,
  )
}
function onResizeDown(event, item, date) {
  if (event.button !== 0 || event.pointerType === 'touch') return
  event.preventDefault()
  begin({ type: 'resize', item, date, start: item.start, end: item.end }, event)
}
function onBarDown(event, bar) {
  if (
    event.button !== 0 ||
    event.pointerType === 'touch' ||
    !bar.event.draggable
  )
    return
  begin({ type: 'bar', bar, from: dayIndexAt(event.clientX), delta: 0 }, event)
}

function onMove(event) {
  const g = gesture.value
  if (!g || event.pointerId !== g.pointerId) return
  if (!g.active) {
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) < MOVE_THRESHOLD)
      return
    if (g.touch) return cancel() // a touch that moves is a scroll
    g.active = true
  }
  if (g.type === 'select') {
    const minutes = minutesAt(event.clientY)
    g.to =
      minutes >= g.from
        ? snap(Math.ceil(minutes / STEP) * STEP, STEP)
        : snap(Math.floor(minutes / STEP) * STEP, STEP)
    if (g.to === g.from) g.to = g.from + STEP
    autoScroll(event.clientY)
  } else if (g.type === 'move') {
    const duration = g.item.event
      ? (Date.parse(g.item.event.end) - Date.parse(g.item.event.start)) / 60000
      : g.end - g.start
    const start = snap(minutesAt(event.clientY) - g.offset, STEP)
    g.date = dateAt(event.clientX)
    g.start = Math.max(0, Math.min(1440 - STEP, start))
    g.end = Math.min(1440, g.start + duration)
    g.duration = duration
    autoScroll(event.clientY)
  } else if (g.type === 'resize') {
    g.end = Math.max(
      g.start + STEP,
      Math.min(1440, snap(minutesAt(event.clientY), STEP)),
    )
    autoScroll(event.clientY)
  } else if (g.type === 'allday') {
    g.to = dayIndexAt(event.clientX)
  } else if (g.type === 'bar') {
    g.delta = dayIndexAt(event.clientX) - g.from
  }
}

async function onUp(event) {
  const g = gesture.value
  if (!g || event.pointerId !== g.pointerId) return
  cancel()
  if (g.type === 'select' || g.type === 'allday') {
    if (g.active) swallowClick()
    if (g.type === 'select') {
      let [start, end] = [Math.min(g.from, g.to), Math.max(g.from, g.to)]
      if (!g.active) end = Math.min(1440, start + props.defaultDuration)
      const anchor = await anchorRect(g.date, start, end)
      emit('create', {
        start: wallInstant(g.date, start, props.timeZone),
        end: wallInstant(g.date, end, props.timeZone),
        allDay: false,
        rect: anchor,
      })
    } else {
      const from = Math.min(g.from, g.to)
      const to = Math.max(g.from, g.to)
      emit('create', {
        start: wallInstant(props.dates[from], 0, props.timeZone),
        end: wallInstant(props.dates[to], 1440, props.timeZone),
        allDay: true,
        rect: barRect(from, to),
      })
    }
    return
  }
  if (!g.active) return
  swallowClick()
  if (g.type === 'move') {
    const event = g.item.event
    const startWall = wallParts(event.start, props.timeZone)
    const shiftDays = dayDiff(g.origin, g.date)
    const deltaMinutes = g.start - (g.item.before ? 0 : g.item.start)
    const startDate = startWall.date
    const newStart = wallInstant(
      startDate,
      startWall.minutes + deltaMinutes + shiftDays * 1440,
      props.timeZone,
    )
    if (newStart && newStart !== event.start) {
      const duration = Date.parse(event.end) - Date.parse(event.start)
      emit('move', event, {
        start: newStart,
        end: new Date(Date.parse(newStart) + duration).toISOString(),
      })
    }
  } else if (g.type === 'resize') {
    const event = g.item.event
    const end = wallInstant(g.date, g.end, props.timeZone)
    if (end && end !== event.end)
      emit('resize', event, { start: event.start, end })
  } else if (g.type === 'bar' && g.delta) {
    emit('move-days', g.bar.event, g.delta)
  }
}

async function anchorRect(date, start, end) {
  await nextTick()
  const column = cols.value?.querySelector(`[data-date="${date}"]`)
  const box = column?.getBoundingClientRect()
  if (!box) return null
  const top = box.top + (start / 60) * props.hourHeight
  return {
    left: box.left,
    right: box.right,
    top,
    bottom: top + ((end - start) / 60) * props.hourHeight,
    width: box.width,
    height: ((end - start) / 60) * props.hourHeight,
  }
}
function barRect(from, to) {
  const box = alldayArea.value?.getBoundingClientRect()
  if (!box) return null
  const width = box.width / props.dates.length
  return {
    left: box.left + from * width,
    right: box.left + (to + 1) * width,
    top: box.top,
    bottom: box.top + lane.value,
    width: (to - from + 1) * width,
    height: lane.value,
  }
}
function clickEvent(dom, event) {
  emit('select', event, dom.currentTarget?.getBoundingClientRect?.() || null)
}

// --- scrolling ---------------------------------------------------------------------------
function scrollToStart() {
  if (!scroller.value) return
  let hour = props.scrollHour
  if (nowMinutes.value !== null)
    hour = Math.min(hour, Math.max(0, nowMinutes.value / 60 - 2))
  scroller.value.scrollTop = Math.max(0, hour * props.hourHeight - 8)
}
onMounted(() => nextTick(scrollToStart))
// A string key: a new but equal dates array (any URL change) must not scroll.
watch(
  () => `${props.dates.length}|${props.hourHeight}`,
  () => nextTick(scrollToStart),
)
onBeforeUnmount(cancel)
defineExpose({ scrollToStart, rectOf })
</script>
<style scoped>
.ag-tg {
  --ag-gutter: 64px;
  --ag-line: var(--outline-gray-1);
  --ag-line-strong: var(--outline-gray-2);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  user-select: none;
}
.ag-tg.is-dragging {
  cursor: grabbing;
}
.ag-tg__head,
.ag-tg__allday {
  display: flex;
  flex: none;
  padding-right: var(--ag-scrollbar, 0px);
  scrollbar-gutter: stable;
  overflow: hidden;
}
.ag-tg__zone {
  flex: 0 0 var(--ag-gutter);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 8px 4px 0;
  font-size: 10px;
  color: var(--ink-gray-6);
}
.ag-tg__dayhead {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0 4px;
}
.ag-tg__weekday {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-gray-6);
}
.ag-tg__daynum {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 999px;
  font-size: 24px;
  line-height: 1;
  color: var(--ink-gray-8);
}
.ag-tg__daynum:hover {
  background: var(--surface-gray-2);
}
.ag-tg__dayhead.is-past .ag-tg__daynum {
  color: var(--ink-gray-6);
}
.ag-tg__dayhead.is-today .ag-tg__weekday {
  color: var(--ag-accent);
}
.ag-tg__dayhead.is-today .ag-tg__daynum {
  background: var(--ag-accent);
  color: var(--ag-on-accent);
}
.ag-tg__allday {
  border-bottom: 1px solid var(--ag-line-strong);
}
.ag-tg__alldaylabel {
  align-items: flex-start;
  padding-top: 4px;
}
.ag-tg__expand {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-tg__expand:hover {
  background: var(--surface-gray-2);
}
.ag-tg__alldayarea {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 28px;
}
.ag-tg__alldaycell {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--ag-line);
}
.ag-tg__alldaycell.is-selecting {
  background: var(--ag-select-tint);
}
.ag-tg__more {
  position: absolute;
  bottom: 2px;
  left: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-gray-7);
}
.ag-bar {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
}
.ag-bar.is-task {
  color: var(--ink-gray-8);
}
/* Phone: 44 px all-day bars in 46 px lanes; «N more» and the expand toggle
   take the same height. */
.is-compact .ag-bar {
  height: 44px;
}
.is-compact .ag-tg__more {
  left: 2px;
  right: 2px;
  height: 44px;
  text-align: left;
  padding: 0 4px;
}
.is-compact .ag-tg__expand {
  width: 44px;
  height: 44px;
}
.ag-bar.is-task .lucide-circle,
.ag-bar.is-task .lucide-circle-check {
  color: var(--ag-dot);
}
.ag-bar.is-before {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.ag-bar.is-after {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.ag-tg__scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.ag-tg__body {
  position: relative;
  display: flex;
}
.ag-tg__gutter {
  position: relative;
  flex: 0 0 var(--ag-gutter);
}
.ag-tg__hour {
  position: absolute;
  right: 8px;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--ink-gray-6);
  white-space: nowrap;
}
.ag-tg__cols {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  background-image: linear-gradient(
    to bottom,
    var(--ag-line) 1px,
    transparent 1px
  );
  background-size: 100% var(--ag-hour);
}
.ag-tg__col {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  border-left: 1px solid var(--ag-line);
  cursor: default;
  touch-action: pan-y;
}
.ag-tg__col.is-today {
  background: var(--ag-today-tint);
}
.ag-event,
.ag-ghost {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.25;
  text-align: left;
  box-shadow: 0 0 0 1px var(--surface-base);
}
.ag-ghost {
  left: 1px;
  right: 10px;
  z-index: 30;
  pointer-events: none;
  box-shadow:
    0 6px 16px -4px rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--surface-base);
}
.ag-ghost.is-move {
  opacity: 0.92;
  animation: ag-lift 0.16s ease-out;
}
@keyframes ag-lift {
  from {
    transform: scale(0.96);
    opacity: 0.6;
  }
}
.ag-event {
  -webkit-touch-callout: none;
  transition: filter 0.12s;
}
.ag-event__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}
/* Phone: a timed event is drawn at its duration (a 30-minute event is 22 px
   tall, a week column 38 px wide) but takes taps on at least 44 × 44 px
   centred on it. The area is the button's own ::before, so a tap there opens
   or drags the event; the resize handle comes later in the tree and stays on
   top of it. */
.is-compact .ag-event {
  overflow: visible;
}
.is-compact .ag-event::before {
  content: '';
  position: absolute;
  inset: min(0px, calc(50% - 22px));
}
.ag-event:active {
  filter: brightness(0.93);
}
.ag-event.is-draggable {
  cursor: grab;
}
.ag-event.is-short {
  flex-direction: row;
  gap: 4px;
  align-items: center;
  padding-top: 0;
  padding-bottom: 0;
}
.ag-event.is-short .ag-event__body {
  flex-direction: row;
  gap: 4px;
  align-items: center;
}
.ag-event__title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.ag-event.is-short .ag-event__title {
  white-space: nowrap;
  display: block;
}
.ag-event__time {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}
.ag-event.is-past,
.ag-bar.is-past {
  filter: saturate(0.55) brightness(1.08);
  opacity: 0.78;
}
.ag-event.is-done .ag-event__title,
.ag-event.is-cancelled .ag-event__title,
.ag-bar.is-done,
.ag-bar.is-cancelled {
  text-decoration: line-through;
}
.ag-event.is-selected,
.ag-bar.is-selected {
  box-shadow:
    0 6px 18px -6px rgba(0, 0, 0, 0.45),
    0 0 0 2px var(--surface-base);
  z-index: 40 !important;
}
.ag-event__handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 7px;
  cursor: ns-resize;
}
.ag-event:hover .ag-event__handle::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 16px;
  height: 3px;
  margin-left: -8px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.6;
}
.ag-now {
  position: absolute;
  left: -1px;
  right: 0;
  z-index: 35;
  height: 2px;
  background: #ea4335;
  pointer-events: none;
}
.ag-now::before {
  content: '';
  position: absolute;
  left: -6px;
  top: -5px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #ea4335;
}
@media (max-width: 640px) {
  .ag-tg {
    --ag-gutter: 44px;
  }
  .ag-tg__daynum {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }
}
</style>
