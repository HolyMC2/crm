<template>
  <form
    class="flex flex-col gap-4"
    novalidate
    @submit.prevent="submit()"
    @keydown.meta.enter.prevent="submit()"
    @keydown.ctrl.enter.prevent="submit()"
  >
    <p v-if="proposal" class="text-sm text-ink-gray-7">
      {{
        __(
          'Only {0} can change this event. Propose a new time and we will let them know.',
          [organizerName],
        )
      }}
    </p>
    <FormControl
      v-if="!proposal"
      ref="titleInput"
      v-model="form.title"
      :label="__('Title')"
      :placeholder="__('Call, visit, delivery…')"
      enterkeyhint="next"
      autocomplete="off"
      required
    />
    <FormControl
      v-if="!proposal"
      v-model="form.allDay"
      type="checkbox"
      :label="__('All day')"
    />
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <FormControl
        v-model="form.date"
        type="date"
        :label="form.allDay ? __('From') : __('Date')"
        class="col-span-2 sm:col-span-1"
      />
      <template v-if="form.allDay">
        <FormControl
          v-model="form.endDate"
          type="date"
          :label="__('Until')"
          class="col-span-2 sm:col-span-2"
        />
      </template>
      <template v-else>
        <FormControl
          v-model="form.startTime"
          type="time"
          :label="__('Starts')"
        />
        <FormControl v-model="form.endTime" type="time" :label="__('Ends')" />
      </template>
    </div>
    <p class="-mt-2 text-sm text-ink-gray-6">
      {{ __('Times in {0}', [timeZone]) }}
    </p>
    <p v-if="localError" role="alert" class="-mt-2 text-sm text-ink-red-4">
      {{ localError }}
    </p>

    <template v-if="!proposal">
      <div>
        <span class="mb-1.5 block text-xs text-ink-gray-5">{{
          __('With whom')
        }}</span>
        <div v-if="form.attendees.length" class="mb-2 flex flex-wrap gap-1.5">
          <span
            v-for="person in form.attendees"
            :key="personKey(person)"
            class="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface-gray-2 pl-3 text-sm text-ink-gray-8"
          >
            {{ person.label || person.name || person.email }}
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-gray-3"
              :aria-label="
                __('Remove {0}', [person.label || person.name || person.email])
              "
              @click="removeAttendee(person)"
            >
              <span class="lucide-x h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </div>
        <FormControl
          v-model="peopleQuery"
          type="text"
          :placeholder="__('Search coworkers or contacts')"
          :aria-label="__('Search coworkers or contacts')"
          autocomplete="off"
          enterkeyhint="search"
        />
        <ul
          v-if="peopleResults.length"
          class="mt-1 max-h-56 overflow-y-auto rounded-lg border border-outline-gray-2"
          :aria-label="__('People found')"
        >
          <li
            v-for="person in peopleResults"
            :key="`${person.doctype}:${person.name}`"
          >
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-base hover:bg-surface-gray-1"
              @click="addAttendee(person)"
            >
              <span class="truncate">{{ person.label }}</span>
              <span class="shrink-0 text-xs text-ink-gray-5">{{
                person.doctype === 'User' ? __('Coworker') : __('Contact')
              }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="peopleError" class="mt-1 text-sm text-ink-red-4">
          {{ peopleError }}
        </p>
      </div>

      <FormControl
        v-model="form.reminder"
        type="select"
        :label="__('Reminder')"
        :options="reminderOptions"
      />
      <FormControl
        v-model="form.location"
        :label="__('Place')"
        autocomplete="off"
      />

      <div
        v-if="form.reference"
        class="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-surface-gray-1 px-3 text-sm"
      >
        <span class="truncate"
          >{{ __('Linked to') }}
          <strong>{{
            form.reference.label || form.reference.name
          }}</strong></span
        >
        <Button
          variant="ghost"
          :label="__('Unlink')"
          @click="form.reference = null"
        />
      </div>

      <button
        type="button"
        class="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-ink-gray-7"
        :aria-expanded="more"
        @click="more = !more"
      >
        <span
          :class="more ? 'lucide-chevron-down' : 'lucide-chevron-right'"
          class="h-4 w-4"
          aria-hidden="true"
        />{{ __('More options') }}
      </button>
      <template v-if="more">
        <FormControl
          v-model="form.repeat"
          type="select"
          :label="__('Repeat')"
          :options="repeatOptions"
        />
        <fieldset v-if="form.repeat === 'weekly'" ref="daysField">
          <legend class="mb-1.5 text-xs text-ink-gray-5">
            {{ __('On these days') }}
          </legend>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="day in weekdays"
              :key="day.value"
              type="button"
              class="min-h-11 min-w-11 rounded-full border px-2 text-sm"
              :class="
                form.repeatDays.includes(day.value)
                  ? 'border-outline-gray-4 bg-surface-gray-3 font-semibold text-ink-gray-9'
                  : 'border-outline-gray-2 text-ink-gray-7'
              "
              :data-weekday="day.value"
              :aria-label="day.long"
              :aria-pressed="form.repeatDays.includes(day.value)"
              @click="toggleDay(day.value)"
            >
              {{ day.short }}
            </button>
          </div>
        </fieldset>
        <FormControl
          v-if="form.repeat"
          v-model="form.repeatTill"
          type="date"
          :label="__('Repeat until (optional)')"
        />
        <FormControl
          v-model="form.description"
          type="textarea"
          :label="__('Notes')"
          :rows="3"
        />
        <FormControl
          v-model="form.public"
          type="checkbox"
          :label="__('Visible to the whole team')"
        />
      </template>
    </template>
    <FormControl
      v-else
      v-model="form.note"
      type="textarea"
      :label="__('Message (optional)')"
      :rows="2"
    />

    <AgendaGuard
      v-if="constraints.length"
      :constraints="constraints"
      :busy="busy"
      :exclude="['open']"
      @action="guardAction"
      @dismiss="emit('dismiss-guard')"
    />

    <div
      class="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-surface-white px-1 pb-[env(safe-area-inset-bottom)] pt-2"
    >
      <Button
        class="min-h-11"
        variant="subtle"
        :label="__('Cancel')"
        @click="emit('close', dirty)"
      />
      <Button
        class="min-h-11"
        variant="solid"
        type="submit"
        :loading="busy"
        :label="submitLabel"
      />
    </div>
  </form>
</template>
<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { Button, FormControl, debounce } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import {
  agendaLocale,
  errorText,
  instantToWall,
  searchPeople,
  wallToInstant,
} from '@/composables/useAgenda'

const props = defineProps({
  // { title, start, end, allDay, location, description, attendees, reminders,
  //   reference, repeat, repeatTill, repeatDays, visibility }
  initial: { type: Object, required: true },
  mode: { type: String, default: 'create' }, // create | edit | propose
  timeZone: { type: String, required: true },
  organizerName: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  constraints: { type: Array, default: () => [] },
})
const emit = defineEmits(['save', 'close', 'guard-action', 'dismiss-guard'])
const proposal = computed(() => props.mode === 'propose')

const REMINDERS = [
  { value: '', before: 0, interval: '' },
  { value: '10m', before: 10, interval: 'minutes' },
  { value: '30m', before: 30, interval: 'minutes' },
  { value: '1h', before: 1, interval: 'hours' },
  { value: '1d', before: 1, interval: 'days' },
]
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
const weekdays = WEEKDAYS.map((value, index) => {
  // 2024-01-01 was a Monday.
  const date = new Date(Date.UTC(2024, 0, 1 + index, 12))
  const name = (weekday) =>
    new Intl.DateTimeFormat(agendaLocale(), {
      weekday,
      timeZone: 'UTC',
    }).format(date)
  return { value, short: name('short'), long: name('long') }
})
const personKey = (person) =>
  person.name ? `${person.doctype}:${person.name}` : `email:${person.email}`
const UNITS = {
  minutes: () => __('minutes'),
  hours: () => __('hours'),
  days: () => __('days'),
  weeks: () => __('weeks'),
}
function reminderSummary(rows) {
  return rows
    .map((row) =>
      __('{0} {1} before', [
        row.before,
        UNITS[row.interval]?.() || row.interval,
      ]),
    )
    .join(', ')
}
const reminderOptions = [
  ...(props.initial.reminders?.length &&
  reminderValue(props.initial.reminders) === 'custom'
    ? [
        {
          label: __('Keep: {0}', [reminderSummary(props.initial.reminders)]),
          value: 'custom',
        },
      ]
    : []),
  { label: __('No reminder'), value: '' },
  { label: __('10 minutes before'), value: '10m' },
  { label: __('30 minutes before'), value: '30m' },
  { label: __('1 hour before'), value: '1h' },
  { label: __('1 day before'), value: '1d' },
]
const repeatOptions = [
  { label: __('Does not repeat'), value: '' },
  { label: __('Every day'), value: 'daily' },
  { label: __('Every week'), value: 'weekly' },
  { label: __('Every month'), value: 'monthly' },
  { label: __('Every year'), value: 'yearly' },
]

// A preset is exactly one notification; anything else is kept as it is.
function reminderValue(rows) {
  if (!rows?.length) return ''
  const [first] = rows
  const match =
    rows.length === 1 &&
    (first.type || 'Notification') === 'Notification' &&
    REMINDERS.find(
      (row) => row.before === first.before && row.interval === first.interval,
    )
  return match ? match.value : 'custom'
}

function initialForm() {
  const start = instantToWall(props.initial.start, props.timeZone)
  const end = instantToWall(props.initial.end, props.timeZone)
  let endDate = end.date
  if (props.initial.allDay) {
    // All-day ends are exclusive on the wire; the form shows the last day.
    const last = new Date(`${end.date}T12:00:00Z`)
    if (end.time === '00:00') last.setUTCDate(last.getUTCDate() - 1)
    endDate = last.toISOString().slice(0, 10)
  }
  const reminder = reminderValue(props.initial.reminders)
  return {
    title: props.initial.title || '',
    allDay: Boolean(props.initial.allDay),
    date: start.date,
    endDate,
    startTime: start.time,
    endTime: end.time,
    attendees: [...(props.initial.attendees || [])],
    reminder,
    location: props.initial.location || '',
    description: props.initial.description || '',
    reference: props.initial.reference || null,
    repeat: props.initial.repeat || '',
    repeatTill: props.initial.repeatTill || '',
    repeatDays: props.initial.repeatDays?.length
      ? [...props.initial.repeatDays]
      : props.initial.repeat === 'weekly'
        ? [WEEKDAYS[(new Date(`${start.date}T12:00:00Z`).getUTCDay() + 6) % 7]]
        : [],
    public: props.initial.visibility === 'public',
    note: '',
  }
}
const form = reactive(initialForm())
const pristine = JSON.stringify(form)
const dirty = computed(() => JSON.stringify(form) !== pristine)
const more = ref(Boolean(form.description || form.repeat || form.public))
const localError = ref('')
const titleInput = ref(null)
const daysField = ref(null)
const initialReminder = form.reminder
const initialAttendees = attendeeSignature(form.attendees)
const initialRepeat = repeatSignature()

function attendeeSignature(rows) {
  return rows.map(personKey).sort().join('|')
}
function repeatSignature() {
  return JSON.stringify([form.repeat, form.repeatTill, sortedDays()])
}
function sortedDays() {
  return WEEKDAYS.filter((day) => form.repeatDays.includes(day))
}
function toggleDay(day) {
  form.repeatDays = form.repeatDays.includes(day)
    ? form.repeatDays.filter((row) => row !== day)
    : [...form.repeatDays, day]
}
// A new weekly repetition starts on the event's own weekday.
watch(
  () => form.repeat,
  (repeat) => {
    if (repeat !== 'weekly' || form.repeatDays.length || !form.date) return
    const index = (new Date(`${form.date}T12:00:00Z`).getUTCDay() + 6) % 7
    form.repeatDays = [WEEKDAYS[index]]
  },
)
async function guardAction(id) {
  // «Edit series» inside the form: the weekdays are right here.
  if (id !== 'edit') return emit('guard-action', id)
  if (!form.repeat) form.repeat = props.initial.repeat || 'weekly'
  more.value = true
  emit('dismiss-guard')
  await nextTick()
  daysField.value?.querySelector('button')?.focus()
}

// Keep the duration when the start moves, like Odoo.
let lastStart = form.startTime
watch(
  () => form.startTime,
  (value) => {
    const from = wallToInstant(form.date, lastStart, props.timeZone)
    const to = wallToInstant(form.date, form.endTime, props.timeZone)
    const next = wallToInstant(form.date, value, props.timeZone)
    if (from && to && next && Date.parse(to) > Date.parse(from)) {
      const shifted = new Date(
        Date.parse(next) + Date.parse(to) - Date.parse(from),
      )
      const wall = instantToWall(shifted.toISOString(), props.timeZone)
      if (wall.date === form.date) form.endTime = wall.time
    }
    lastStart = value
  },
)

const peopleQuery = ref('')
const peopleResults = ref([])
const peopleError = ref('')
let peopleRequest = 0
const runSearch = debounce(async (text) => {
  const request = ++peopleRequest
  try {
    const data = await searchPeople(text)
    if (request !== peopleRequest) return
    const chosen = new Set(form.attendees.map((p) => `${p.doctype}:${p.name}`))
    peopleResults.value = (data.people || []).filter(
      (p) => !chosen.has(`${p.doctype}:${p.name}`),
    )
    peopleError.value = ''
  } catch (error) {
    if (request !== peopleRequest) return
    peopleResults.value = []
    peopleError.value = errorText(error)
  }
}, 200)
watch(peopleQuery, (text) => {
  if (text.trim().length < 2) {
    peopleRequest++
    peopleResults.value = []
    return
  }
  runSearch(text.trim())
})
function addAttendee(person) {
  form.attendees.push({
    doctype: person.doctype,
    name: person.name,
    label: person.label,
  })
  peopleQuery.value = ''
  peopleResults.value = []
}
function removeAttendee(person) {
  form.attendees = form.attendees.filter(
    (p) => !(p.doctype === person.doctype && p.name === person.name),
  )
}

const submitLabel = computed(() =>
  proposal.value
    ? __('Send proposal')
    : props.mode === 'edit'
      ? __('Save changes')
      : __('Save event'),
)

function times() {
  if (form.allDay) {
    const start = wallToInstant(form.date, '00:00', props.timeZone)
    const last = new Date(`${form.endDate || form.date}T12:00:00Z`)
    last.setUTCDate(last.getUTCDate() + 1)
    const end = wallToInstant(
      last.toISOString().slice(0, 10),
      '00:00',
      props.timeZone,
    )
    return { start, end }
  }
  return {
    start: wallToInstant(form.date, form.startTime, props.timeZone),
    end: wallToInstant(form.date, form.endTime, props.timeZone),
  }
}

function submit() {
  localError.value = ''
  if (!proposal.value && !form.title.trim()) {
    localError.value = __('Write a title for the event.')
    titleInput.value?.$el?.querySelector('input')?.focus()
    return
  }
  const { start, end } = times()
  if (!start || !end) {
    localError.value = __('Choose a valid date and time.')
    return
  }
  if (Date.parse(end) <= Date.parse(start)) {
    // Overnight: an end before the start means the next day.
    if (!form.allDay && form.endTime < form.startTime) {
      const next = new Date(Date.parse(end) + 24 * 3600 * 1000).toISOString()
      return emitSave(start, next)
    }
    localError.value = __('The end must be after the start.')
    return
  }
  if (form.repeat === 'weekly' && !form.repeatDays.length) {
    more.value = true
    localError.value = __('Choose at least one day for the repetition.')
    return
  }
  emitSave(start, end)
}

function emitSave(start, end) {
  if (proposal.value) {
    emit('save', { start, end, note: form.note.trim() })
    return
  }
  const editing = props.mode === 'edit'
  const preset = REMINDERS.find((row) => row.value === form.reminder)
  const reminders =
    form.reminder === 'custom'
      ? props.initial.reminders || []
      : preset && preset.value
        ? [
            {
              type: 'Notification',
              before: preset.before,
              interval: preset.interval,
            },
          ]
        : []
  // An edit sends reminders and people only when they changed, so native rows the form
  // cannot show in full (email reminders, invitations by email) stay as they are.
  const remindersChanged = !editing || form.reminder !== initialReminder
  const attendeesChanged =
    !editing || attendeeSignature(form.attendees) !== initialAttendees
  const repeatChanged = !editing || repeatSignature() !== initialRepeat
  emit('save', {
    title: form.title.trim(),
    start,
    end,
    allDay: form.allDay,
    location: form.location.trim(),
    description: form.description.trim(),
    ...(attendeesChanged
      ? {
          attendees: form.attendees.map((person) =>
            person.name
              ? { doctype: person.doctype, name: person.name }
              : { email: person.email },
          ),
        }
      : {}),
    ...(remindersChanged ? { reminders } : {}),
    reference: form.reference
      ? { doctype: form.reference.doctype, name: form.reference.name }
      : null,
    visibility: form.public ? 'public' : 'private',
    // Repetition is sent only when chosen here, so series set up elsewhere keep their days.
    ...(repeatChanged
      ? {
          repeat: form.repeat,
          repeatTill: form.repeat ? form.repeatTill || null : null,
          ...(form.repeat === 'weekly' ? { repeatDays: sortedDays() } : {}),
        }
      : {}),
  })
}

onMounted(async () => {
  await nextTick()
  if (props.mode === 'create')
    titleInput.value?.$el?.querySelector('input')?.focus()
})
defineExpose({ dirty, submit, form })
</script>
