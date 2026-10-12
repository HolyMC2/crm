<template>
  <form
    class="ag-qc"
    novalidate
    @submit.prevent="save"
    @keydown.meta.enter.prevent="save"
    @keydown.ctrl.enter.prevent="save"
  >
    <div class="ag-qc__bar">
      <span
        class="lucide-grip-horizontal h-4 w-4 text-ink-gray-5"
        aria-hidden="true"
      />
      <button
        type="button"
        class="ag-qc__icon"
        :aria-label="__('Close')"
        @click="emit('close')"
      >
        <span class="lucide-x h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <div class="ag-qc__body">
      <input
        ref="titleInput"
        v-model="form.title"
        class="ag-qc__title"
        :placeholder="kind === 'task' ? __('Add a task') : __('Add title')"
        :aria-label="__('Title')"
        autocomplete="off"
        maxlength="140"
      />
      <div v-if="canCreateTask" class="ag-qc__tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="ag-qc__tab"
          :aria-selected="kind === tab.value"
          @click="kind = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="ag-qc__row">
        <span class="lucide-clock h-5 w-5" aria-hidden="true" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <input
              v-model="form.date"
              type="date"
              class="ag-qc__input"
              :aria-label="__('Date')"
            />
            <template v-if="kind === 'event' && form.allDay">
              <span class="text-ink-gray-6">–</span>
              <input
                v-model="form.endDate"
                type="date"
                class="ag-qc__input"
                :aria-label="__('Until')"
              />
            </template>
          </div>
          <div
            v-if="kind === 'event' && !form.allDay"
            class="flex items-center gap-1.5"
          >
            <input
              v-model="form.startTime"
              type="time"
              step="900"
              class="ag-qc__input"
              :aria-label="__('Starts')"
            />
            <span class="text-ink-gray-6">–</span>
            <input
              v-model="form.endTime"
              type="time"
              step="900"
              class="ag-qc__input"
              :aria-label="__('Ends')"
            />
          </div>
          <label
            v-if="kind === 'event'"
            class="flex items-center gap-2 text-sm text-ink-gray-7"
          >
            <input
              v-model="form.allDay"
              type="checkbox"
              class="h-4 w-4 rounded"
            />{{ __('All day') }}
          </label>
        </div>
      </div>

      <template v-if="kind === 'event'">
        <div class="ag-qc__row">
          <span class="lucide-map-pin h-5 w-5" aria-hidden="true" />
          <input
            v-model="form.location"
            class="ag-qc__plain"
            :placeholder="__('Add location')"
            :aria-label="__('Place')"
            autocomplete="off"
          />
        </div>
        <button type="button" class="ag-qc__row ag-qc__rowbtn" @click="more">
          <span class="lucide-users h-5 w-5" aria-hidden="true" />
          <span class="text-ink-gray-7">{{
            __('Add guests, reminders and notes')
          }}</span>
        </button>
      </template>
      <div v-if="context?.reference" class="ag-qc__row">
        <span class="lucide-link h-5 w-5" aria-hidden="true" />
        <span class="truncate text-sm"
          >{{ __('Linked to') }}
          <strong>{{
            context.reference.label || context.reference.name
          }}</strong></span
        >
      </div>
      <div v-if="kind === 'event'" class="ag-qc__row">
        <span class="lucide-palette h-5 w-5" aria-hidden="true" />
        <div
          class="flex flex-wrap items-center gap-1.5"
          role="radiogroup"
          :aria-label="__('Color')"
        >
          <button
            type="button"
            class="ag-qc__swatch is-default"
            role="radio"
            :aria-checked="!form.color"
            :title="__('Calendar color')"
            :style="{ background: calendarColor }"
            @click="form.color = ''"
          >
            <span
              v-if="!form.color"
              class="lucide-check h-3 w-3"
              :style="{ color: textOn(calendarColor) }"
              aria-hidden="true"
            />
          </button>
          <button
            v-for="swatch in PALETTE.slice(0, 11)"
            :key="swatch.id"
            type="button"
            class="ag-qc__swatch"
            role="radio"
            :aria-checked="form.color === swatch.hex"
            :title="__(swatch.name)"
            :aria-label="__(swatch.name)"
            :style="{ background: swatch.hex }"
            @click="form.color = swatch.hex"
          >
            <span
              v-if="form.color === swatch.hex"
              class="lucide-check h-3 w-3"
              :style="{ color: textOn(swatch.hex) }"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <p v-if="error" role="alert" class="text-sm text-ink-red-4">
        {{ error }}
      </p>
      <AgendaGuard
        v-if="constraints.length"
        :constraints="constraints"
        :busy="busy"
        :exclude="['open']"
        @action="(id) => emit('guard-action', id)"
        @dismiss="emit('dismiss-guard')"
      />
    </div>
    <div class="ag-qc__foot">
      <Button
        v-if="kind === 'event'"
        variant="ghost"
        :label="__('More options')"
        @click="more"
      />
      <Button
        variant="solid"
        type="submit"
        :loading="busy"
        :label="__('Save')"
      />
    </div>
  </form>
</template>
<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import { PALETTE, textOn } from '@/components/agenda/agendaColors'
import { instantToWall, wallToInstant } from '@/composables/useAgenda'

const props = defineProps({
  draft: { type: Object, required: true }, // { start, end, allDay, kind }
  timeZone: { type: String, required: true },
  calendarColor: { type: String, default: '#039be5' },
  canCreateTask: { type: Boolean, default: false },
  context: { type: Object, default: null }, // { reference, attendees, title }
  busy: { type: Boolean, default: false },
  constraints: { type: Array, default: () => [] },
})
const emit = defineEmits([
  'save',
  'more',
  'close',
  'change',
  'guard-action',
  'dismiss-guard',
])

const tabs = [
  { value: 'event', label: __('Event') },
  { value: 'task', label: __('Task') },
]
const kind = ref(props.draft.kind || 'event')
const titleInput = ref(null)
const error = ref('')

function lastDay(endInstant) {
  const end = instantToWall(endInstant, props.timeZone)
  if (end.time !== '00:00') return end.date
  const day = new Date(`${end.date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}
const start = instantToWall(props.draft.start, props.timeZone)
const end = instantToWall(props.draft.end, props.timeZone)
const form = reactive({
  title: props.context?.title || props.draft.title || '',
  date: start.date,
  endDate: props.draft.allDay ? lastDay(props.draft.end) : start.date,
  startTime: props.draft.allDay ? '09:00' : start.time,
  endTime: props.draft.allDay ? '10:00' : end.time,
  allDay: Boolean(props.draft.allDay),
  location: '',
  color: '',
})

function times() {
  if (form.allDay || kind.value === 'task') {
    const last = new Date(
      `${form.allDay ? form.endDate || form.date : form.date}T12:00:00Z`,
    )
    last.setUTCDate(last.getUTCDate() + 1)
    return {
      start: wallToInstant(form.date, '00:00', props.timeZone),
      end: wallToInstant(
        last.toISOString().slice(0, 10),
        '00:00',
        props.timeZone,
      ),
    }
  }
  let to = wallToInstant(form.date, form.endTime, props.timeZone)
  const from = wallToInstant(form.date, form.startTime, props.timeZone)
  if (from && to && Date.parse(to) <= Date.parse(from))
    to = new Date(Date.parse(to) + 24 * 3600 * 1000).toISOString()
  return { start: from, end: to }
}
// The grid keeps drawing the draft where the form says it is.
watch(
  () => [
    form.title,
    form.date,
    form.endDate,
    form.startTime,
    form.endTime,
    form.allDay,
    kind.value,
  ],
  () => {
    const value = times()
    if (value.start && value.end)
      emit('change', {
        ...value,
        allDay: form.allDay || kind.value === 'task',
        title: form.title,
        kind: kind.value,
      })
  },
)
// Keep the duration when the start moves.
let lastStart = form.startTime
watch(
  () => form.startTime,
  (next) => {
    const from = wallToInstant(form.date, lastStart, props.timeZone)
    const to = wallToInstant(form.date, form.endTime, props.timeZone)
    const moved = wallToInstant(form.date, next, props.timeZone)
    if (from && to && moved && Date.parse(to) > Date.parse(from)) {
      const shifted = new Date(
        Date.parse(moved) + Date.parse(to) - Date.parse(from),
      ).toISOString()
      const wall = instantToWall(shifted, props.timeZone)
      if (wall.date === form.date) form.endTime = wall.time
    }
    lastStart = next
  },
)
const calendarColor = computed(() => props.calendarColor)

function payload() {
  const value = times()
  return {
    kind: kind.value,
    title: form.title.trim(),
    start: value.start,
    end: value.end,
    date: form.date,
    allDay: form.allDay,
    location: form.location.trim(),
    color: form.color,
  }
}
function save() {
  error.value = ''
  const value = payload()
  if (!value.title) {
    error.value =
      kind.value === 'task'
        ? __('Write what needs doing.')
        : __('Write a title for the event.')
    titleInput.value?.focus()
    return
  }
  if (
    !value.start ||
    !value.end ||
    Date.parse(value.end) <= Date.parse(value.start)
  ) {
    error.value = __('Choose a valid date and time.')
    return
  }
  emit('save', value)
}
function more() {
  emit('more', payload())
}
onMounted(async () => {
  await nextTick()
  titleInput.value?.focus()
})
</script>
<style scoped>
.ag-qc {
  display: flex;
  flex-direction: column;
}
.ag-qc__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px 0 16px;
  background: var(--surface-gray-1);
  border-radius: 16px 16px 0 0;
}
.ag-qc__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-qc__icon:hover {
  background: var(--surface-gray-3);
}
.ag-qc__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 8px 20px;
}
.ag-qc__title {
  width: 100%;
  margin-left: 36px;
  width: calc(100% - 36px);
  padding: 6px 0;
  border: 0;
  border-bottom: 1px solid var(--outline-gray-2);
  background: transparent;
  font-size: 22px;
  color: var(--ink-gray-9);
  outline: none;
  box-shadow: none;
}
.ag-qc__title:focus {
  border-bottom: 2px solid var(--ag-accent);
}
.ag-qc__tabs {
  display: flex;
  gap: 6px;
  margin-left: 36px;
}
.ag-qc__tab {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-7);
}
.ag-qc__tab:hover {
  background: var(--surface-gray-2);
}
.ag-qc__tab[aria-selected='true'] {
  background: var(--ag-select-strong);
  color: var(--ag-accent-ink);
}
.ag-qc__row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 36px;
  color: var(--ink-gray-8);
  font-size: 14px;
}
.ag-qc__row > [class^='lucide-'] {
  flex: none;
  color: var(--ink-gray-6);
}
.ag-qc__rowbtn {
  width: 100%;
  border-radius: 8px;
  text-align: left;
}
.ag-qc__rowbtn:hover {
  background: var(--surface-gray-1);
}
.ag-qc__input {
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: var(--surface-gray-2);
  font-size: 14px;
  color: var(--ink-gray-9);
}
.ag-qc__plain {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
}
.ag-qc__plain:hover,
.ag-qc__plain:focus {
  background: var(--surface-gray-2);
}
.ag-qc__swatch {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
}
.ag-qc__swatch.is-default {
  box-shadow:
    0 0 0 2px var(--surface-base),
    0 0 0 3px var(--outline-gray-3);
  margin-right: 4px;
}
.ag-qc__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 16px 16px;
}
</style>
