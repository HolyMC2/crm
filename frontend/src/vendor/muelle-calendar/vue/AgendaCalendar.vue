<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  calendarRange, eventInterval, eventsForDay, formatTime, groupAgendaEvents, localDate,
  type CreateRange, type CreateSlot, type DayEvent, type Event,
} from '../core'
import ResourceCalendar from './ResourceCalendar.vue'
import { buildWeekGrid, weekRowAt, type WeekColumn, type WeekEntry, type WeekSlot } from './week-grid'
import type { AgendaCalendarProps } from './types'
import { useSlotSelection } from './useSlotSelection'
import { useCalendarNow } from './useCalendarNow'
import { timeUnavailable } from './availability'

const props = withDefaults(defineProps<AgendaCalendarProps>(), {
  view: 'day', locale: 'en', hour12: true, showSummary: true, disabled: false,
  startHour: 7, endHour: 21, slotMinutes: 30,
})
const emit = defineEmits<{ select: [event: Event]; create: [slot: CreateSlot]; createRange: [range: CreateRange]; chooseDate: [date: string] }>()
const dayProps = computed(() => { const { view, ...rest } = props; return rest })
const selectedWeekDate = ref(props.date)
watch(() => props.date, (date) => { selectedWeekDate.value = date })
const t = (source: string, values: Record<string, string | number> = {}) =>
  (props.translate?.(source, values) ?? source).replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))
const dateText = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) =>
  new Intl.DateTimeFormat(props.locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const identity = (event: Event) => JSON.stringify([event.source, event.id])
const resourceNames = (event: Event) => props.resources.filter((resource) => event.resourceIds.includes(resource.id)).map((resource) => resource.title).join(', ')
const eventTime = (event: Event, full = false) => {
  const startDate = localDate(event.start, props.timeZone)
  const endDate = localDate(event.end, props.timeZone)
  const label = (instant: string, date: string) => `${startDate !== endDate ? `${dateText(date, { month: 'short', day: 'numeric' })} ` : ''}${formatTime(instant, props.timeZone, props.locale, full, props.hour12)}`
  return `${label(event.start, startDate)} – ${label(event.end, endDate)}`
}
const eventLabel = (event: Event) => t('{title}, {time}, {resource}, {status}', {
  title: event.title, time: eventTime(event, true), resource: resourceNames(event), status: t(event.status),
})
const model = computed(() => {
  try {
    const range = calendarRange(props.date, props.view, props.timeZone, props.weekStartsOn)
    const resourceIds = props.resources.map((resource) => resource.id)
    const days = range.dates.map((date) => ({
      date, label: dateText(date), weekday: dateText(date, { weekday: 'short' }),
      number: dateText(date, { day: 'numeric' }), entries: eventsForDay(props.events, date, props.timeZone, resourceIds),
    }))
    const groups = groupAgendaEvents(props.events, range, props.timeZone, resourceIds)
    const week = props.view === 'week' ? buildWeekGrid(range.dates, props.events, resourceIds, props.timeZone, props) : null
    const summary = props.view === 'month' ? dateText(props.date, { month: 'long', year: 'numeric' }) : `${dateText(range.startDate, { month: 'short', day: 'numeric' })} – ${dateText(range.dates[range.dates.length - 1]!, { month: 'short', day: 'numeric', year: 'numeric' })}`
    return { range, days, groups, week, summary, count: groups.reduce((count, group) => count + group.events.length, 0), error: false }
  } catch {
    return { range: null, days: [], groups: [], week: null, summary: props.date, count: 0, error: true }
  }
})
const invalidCount = computed(() => props.events.filter((event) => !eventInterval(event)).length)
const now = useCalendarNow()
const activeWeekDate = computed(() => model.value.range?.dates.includes(selectedWeekDate.value) ? selectedWeekDate.value : model.value.range?.startDate)
const hasDayEvents = (date: string) => model.value.days.some((day) => day.date === date && day.entries.length > 0)
const chooseDate = (date: string) => { if (!props.disabled) emit('chooseDate', date) }
const select = (event: Event) => { selection.cancel(); if (!props.disabled) emit('select', event) }
const weekSlotLabel = (date: string, slot: WeekSlot) => props.resources.length === 1
  ? t('Create event for {resource} at {time}', { resource: props.resources[0]!.title, time: `${dateText(date)} ${slot.label}` })
  : t('Choose a resource for {date} at {time}', { date: dateText(date), time: slot.label })
const selection = useSlotSelection({
  slots: (date) => model.value.week?.columns.find((column) => column.date === date)?.slots ?? [],
  disabled: () => props.disabled || props.view !== 'week',
  commit: (_date, interval) => {
    if (props.resources.every(resource => resource.active === false || timeUnavailable(props.unavailable || [], resource.id, interval.start, interval.end))) return
    const range = { start: new Date(interval.start).toISOString(), end: new Date(interval.end).toISOString() }
    if (props.resources.length === 1) emit('create', { resourceId: props.resources[0]!.id, ...range })
    else if (props.resources.length > 1) emit('createRange', range)
  },
})
watch(() => [props.date, selectedWeekDate.value, props.timeZone, props.view, props.disabled, props.startHour, props.endHour, props.slotMinutes, ...props.resources.map((resource) => resource.id)], selection.cancel)
const previewStyle = (column: WeekColumn) => {
  const range = selection.range.value
  const rows = model.value.week?.rows.length ?? 0
  if (!range) return {}
  const startRow = weekRowAt(column.slots, rows, range.start) ?? 0
  const endRow = weekRowAt(column.slots, rows, range.end) ?? startRow
  return { top: `calc(var(--mc-week-row-height) * ${startRow})`, height: `calc(var(--mc-week-row-height) * ${endRow - startRow})` }
}
const previewLabel = computed(() => {
  const range = selection.range.value
  return range ? t('{start} – {end} · {minutes} min', { start: formatTime(range.start, props.timeZone, props.locale, false, props.hour12), end: formatTime(range.end, props.timeZone, props.locale, false, props.hour12), minutes: Math.round((range.end - range.start) / 60_000) }) : ''
})
const nowStyle = (column: WeekColumn) => {
  const rows = model.value.week?.rows.length ?? 0
  const row = weekRowAt(column.slots, rows, now.value)
  return row !== null && row < rows ? { top: `calc(var(--mc-week-row-height) * ${row})` } : null
}
const weekEventStyle = (entry: WeekEntry) => ({
  top: `calc(var(--mc-week-row-height) * ${entry.startRow})`,
  height: `max(1px, calc(var(--mc-week-row-height) * ${entry.endRow - entry.startRow} - 3px))`,
  left: `calc(${entry.layout.column / entry.layout.columns * 100}% + 3px)`,
  width: `calc(${100 / entry.layout.columns}% - 6px)`,
})
const monthTime = (entry: DayEvent) => entry.continuesBefore ? t('Continued') : formatTime(entry.event.start, props.timeZone, props.locale, false, props.hour12)
const unavailableSlot = (slot: WeekSlot) => props.resources.length > 0 && props.resources.every(resource => resource.active === false || timeUnavailable(props.unavailable || [], resource.id, slot.start, slot.end))
</script>

<template>
  <ResourceCalendar v-if="view === 'day'" v-bind="dayProps" @select="emit('select', $event)" @create="emit('create', $event)" />
  <section v-else class="mc-calendar mc-agenda" :data-view="view" :aria-label="t('Calendar')" :aria-busy="disabled">
    <div v-if="showSummary" class="mc-calendar__summary">
      <div><h2>{{ model.summary }}</h2><p>{{ timeZone }}</p></div>
      <span v-if="!model.error" class="mc-calendar__count">{{ t('{count} events', { count: model.count }) }}</span>
    </div>
    <p v-if="model.error" class="mc-calendar__notice" role="alert">{{ t('The calendar date or time zone is invalid.') }}</p>
    <p v-else-if="!resources.length" class="mc-calendar__notice" role="status">{{ t('No resources to display.') }}</p>
    <template v-else>
      <p v-if="invalidCount" class="mc-calendar__notice" role="status">{{ t('{count} events could not be displayed because their times are invalid.', { count: invalidCount }) }}</p>
      <template v-if="view === 'week' && model.week">
        <p class="mc-calendar__selection-hint"><span class="mc-calendar__mouse-hint">{{ t('Drag to select a time range. Shift + Arrow keys extend it; Enter books; Escape cancels.') }}</span><span class="mc-calendar__touch-hint">{{ t('Tap a time to book, then adjust the duration.') }}</span></p>
        <nav class="mc-agenda__day-tabs" :aria-label="t('Days of the week')">
          <button v-for="day in model.days" :key="day.date" type="button" :disabled="disabled" :aria-pressed="activeWeekDate === day.date" :aria-label="day.label" @click="selectedWeekDate = day.date">{{ day.weekday }} <strong>{{ day.number }}</strong></button>
        </nav>
        <p v-if="!model.week.rows.length" class="mc-calendar__notice" role="status">{{ t('No time slots in this range.') }}</p>
        <div v-else class="mc-agenda__week-scroll" tabindex="0" role="region" :aria-label="t('Week time slots')">
          <div class="mc-agenda__week-grid">
            <div class="mc-agenda__week-corner">{{ t('Time') }}</div>
            <button v-for="day in model.days" :key="`heading-${day.date}`" type="button" class="mc-agenda__week-heading" :class="{ 'is-selected': activeWeekDate === day.date }" :disabled="disabled" :aria-label="t('Open {date}', { date: day.label })" @click="chooseDate(day.date)"><span>{{ day.weekday }}</span> <strong>{{ day.number }}</strong></button>
            <div class="mc-agenda__week-times" aria-hidden="true">
              <div v-for="row in model.week.rows" :key="row.key" class="mc-agenda__week-time"><span>{{ row.label }}</span></div>
            </div>
            <div v-for="column in model.week.columns" :key="column.date" class="mc-agenda__week-column" :class="{ 'is-selected': activeWeekDate === column.date }" :data-date="column.date" :style="{ height: `calc(var(--mc-week-row-height) * ${model.week.rows.length})` }" role="group" :aria-label="dateText(column.date)" data-mc-selection-column>
              <div v-for="row in model.week.rows" :key="row.key" class="mc-agenda__week-cell" :class="{ 'is-unavailable': !column.slots.some(slot => slot.key === row.key) }" aria-hidden="true" />
              <button v-for="(slot, slotIndex) in column.slots" :key="slot.key" type="button" class="mc-agenda__week-slot" :data-mc-slot-index="slotIndex" :style="{ top: `calc(var(--mc-week-row-height) * ${slot.row})` }" :disabled="disabled || unavailableSlot(slot)" :class="{ 'is-unavailable': unavailableSlot(slot) }" :aria-label="weekSlotLabel(column.date, slot)" @pointerdown="selection.pointerDown($event, column.date, slotIndex)" @keydown="selection.keyDown($event, column.date, slotIndex)" @click="selection.click(column.date, slotIndex)"><span aria-hidden="true">+</span></button>
              <button v-for="entry in column.entries" :key="identity(entry.layout.event)" type="button" class="mc-agenda__week-event" :style="weekEventStyle(entry)" :disabled="disabled" :data-event-id="entry.layout.event.id" :title="eventLabel(entry.layout.event)" :aria-label="eventLabel(entry.layout.event)" @click="select(entry.layout.event)">
                <span class="mc-agenda__week-event-content">
                  <strong>{{ entry.layout.event.title }}</strong>
                  <span>{{ formatTime(entry.layout.event.start, timeZone, locale, false, hour12) }} · {{ t(entry.layout.event.status) }}</span>
                  <span>{{ resourceNames(entry.layout.event) }}</span>
                </span>
              </button>
              <div v-if="selection.state.value?.group === column.date" class="mc-calendar__range-preview" :style="previewStyle(column)" role="status" aria-live="polite">{{ previewLabel }}</div>
              <div v-if="nowStyle(column)" class="mc-calendar__now" :style="nowStyle(column)!" aria-hidden="true"><span>{{ t('Now') }}</span></div>
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="view === 'month'" class="mc-agenda__month" :aria-label="t('Month calendar')">
        <div v-for="day in model.days.slice(0, 7)" :key="`weekday-${day.date}`" class="mc-agenda__month-weekday">{{ day.weekday }}</div>
        <div v-for="day in model.days" :key="day.date" class="mc-agenda__month-day" :class="{ 'is-outside': day.date.slice(0, 7) !== date.slice(0, 7), 'is-selected': day.date === date }" :data-date="day.date">
          <button type="button" class="mc-agenda__month-date" :disabled="disabled" :aria-current="day.date === date ? 'date' : undefined" :aria-label="t('Open {date}: {count} events', { date: day.label, count: day.entries.length })" @click="chooseDate(day.date)"><strong>{{ day.number }}</strong><span class="mc-agenda__month-count">{{ day.entries.length }}<span class="mc-agenda__count-word"> {{ t('events') }}</span></span></button>
          <div class="mc-agenda__month-events">
            <button v-for="entry in day.entries.slice(0, 3)" :key="identity(entry.event)" type="button" class="mc-agenda__month-event" :disabled="disabled" :data-event-id="entry.event.id" :title="eventLabel(entry.event)" :aria-label="eventLabel(entry.event)" @click="select(entry.event)"><span>{{ monthTime(entry) }}</span><strong>{{ entry.event.title }}</strong></button>
            <button v-if="day.entries.length > 3" type="button" class="mc-agenda__more" :disabled="disabled" @click="chooseDate(day.date)">{{ t('{count} more events', { count: day.entries.length - 3 }) }}</button>
          </div>
        </div>
      </div>

      <div v-else-if="view === 'list'" class="mc-agenda__list">
        <section v-for="group in model.groups" :key="group.date" class="mc-agenda__list-day" :data-date="group.date" :aria-label="dateText(group.date)">
          <div class="mc-agenda__list-heading"><h3>{{ dateText(group.date) }}</h3><button type="button" :disabled="disabled" :aria-label="t('Open {date}', { date: dateText(group.date) })" @click="chooseDate(group.date)">{{ t('Open day') }}</button></div>
          <p v-if="!group.events.length" class="mc-agenda__empty">{{ hasDayEvents(group.date) ? t('Events continue from a previous day.') : t('No events on this day.') }} <button type="button" :disabled="disabled" @click="chooseDate(group.date)">{{ t('Book on this day') }}</button></p>
          <button v-for="event in group.events" :key="identity(event)" type="button" class="mc-agenda__list-event" :disabled="disabled" :data-event-id="event.id" :aria-label="eventLabel(event)" @click="select(event)"><span class="mc-agenda__list-time">{{ eventTime(event) }}</span><span class="mc-agenda__list-details"><strong>{{ event.title }}</strong><span>{{ resourceNames(event) }}</span></span><span class="mc-agenda__list-status">{{ t(event.status) }}</span></button>
        </section>
      </div>
    </template>
  </section>
</template>

<style>
.mc-agenda { --mc-week-row-height: 5.25em; }
.mc-agenda button { font: inherit; color: inherit; cursor: pointer; }
.mc-agenda button:disabled { cursor: default; }
.mc-agenda button:focus-visible, .mc-agenda [tabindex="0"]:focus-visible { outline: 2px solid var(--mc-accent); outline-offset: -2px; }
.mc-agenda__day-tabs { display: none; gap: .4em; min-width: 0; max-width: 100%; overflow-x: auto; margin-bottom: .6em; }
.mc-agenda__day-tabs button { flex: 0 0 auto; min-width: 3.4em; min-height: 3em; padding: .4em; border: 1px solid var(--mc-border); border-radius: .4em; background: var(--mc-surface); }
.mc-agenda__day-tabs button[aria-pressed="true"] { background: var(--mc-event-surface); border-color: var(--mc-accent); }
.mc-agenda__day-tabs strong { display: block; }
.mc-agenda__week-scroll { width: 100%; max-width: 100%; min-width: 0; max-height: 70vh; overflow: auto; border: 1px solid var(--mc-border); border-radius: .6em; background: var(--mc-surface); overscroll-behavior: contain; }
.mc-agenda__week-grid { display: grid; grid-template-columns: max-content repeat(7, minmax(12em, 1fr)); width: max-content; min-width: 100%; isolation: isolate; }
.mc-agenda__week-corner, .mc-agenda__week-heading { position: sticky; top: 0; z-index: 4; min-width: 0; min-height: 3.4em; border: 0; border-right: 1px solid var(--mc-border); border-bottom: 1px solid var(--mc-border); padding: .6em .75em; background: var(--mc-panel); text-align: left; }
.mc-agenda__week-corner { left: 0; z-index: 5; }
.mc-agenda__week-heading.is-selected { box-shadow: inset 0 -3px var(--mc-accent); }
.mc-agenda__week-times { position: sticky; left: 0; z-index: 3; background: var(--mc-surface); }
.mc-agenda__week-time { height: var(--mc-week-row-height); padding: .6em .75em; border-bottom: 1px solid var(--mc-border); border-right: 1px solid var(--mc-border); white-space: nowrap; color: var(--mc-muted); }
.mc-agenda__week-time span { font-size: .9375em; font-variant-numeric: tabular-nums; }
.mc-agenda__week-column { position: relative; min-width: 0; border-right: 1px solid var(--mc-border); }
.mc-agenda__week-cell { height: var(--mc-week-row-height); border-bottom: 1px solid var(--mc-border); }
.mc-agenda__week-cell.is-unavailable { background: repeating-linear-gradient(135deg, var(--mc-panel), var(--mc-panel) 6px, var(--mc-surface) 6px, var(--mc-surface) 12px); }
.mc-agenda__week-slot { position: absolute; left: 0; width: 100%; height: var(--mc-week-row-height); border: 0; background: transparent; user-select: none; }
.mc-agenda__week-slot.is-unavailable { background: repeating-linear-gradient(135deg, var(--mc-panel), var(--mc-panel) 6px, var(--mc-surface) 6px, var(--mc-surface) 12px); cursor: not-allowed; }
.mc-agenda__week-slot span { opacity: 0; }
.mc-agenda__week-slot:hover, .mc-agenda__week-slot:focus-visible { background: var(--mc-hover); }
.mc-agenda__week-slot:hover span, .mc-agenda__week-slot:focus-visible span { opacity: 1; }
.mc-agenda__week-event { position: absolute; z-index: 2; min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--mc-event-border); border-left: 3px solid var(--mc-accent); border-radius: .3em; background: var(--mc-event-surface); color: var(--mc-event-text) !important; text-align: left; line-height: 1.35; }
.mc-agenda__week-event-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: flex-start; gap: .12em; padding: .3em .4em; }
.mc-agenda__week-event-content > strong, .mc-agenda__week-event-content > span { flex-shrink: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-agenda__week-event-content > span { font-size: .9375em; }
.mc-agenda__month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; width: 100%; border-left: 1px solid var(--mc-border); border-top: 1px solid var(--mc-border); border-radius: .4em; overflow: hidden; }
.mc-agenda__month-weekday { min-width: 0; padding: .6em .25em; border-bottom: 1px solid var(--mc-border); border-right: 1px solid var(--mc-border); background: var(--mc-panel); text-align: center; font-size: .9375em; overflow-wrap: anywhere; }
.mc-agenda__month-day { min-width: 0; min-height: 10em; border-right: 1px solid var(--mc-border); border-bottom: 1px solid var(--mc-border); background: var(--mc-surface); }
.mc-agenda__month-day.is-outside { background: var(--mc-panel); }
.mc-agenda__month-day.is-selected { box-shadow: inset 0 0 0 2px var(--mc-accent); }
.mc-agenda__month-date { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .15em; width: 100%; min-width: 0; min-height: 3em; padding: .4em .5em; border: 0; background: transparent; }
.mc-agenda__month-count { color: var(--mc-muted); font-size: .875em; }
.mc-agenda__count-word { margin-inline-start: .25em; }
.mc-agenda__month-events { padding: 0 .3em .4em; }
.mc-agenda__month-event { display: flex; flex-direction: column; width: 100%; min-width: 0; margin-top: .3em; padding: .3em; border: 1px solid var(--mc-event-border); border-radius: .25em; background: var(--mc-event-surface); color: var(--mc-event-text) !important; text-align: left; }
.mc-agenda__month-event span { font-size: .875em; }
.mc-agenda__month-event strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: .9375em; }
.mc-agenda__more { width: 100%; min-height: 2.5em; margin-top: .25em; padding: .2em; border: 0; background: transparent; color: var(--mc-accent) !important; overflow-wrap: anywhere; font-size: .875em !important; }
.mc-agenda__list-day { margin-bottom: 1em; border: 1px solid var(--mc-border); border-radius: .5em; overflow: hidden; background: var(--mc-surface); }
.mc-agenda__list-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5em; padding: .75em; background: var(--mc-panel); }
.mc-agenda__list-heading h3 { margin: 0; font-size: 1em; overflow-wrap: anywhere; }
.mc-agenda__list-heading button, .mc-agenda__empty button { min-height: 2.75em; padding: .3em .6em; border: 1px solid var(--mc-border); border-radius: .35em; background: var(--mc-surface); color: var(--mc-accent); }
.mc-agenda__empty { margin: 0; padding: .75em; color: var(--mc-muted); overflow-wrap: anywhere; }
.mc-agenda__empty button { margin: .35em 0 .35em .5em; }
.mc-agenda__list-event { display: grid; grid-template-columns: minmax(10em, 1fr) minmax(0, 2fr) auto; align-items: start; gap: .75em; width: 100%; min-width: 0; padding: .85em; border: 0; border-top: 1px solid var(--mc-border); background: var(--mc-surface); text-align: left; }
.mc-agenda__list-event:hover { background: var(--mc-hover); }
.mc-agenda__list-time, .mc-agenda__list-details, .mc-agenda__list-status { min-width: 0; overflow-wrap: anywhere; }
.mc-agenda__list-details { display: flex; flex-direction: column; gap: .25em; }
.mc-agenda__list-time, .mc-agenda__list-details > span, .mc-agenda__list-status { font-size: .9375em; }
.mc-agenda__list-details > span { color: var(--mc-muted); }
@media (max-width: 640px) {
  .mc-agenda__day-tabs { display: flex; }
  .mc-agenda__week-grid { width: 100%; grid-template-columns: max-content minmax(0, 1fr); }
  .mc-agenda__week-heading:not(.is-selected), .mc-agenda__week-column:not(.is-selected) { display: none; }
  .mc-agenda__month-day { min-height: 4.5em; }
  .mc-agenda__month-date { flex-direction: column; align-items: center; justify-content: center; min-height: 4.5em; padding: .2em; }
  .mc-agenda__month-events, .mc-agenda__count-word { display: none; }
  .mc-agenda__month-weekday { font-size: .875em; padding-inline: .1em; }
  .mc-agenda__list-event { grid-template-columns: minmax(0, 1fr); gap: .4em; }
}
</style>
