<template>
  <div class="agenda-app" :class="{ 'is-phone': phone }">
    <!-- top bar: ☰ · Agenda · Today ‹ › · title ……… settings · view -->
    <header v-if="!phone" class="ag-top">
      <button
        type="button"
        class="ag-iconbtn"
        :aria-label="__('Main menu')"
        :aria-expanded="phone ? drawer : prefs.sidebar"
        @click="phone ? (drawer = true) : (prefs.sidebar = !prefs.sidebar)"
      >
        <span class="lucide-menu h-5 w-5" aria-hidden="true" />
      </button>
      <component
        :is="returnRoute ? RouterLink : 'a'"
        v-if="returnTo"
        v-bind="returnRoute ? { to: returnRoute } : { href: returnTo }"
        class="ag-back"
        ><span class="lucide-arrow-left h-4 w-4" aria-hidden="true" /><span
          class="truncate"
          >{{ __('Back to {0}', [returnLabel]) }}</span
        ></component
      >
      <span v-else-if="!phone" class="ag-brand">
        <span class="ag-brand__icon" aria-hidden="true">{{
          Number(todayDate.slice(8))
        }}</span>
        {{ __('Agenda') }}
      </span>
      <button
        type="button"
        class="ag-today"
        :title="todayLong"
        @click="setDate(todayDate)"
      >
        {{ __('Today') }}
      </button>
      <div class="flex items-center">
        <button
          type="button"
          class="ag-iconbtn"
          :aria-label="__('Previous')"
          @click="go(-1)"
        >
          <span class="lucide-chevron-left h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="ag-iconbtn"
          :aria-label="__('Next')"
          @click="go(1)"
        >
          <span class="lucide-chevron-right h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <h1 class="ag-title">{{ rangeTitle }}</h1>
      <span
        v-if="loading && !showSkeleton"
        class="ag-spinner"
        role="status"
        :aria-label="__('Loading')"
      />
      <AgendaSearch
        class="ml-auto"
        :locale="locale"
        :fallback-color="calendarColors.Event"
        @pick="openFound"
      />
      <button
        type="button"
        class="ag-iconbtn"
        :aria-label="__('Agenda settings')"
        :title="__('Agenda settings')"
        @click="openSettings('general')"
      >
        <span class="lucide-settings h-5 w-5" aria-hidden="true" />
      </button>
      <div v-if="!phone" class="relative">
        <button
          type="button"
          class="ag-viewbtn"
          :aria-expanded="viewMenu"
          aria-haspopup="menu"
          @click="viewMenu = !viewMenu"
        >
          {{ currentViewLabel }}
          <span class="lucide-chevron-down h-4 w-4" aria-hidden="true" />
        </button>
        <div v-if="viewMenu" class="ag-viewmenu" role="menu">
          <button
            v-for="entry in viewEntries"
            :key="entry.value"
            type="button"
            role="menuitemradio"
            :aria-checked="state.view === entry.value"
            class="ag-viewmenu__item"
            @click="(viewMenu = false), setView(entry.value)"
          >
            <span>{{ entry.label }}</span>
            <kbd>{{ entry.key.toUpperCase() }}</kbd>
          </button>
          <hr class="my-1 border-outline-gray-1" />
          <button
            type="button"
            role="menuitemcheckbox"
            :aria-checked="prefs.showWeekends"
            class="ag-viewmenu__item"
            @click="prefs.showWeekends = !prefs.showWeekends"
          >
            <span class="flex items-center gap-2"
              ><span
                :class="prefs.showWeekends ? 'lucide-check' : ''"
                class="inline-block h-4 w-4"
                aria-hidden="true"
              />{{ __('Show weekends') }}</span
            >
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            :aria-checked="prefs.showDone"
            class="ag-viewmenu__item"
            @click="prefs.showDone = !prefs.showDone"
          >
            <span class="flex items-center gap-2"
              ><span
                :class="prefs.showDone ? 'lucide-check' : ''"
                class="inline-block h-4 w-4"
                aria-hidden="true"
              />{{ __('Show finished') }}</span
            >
          </button>
        </div>
      </div>
    </header>
    <!-- phone app bar: ☰ · month ▾ ……… search · today -->
    <header v-else class="ag-ptop">
      <component
        :is="returnRoute ? RouterLink : 'a'"
        v-if="returnTo"
        v-bind="returnRoute ? { to: returnRoute } : { href: returnTo }"
        class="ag-iconbtn"
        :aria-label="__('Back to {0}', [returnLabel])"
        ><span class="lucide-arrow-left h-5 w-5" aria-hidden="true"
      /></component>
      <button
        v-else
        type="button"
        class="ag-iconbtn"
        :aria-label="__('Main menu')"
        :aria-expanded="drawer"
        @click="drawer = true"
      >
        <span class="lucide-menu h-6 w-6" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="ag-ptitle"
        :aria-expanded="picker"
        :aria-label="__('Choose a date')"
        @click="picker = !picker"
      >
        <span class="truncate">{{ phoneTitle }}</span>
        <span
          class="lucide-chevron-down ag-ptitle__caret h-5 w-5"
          :class="{ 'is-open': picker }"
          aria-hidden="true"
        />
      </button>
      <span
        v-if="loading && !showSkeleton"
        class="ag-spinner"
        role="status"
        :aria-label="__('Loading')"
      />
      <AgendaSearch
        class="ml-auto"
        :locale="locale"
        :fallback-color="calendarColors.Event"
        @pick="openFound"
      />
      <button
        type="button"
        class="ag-todaybtn"
        :aria-label="__('Today')"
        :title="todayLong"
        @click="goToday"
      >
        <span class="lucide-calendar h-6 w-6" aria-hidden="true" />
        <span class="ag-todaybtn__num">{{ Number(todayDate.slice(8)) }}</span>
      </button>
    </header>
    <Transition name="ag-drop">
      <div v-if="phone && picker" class="ag-picker" data-no-swipe>
        <AgendaMonthStrip
          v-if="state.view === 'month'"
          :selected="state.date"
          :today="todayDate"
          :locale="locale"
          @pick="pickMonth"
        />
        <AgendaMiniMonth
          v-else
          class="ag-picker__mini"
          :selected="state.date"
          :today="todayDate"
          :range="sidebarProps.range"
          :busy-dates="busyDates"
          :week-starts-on="firstWeekday"
          :locale="locale"
          @pick="pickDate"
        />
      </div>
    </Transition>

    <div class="ag-main">
      <aside v-if="!phone && prefs.sidebar" class="ag-sidebar">
        <AgendaSidebar v-bind="sidebarProps" v-on="sidebarHandlers" />
      </aside>

      <section class="ag-view" :aria-busy="loading">
        <div v-if="notices" class="ag-notices">
          <p v-if="zoneNote" class="text-sm text-ink-gray-6">{{ zoneNote }}</p>
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
            :hint="__('Calendar: {0}', [calendarLabel(problem.source)])"
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
            <button type="button" class="min-h-11 underline" @click="load()">
              {{ __('Try again') }}
            </button>
          </p>
        </div>

        <div ref="calendarRoot" class="ag-canvas" :class="`is-${state.view}`">
          <div :key="state.view" class="ag-viewin">
            <div v-if="showSkeleton" class="space-y-3 p-4" aria-hidden="true">
              <div
                v-for="n in 6"
                :key="n"
                class="h-14 animate-pulse rounded-lg bg-surface-gray-1"
              />
            </div>
            <template v-else-if="timeZone">
              <AgendaTimeGrid
                v-if="gridView"
                :dates="gridDates"
                :events="visibleEvents"
                :color-of="colorOf"
                :time-zone="timeZone"
                :locale="locale"
                :hour12="hour12"
                :today="todayDate"
                :now="now"
                :hour-height="hourHeight"
                :scroll-hour="prefs.dayStartHour"
                :can-create="canCreate"
                :create-color="createColor"
                :default-duration="prefs.defaultDuration"
                :draft="draftShown"
                :selected-key="state.event"
                :dim-past="prefs.dimPast"
                @select="select"
                @create="startCreate"
                @move="(event, times) => doMove(event, times)"
                @resize="(event, times) => doMove(event, times)"
                @move-days="moveDays"
                @open-day="(date) => setState({ date, view: 'day' })"
              />
              <template v-else-if="state.view === 'month'">
                <AgendaMonthGrid
                  :date="state.date"
                  :events="visibleEvents"
                  :color-of="colorOf"
                  :time-zone="timeZone"
                  :locale="locale"
                  :hour12="hour12"
                  :today="todayDate"
                  :now="now"
                  :week-starts-on="firstWeekday"
                  :show-weekends="prefs.showWeekends"
                  :compact="phone"
                  :can-create="canCreate"
                  :create-color="createColor"
                  :draft="draftShown"
                  :selected-key="state.event"
                  :dim-past="prefs.dimPast"
                  @select="select"
                  @create="startCreate"
                  @create-day="createOnDay"
                  @move-days="moveDays"
                  @pick="setDate"
                  @open-day="(date) => setState({ date, view: 'day' })"
                />
              </template>
              <AgendaSchedule
                v-else-if="phone"
                :events="visibleEvents"
                :range="range"
                :time-zone="timeZone"
                :locale="locale"
                :hour12="hour12"
                :today="todayDate"
                :now="now"
                :selected="state.event"
                :can-create="canCreate"
                :color-of="colorOf"
                :week-starts-on="firstWeekday"
                :full="listDays >= LIST_MAX_DAYS"
                :dim-past="prefs.dimPast"
                @select="select"
                @create="(date) => createOnDay(date)"
                @open-day="(date) => setState({ date, view: 'day' })"
                @more="moreDays"
                @later="laterDays"
                @earlier="earlierDays"
              />
              <AgendaList
                v-else
                class="ag-schedule"
                :events="visibleEvents"
                :range="range"
                :time-zone="timeZone"
                :locale="locale"
                :hour12="hour12"
                :today="todayDate"
                :now="now"
                :selected="state.event"
                :can-create="canCreate"
                :color-of="colorOf"
                @select="select"
                @create="(date) => createOnDay(date)"
              />
            </template>
          </div>
        </div>
      </section>
    </div>

    <!-- phone: «+» (a small menu when tasks can be created too) -->
    <template v-if="canCreate && phone">
      <Transition name="ag-fade">
        <div v-if="fabOpen" class="ag-fabscrim" @click="fabOpen = false" />
      </Transition>
      <div class="ag-dial" :class="{ 'is-open': fabOpen }">
        <Transition name="ag-dial">
          <div v-if="fabOpen" class="ag-dial__items" role="menu">
            <button
              v-if="tasksEnabled"
              type="button"
              role="menuitem"
              class="ag-dial__item"
              @click="fabCreate('task')"
            >
              <span class="ag-dial__label">{{ __('Task') }}</span>
              <span class="ag-dial__icon">
                <span class="lucide-circle-check h-5 w-5" aria-hidden="true" />
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="ag-dial__item"
              @click="fabCreate('event')"
            >
              <span class="ag-dial__label">{{ __('Event') }}</span>
              <span class="ag-dial__icon">
                <span class="lucide-calendar-plus h-5 w-5" aria-hidden="true" />
              </span>
            </button>
          </div>
        </Transition>
        <button
          type="button"
          class="ag-fab"
          :class="{ 'is-open': fabOpen }"
          :aria-label="fabOpen ? __('Close') : __('New event')"
          :aria-expanded="tasksEnabled ? fabOpen : undefined"
          @click="fabPress"
        >
          <span class="lucide-plus h-7 w-7" aria-hidden="true" />
        </button>
      </div>
    </template>

    <!-- phone: the menu drawer (views, refresh, calendars, settings) -->
    <Teleport to="body">
      <Transition name="ag-drawer" :duration="240">
        <div
          v-if="phone && drawer"
          class="ag-drawer"
          @click.self="drawer = false"
        >
          <div
            ref="drawerPanel"
            class="ag-drawer__panel ag-vars"
            role="dialog"
            :aria-label="__('Agenda menu')"
            @touchstart.passive="drawerStart"
            @touchmove.passive="drawerMove"
            @touchend="drawerEnd"
            @touchcancel="drawerEnd"
          >
            <div class="ag-drawer__brand">
              <span class="ag-drawer__logo" aria-hidden="true">{{
                Number(todayDate.slice(8))
              }}</span>
              {{ __('Agenda') }}
            </div>
            <nav class="ag-drawer__views" :aria-label="__('View')">
              <button
                v-for="entry in phoneViews"
                :key="entry.value"
                type="button"
                class="ag-drawer__item"
                :aria-current="state.view === entry.value ? 'page' : undefined"
                @click="pickPhoneView(entry.value)"
              >
                <span :class="entry.icon" class="h-5 w-5" aria-hidden="true" />
                {{ entry.label }}
              </button>
            </nav>
            <hr class="ag-drawer__rule" />
            <button type="button" class="ag-drawer__item" @click="refresh">
              <span class="lucide-refresh-cw h-5 w-5" aria-hidden="true" />
              {{ __('Refresh') }}
            </button>
            <hr class="ag-drawer__rule" />
            <AgendaSidebar
              v-bind="sidebarProps"
              compact
              v-on="sidebarHandlers"
            />
            <hr class="ag-drawer__rule" />
            <button
              type="button"
              class="ag-drawer__item"
              @click="openSettings('general')"
            >
              <span class="lucide-settings h-5 w-5" aria-hidden="true" />
              {{ __('Agenda settings') }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- desktop: quick create beside the selection -->
    <AgendaPopover
      v-if="quick && !phone"
      :anchor="quick.rect"
      :width="448"
      :label="__('New event')"
      keep-open-on=".ag-tg__col, .ag-tg__alldayarea, .ag-month__week"
      @close="closeQuick"
    >
      <div class="ag-vars">
        <AgendaQuickCreate
          :key="quick.key"
          :draft="quick.draft"
          :time-zone="timeZone"
          :calendar-color="calendarColors.Event"
          :can-create-task="tasksEnabled"
          :context="quick.context"
          :busy="busy"
          :constraints="quick.constraints"
          @change="(draft) => (quick.draft = { ...quick.draft, ...draft })"
          @save="saveQuick"
          @more="quickMore"
          @close="closeQuick"
          @guard-action="quickGuardAction"
          @dismiss-guard="quick.constraints = []"
        />
      </div>
    </AgendaPopover>

    <!-- phone: quick create (a task) in a sheet -->
    <BottomSheet
      v-if="phone"
      :open="Boolean(quick)"
      :title="''"
      @update:open="(value) => !value && closeQuick()"
    >
      <div v-if="quick" class="ag-vars px-5 pb-6">
        <AgendaQuickCreate
          :key="quick.key"
          :draft="quick.draft"
          :time-zone="timeZone"
          :calendar-color="calendarColors.Event"
          :can-create-task="tasksEnabled"
          :context="quick.context"
          :busy="busy"
          :constraints="quick.constraints"
          @change="(draft) => (quick.draft = { ...quick.draft, ...draft })"
          @save="saveQuick"
          @more="quickMore"
          @close="closeQuick"
          @guard-action="quickGuardAction"
          @dismiss-guard="quick.constraints = []"
        />
      </div>
    </BottomSheet>

    <!-- event details: a card beside the chip (desktop), a sheet (phone) -->
    <AgendaPopover
      v-if="selectedEvent && !phone"
      :anchor="anchorRect"
      :width="448"
      :label="__('Event details')"
      keep-open-on=".ag-event, .ag-bar, .ag-month__item, .ag-schedule button, [role='dialog'], .toast, [data-sonner-toaster]"
      @close="closePanel"
    >
      <div class="ag-vars p-5 pt-3" :aria-label="__('Event details')">
        <AgendaEventPanel v-bind="panelProps" v-on="panelHandlers" />
      </div>
    </AgendaPopover>
    <BottomSheet
      v-if="phone"
      :open="Boolean(selectedEvent)"
      :title="''"
      @update:open="(value) => !value && closePanel()"
    >
      <div
        v-if="selectedEvent"
        class="ag-vars px-5 pb-6"
        :aria-label="__('Event details')"
      >
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
            :calendar-color="calendarColors.Event"
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

    <AgendaSettings
      v-if="settings"
      :calendars="calendars"
      :sync="sync"
      :initial="settings"
      :busy="syncBusy"
      :error="syncError"
      :locale="locale"
      @close="settings = ''"
      @toggle="toggleCalendar"
      @color="setColor"
      @reset="resetPrefs"
      @google="googleAction"
      @ics="icsAction"
    />
  </div>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { BottomSheet, Button, Dialog, toast } from 'frappe-ui'
import AgendaEventForm from '@/components/agenda/AgendaEventForm.vue'
import AgendaEventPanel from '@/components/agenda/AgendaEventPanel.vue'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import AgendaList from '@/components/agenda/AgendaList.vue'
import AgendaMiniMonth from '@/components/agenda/AgendaMiniMonth.vue'
import AgendaMonthGrid from '@/components/agenda/AgendaMonthGrid.vue'
import AgendaMonthStrip from '@/components/agenda/AgendaMonthStrip.vue'
import AgendaPopover from '@/components/agenda/AgendaPopover.vue'
import AgendaQuickCreate from '@/components/agenda/AgendaQuickCreate.vue'
import AgendaSchedule from '@/components/agenda/AgendaSchedule.vue'
import AgendaSearch from '@/components/agenda/AgendaSearch.vue'
import AgendaSettings from '@/components/agenda/AgendaSettings.vue'
import AgendaSidebar from '@/components/agenda/AgendaSidebar.vue'
import AgendaTimeGrid from '@/components/agenda/AgendaTimeGrid.vue'
import {
  defaultCalendarColor,
  eventColor,
} from '@/components/agenda/agendaColors'
import {
  eventDates,
  wallInstant,
  wallParts,
} from '@/components/agenda/agendaGrid'
import { useSwipeNav } from '@/components/agenda/agendaSwipe'
import { isMobile } from '@/composables/breakpoint'
import { DENSITIES, useAgendaPrefs } from '@/composables/useAgendaPrefs'
import { hoyLive } from '@/composables/useHoy'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import { shiftCalendarDate } from '@/vendor/muelle-calendar/core'
import {
  CITAS,
  GOOGLE_RETURN_KEY,
  LIST_DAYS,
  LIST_MAX_DAYS,
  MY_CALENDARS,
  PER_RESOURCE,
  TASKS,
  agendaLocale,
  calendarKey,
  calendarLabel,
  completeTask,
  connectGoogle,
  createEvent,
  createRangeCache,
  createTask,
  disconnectGoogle,
  errorText,
  eventDetail,
  eventKey,
  formatWhen,
  icsSubscription,
  loadCapabilities,
  moveEvent,
  moveToDateTimes,
  parseEventKey,
  parseState,
  queryTasks,
  querySources,
  rangeFor,
  readResourceCache,
  reopenTask,
  resourceCalendarKey,
  requestChange,
  requestId,
  rescheduleTask,
  safeReturn,
  setStatus,
  shareLink,
  sourcesFor,
  splitCalendarKey,
  stateQuery,
  step,
  syncGoogle,
  syncStatus,
  tasksAvailable,
  taskRoute,
  today,
  updateEvent,
  usesHour12,
  wallToInstant,
  weekStartsOn,
  writeResourceCache,
} from '@/composables/useAgenda'

const route = useRoute()
const router = useRouter()
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const phone = isMobile
const locale = agendaLocale()
const hour12 = usesHour12(locale)
const {
  prefs,
  loadRemote,
  setColor: setPrefColor,
  toggleHidden,
  setHidden,
  remember,
  reset,
} = useAgendaPrefs()
const firstWeekday = computed(() => prefs.weekStart ?? weekStartsOn())

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
const quick = ref(null)
const calendarRoot = ref(null)
const anchorRect = ref(null)
const drawer = ref(false)
const viewMenu = ref(false)
const settings = ref('')
const sync = ref(null)
const syncBusy = ref('')
const syncError = ref('')
const tasksEnabled = ref(false)
const cache = createRangeCache()
// Doctors and technicians per source (each one a calendar), remembered on this device.
const resources = ref(readResourceCache())
// Phone: the date dropdown under the title, the Create menu and how far the list reaches.
const picker = ref(false)
const fabOpen = ref(false)
const PHONE_LIST_DAYS = 14
const listDays = ref(phone.value ? PHONE_LIST_DAYS : LIST_DAYS)

const timeZone = computed(
  () =>
    caps.value?.sources?.find((row) => row.enabled)?.timeZone ||
    window.timezone?.system ||
    Intl.DateTimeFormat().resolvedOptions().timeZone,
)
const state = computed(() =>
  parseState(route.query, {
    phone: phone.value,
    timeZone: timeZone.value,
    defaultView: prefs.view,
  }),
)
const todayDate = computed(() => today(timeZone.value))
const range = computed(() =>
  rangeFor(state.value, timeZone.value, firstWeekday.value, listDays.value),
)
const gridView = computed(() =>
  ['day', '3day', '4day', 'week'].includes(state.value.view),
)
const isWeekend = (date) =>
  [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())
const gridDates = computed(() => {
  const dates = range.value.dates
  if (state.value.view !== 'week' || prefs.showWeekends) return dates
  const work = dates.filter((date) => !isWeekend(date))
  return work.length ? work : dates
})
const hourHeight = computed(
  () => DENSITIES[prefs.density] || DENSITIES.comfortable,
)
const viewEntries = computed(() => [
  { value: 'day', label: __('Day'), key: 'd' },
  { value: 'week', label: __('Week'), key: 'w' },
  { value: 'month', label: __('Month'), key: 'm' },
  { value: 'list', label: __('Schedule view'), key: 'a' },
  { value: '4day', label: __('4 days'), key: 'x' },
])
// The phone drawer's views, as a native calendar lists them.
const phoneViews = computed(() => [
  { value: 'list', label: __('Schedule view'), icon: 'lucide-rows-3' },
  { value: 'day', label: __('Day'), icon: 'lucide-square' },
  { value: '3day', label: __('3 days'), icon: 'lucide-columns-3' },
  { value: 'week', label: __('Week'), icon: 'lucide-columns-4' },
  { value: 'month', label: __('Month'), icon: 'lucide-layout-grid' },
])
const currentViewLabel = computed(
  () =>
    [...viewEntries.value, ...phoneViews.value].find(
      (entry) => entry.value === state.value.view,
    )?.label || '',
)

// --- calendars: sources + citas + tasks, with the worker's colors and visibility --------
const enabledSources = computed(
  () => caps.value?.sources?.filter((row) => row.enabled) || [],
)
const sessionUser = () =>
  decodeURIComponent(
    document.cookie
      .split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
const calendars = computed(() => {
  const rows = []
  const hidden = new Set(prefs.hidden)
  const linked = state.value.calendars
  const me = sessionUser()
  const shown = (key, parent) =>
    linked
      ? linked.includes(key) || Boolean(parent && linked.includes(parent))
      : !hidden.has(key) && !(parent && hidden.has(parent))
  const add = (key, extra = {}) => {
    const index = rows.length
    rows.push({
      key,
      label: extra.title || calendarLabel(key, extra.label),
      color: prefs.colors[key] || defaultCalendarColor(key, index),
      visible: shown(key, extra.parent),
      group: extra.group || (MY_CALENDARS.includes(key) ? 'mine' : 'other'),
      parent: extra.parent || '',
      blocked: Boolean(extra.blocked),
      reason: extra.reason || '',
      inactive: Boolean(extra.inactive),
      mine: Boolean(extra.mine),
    })
  }
  for (const source of caps.value?.sources || []) {
    if (PER_RESOURCE[source.key]) {
      // Role calendars (Clínica, Taller) only list for the people who work there.
      if (!source.enabled) continue
      const people = resources.value[source.key] || []
      if (!people.length) {
        add(source.key, { label: source.label, group: source.key })
        continue
      }
      for (const person of people)
        add(resourceCalendarKey(source.key, person.id), {
          title:
            person.id === '__unassigned__' ? __('Unassigned') : person.title,
          group: source.key,
          parent: source.key,
          inactive: person.active === false,
          mine: Boolean(me && person.id === me),
        })
      continue
    }
    if (!source.enabled && !source.reason) continue
    add(source.key, {
      label: source.label,
      blocked: !source.enabled,
      reason: source.reason,
    })
    if (source.key === 'Event' && source.enabled && prefs.seen.includes(CITAS))
      add(CITAS)
  }
  if (tasksEnabled.value) add(TASKS)
  return rows
})
const calendarColors = computed(() =>
  Object.fromEntries(calendars.value.map((row) => [row.key, row.color])),
)
const visibleCalendars = computed(() =>
  calendars.value
    .filter((row) => row.visible && !row.blocked)
    .map((row) => row.key),
)
const firstReason = computed(
  () => calendars.value.find((row) => row.blocked)?.reason || '',
)
const canCreate = computed(() =>
  Boolean(enabledSources.value.find((row) => row.key === 'Event')?.canCreate),
)
const createColor = computed(() => {
  const own = quick.value?.draft?.color
  if (own) return own
  return quick.value?.draft?.kind === 'task'
    ? calendarColors.value[TASKS] || '#3f51b5'
    : calendarColors.value.Event || '#039be5'
})
function colorOf(event) {
  const key = calendarKey(event)
  const color = calendarColors.value[key] || defaultCalendarColor(key)
  // A doctor's or technician's calendar color names the person: it wins over the
  // appointment type's color (an event's own color still wins).
  return PER_RESOURCE[event.source]
    ? eventColor({ color: event.color }, color)
    : eventColor(event, color)
}
const calendarName = (event) => {
  const key = calendarKey(event)
  return (
    calendars.value.find((row) => row.key === key)?.label || calendarLabel(key)
  )
}
const zoneNote = computed(() => {
  const own = caps.value?.user_time_zone
  return own && own !== timeZone.value
    ? __('Times in {0}, the business time zone.', [timeZone.value])
    : ''
})
const knownCalendars = computed(
  () => new Set(calendars.value.map((row) => row.key)),
)
const visibleEvents = computed(() => {
  const visible = new Set(visibleCalendars.value)
  return events.value.filter((event) => {
    const key = calendarKey(event)
    // Someone new on a doctor's/technician's source (not listed yet) shows with it.
    const shown =
      visible.has(key) ||
      (!knownCalendars.value.has(key) &&
        PER_RESOURCE[event.source] &&
        neededSources.value.includes(event.source))
    if (!shown) return false
    if (!prefs.showDone && event.status === 'Done') return false
    if (!prefs.showCancelled && event.status === 'Cancelled') return false
    return true
  })
})
const busyDates = computed(() => {
  const dates = new Set()
  for (const event of visibleEvents.value) {
    if (event.kind === 'task') dates.add(event.date)
    else {
      const span = eventDates(event, timeZone.value)
      for (
        let date = span.first;
        date <= span.last && dates.size < 400;
        date = shiftCalendarDate(date, 1)
      )
        dates.add(date)
    }
  }
  return [...dates]
})
const notices = computed(
  () =>
    zoneNote.value ||
    capsError.value ||
    (caps.value && !caps.value.enabled) ||
    problems.value.length ||
    (moveGuard.value && !panelOpen.value) ||
    slow.value,
)

// --- titles -------------------------------------------------------------------------------
const civil = (date, options) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const todayLong = computed(() =>
  civil(todayDate.value, { weekday: 'long', day: 'numeric', month: 'long' }),
)
const rangeTitle = computed(() => {
  const view = state.value.view
  if (view === 'day')
    return capital(
      civil(
        state.value.date,
        phone.value
          ? { weekday: 'short', day: 'numeric', month: 'short' }
          : { day: 'numeric', month: 'long', year: 'numeric' },
      ),
    )
  if (view === 'month')
    return capital(civil(state.value.date, { month: 'long', year: 'numeric' }))
  const dates = view === 'list' ? range.value.dates : gridDates.value
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.slice(0, 7) === last.slice(0, 7))
    return capital(
      civil(first, { month: phone.value ? 'short' : 'long', year: 'numeric' }),
    )
  if (first.slice(0, 4) === last.slice(0, 4))
    return capital(
      `${civil(first, { month: 'short' })} – ${civil(last, { month: 'short', year: 'numeric' })}`.replace(
        /\./g,
        '',
      ),
    )
  return capital(
    `${civil(first, { month: 'short', year: 'numeric' })} – ${civil(last, { month: 'short', year: 'numeric' })}`.replace(
      /\./g,
      '',
    ),
  )
})

// Phone: the month (and the year when it is not this one), as a native calendar titles it.
const phoneTitle = computed(() => {
  const date = gridView.value ? gridDates.value[0] : state.value.date
  const thisYear = date.slice(0, 4) === todayDate.value.slice(0, 4)
  return capital(
    civil(
      date,
      thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' },
    ),
  )
})

const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  String(route.query.return_label || __('previous screen')).slice(0, 40),
)
const returnRoute = computed(() =>
  returnTo.value.startsWith('/crm/') ? returnTo.value.slice(4) : '',
)

// --- URL state ------------------------------------------------------------------------
function setState(patch) {
  const next = { ...state.value, ...patch }
  router.replace({ query: stateQuery(next, route.query) })
}
function setView(view) {
  picker.value = false
  if (phone.value && view === 'list') listDays.value = PHONE_LIST_DAYS
  setState({ view })
}
// Phone paging: a swipe on the calendar (not the list) moves a range, following the finger.
const swipe = useSwipeNav(calendarRoot, {
  onNavigate: (direction) => setState({ date: step(state.value, direction) }),
  enabled: () =>
    phone.value &&
    state.value.view !== 'list' &&
    !form.value &&
    !selectedEvent.value &&
    !drawer.value,
})
function setDate(date) {
  const before = state.value.date
  setState({ date })
  if (phone.value && date !== before) swipe.enter(date > before ? 1 : -1)
}
function go(direction) {
  setState({ date: step(state.value, direction) })
  if (phone.value) swipe.enter(direction)
}
function goToday() {
  picker.value = false
  if (state.value.view === 'list')
    listDays.value = phone.value ? PHONE_LIST_DAYS : LIST_DAYS
  setDate(todayDate.value)
}
function pickMonth(month) {
  setDate(
    month === todayDate.value.slice(0, 7) ? todayDate.value : `${month}-01`,
  )
}
function pickDate(date) {
  picker.value = false
  setDate(date)
}
// A deep link's calendar filter becomes the worker's own choice once they change it.
function adoptLinkedFilter() {
  if (!state.value.calendars) return
  const changes = calendars.value.map((row) => [row.key, !row.visible])
  for (const row of calendars.value)
    if (row.parent) changes.push([row.parent, false])
  setHidden(changes)
  setState({ calendars: null })
}
function toggleCalendar(key) {
  adoptLinkedFilter()
  const row = calendars.value.find((entry) => entry.key === key)
  // Turning one person on while their whole group was off: just that person.
  if (row?.parent && prefs.hidden.includes(row.parent)) {
    const changes = [[row.parent, false]]
    for (const other of calendars.value)
      if (other.parent === row.parent)
        changes.push([other.key, other.key !== key])
    return setHidden(changes)
  }
  toggleHidden(key)
}
/** A group's box: everyone off when anyone shows, else everyone on. */
function toggleGroup(group) {
  adoptLinkedFilter()
  const rows = calendars.value.filter((row) => row.group === group)
  const anyShown = rows.some((row) => row.visible)
  const changes = rows.map((row) => [row.key, anyShown])
  changes.push([group, anyShown])
  setHidden(changes)
}
function onlyCalendar(key) {
  const changes = calendars.value.map((row) => [row.key, row.key !== key])
  const parent =
    splitCalendarKey(key).resource !== null ? splitCalendarKey(key).source : ''
  for (const row of calendars.value)
    if (row.parent) changes.push([row.parent, row.parent !== parent])
  setHidden(changes)
  if (state.value.calendars) setState({ calendars: null })
}
const setColor = (key, hex) => setPrefColor(key, hex)
function resetPrefs() {
  reset()
  toast.success(__('Agenda settings restored'))
}

// --- loading ------------------------------------------------------------------------------
async function boot() {
  capsError.value = ''
  copied.value = ''
  loadRemote()
  tasksAvailable().then((value) => (tasksEnabled.value = value))
  try {
    caps.value = await loadCapabilities()
  } catch (error) {
    capsError.value = errorText(error)
    return
  }
  await load()
  refreshSync()
}

const neededSources = computed(() =>
  sourcesFor(
    visibleCalendars.value,
    enabledSources.value.map((row) => row.key),
  ),
)
const wantTasks = computed(
  () => tasksEnabled.value && visibleCalendars.value.includes(TASKS),
)

async function fetchRange(target, { store = true } = {}) {
  const sources = neededSources.value
  const parts = await Promise.all(
    sources.map(async (source) => {
      const result = await querySources([source], target)
      if (store && !result.problems.length)
        cache.set(cache.key(source, target), result.events)
      return result
    }),
  )
  let tasks = []
  if (wantTasks.value) {
    try {
      tasks = await queryTasks(target, timeZone.value)
      if (store) cache.set(cache.key(TASKS, target), tasks)
    } catch {
      tasks = []
    }
  }
  learnResources(parts)
  return {
    events: [...parts.flatMap((part) => part.events), ...tasks],
    problems: parts.flatMap((part) => part.problems),
  }
}
// The people each per-resource source returned: they become (or stay) calendars.
function learnResources(parts) {
  let changed = false
  const next = { ...resources.value }
  for (const part of parts)
    for (const [source, rows] of Object.entries(part.resources || {})) {
      if (!PER_RESOURCE[source]) continue
      const clean = rows.slice(0, 100).map((row) => ({
        id: String(row.id),
        title: String(row.title || row.id),
        active: row.active !== false,
      }))
      if (JSON.stringify(clean) === JSON.stringify(next[source] || [])) continue
      next[source] = clean
      changed = true
    }
  if (!changed) return
  resources.value = next
  writeResourceCache(next)
}
function fromCache(target) {
  const keys = [...neededSources.value, ...(wantTasks.value ? [TASKS] : [])]
  const rows = []
  for (const key of keys) {
    const hit = cache.get(cache.key(key, target))
    if (!hit) return null
    rows.push(...hit.value)
  }
  return rows
}

let sequence = 0
let loadedKey = ''
const loadKey = computed(() =>
  [
    range.value.start,
    range.value.end,
    neededSources.value.join(','),
    wantTasks.value,
  ].join('|'),
)
async function load({ quiet = false } = {}) {
  if (!caps.value?.enabled) return
  loadedKey = loadKey.value
  const target = range.value
  const request = ++sequence
  const cached = fromCache(target)
  if (cached) {
    events.value = cached
    syncSelection()
  }
  loading.value = true
  slow.value = false
  const skeleton = setTimeout(() => {
    if (request === sequence && !cached && !quiet) showSkeleton.value = true
  }, 250)
  const lag = setTimeout(
    () => request === sequence && (slow.value = true),
    8000,
  )
  try {
    const result = await fetchRange(target)
    if (request !== sequence) return
    events.value = result.events
    problems.value = result.problems
    if (result.events.some((event) => calendarKey(event) === CITAS))
      remember(CITAS)
    syncSelection()
    prefetch()
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
// The next and previous ranges load in the background, so paging feels instant.
let prefetchTimer
function prefetch() {
  clearTimeout(prefetchTimer)
  prefetchTimer = setTimeout(() => {
    for (const direction of [1, -1]) {
      if (state.value.view === 'list' && phone.value && direction < 0) continue
      const target = rangeFor(
        { ...state.value, date: step(state.value, direction) },
        timeZone.value,
        firstWeekday.value,
        listDays.value,
      )
      if (!fromCache(target)) fetchRange(target).catch(() => {})
    }
  }, 400)
}
function invalidate() {
  cache.clear()
}
// Phone schedule: reaching the end loads two more weeks (up to six), then pages on.
function moreDays() {
  if (listDays.value >= LIST_MAX_DAYS) return
  listDays.value = Math.min(LIST_MAX_DAYS, listDays.value + PHONE_LIST_DAYS)
  load({ quiet: true })
}
function laterDays() {
  const date = shiftCalendarDate(state.value.date, listDays.value)
  listDays.value = PHONE_LIST_DAYS
  setState({ date })
  calendarRoot.value?.scrollTo?.({ top: 0 })
}
function earlierDays() {
  setState({ date: shiftCalendarDate(state.value.date, -LIST_DAYS) })
  calendarRoot.value?.scrollTo?.({ top: 0 })
}
async function refresh() {
  drawer.value = false
  invalidate()
  await load()
  toast.success(__('Agenda updated'))
}
// Phone «+»: straight to a new event, or a small menu when tasks can be created too.
function fabPress() {
  if (!tasksEnabled.value) return openCreate()
  fabOpen.value = !fabOpen.value
}
function fabCreate(kind) {
  fabOpen.value = false
  sidebarHandlers.create(kind)
}
// The phone drawer follows a leftward swipe and closes past a third of its width.
const drawerPanel = ref(null)
let drawerTouch = null
function drawerStart(event) {
  const point = event.touches[0]
  drawerTouch = { x: point.clientX, y: point.clientY, dx: 0, axis: '' }
}
function drawerMove(event) {
  if (!drawerTouch) return
  const point = event.touches[0]
  const dx = point.clientX - drawerTouch.x
  const dy = point.clientY - drawerTouch.y
  if (!drawerTouch.axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    drawerTouch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
  }
  if (drawerTouch.axis !== 'x') return
  drawerTouch.dx = Math.min(0, dx)
  if (drawerPanel.value) {
    drawerPanel.value.style.transition = 'none'
    drawerPanel.value.style.transform = `translateX(${drawerTouch.dx}px)`
  }
}
function drawerEnd() {
  const current = drawerTouch
  drawerTouch = null
  const panel = drawerPanel.value
  if (!current || !panel) return
  panel.style.transition = ''
  panel.style.transform = ''
  if (current.axis === 'x' && current.dx < -panel.clientWidth / 3)
    drawer.value = false
}
function pickPhoneView(view) {
  drawer.value = false
  setView(view)
}
// Range and calendar changes reload (once: boot's own load already covers its key).
watch(loadKey, (key) => caps.value && key !== loadedKey && load())
// Someone (or another tab) changed an event, a task or a shift: refresh quietly.
useLiveWatch(
  hoyLive(socket),
  [
    'Event',
    'ToDo',
    'CRM Task',
    'Shift Assignment',
    'Patient Appointment',
    'Repair Order',
  ],
  () => {
    invalidate()
    return load({ quiet: true })
  },
)

// --- selection and panel --------------------------------------------------------------
const selectedEvent = ref(null)
const panelOpen = computed(() => Boolean(selectedEvent.value))
function select(event, rect = null) {
  closeQuick()
  anchorRect.value = rect
  setState({ event: eventKey(event) })
}
function closePanel() {
  if (state.value.event) setState({ event: '' })
}
let detailRequest = 0
async function syncSelection() {
  const key = state.value.event
  if (!key) {
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
  color: selectedEvent.value ? colorOf(selectedEvent.value) : '',
  calendar: selectedEvent.value ? calendarName(selectedEvent.value) : '',
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
  'copy-link': copyLink,
  color: (hex) => recolor(selectedEvent.value, hex),
  'task-done': () => taskStatus(selectedEvent.value, 'complete'),
  'task-reopen': () => taskStatus(selectedEvent.value, 'reopen'),
  'open-task': () =>
    selectedEvent.value && router.push(taskRoute(selectedEvent.value)),
  'open-native': () => commonAction('open_native', selectedEvent.value),
}
// A search result: jump to its day and open its card.
function openFound(row) {
  const date = String(row.starts_on || '').slice(0, 10)
  const occurrence = row.repeat_this_event ? `@${date}` : ''
  anchorRect.value = null
  setState({
    ...(date ? { date } : {}),
    view: state.value.view === 'list' ? 'list' : state.value.view,
    event: `Event:${row.name}${occurrence}`,
  })
}
async function copyLink() {
  const link = shareLink(state.value, selectedEvent.value)
  try {
    await navigator.clipboard.writeText(link)
    toast.success(__('Link copied'))
  } catch {
    toast.info(link)
  }
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
    const result = event.allDay
      ? await updateEvent(
          event,
          { start: times.start, end: times.end, allDay: true },
          confirm,
        )
      : await moveEvent(event, times, { scope, confirm })
    if (result?.constraints) {
      patchLocal(event, previous)
      moveGuard.value = { event, times, scope, constraints: result.constraints }
      return
    }
    moveGuard.value = null
    invalidate()
    await load({ quiet: true })
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
async function moveDays(event, delta) {
  if (event.kind === 'task')
    return moveTask(event, shiftCalendarDate(event.date, delta))
  if (event.allDay) {
    const span = eventDates(event, timeZone.value)
    return doMove(event, {
      start: wallInstant(
        shiftCalendarDate(span.first, delta),
        0,
        timeZone.value,
      ),
      end: wallInstant(
        shiftCalendarDate(span.last, delta),
        1440,
        timeZone.value,
      ),
    })
  }
  const target = shiftCalendarDate(
    wallParts(event.start, timeZone.value).date,
    delta,
  )
  const times = moveToDateTimes(event, target, timeZone.value)
  if (times) return doMove(event, times)
}
async function moveTask(event, date, { undo = false } = {}) {
  const before = event.date
  busy.value = true
  try {
    await rescheduleTask(event, date)
    invalidate()
    await load({ quiet: true })
    if (!undo)
      toast.success(__('Task moved'), {
        action: {
          label: __('Undo'),
          onClick: () => {
            const fresh = events.value.find((row) => row.id === event.id)
            if (fresh) moveTask(fresh, before, { undo: true })
          },
        },
        duration: 8000,
      })
  } catch (error) {
    toast.error(errorText(error))
  } finally {
    busy.value = false
  }
}
async function taskStatus(event, action) {
  if (!event) return
  busy.value = true
  try {
    if (action === 'complete') await completeTask(event)
    else await reopenTask(event)
    invalidate()
    await load({ quiet: true })
    toast.success(
      action === 'complete' ? __('Marked as done') : __('Task reopened'),
    )
  } catch (error) {
    toast.error(errorText(error))
  } finally {
    busy.value = false
  }
}
async function recolor(event, hex) {
  if (!event || event.kind === 'task' || event.source !== 'Event') return
  busy.value = true
  try {
    const result = await updateEvent(event, { color: hex || '' })
    if (result?.constraints) {
      panelConstraints.value = result.constraints
      return
    }
    invalidate()
    await load({ quiet: true })
    if (eventKey(result) !== state.value.event)
      setState({ event: eventKey(result) })
    else syncSelection()
  } catch (error) {
    panelConstraints.value = [
      { code: 'unavailable', message: errorText(error), severity: 'block' },
    ]
  } finally {
    busy.value = false
  }
}

async function guardAction(id) {
  const guard = moveGuard.value
  if (!guard) return
  if (id === 'confirm')
    return doMove(guard.event, guard.times, { scope: guard.scope, confirm: 1 })
  if (id === 'move_series')
    return doMove(guard.event, guard.times, { scope: 'series' })
  if (id === 'retry') {
    invalidate()
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
    invalidate()
    await load({ quiet: true })
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

// --- quick create (desktop): the dragged range stays drawn while the card is open -------
let quickKey = 0
const draftShown = computed(() => quick.value?.draft || null)
function startCreate(slot) {
  if (!canCreate.value) return
  closePanel()
  if (phone.value)
    return openCreate({ start: slot.start, end: slot.end, allDay: slot.allDay })
  quick.value = reactive({
    key: ++quickKey,
    rect: slot.rect,
    draft: {
      start: slot.start,
      end: slot.end,
      allDay: slot.allDay,
      kind: 'event',
    },
    context: null,
    constraints: [],
    requestId: requestId(),
    last: null,
  })
}
function createOnDay(date, rect = null) {
  const start =
    date === todayDate.value
      ? nextHalfHour()
      : wallToInstant(date, '09:00', timeZone.value)
  const end = new Date(
    Date.parse(start) + prefs.defaultDuration * 60000,
  ).toISOString()
  startCreate({ start, end, allDay: false, rect })
}
function closeQuick() {
  quick.value = null
}
async function saveQuick(payload, confirm = 0) {
  const current = quick.value
  if (!current) return
  current.last = payload
  busy.value = true
  try {
    if (payload.kind === 'task') {
      await createTask({
        title: payload.title,
        date: payload.date,
        reference: current.context?.reference,
      })
      quick.value = null
      invalidate()
      await load({ quiet: true })
      toast.success(__('Task saved'))
      return
    }
    const result = await createEvent('Event', {
      title: payload.title,
      start: payload.start,
      end: payload.end,
      allDay: payload.allDay,
      location: payload.location,
      attendees: [],
      reminders: [{ type: 'Notification', before: 10, interval: 'minutes' }],
      ...(payload.color ? { color: payload.color } : {}),
      ...(sync.value?.google?.connected && !prefs.syncGoogle
        ? { syncGoogle: false }
        : {}),
      requestId: current.requestId,
      confirm,
    })
    if (result?.constraints) {
      current.constraints = result.constraints
      return
    }
    quick.value = null
    invalidate()
    await load({ quiet: true })
    toast.success(__('Event saved'), {
      action: { label: __('Open'), onClick: () => select(result) },
      duration: 6000,
    })
  } catch (error) {
    current.constraints = [
      { code: 'unavailable', message: errorText(error), severity: 'block' },
    ]
  } finally {
    busy.value = false
  }
}
function quickGuardAction(id) {
  const current = quick.value
  if (!current) return
  if (id === 'confirm') return saveQuick(current.last, 1)
  if (id === 'pick_time') return (current.constraints = [])
  if (id === 'retry') return saveQuick(current.last)
  return commonAction(id, null)
}
function quickMore(payload) {
  const current = quick.value
  quick.value = null
  openCreate({
    title: payload.title,
    start: payload.start,
    end: payload.end,
    allDay: payload.allDay,
    location: payload.location,
    color: payload.color,
    ...(current?.context || {}),
  })
}

// --- full form: create / edit / propose ----------------------------------------------
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
  closeQuick()
  const start = extra.start || nextHalfHour()
  const end =
    extra.end ||
    new Date(Date.parse(start) + prefs.defaultDuration * 60000).toISOString()
  openForm('create', {
    title: '',
    attendees: [],
    reminders: [{ type: 'Notification', before: 10, interval: 'minutes' }],
    ...extra,
    start,
    end,
  })
}
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
    color: base.color || '',
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
    const body = { ...payload }
    if (
      current.mode === 'create' &&
      sync.value?.google?.connected &&
      !prefs.syncGoogle
    )
      body.syncGoogle = false
    result =
      current.mode === 'edit'
        ? await updateEvent(current.event, body, confirm)
        : await createEvent('Event', {
            ...body,
            requestId: current.requestId,
            confirm,
          })
    if (result?.constraints) {
      current.constraints = result.constraints
      return
    }
    form.value = null
    invalidate()
    await load({ quiet: true })
    const done = `Event:${(result.seriesId || result.id).split('@')[0]}`
    if (current.mode === 'create' && returnTo.value) {
      const url = new URL(returnTo.value, window.location.origin)
      url.searchParams.set('done', done)
      const target = `${url.pathname}${url.search}${url.hash}`
      if (target.startsWith('/crm/')) router.push(target.slice(4))
      else window.location.assign(target)
      return
    }
    anchorRect.value = null
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
    invalidate()
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

// --- settings and sync --------------------------------------------------------------------
function openSettings(section) {
  drawer.value = false
  settings.value = section || 'general'
  if (section === 'sync') refreshSync()
}
async function refreshSync() {
  try {
    sync.value = await syncStatus()
  } catch {
    sync.value = {
      google: {
        available: false,
        reason: __('Sync is not available on this site yet.'),
      },
      ics: null,
    }
  }
}
async function googleAction(action) {
  syncBusy.value = action
  syncError.value = ''
  try {
    if (action === 'connect') {
      const result = await connectGoogle()
      if (result?.constraints) throw new Error(result.constraints[0].message)
      if (!result?.url) throw new Error(__('Google did not answer. Try again.'))
      localStorage.setItem(
        GOOGLE_RETURN_KEY,
        `/crm/agenda?${new URLSearchParams(stateQuery(state.value, {})).toString()}`,
      )
      window.location.assign(result.url)
      return
    }
    if (action === 'sync') {
      const result = await syncGoogle()
      if (result?.constraints) throw new Error(result.constraints[0].message)
      invalidate()
      await load({ quiet: true })
      toast.success(result?.message || __('Google Calendar synced'))
    }
    if (action === 'disconnect') {
      const result = await disconnectGoogle()
      toast.success(result?.message || __('Google Calendar disconnected'))
    }
    await refreshSync()
  } catch (error) {
    syncError.value = errorText(error)
    if (!settings.value) toast.error(syncError.value)
  } finally {
    syncBusy.value = ''
  }
}
async function icsAction(action) {
  syncBusy.value = action === 'rotate' ? 'rotate' : 'ics'
  syncError.value = ''
  try {
    const result = await icsSubscription(action === 'rotate' ? 1 : 0)
    sync.value = { ...(sync.value || {}), ics: result }
    if (action === 'rotate')
      toast.success(__('New link ready. The old one no longer works.'))
  } catch (error) {
    syncError.value = errorText(error)
  } finally {
    syncBusy.value = ''
  }
}
function googleReturn() {
  const outcome = route.query.google
  if (!['connected', 'error'].includes(outcome)) return
  const rest = { ...route.query }
  delete rest.google
  router.replace({ query: rest })
  if (outcome === 'error') {
    openSettings('sync')
    syncError.value = __(
      'Google did not grant access. Try connecting again and allow calendar access.',
    )
    return
  }
  toast.success(__('Google Calendar connected'))
  googleAction('sync')
}

const sidebarProps = computed(() => ({
  calendars: calendars.value,
  selected: state.value.date,
  today: todayDate.value,
  range: gridView.value
    ? gridDates.value
    : state.value.view === 'list'
      ? range.value.dates
      : null,
  busyDates: busyDates.value,
  weekStartsOn: firstWeekday.value,
  locale,
  canCreate: canCreate.value,
  canCreateTask: tasksEnabled.value,
  sync: sync.value,
}))
const sidebarHandlers = {
  create: (kind) => {
    drawer.value = false
    if (kind === 'task') {
      const date = state.value.date
      quick.value = reactive({
        key: ++quickKey,
        rect: null,
        draft: {
          start: wallInstant(date, 0, timeZone.value),
          end: wallInstant(date, 1440, timeZone.value),
          allDay: true,
          kind: 'task',
        },
        context: null,
        constraints: [],
        requestId: requestId(),
        last: null,
      })
      return
    }
    openCreate()
  },
  pick: (date) => {
    drawer.value = false
    setDate(date)
  },
  toggle: toggleCalendar,
  'toggle-group': toggleGroup,
  only: onlyCalendar,
  color: setColor,
  settings: openSettings,
}

// --- keyboard: never while typing ---------------------------------------------------------
function onKey(event) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    form.value ||
    settings.value
  )
    return
  const target = event.target
  if (target?.closest?.('input, textarea, select, [contenteditable="true"]'))
    return
  const actions = {
    c: () => canCreate.value && openCreate(),
    t: () => setDate(todayDate.value),
    d: () => setView('day'),
    w: () => setView('week'),
    m: () => setView('month'),
    a: () => setView('list'),
    l: () => setView('list'),
    x: () => setView('4day'),
    j: () => go(1),
    k: () => go(-1),
    n: () => go(1),
    p: () => go(-1),
    ArrowRight: () => go(1),
    ArrowLeft: () => go(-1),
    Escape: () =>
      fabOpen.value
        ? (fabOpen.value = false)
        : drawer.value
          ? (drawer.value = false)
          : picker.value
            ? (picker.value = false)
            : quick.value
              ? closeQuick()
              : state.value.event && closePanel(),
  }
  const action = actions[event.key]
  if (action) {
    event.preventDefault()
    action()
  }
}
function outsideViewMenu(event) {
  if (viewMenu.value && !event.target.closest?.('.ag-viewmenu, .ag-viewbtn'))
    viewMenu.value = false
}

let clock
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', outsideViewMenu, true)
  clock = setInterval(() => (now.value = Date.now()), 60 * 1000)
  document.title = `${__('Agenda')} · Muelle`
  // The view is always in the URL, so a shared or reloaded link opens the same view.
  if (!route.query.view) setState({})
  await boot()
  openFromQuery()
  googleReturn()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', outsideViewMenu, true)
  clearInterval(clock)
  clearTimeout(prefetchTimer)
})
</script>
<style>
.agenda-app,
.ag-vars {
  --ag-accent: #1a73e8;
  --ag-on-accent: #ffffff;
  --ag-accent-ink: #0b57d0;
  --ag-select-tint: rgba(26, 115, 232, 0.12);
  --ag-select-strong: #d3e3fd;
  --ag-today-tint: transparent;
}
[data-theme='dark'] .agenda-app,
[data-theme='dark'] .ag-vars {
  --ag-accent: #a8c7fa;
  --ag-on-accent: #062e6f;
  --ag-accent-ink: #d3e3fd;
  --ag-select-tint: rgba(168, 199, 250, 0.14);
  --ag-select-strong: #004a77;
}
</style>
<style scoped>
.agenda-app {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--surface-base);
  color: var(--ink-gray-9);
}
.ag-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 8px 16px 8px 8px;
  border-bottom: 1px solid var(--outline-gray-1);
}
.is-phone .ag-top {
  min-height: 56px;
  gap: 4px;
  padding: 4px 8px;
}
.ag-iconbtn {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-iconbtn:hover {
  background: var(--surface-gray-2);
}
.ag-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 28px;
  font-size: 22px;
  color: var(--ink-gray-8);
}
.ag-brand__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: var(--ag-accent);
  color: var(--ag-on-accent);
  font-size: 15px;
  font-weight: 600;
}
.ag-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  min-height: 40px;
  margin-right: 8px;
  font-size: 14px;
  color: var(--ink-gray-7);
}
.ag-today {
  flex: none;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--outline-gray-3);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-8);
}
.ag-today:hover {
  background: var(--surface-gray-2);
}
.ag-title {
  min-width: 0;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22px;
  font-weight: 400;
  color: var(--ink-gray-9);
}
.is-phone .ag-title {
  font-size: 18px;
  font-weight: 500;
}
.ag-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--outline-gray-2);
  border-top-color: var(--ag-accent);
  border-radius: 999px;
  animation: ag-spin 0.8s linear infinite;
}
@keyframes ag-spin {
  to {
    transform: rotate(360deg);
  }
}
.ag-viewbtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px 0 16px;
  border: 1px solid var(--outline-gray-3);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-8);
}
.ag-viewbtn:hover {
  background: var(--surface-gray-2);
}
.ag-viewmenu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 60;
  min-width: 220px;
  padding: 6px 0;
  border-radius: 10px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow:
    0 10px 30px -6px rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--outline-gray-1);
}
.ag-viewmenu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 0 16px;
  font-size: 14px;
  color: var(--ink-gray-8);
}
.ag-viewmenu__item:hover {
  background: var(--surface-gray-2);
}
.ag-viewmenu__item[aria-checked='true'][role='menuitemradio'] {
  background: var(--ag-select-tint);
  color: var(--ag-accent-ink);
  font-weight: 600;
}
.ag-viewmenu__item kbd {
  font-family: inherit;
  font-size: 12px;
  color: var(--ink-gray-5);
}
.ag-main {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
.ag-sidebar {
  flex: 0 0 256px;
  overflow-y: auto;
  padding-top: 8px;
}
.ag-view {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  margin: 0 12px 12px 0;
  border-radius: 16px;
  background: var(--surface-base);
  box-shadow: 0 0 0 1px var(--outline-gray-1);
  overflow: hidden;
  /* Grid layers (events, the now line, drags) stay under dialogs and menus. */
  isolation: isolate;
}
.is-phone .ag-view {
  margin: 0;
  border-radius: 0;
  box-shadow: none;
}
.ag-notices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px 0;
}
.ag-canvas {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.ag-canvas.is-list,
.ag-canvas.is-month {
  overflow-y: auto;
}
.ag-canvas.is-list {
  padding: 8px 24px 24px;
}
.is-phone .ag-canvas.is-list {
  padding: 4px 12px 96px;
}
/* --- phone: app bar, date dropdown, views, «+», drawer (a native calendar's layout) --- */
.ag-ptop {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 56px;
  padding: 4px 6px 4px 4px;
  padding-top: max(4px, env(safe-area-inset-top));
}
.is-phone .ag-iconbtn {
  width: 44px;
  height: 44px;
}
.ag-ptitle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 44px;
  padding: 0 8px 0 10px;
  border-radius: 999px;
  font-size: 22px;
  font-weight: 400;
  color: var(--ink-gray-9);
}
.ag-ptitle:active {
  background: var(--surface-gray-2);
}
.ag-ptitle__caret {
  flex: none;
  color: var(--ink-gray-7);
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ag-ptitle__caret.is-open {
  transform: rotate(180deg);
}
.ag-todaybtn {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-todaybtn:active {
  background: var(--surface-gray-2);
}
.ag-todaybtn__num {
  position: absolute;
  top: 17px;
  left: 0;
  right: 0;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  color: var(--ink-gray-8);
}
.ag-picker {
  overflow: hidden;
  border-bottom: 1px solid var(--outline-gray-1);
}
.ag-picker__mini {
  max-width: 360px;
  margin: 0 auto;
  padding: 0 12px 8px;
}
.ag-drop-enter-active,
.ag-drop-leave-active {
  transition:
    max-height 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s;
  max-height: 340px;
}
.ag-drop-enter-from,
.ag-drop-leave-to {
  max-height: 0;
  opacity: 0;
}
.ag-viewin {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  animation: ag-viewin 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes ag-viewin {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}
.is-phone .ag-canvas {
  will-change: transform;
}
.is-phone .ag-canvas.is-list {
  padding: 0;
}
.ag-dial {
  position: fixed;
  right: 16px;
  bottom: calc(4.5rem + env(safe-area-inset-bottom));
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}
.ag-dial__items {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
  padding-right: 4px;
}
.ag-dial__item {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ag-dial__label {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-9);
}
.ag-dial__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--surface-elevation-2, var(--surface-base));
  color: var(--ag-accent-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.ag-dial-enter-active,
.ag-dial-leave-active {
  transition:
    opacity 0.18s,
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ag-dial-enter-from,
.ag-dial-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.92);
}
.ag-fab {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--ag-select-strong);
  color: var(--ag-accent-ink);
  box-shadow:
    0 3px 6px rgba(0, 0, 0, 0.2),
    0 6px 16px -4px rgba(0, 0, 0, 0.3);
  transition:
    transform 0.15s,
    border-radius 0.2s;
}
.ag-fab:active {
  transform: scale(0.94);
}
.ag-fab .lucide-plus {
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ag-fab.is-open .lucide-plus {
  transform: rotate(45deg);
}
.ag-fabscrim {
  position: fixed;
  inset: 0;
  z-index: 39;
  background: rgba(0, 0, 0, 0.32);
}
.ag-fade-enter-active,
.ag-fade-leave-active {
  transition: opacity 0.2s;
}
.ag-fade-enter-from,
.ag-fade-leave-to {
  opacity: 0;
}
.ag-drawer {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.4);
}
.ag-drawer__panel {
  position: absolute;
  inset: 0 auto 0 0;
  width: min(320px, 86vw);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: max(12px, env(safe-area-inset-top)) 0
    calc(16px + env(safe-area-inset-bottom));
  border-radius: 0 16px 16px 0;
  background: var(--surface-base);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.3);
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ag-drawer-enter-active,
.ag-drawer-leave-active {
  transition: background-color 0.24s;
}
.ag-drawer-enter-from,
.ag-drawer-leave-to {
  background-color: rgba(0, 0, 0, 0);
}
.ag-drawer-enter-from .ag-drawer__panel,
.ag-drawer-leave-to .ag-drawer__panel {
  transform: translateX(-100%);
}
.ag-drawer__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px 12px;
  font-size: 22px;
  color: var(--ink-gray-9);
}
.ag-drawer__logo {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: var(--ag-accent);
  color: var(--ag-on-accent);
  font-size: 15px;
  font-weight: 600;
}
.ag-drawer__views {
  display: flex;
  flex-direction: column;
}
.ag-drawer__item {
  display: flex;
  align-items: center;
  gap: 20px;
  width: calc(100% - 12px);
  min-height: 52px;
  padding: 0 24px;
  border-radius: 0 999px 999px 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--ink-gray-8);
  text-align: left;
}
.ag-drawer__item:active {
  background: var(--surface-gray-2);
}
.ag-drawer__item[aria-current='page'] {
  background: var(--ag-select-strong);
  color: var(--ag-accent-ink);
}
.ag-drawer__rule {
  margin: 8px 0;
  border-color: var(--outline-gray-1);
}
@media (prefers-reduced-motion: reduce) {
  .ag-viewin,
  .ag-drawer__panel,
  .ag-drop-enter-active,
  .ag-drop-leave-active,
  .ag-dial-enter-active,
  .ag-dial-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
