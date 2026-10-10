<template>
  <ModuleLayout
    :title="__('Agenda')"
    :entries="viewEntries"
    :active-key="state.view"
    @select="setView"
  >
    <template #sidebar>
      <fieldset v-if="calendarOptions.length > 1" class="px-3 pt-7">
        <legend class="pb-3 text-xs text-ink-gray-6">
          {{ __('Calendars') }}
        </legend>
        <label
          v-for="option in calendarOptions"
          :key="option.key"
          class="flex min-h-11 items-center gap-2.5 text-sm text-ink-gray-8"
        >
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            :checked="state.calendars.includes(option.key)"
            @change="toggleCalendar(option.key)"
          />{{ option.label }}
        </label>
      </fieldset>
      <ul
        v-if="blockedSources.length"
        class="space-y-2 px-3 pt-4 text-xs text-ink-gray-6"
      >
        <li v-for="row in blockedSources" :key="row.key">
          <strong class="text-ink-gray-7">{{ sourceLabel(row.key) }}:</strong>
          {{ row.reason }}
        </li>
      </ul>
    </template>

    <div class="agenda-page flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex flex-col gap-2 border-b border-outline-gray-1 px-4 py-2.5 sm:flex-row sm:items-center sm:px-6 sm:py-3"
        >
          <div class="flex min-w-0 items-center gap-2 sm:flex-1">
            <component
              :is="returnRoute ? RouterLink : 'a'"
              v-if="returnTo"
              v-bind="returnRoute ? { to: returnRoute } : { href: returnTo }"
              class="mr-1 inline-flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
              ><span class="lucide-arrow-left h-4 w-4" aria-hidden="true" />{{
                __('Back to {0}', [returnLabel])
              }}</component
            >
            <h1
              class="min-w-0 flex-1 truncate text-lg font-semibold text-ink-gray-9 first-letter:uppercase sm:text-2xl"
            >
              {{ rangeTitle }}
            </h1>
            <div class="flex shrink-0 items-center gap-1">
              <Button
                class="min-h-11 min-w-11"
                variant="ghost"
                icon="chevron-left"
                :aria-label="__('Previous')"
                @click="go(-1)"
              />
              <Button
                class="min-h-11"
                variant="subtle"
                :label="__('Today')"
                @click="setDate(todayDate)"
              />
              <Button
                class="min-h-11 min-w-11"
                variant="ghost"
                icon="chevron-right"
                :aria-label="__('Next')"
                @click="go(1)"
              />
            </div>
          </div>
          <div
            class="grid grid-cols-4 rounded-lg bg-surface-gray-2 p-0.5 sm:hidden"
            role="group"
            :aria-label="__('View')"
          >
            <button
              v-for="entry in viewEntries"
              :key="entry.value"
              type="button"
              class="min-h-10 rounded-md px-2 text-sm"
              :class="
                state.view === entry.value
                  ? 'bg-surface-white font-semibold text-ink-gray-9 shadow-sm'
                  : 'text-ink-gray-7'
              "
              :aria-pressed="state.view === entry.value"
              @click="setView(entry.value)"
            >
              {{ entry.label }}
            </button>
          </div>
          <Button
            v-if="canCreate"
            class="hidden min-h-11 sm:inline-flex"
            variant="solid"
            icon-left="plus"
            :label="__('New event')"
            @click="openCreate()"
          />
        </header>

        <div class="flex flex-col gap-2 px-4 pt-3 sm:px-6">
          <p v-if="zoneNote" class="text-sm text-ink-gray-6">{{ zoneNote }}</p>
          <div
            v-if="calendarOptions.length > 1"
            class="flex gap-2 overflow-x-auto sm:hidden"
            :aria-label="__('Calendars')"
          >
            <button
              v-for="option in calendarOptions"
              :key="option.key"
              type="button"
              class="min-h-10 shrink-0 rounded-full border px-3 text-sm"
              :class="
                state.calendars.includes(option.key)
                  ? 'border-outline-gray-4 bg-surface-gray-2 font-medium text-ink-gray-9'
                  : 'border-outline-gray-2 text-ink-gray-6'
              "
              :aria-pressed="state.calendars.includes(option.key)"
              @click="toggleCalendar(option.key)"
            >
              {{ option.label }}
            </button>
          </div>
          <section
            v-if="capsError || (caps && !caps.enabled)"
            role="alert"
            class="rounded-lg border border-outline-gray-2 p-4"
          >
            <h2 class="text-lg font-semibold text-ink-gray-9">
              {{ __('We could not open the Agenda') }}
            </h2>
            <p class="mt-1 text-base text-ink-gray-7">
              {{ capsError || caps.reason || firstReason }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                class="min-h-11"
                variant="solid"
                :label="__('Retry permissions')"
                @click="boot"
              />
              <Button
                class="min-h-11"
                :label="__('Request access')"
                @click="copyAccessRequest"
              />
            </div>
            <p v-if="copied" role="status" class="mt-2 text-sm text-ink-gray-7">
              {{ copied }}
            </p>
          </section>
          <AgendaGuard
            v-for="problem in problems"
            :key="problem.source"
            :constraints="[problem.constraint]"
            :hint="__('Calendar: {0}', [sourceLabel(problem.source)])"
            @action="(id) => problemAction(id)"
            @dismiss="problems = problems.filter((row) => row !== problem)"
          />
          <AgendaGuard
            v-if="moveGuard && !panelOpen"
            :constraints="moveGuard.constraints"
            :busy="busy"
            :hint="moveHint"
            @action="guardAction"
            @dismiss="moveGuard = null"
          />
          <p v-if="slow" role="status" class="text-sm text-ink-gray-6">
            {{ __('This is taking longer than usual.') }}
            <button type="button" class="min-h-11 underline" @click="load">
              {{ __('Try again') }}
            </button>
          </p>
          <div
            v-if="['day', 'week'].includes(state.view) && allDayRows.length"
            class="flex flex-wrap items-center gap-1.5"
            :aria-label="__('All day')"
          >
            <span class="text-xs text-ink-gray-6">{{ __('All day') }}</span>
            <button
              v-for="row in allDayRows"
              :key="row.key"
              type="button"
              class="min-h-9 max-w-full truncate rounded-md border border-outline-gray-2 bg-surface-gray-1 px-2 text-sm text-ink-gray-8 hover:bg-surface-gray-2"
              @click="select(row.event)"
            >
              <span v-if="state.view === 'week'" class="text-ink-gray-5"
                >{{ row.day }} · </span
              >{{ row.event.title }}
            </button>
          </div>
        </div>

        <div
          ref="calendarRoot"
          class="agenda-cal min-h-0 flex-1 overflow-auto px-4 pb-6 pt-3 sm:px-6"
          :aria-busy="loading"
        >
          <div v-if="showSkeleton" class="space-y-3" aria-hidden="true">
            <div
              v-for="n in 6"
              :key="n"
              class="h-14 animate-pulse rounded-lg bg-surface-gray-1"
            />
          </div>
          <template v-else-if="timeZone">
            <AgendaList
              v-if="state.view === 'list'"
              :events="visibleEvents"
              :range="range"
              :time-zone="timeZone"
              :locale="locale"
              :hour12="hour12"
              :today="todayDate"
              :now="now"
              :selected="state.event"
              :can-create="canCreate"
              @select="select"
              @create="openCreateOn"
            />
            <template v-else-if="state.view === 'month'">
              <AgendaMonth
                :events="visibleEvents"
                :date="state.date"
                :today="todayDate"
                :time-zone="timeZone"
                :locale="locale"
                :hour12="hour12"
                :week-starts-on="firstWeekday"
                :compact="phone"
                :selected="state.event"
                :can-create="canCreate"
                @select="select"
                @create="openCreateOn"
                @pick="setDate"
                @open-day="(date) => setState({ date, view: 'day' })"
              />
              <AgendaList
                v-if="phone"
                class="mt-4"
                :events="visibleEvents"
                :range="pickedDay"
                :time-zone="timeZone"
                :locale="locale"
                :hour12="hour12"
                :today="todayDate"
                :now="now"
                :selected="state.event"
                :can-create="canCreate"
                @select="select"
                @create="openCreateOn"
              />
            </template>
            <AgendaCalendar
              v-else
              :view="state.view"
              :events="calendarEvents"
              :resources="calendarResources"
              :date="state.date"
              :time-zone="timeZone"
              :locale="locale"
              :hour12="hour12"
              :show-summary="false"
              :start-hour="hours.start"
              :end-hour="hours.end"
              :slot-minutes="SLOT_MINUTES"
              :week-starts-on="firstWeekday"
              :disabled="busy"
              :translate="translate"
              @select="select"
              @create="openCreateSlot"
              @create-range="openCreateSlot"
              @choose-date="(date) => setState({ date, view: 'day' })"
            />
          </template>
        </div>
        <Button
          v-if="canCreate"
          class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 h-14 w-14 rounded-full shadow-lg sm:hidden"
          variant="solid"
          icon="plus"
          :aria-label="__('New event')"
          @click="openCreate()"
        />
      </div>

      <aside
        v-if="selectedEvent && !phone"
        class="w-[380px] shrink-0 overflow-y-auto border-l border-outline-gray-1 p-5"
        :aria-label="__('Event details')"
      >
        <AgendaEventPanel v-bind="panelProps" v-on="panelHandlers" />
      </aside>
    </div>

    <BottomSheet
      v-if="phone"
      :open="Boolean(selectedEvent)"
      :title="''"
      @update:open="(value) => !value && closePanel()"
    >
      <div v-if="selectedEvent" class="px-5 pb-6">
        <AgendaEventPanel v-bind="panelProps" v-on="panelHandlers" />
      </div>
    </BottomSheet>

    <component
      :is="phone ? BottomSheet : Dialog"
      v-if="form"
      v-bind="formContainerProps"
    >
      <template #[formSlot]>
        <div :class="phone ? 'px-5 pb-4' : ''">
          <h2 v-if="phone" class="pb-3 text-xl font-semibold">
            {{ formTitle }}
          </h2>
          <div
            v-if="!form.initial && !form.loadError"
            class="space-y-3 py-2"
            aria-busy="true"
            role="status"
          >
            <p class="text-base text-ink-gray-7">
              {{ __('Loading the event…') }}
            </p>
            <div class="h-9 animate-pulse rounded bg-surface-gray-2" />
            <div class="h-9 animate-pulse rounded bg-surface-gray-2" />
          </div>
          <div v-else-if="!form.initial" role="alert" class="space-y-3 py-2">
            <p class="text-base text-ink-red-4">{{ form.loadError }}</p>
            <p class="text-sm text-ink-gray-7">
              {{
                __(
                  'We need the full event before editing it, so nothing is overwritten.',
                )
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                class="min-h-11"
                variant="solid"
                :label="__('Try again')"
                @click="loadEditForm(form)"
              />
              <Button
                class="min-h-11"
                variant="subtle"
                :label="__('Cancel')"
                @click="form = null"
              />
            </div>
          </div>
          <AgendaEventForm
            v-else
            :key="form.key"
            :initial="form.initial"
            :mode="form.mode"
            :time-zone="timeZone"
            :organizer-name="form.event?.organizerName || ''"
            :busy="busy"
            :constraints="form.constraints"
            @save="saveForm"
            @close="closeForm"
            @guard-action="formGuardAction"
            @dismiss-guard="form.constraints = []"
          />
          <div
            v-if="form.confirmDiscard"
            role="alertdialog"
            class="mt-3 rounded-lg border border-outline-gray-2 p-3"
          >
            <p class="text-base">{{ __('Discard your changes?') }}</p>
            <div class="mt-2 flex gap-2">
              <Button
                class="min-h-11"
                variant="subtle"
                :label="__('Keep editing')"
                @click="form.confirmDiscard = false"
              />
              <Button
                class="min-h-11"
                variant="solid"
                theme="red"
                :label="__('Discard')"
                @click="form = null"
              />
            </div>
          </div>
        </div>
      </template>
    </component>
  </ModuleLayout>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { BottomSheet, Button, Dialog, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import AgendaEventForm from '@/components/agenda/AgendaEventForm.vue'
import AgendaEventPanel from '@/components/agenda/AgendaEventPanel.vue'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import AgendaList from '@/components/agenda/AgendaList.vue'
import AgendaMonth from '@/components/agenda/AgendaMonth.vue'
import { useAgendaDrag } from '@/components/agenda/agendaDrag'
import { AgendaCalendar } from '@/vendor/muelle-calendar/vue'
import { isMobile } from '@/composables/breakpoint'
import { registerPageShortcuts } from '@/composables/shellKeyboard'
import {
  CALENDAR_RESOURCE,
  agendaLocale,
  agendaShortcuts,
  createEvent,
  errorText,
  eventDetail,
  eventKey,
  formatWhen,
  loadCapabilities,
  moveEvent,
  parseEventKey,
  parseState,
  querySources,
  rangeFor,
  requestChange,
  requestId,
  safeReturn,
  setStatus,
  splitAllDay,
  stateQuery,
  step,
  toCalendarEvent,
  today,
  updateEvent,
  usesHour12,
  visibleHours,
  wallToInstant,
  weekStartsOn,
} from '@/composables/useAgenda'

const SLOT_MINUTES = 30
const route = useRoute()
const router = useRouter()
const phone = isMobile
const locale = agendaLocale()
const hour12 = usesHour12(locale)
const translate = (source) => __(source)
const firstWeekday = weekStartsOn()

const caps = ref(null)
const capsError = ref('')
const copied = ref('')
const events = ref([])
const problems = ref([])
const loading = ref(false)
const showSkeleton = ref(false)
const slow = ref(false)
const busy = ref(false)
const now = ref(Date.now())
const moveGuard = ref(null)
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const panelConstraints = ref([])
const form = ref(null)
const calendarRoot = ref(null)

const timeZone = computed(
  () =>
    caps.value?.sources?.find((row) => row.enabled)?.timeZone ||
    window.timezone?.system ||
    Intl.DateTimeFormat().resolvedOptions().timeZone,
)
const state = computed(() =>
  parseState(route.query, { phone: phone.value, timeZone: timeZone.value }),
)
const todayDate = computed(() => today(timeZone.value))
const range = computed(() =>
  rangeFor(state.value, timeZone.value, firstWeekday),
)
// Phone month: the tapped day's agenda below the grid, from the month already loaded.
const pickedDay = computed(() =>
  rangeFor({ view: 'day', date: state.value.date }, timeZone.value),
)
const viewEntries = computed(() => [
  { value: 'list', label: __('List'), icon: 'list' },
  { value: 'day', label: __('Day'), icon: 'calendar' },
  { value: 'week', label: __('Week'), icon: 'columns' },
  { value: 'month', label: __('Month'), icon: 'grid' },
])
const SOURCE_LABELS = {
  Event: () => __('My agenda'),
  Turno: () => __('Shifts'),
}
const sourceLabel = (key) => SOURCE_LABELS[key]?.() || key
const enabledSources = computed(
  () => caps.value?.sources?.filter((row) => row.enabled) || [],
)
const blockedSources = computed(
  () =>
    caps.value?.sources?.filter(
      (row) => !row.enabled && row.reason && row.key in SOURCE_LABELS,
    ) || [],
)
const firstReason = computed(() => blockedSources.value[0]?.reason || '')
const calendarOptions = computed(() =>
  enabledSources.value
    .filter((row) => row.key in SOURCE_LABELS)
    .map((row) => ({ key: row.key, label: sourceLabel(row.key) })),
)
const activeSources = computed(() =>
  calendarOptions.value
    .map((row) => row.key)
    .filter((key) => state.value.calendars.includes(key)),
)
const canCreate = computed(() =>
  Boolean(enabledSources.value.find((row) => row.key === 'Event')?.canCreate),
)
const zoneNote = computed(() => {
  const own = caps.value?.user_time_zone
  return own && own !== timeZone.value
    ? __('Times in {0}, the business time zone.', [timeZone.value])
    : ''
})

const visibleEvents = computed(() =>
  events.value.filter((event) => activeSources.value.includes(event.source)),
)
const split = computed(() => splitAllDay(visibleEvents.value))
const calendarEvents = computed(() => split.value.timed.map(toCalendarEvent))
const calendarResources = computed(() => [
  { id: CALENDAR_RESOURCE, title: __('Agenda'), timeZone: timeZone.value },
])
const hours = computed(() => visibleHours(split.value.timed, timeZone.value))
const allDayRows = computed(() => {
  const dates = new Set(
    state.value.view === 'day' ? [state.value.date] : range.value.dates,
  )
  const dayLabel = new Intl.DateTimeFormat(locale, {
    timeZone: timeZone.value,
    weekday: 'short',
  })
  const rows = []
  for (const event of split.value.allDay) {
    const first = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone.value,
    }).format(new Date(event.start))
    const lastInstant = new Date(Date.parse(event.end) - 1)
    const last = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone.value,
    }).format(lastInstant)
    if ([...dates].some((date) => date >= first && date <= last))
      rows.push({
        key: eventKey(event),
        event,
        day: dayLabel.format(new Date(event.start)),
      })
  }
  return rows
})
const rangeTitle = computed(() => {
  const civil = (date, options) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    )
  if (state.value.view === 'day')
    return civil(state.value.date, {
      weekday: phone.value ? 'short' : 'long',
      day: 'numeric',
      month: phone.value ? 'short' : 'long',
    })
  if (state.value.view === 'month')
    return civil(state.value.date, { month: 'long', year: 'numeric' })
  const dates = range.value.dates
  const last = { day: 'numeric', month: 'short' }
  if (!phone.value) last.year = 'numeric'
  return `${civil(dates[0], { day: 'numeric', month: 'short' })} – ${civil(dates[dates.length - 1], last)}`
})

const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  String(route.query.return_label || __('previous screen')).slice(0, 40),
)
// CRM targets stay in this router; sibling apps (Taller, Clínica, POS…) are other pages.
const returnRoute = computed(() =>
  returnTo.value.startsWith('/crm/') ? returnTo.value.slice(4) : '',
)

// --- URL state ------------------------------------------------------------------------
function setState(patch) {
  const next = { ...state.value, ...patch }
  router.replace({ query: stateQuery(next, route.query) })
}
const setView = (view) => setState({ view })
const setDate = (date) => setState({ date })
const go = (direction) => setState({ date: step(state.value, direction) })
function toggleCalendar(key) {
  const current = state.value.calendars
  const next = current.includes(key)
    ? current.filter((row) => row !== key)
    : [...current, key]
  setState({ calendars: next.length ? next : ['Event'] })
}

// --- loading --------------------------------------------------------------------------
async function boot() {
  capsError.value = ''
  copied.value = ''
  try {
    caps.value = await loadCapabilities()
  } catch (error) {
    capsError.value = errorText(error)
    return
  }
  await load()
}

let sequence = 0
async function load() {
  if (!activeSources.value.length) {
    events.value = []
    return
  }
  const request = ++sequence
  loading.value = true
  slow.value = false
  const skeleton = setTimeout(() => {
    if (request === sequence && !events.value.length) showSkeleton.value = true
  }, 150)
  const lag = setTimeout(
    () => request === sequence && (slow.value = true),
    8000,
  )
  try {
    const result = await querySources(activeSources.value, range.value)
    if (request !== sequence) return
    events.value = result.events
    problems.value = result.problems
    syncSelection()
  } finally {
    clearTimeout(skeleton)
    clearTimeout(lag)
    if (request === sequence) {
      loading.value = false
      showSkeleton.value = false
      slow.value = false
    }
  }
}
// Range and calendar changes reload; the first load belongs to boot(). The key is a
// string so picking a day or an event inside the loaded range does not refetch.
watch(
  () =>
    [range.value.start, range.value.end, activeSources.value.join(',')].join(
      '|',
    ),
  (_now, before) => caps.value && !before.endsWith('|') && load(),
)

// --- selection and panel --------------------------------------------------------------
const selectedEvent = ref(null)
const panelOpen = computed(() => Boolean(selectedEvent.value))
function select(event) {
  setState({ event: eventKey(event) })
}
function closePanel() {
  setState({ event: '' })
}
let detailRequest = 0
async function syncSelection() {
  const key = state.value.event
  if (!key) {
    // A detail still on its way must not reopen the closed panel.
    detailRequest++
    detailLoading.value = false
    selectedEvent.value = null
    detail.value = null
    panelConstraints.value = []
    return
  }
  const found = events.value.find((event) => eventKey(event) === key)
  const parsed = parseEventKey(key)
  if (selectedEvent.value && eventKey(selectedEvent.value) !== key)
    panelConstraints.value = []
  selectedEvent.value =
    found ||
    (selectedEvent.value && eventKey(selectedEvent.value) === key
      ? selectedEvent.value
      : null)
  if (!parsed || parsed.source !== 'Event') {
    detail.value = null
    return
  }
  const request = ++detailRequest
  detailLoading.value = true
  detailError.value = ''
  try {
    const data = await eventDetail(parsed.source, parsed.id)
    if (request !== detailRequest) return
    if (data?.constraints) {
      detailError.value = data.constraints[0].message
      return
    }
    detail.value = data
    // Deep links outside the loaded range still open their panel.
    if (!selectedEvent.value) selectedEvent.value = data
  } catch (error) {
    if (request === detailRequest) detailError.value = errorText(error)
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}
watch(() => state.value.event, syncSelection)

const panelProps = computed(() => ({
  event: selectedEvent.value,
  detail: detail.value,
  loading: detailLoading.value,
  error: detailError.value,
  timeZone: timeZone.value,
  locale,
  hour12,
  busy: busy.value,
  constraints: panelConstraints.value.length
    ? panelConstraints.value
    : moveGuard.value && eventKey(moveGuard.value.event) === state.value.event
      ? moveGuard.value.constraints
      : [],
}))
const panelHandlers = {
  close: closePanel,
  reschedule: () => openEdit(selectedEvent.value, { focusTimes: true }),
  edit: () => openEdit(selectedEvent.value),
  status: (action) => changeStatus(selectedEvent.value, action),
  'request-change': () => openPropose(selectedEvent.value),
  'guard-action': (id) =>
    moveGuard.value ? guardAction(id) : panelGuardAction(id),
  'dismiss-guard': () => {
    panelConstraints.value = []
    moveGuard.value = null
  },
  'open-turnos': openTurnos,
  reload: syncSelection,
}

// --- moving ---------------------------------------------------------------------------
function patchLocal(event, times) {
  events.value = events.value.map((row) =>
    eventKey(row) === eventKey(event) ? { ...row, ...times } : row,
  )
}
const moveHint = computed(() =>
  moveGuard.value
    ? __('«{0}» to {1}', [
        moveGuard.value.event.title,
        formatWhen(moveGuard.value.times.start, timeZone.value, locale, hour12),
      ])
    : '',
)
async function doMove(
  event,
  times,
  { scope = 'single', confirm = 0, undo = false } = {},
) {
  const previous = { start: event.start, end: event.end }
  patchLocal(event, times)
  busy.value = true
  try {
    const result = await moveEvent(event, times, { scope, confirm })
    if (result?.constraints) {
      patchLocal(event, previous)
      moveGuard.value = { event, times, scope, constraints: result.constraints }
      return
    }
    moveGuard.value = null
    await load()
    if (
      state.value.event === eventKey(event) &&
      eventKey(result) !== eventKey(event)
    )
      setState({ event: eventKey(result) })
    if (!undo)
      toast.success(
        __('Moved to {0}', [
          formatWhen(result.start, timeZone.value, locale, hour12),
        ]),
        {
          action: {
            label: __('Undo'),
            onClick: () =>
              doMove({ ...result, source: event.source }, previous, {
                scope,
                confirm: 1,
                undo: true,
              }),
          },
          duration: 8000,
        },
      )
  } catch (error) {
    patchLocal(event, previous)
    moveGuard.value = {
      event,
      times,
      scope,
      constraints: [
        { code: 'unavailable', message: errorText(error), severity: 'block' },
      ],
    }
  } finally {
    busy.value = false
  }
}
useAgendaDrag(calendarRoot, {
  find: (id, source) =>
    events.value.find(
      (event) => event.id === id && (!source || event.source === source),
    ),
  options: () => ({
    timeZone: timeZone.value,
    slotMinutes: SLOT_MINUTES,
    startHour: hours.value.start,
    endHour: hours.value.end,
    date: state.value.date,
  }),
  onDrop: (event, times) => doMove(event, times),
})

async function guardAction(id) {
  const guard = moveGuard.value
  if (!guard) return
  if (id === 'confirm')
    return doMove(guard.event, guard.times, { scope: guard.scope, confirm: 1 })
  if (id === 'move_series')
    return doMove(guard.event, guard.times, { scope: 'series' })
  if (id === 'retry') {
    await load()
    const fresh = events.value.find(
      (event) => eventKey(event) === eventKey(guard.event),
    )
    if (!fresh) {
      moveGuard.value = null
      return toast.error(__('This event is no longer in the agenda.'))
    }
    return doMove(fresh, guard.times, { scope: guard.scope })
  }
  moveGuard.value = null
  if (id === 'pick_time' || id === 'edit')
    return openEdit(guard.event, { times: guard.times })
  if (id === 'request_change') return openPropose(guard.event, guard.times)
  if (id === 'open') return select(guard.event)
  return commonAction(id, guard.event)
}
function panelGuardAction(id) {
  panelConstraints.value = []
  if (id === 'retry' || id === 'refresh') return load()
  if (id === 'request_change') return openPropose(selectedEvent.value)
  if (id === 'edit' || id === 'pick_time') return openEdit(selectedEvent.value)
  return commonAction(id, selectedEvent.value)
}
// A month too full to draw steps down to its week; a week to its day.
const shorterView = () => setView(state.value.view === 'month' ? 'week' : 'day')
function problemAction(id) {
  if (id === 'shorter_range') return shorterView()
  return load()
}
function commonAction(id, event) {
  if (id === 'open_native' && event) {
    const name = (event.seriesId || event.id).split('@')[0]
    return window.open(
      `/app/event/${encodeURIComponent(name)}`,
      '_blank',
      'noopener',
    )
  }
  if (id === 'open_turnos') return openTurnos()
  if (id === 'request_access') return copyAccessRequest()
  if (id === 'shorter_range') return shorterView()
  return load()
}
function openTurnos() {
  window.location.assign('/app/asistencia?v=turnos')
}
async function copyAccessRequest() {
  const text = __(
    'I need access to the Agenda (Event read and create) to schedule my work. Please review my permissions.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

// --- status ---------------------------------------------------------------------------
async function changeStatus(event, action) {
  busy.value = true
  try {
    const result = await setStatus(event, action)
    if (result?.constraints) {
      panelConstraints.value = result.constraints
      return
    }
    panelConstraints.value = []
    if (action === 'cancel') closePanel()
    await load()
    const messages = {
      complete: __('Marked as done'),
      cancel: __('Event cancelled'),
      reopen: __('Event reopened'),
    }
    toast.success(messages[action], {
      ...(action !== 'reopen'
        ? {
            action: {
              label: __('Undo'),
              onClick: () =>
                changeStatus({ ...result, source: event.source }, 'reopen'),
            },
          }
        : {}),
      duration: 8000,
    })
  } catch (error) {
    panelConstraints.value = [
      { code: 'unavailable', message: errorText(error), severity: 'block' },
    ]
  } finally {
    busy.value = false
  }
}

// --- create / edit / propose ----------------------------------------------------------
let formKey = 0
function nextHalfHour() {
  const ms = 30 * 60 * 1000
  return new Date(Math.ceil(Date.now() / ms) * ms).toISOString()
}
function openForm(mode, initial, event = null) {
  form.value = reactive({
    key: ++formKey,
    mode,
    initial,
    event,
    constraints: [],
    requestId: requestId(),
    confirmDiscard: false,
    lastPayload: null,
    loadError: '',
    times: null,
  })
}
function openCreate(extra = {}) {
  const start = extra.start || nextHalfHour()
  const end =
    extra.end || new Date(Date.parse(start) + 3600 * 1000).toISOString()
  openForm('create', {
    title: '',
    attendees: [],
    reminders: [{ type: 'Notification', before: 10, interval: 'minutes' }],
    ...extra,
    start,
    end,
  })
}
function openCreateSlot(slot) {
  if (!canCreate.value) return
  // A single tapped slot becomes a one-hour event; a dragged range keeps its length.
  const span = Date.parse(slot.end) - Date.parse(slot.start)
  const end =
    span <= SLOT_MINUTES * 60 * 1000
      ? new Date(Date.parse(slot.start) + 3600 * 1000).toISOString()
      : slot.end
  openCreate({ start: slot.start, end })
}
function openCreateOn(date) {
  const start =
    date === todayDate.value
      ? nextHalfHour()
      : wallToInstant(date, '09:00', timeZone.value)
  openCreate({ start })
}
// Editing starts from the full detail of this exact event: a calendar row lacks notes,
// people, reminders, link and visibility, and saving from it would erase them.
function openEdit(event, { times } = {}) {
  if (!event) return
  openForm('edit', null, event)
  form.value.times = times || null
  loadEditForm(form.value)
}
async function loadEditForm(current) {
  current.loadError = ''
  const event = current.event
  let base =
    detail.value && eventKey(detail.value) === eventKey(event)
      ? detail.value
      : null
  if (!base) {
    try {
      const data = await eventDetail(event.source, event.id)
      if (data?.constraints) throw new Error(data.constraints[0].message)
      if (eventKey({ ...data, source: event.source }) !== eventKey(event))
        throw new Error(__('This event changed. Refresh the agenda.'))
      base = data
    } catch (error) {
      if (form.value === current) current.loadError = errorText(error)
      return
    }
  }
  if (form.value !== current) return
  const times = current.times
  // The version the form saves against is the one its values were read at.
  current.event = { ...event, version: base.version || event.version }
  current.initial = {
    title: base.title,
    start: times?.start || event.start,
    end: times?.end || event.end,
    allDay: base.allDay,
    location: base.location || '',
    description: base.description || '',
    attendees: base.attendees || [],
    reminders: base.reminders || [],
    reference: base.reference || null,
    repeat: base.repeat?.on || '',
    repeatTill: base.repeat?.till || '',
    repeatDays: base.repeat?.days || [],
    visibility: base.visibility || 'private',
  }
}
function openPropose(event, times) {
  if (!event) return
  openForm(
    'propose',
    {
      title: event.title,
      start: times?.start || event.start,
      end: times?.end || event.end,
    },
    event,
  )
}
const formTitle = computed(() =>
  form.value?.mode === 'edit'
    ? __('Edit event')
    : form.value?.mode === 'propose'
      ? __('Propose another time')
      : __('New event'),
)
const formSlot = computed(() => (phone.value ? 'default' : 'body-content'))
const formContainerProps = computed(() =>
  phone.value
    ? { open: true, dismissible: false, title: '' }
    : { open: true, title: formTitle.value, size: 'xl', dismissible: false },
)
function closeForm(dirty) {
  if (dirty && form.value) form.value.confirmDiscard = true
  else form.value = null
}

async function saveForm(payload, confirm = 0) {
  const current = form.value
  if (!current) return
  current.lastPayload = payload
  busy.value = true
  try {
    let result
    if (current.mode === 'propose') {
      result = await requestChange(current.event, payload, payload.note)
      if (result?.constraints) return (current.constraints = result.constraints)
      form.value = null
      toast.success(result.message)
      return
    }
    result =
      current.mode === 'edit'
        ? await updateEvent(current.event, payload, confirm)
        : await createEvent('Event', {
            ...payload,
            requestId: current.requestId,
            confirm,
          })
    if (result?.constraints) {
      current.constraints = result.constraints
      return
    }
    form.value = null
    await load()
    const done = `Event:${(result.seriesId || result.id).split('@')[0]}`
    if (current.mode === 'create' && returnTo.value) {
      const url = new URL(returnTo.value, window.location.origin)
      url.searchParams.set('done', done)
      const target = `${url.pathname}${url.search}${url.hash}`
      if (target.startsWith('/crm/')) router.push(target.slice(4))
      else window.location.assign(target)
      return
    }
    setState({ event: eventKey(result) })
    toast.success(
      current.mode === 'edit' ? __('Changes saved') : __('Event saved'),
    )
  } catch (error) {
    current.constraints = [
      { code: 'unavailable', message: errorText(error), severity: 'block' },
    ]
  } finally {
    busy.value = false
  }
}
async function formGuardAction(id) {
  const current = form.value
  if (!current) return
  if (id === 'confirm') return saveForm(current.lastPayload, 1)
  if (id === 'pick_time') return (current.constraints = [])
  if (id === 'retry' && current.mode === 'edit') {
    await load()
    const fresh = events.value.find(
      (event) => eventKey(event) === eventKey(current.event),
    )
    if (fresh) current.event = fresh
    current.constraints = []
    return saveForm(current.lastPayload)
  }
  if (id === 'retry') return saveForm(current.lastPayload)
  if (id === 'request_change') {
    const event = current.event
    const times = current.lastPayload
    form.value = null
    return openPropose(event, times)
  }
  return commonAction(id, current.event)
}

// Record context: ?create=1&ref_doctype=&ref_name=&ref_label=&attendee_doctype=&attendee_name=&attendee_label=&title=
function openFromQuery() {
  const query = route.query
  if (query.create !== '1' || !canCreate.value) return
  const reference =
    typeof query.ref_doctype === 'string' && typeof query.ref_name === 'string'
      ? {
          doctype: query.ref_doctype,
          name: query.ref_name,
          label: String(query.ref_label || query.ref_name).slice(0, 140),
        }
      : null
  const attendees =
    ['Contact', 'User'].includes(query.attendee_doctype) &&
    typeof query.attendee_name === 'string'
      ? [
          {
            doctype: query.attendee_doctype,
            name: query.attendee_name,
            label: String(query.attendee_label || query.attendee_name).slice(
              0,
              140,
            ),
          },
        ]
      : []
  openCreate({
    title: typeof query.title === 'string' ? query.title.slice(0, 140) : '',
    reference,
    attendees,
  })
  const rest = { ...query }
  for (const key of [
    'create',
    'ref_doctype',
    'ref_name',
    'ref_label',
    'attendee_doctype',
    'attendee_name',
    'attendee_label',
    'title',
  ])
    delete rest[key]
  router.replace({ query: rest })
}

// --- keyboard (shell §3.3): never while typing ------------------------------------------
// The Alt+H sheet lists these under «En esta página»; keep it in step with onKey.
registerPageShortcuts(null, () =>
  agendaShortcuts({ canCreate: canCreate.value }),
)
function onKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey || form.value) return
  const target = event.target
  if (target?.closest?.('input, textarea, select, [contenteditable="true"]'))
    return
  const actions = {
    c: () => canCreate.value && openCreate(),
    t: () => setDate(todayDate.value),
    d: () => setView('day'),
    w: () => setView('week'),
    m: () => setView('month'),
    l: () => setView('list'),
    j: () => go(1),
    k: () => go(-1),
    ArrowRight: () => go(1),
    ArrowLeft: () => go(-1),
    Escape: () => state.value.event && closePanel(),
  }
  const action = actions[event.key]
  if (action) {
    event.preventDefault()
    action()
  }
}

let clock
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  clock = setInterval(() => (now.value = Date.now()), 60 * 1000)
  document.title = `${__('Agenda')} · Muelle`
  // The view is always in the URL, so a shared or reloaded link opens the same view.
  if (!route.query.view) setState({})
  await boot()
  openFromQuery()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(clock)
})
</script>
<style scoped>
/* The shared calendar takes frappe-ui tokens so it follows the theme and palette. */
.agenda-cal :deep(.mc-calendar) {
  --mc-accent: var(--text-ink-blue-3);
  --mc-surface: var(--surface-white);
  --mc-panel: var(--surface-gray-1);
  --mc-border: var(--outline-gray-2);
  --mc-muted: var(--text-ink-gray-6);
  --mc-text: var(--text-ink-gray-9);
  --mc-event-surface: var(--surface-blue-1);
  --mc-event-border: var(--outline-blue-1);
  --mc-event-text: var(--text-ink-gray-9);
  --mc-hover: var(--surface-gray-2);
}
.agenda-cal :deep(.agenda-dragging) {
  opacity: 0.5;
  cursor: grabbing;
}
.agenda-cal :deep(.agenda-drop-target) {
  background: var(--surface-blue-2);
  outline: 2px solid var(--outline-blue-1);
}
@media (pointer: fine) {
  .agenda-cal :deep(.mc-calendar [data-event-id]) {
    cursor: grab;
  }
}
</style>
