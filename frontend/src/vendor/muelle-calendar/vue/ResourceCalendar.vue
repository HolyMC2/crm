<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  daySlots, eventInterval, formatDay, formatTime, layoutEvents,
  type CreateSlot, type DaySlot, type Event, type PositionedEvent,
} from '../core'
import type { ResourceCalendarProps } from './types'
import { useSlotSelection } from './useSlotSelection'
import { useCalendarNow } from './useCalendarNow'
import { timeUnavailable } from './availability'

const props = withDefaults(defineProps<ResourceCalendarProps>(), {
  locale: 'en', hour12: true, showSummary: true, disabled: false, startHour: 7, endHour: 21, slotMinutes: 30,
})
const emit = defineEmits<{ select: [event: Event]; create: [slot: CreateSlot] }>()
const t = (source: string, values: Record<string, string | number> = {}) => {
  const translated = props.translate?.(source, values) ?? source
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))
}
const state = computed(() => {
  try {
    const slots = daySlots(props.date, props.timeZone, props)
    const timeLabels = slots.map((slot) => formatTime(slot.start, props.timeZone, props.locale, false, props.hour12))
    const repeatedLabels = new Set(timeLabels.filter((label, index) => timeLabels.indexOf(label) !== index))
    const visualSlots = slots.map((slot, index) => ({
      ...slot, displayLabel: repeatedLabels.has(timeLabels[index]!) ? slot.label : timeLabels[index]!,
    }))
    const first = slots[0]
    const last = slots[slots.length - 1]
    const range = first && last ? { start: first.start, end: last.end } : null
    const columns = props.resources.map((resource) => ({
      resource, entries: range ? layoutEvents(props.events, range, resource.id) : [],
    }))
    const count = new Set(columns.flatMap((column) => column.entries.map((item) => JSON.stringify([item.event.source, item.event.id])))).size
    return { slots: visualSlots, range, columns, count, label: formatDay(props.date, props.timeZone, props.locale), error: false }
  } catch {
    return { slots: [], range: null, columns: [], count: 0, label: props.date, error: true }
  }
})
const invalidCount = computed(() => props.events.filter((event) => !eventInterval(event)).length)
const now = useCalendarNow()
const nowTop = computed(() => {
  const range = state.value.range
  return range && range.start <= now.value && now.value < range.end ? `${(now.value - range.start) / (range.end - range.start) * 100}%` : null
})
const bodyHeight = computed(() => `calc(var(--mc-slot-height) * ${state.value.range ? (state.value.range.end - state.value.range.start) / (props.slotMinutes * 60_000) : 0})`)
const gridStyle = computed(() => ({ gridTemplateColumns: `max-content repeat(${props.resources.length}, minmax(var(--mc-resource-width), 1fr))` }))
const slotHeight = (slot: DaySlot) => `calc(var(--mc-slot-height) * ${(slot.end - slot.start) / (props.slotMinutes * 60_000)})`
const eventStyle = (item: PositionedEvent) => ({
  top: `${item.top * 100}%`, height: `max(1px, calc(${item.height * 100}% - 3px))`,
  left: `calc(${item.column / item.columns * 100}% + 3px)`, width: `calc(${100 / item.columns}% - 6px)`,
})
const eventTime = (event: Event) => `${formatTime(event.start, props.timeZone, props.locale, true, props.hour12)} – ${formatTime(event.end, props.timeZone, props.locale, true, props.hour12)}`
const eventStartTime = (event: Event) => formatTime(event.start, props.timeZone, props.locale, false, props.hour12)
const eventLabel = (event: Event) => t('{title}, {time}, {status}', { title: event.title, time: eventTime(event), status: t(event.status) })
const selection = useSlotSelection({
  slots: (group) => props.resources.some((resource) => resource.id === group && resource.active !== false) ? state.value.slots : [],
  disabled: () => props.disabled,
  commit: (resourceId, range) => {
    if (props.resources.some(resource => resource.id === resourceId && resource.active !== false) && !timeUnavailable(props.unavailable || [], resourceId, range.start, range.end))
      emit('create', { resourceId, start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() })
  },
})
watch(() => [props.date, props.timeZone, props.disabled, props.startHour, props.endHour, props.slotMinutes, ...props.resources.map((resource) => resource.id)], selection.cancel)
const previewStyle = computed(() => {
  const range = state.value.range
  const selected = selection.range.value
  if (!range || !selected) return {}
  return { top: `${(selected.start - range.start) / (range.end - range.start) * 100}%`, height: `${(selected.end - selected.start) / (range.end - range.start) * 100}%` }
})
const previewLabel = computed(() => {
  const range = selection.range.value
  return range ? t('{start} – {end} · {minutes} min', { start: formatTime(range.start, props.timeZone, props.locale, false, props.hour12), end: formatTime(range.end, props.timeZone, props.locale, false, props.hour12), minutes: Math.round((range.end - range.start) / 60_000) }) : ''
})
const select = (event: Event) => { selection.cancel(); if (!props.disabled) emit('select', event) }
</script>

<template>
  <section class="mc-calendar" :aria-label="t('Resource calendar')" :aria-busy="disabled">
    <div v-if="showSummary" class="mc-calendar__summary">
      <div><h2>{{ state.label }}</h2><p>{{ timeZone }}</p></div>
      <span v-if="!state.error" class="mc-calendar__count">{{ t('{count} events', { count: state.count }) }}</span>
    </div>
    <p v-if="state.error" class="mc-calendar__notice" role="alert">{{ t('The calendar date or time zone is invalid.') }}</p>
    <p v-else-if="!resources.length" class="mc-calendar__notice" role="status">{{ t('No resources to display.') }}</p>
    <p v-else-if="!state.slots.length" class="mc-calendar__notice" role="status">{{ t('No time slots in this range.') }}</p>
    <template v-else>
      <p v-if="invalidCount" class="mc-calendar__notice" role="status">{{ t('{count} events could not be displayed because their times are invalid.', { count: invalidCount }) }}</p>
      <p v-if="!state.count" class="mc-calendar__notice" role="status">{{ disabled ? t('No events in this time range.') : t('No events in this time range. Select a time to create one.') }}</p>
      <p class="mc-calendar__selection-hint"><span class="mc-calendar__mouse-hint">{{ t('Drag to select a time range. Shift + Arrow keys extend it; Enter books; Escape cancels.') }}</span><span class="mc-calendar__touch-hint">{{ t('Tap a time to book, then adjust the duration.') }}</span></p>
      <div class="mc-calendar__scroll" tabindex="0" role="region" :aria-label="t('Calendar time slots')">
        <div class="mc-calendar__grid" :style="gridStyle">
          <div class="mc-calendar__header">
            <div class="mc-calendar__time-heading">{{ t('Time') }}</div>
            <div v-for="resource in resources" :key="resource.id" class="mc-calendar__resource-heading">{{ resource.title }}<small v-if="resource.active === false"> · {{ t('Read only') }}</small><small v-else-if="resource.scheduled === false"> · {{ t('No schedule') }}</small></div>
          </div>
          <div class="mc-calendar__body">
            <div class="mc-calendar__times" :style="{ height: bodyHeight }" aria-hidden="true">
              <div v-for="slot in state.slots" :key="slot.start" class="mc-calendar__time" :style="{ height: slotHeight(slot) }" :title="slot.label"><span>{{ slot.displayLabel }}</span></div>
            </div>
            <div v-for="(column, columnIndex) in state.columns" :key="column.resource.id" class="mc-calendar__resource" :style="{ height: bodyHeight }" role="group" :aria-label="column.resource.title" data-mc-selection-column>
              <button
                v-for="(slot, slotIndex) in state.slots" :key="slot.start" type="button" class="mc-calendar__slot" :data-mc-slot-index="slotIndex"
                :style="{ height: slotHeight(slot) }" :disabled="disabled || column.resource.active === false || timeUnavailable(unavailable || [], column.resource.id, slot.start, slot.end)"
                :class="{ 'is-unavailable': column.resource.active === false || timeUnavailable(unavailable || [], column.resource.id, slot.start, slot.end) }"
                :aria-label="t('Create event for {resource} at {time}', { resource: column.resource.title, time: slot.label })"
                @pointerdown="selection.pointerDown($event, column.resource.id, slotIndex)"
                @keydown="selection.keyDown($event, column.resource.id, slotIndex)"
                @click="selection.click(column.resource.id, slotIndex)"
              ><span aria-hidden="true">+</span></button>
              <button
                v-for="item in column.entries" :key="JSON.stringify([item.event.source, item.event.id])" type="button"
                class="mc-calendar__event" :style="eventStyle(item)" :disabled="disabled"
                :data-event-id="item.event.id" :data-event-source="item.event.source"
                :title="eventLabel(item.event)" :aria-label="eventLabel(item.event)" @click="select(item.event)"
              >
                <span class="mc-calendar__event-content">
                  <strong>{{ item.event.title }}</strong>
                  <span class="mc-calendar__event-meta">
                    <span class="mc-calendar__event-time">{{ eventStartTime(item.event) }}</span>
                    <span class="mc-calendar__status">{{ t(item.event.status) }}</span>
                  </span>
                </span>
              </button>
              <div v-if="selection.state.value?.group === column.resource.id" class="mc-calendar__range-preview" :style="previewStyle" role="status" aria-live="polite">{{ previewLabel }}</div>
              <div v-if="nowTop" class="mc-calendar__now" :style="{ top: nowTop }" aria-hidden="true"><span v-if="columnIndex === 0">{{ t('Now') }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style>
.mc-calendar { --mc-accent: #155e75; --mc-surface: #fff; --mc-panel: #f5f8fb; --mc-border: #cbd5e1; --mc-muted: #526475; --mc-text: #172b3a; --mc-event-surface: #ecf5f8; --mc-event-border: #88b4c4; --mc-event-text: #164e63; --mc-hover: #edf8fc; --mc-slot-height: 4.25em; --mc-resource-width: 18em; min-width: 0; width: 100%; max-width: 100%; color: var(--mc-text); font-family: inherit; font-size: max(16px, 1em); line-height: 1.4; color-scheme: light; }
:where(.dark, [data-theme="dark"]) .mc-calendar, .mc-calendar:where(.dark, [data-theme="dark"]) { --mc-accent: #7dd3fc; --mc-surface: #111e2c; --mc-panel: #192a3a; --mc-border: #3a5267; --mc-muted: #bdcdd9; --mc-text: #e8f1f7; --mc-event-surface: #193c4d; --mc-event-border: #56869b; --mc-event-text: #e3f7ff; --mc-hover: #254458; color-scheme: dark; }
.mc-calendar *, .mc-calendar *::before, .mc-calendar *::after { box-sizing: border-box; }
.mc-calendar__summary { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1em; margin-bottom: 1em; }
.mc-calendar__summary > div { min-width: 0; overflow-wrap: anywhere; }
.mc-calendar__summary h2 { margin: 0; font-size: 1.1em; font-weight: 650; }
.mc-calendar__summary p { margin: .25em 0 0; color: var(--mc-muted); font-size: .875em; }
.mc-calendar__count { padding: .3em .6em; white-space: nowrap; border: 1px solid var(--mc-border); border-radius: .4em; font-size: .875em; }
.mc-calendar__notice { margin: 0 0 .75em; padding: .75em .875em; border: 1px solid var(--mc-border); border-radius: .5em; background: var(--mc-panel); color: var(--mc-muted); font-size: .9375em; overflow-wrap: anywhere; }
.mc-calendar__scroll { min-width: 0; width: 100%; max-width: 100%; max-height: 70vh; min-height: 11em; overflow: auto; border: 1px solid var(--mc-border); border-radius: .625em; background: var(--mc-surface); overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.mc-calendar__grid { display: grid; min-width: 100%; width: max-content; isolation: isolate; }
.mc-calendar__header, .mc-calendar__body { display: contents; }
.mc-calendar__time-heading, .mc-calendar__resource-heading { position: sticky; top: 0; z-index: 4; min-width: 0; min-height: 3.25em; padding: .875em .75em; border-bottom: 1px solid var(--mc-border); border-right: 1px solid var(--mc-border); background: var(--mc-panel); font-size: 1em; font-weight: 650; overflow-wrap: anywhere; }
.mc-calendar__time-heading { left: 0; z-index: 5; }
.mc-calendar__times { position: sticky; left: 0; z-index: 3; background: var(--mc-surface); }
.mc-calendar__time { padding: .5em .75em; border-bottom: 1px solid var(--mc-border); border-right: 1px solid var(--mc-border); color: var(--mc-muted); font-size: inherit; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mc-calendar__time > span { font-size: .9375em; line-height: 1.4; }
.mc-calendar__resource { position: relative; min-width: 0; border-right: 1px solid var(--mc-border); }
.mc-calendar__selection-hint { margin: 0 0 .6em; color: var(--mc-muted); font-size: .9375em; line-height: 1.4; }
.mc-calendar__touch-hint { display: none; }
@media (pointer: coarse) { .mc-calendar__mouse-hint { display: none; } .mc-calendar__touch-hint { display: inline; } }
.mc-calendar__range-preview { position: absolute; z-index: 2; left: 0; right: 0; padding: .35em .5em; border: 2px solid var(--mc-accent); border-radius: .3em; background: color-mix(in srgb, var(--mc-accent) 16%, var(--mc-surface)); color: var(--mc-text); font-size: inherit; line-height: 1.4; pointer-events: none; overflow: hidden; }
.mc-calendar__now { position: absolute; z-index: 2; left: 0; right: 0; height: 0; border-top: 2px solid #e11d48; pointer-events: none; }
.mc-calendar__now span { position: absolute; top: -.85em; left: .3em; padding: 0 .3em; border-radius: .2em; background: #be123c; color: white; font-size: .875em; line-height: 1.5; }
.mc-calendar__slot { display: block; width: 100%; padding: 0; border: 0; border-bottom: 1px solid var(--mc-border); border-radius: 0; background: transparent; color: var(--mc-accent); cursor: pointer; text-align: center; font: inherit; user-select: none; }
.mc-calendar__slot.is-unavailable { background: repeating-linear-gradient(135deg, var(--mc-panel), var(--mc-panel) 6px, var(--mc-surface) 6px, var(--mc-surface) 12px); cursor: not-allowed; }
.mc-calendar__slot span { opacity: 0; font-size: 1.25em; }
.mc-calendar__slot:not(:disabled):hover, .mc-calendar__slot:focus-visible { background: var(--mc-hover); }
.mc-calendar__slot:not(:disabled):hover span, .mc-calendar__slot:focus-visible span { opacity: 1; }
.mc-calendar__event { position: absolute; z-index: 2; min-height: 1px; overflow: hidden; padding: 0; border: 1px solid var(--mc-event-border); border-left: 3px solid var(--mc-accent); border-radius: .35em; background: var(--mc-event-surface); color: var(--mc-event-text); cursor: pointer; text-align: left; font: inherit; line-height: 1.4; }
.mc-calendar__event-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: flex-start; gap: .125em; padding: .375em .5em; }
.mc-calendar__event strong { flex-shrink: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
.mc-calendar__event-meta { display: flex; align-items: baseline; gap: .5em; width: 100%; min-width: 0; white-space: nowrap; font-size: .9375em; }
.mc-calendar__event-time { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.mc-calendar__status { min-width: 0; overflow: hidden; text-overflow: ellipsis; border-radius: .2em; font-weight: 650; }
.mc-calendar__slot:focus-visible, .mc-calendar__event:focus-visible, .mc-calendar__scroll:focus-visible { outline: 2px solid var(--mc-accent); outline-offset: -2px; }
.mc-calendar button:disabled { cursor: default; opacity: .6; }
@media (max-width: 640px) { .mc-calendar__summary { align-items: flex-start; } }
</style>
