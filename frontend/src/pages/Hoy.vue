<template>
  <div
    ref="scroller"
    class="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain"
  >
    <div
      v-if="pull || refreshing"
      class="flex items-end justify-center overflow-hidden text-ink-gray-6"
      :style="{ height: `${refreshing ? 48 : pull}px` }"
      aria-hidden="true"
    >
      <span
        class="lucide-refresh-cw mb-3 size-5"
        :class="refreshing ? 'animate-spin' : ''"
        :style="refreshing ? null : { transform: `rotate(${pull * 4}deg)` }"
      />
    </div>
    <div
      class="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <header class="flex items-start gap-3 pb-4">
        <div class="min-w-0 flex-1">
          <component
            :is="phone ? 'p' : 'h1'"
            class="text-xl font-semibold text-ink-gray-9 [text-wrap:balance] sm:text-2xl"
          >
            {{ hello }}
          </component>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            <span class="first-letter:uppercase">{{ dateLine }}</span>
            <template v-if="summary"> · {{ summary }}</template>
          </p>
        </div>
        <Button
          v-if="!phone"
          variant="subtle"
          :loading="refreshing"
          :label="__('Refresh')"
          @click="refresh()"
        >
          <template #prefix>
            <span class="lucide-refresh-cw size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>
      <!-- «Pregúntale a Muelle»: at most one suggestion, with its reason (SHELL-S2.3). -->
      <AssistantSuggestion v-if="data" screen="hoy" :data="data" class="mb-4" />

      <div
        v-if="problem && !data"
        role="alert"
        class="mb-4 space-y-3 rounded-xl bg-surface-red-1 p-4 text-ink-red-7"
      >
        <p>
          <strong>{{ __('We could not load your day.') }}</strong>
          {{ problem }}
        </p>
        <Button :label="__('Retry')" @click="refresh()" />
      </div>
      <p
        v-else-if="slow"
        role="status"
        class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-7"
      >
        {{ __('This is taking longer than usual.') }}
        <Button variant="ghost" :label="__('Retry')" @click="refresh()" />
      </p>

      <!-- Nothing overdue, due today or on the agenda: one line instead of two empty cards. -->
      <p
        v-if="allClear"
        role="status"
        class="mb-4 flex items-center gap-2 rounded-xl border border-outline-gray-2 bg-surface-base px-4 py-3 text-base text-ink-gray-8"
      >
        <span
          class="lucide-circle-check size-5 shrink-0 text-ink-green-8"
          aria-hidden="true"
        />
        {{ __('All clear: nothing overdue, due today or on your agenda.') }}
      </p>
      <div
        class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start"
      >
        <!-- 1 · Para ahora, and the seller's deals without a next step -->
        <div class="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <HoySection
            v-if="!allClear"
            id="ahora"
            :title="__('For now')"
            icon="lucide-square-check-big"
            :count="dueCount"
            :more="
              pendientes?.available
                ? { label: __('See all'), to: '/pendientes' }
                : null
            "
            :skeleton="skeleton"
            :collapsed="dueCollapsed"
            :failed="Boolean(pendientes?.failed)"
            @retry="refresh()"
          >
            <HoyTask
              v-for="row in tasks"
              :key="row.doctype + row.name"
              :row="row"
              :today="today"
              :busy="busy.has(row.doctype + row.name)"
              @complete="complete"
              @complete-next="openComplete"
              @reschedule="reschedule"
            />
            <RouterLink
              v-if="moreTasks"
              to="/pendientes"
              class="mx-4 mt-1 flex min-h-11 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:mx-5"
            >
              {{ __('More pendientes due — open Pendientes') }}
            </RouterLink>
          </HoySection>
          <!-- 2b · Tratos sin seguimiento (sellers only) -->
          <HoySection
            v-if="data?.seguimiento?.available || data?.seguimiento?.failed"
            id="seguimiento"
            :title="__('Deals without a next step')"
            icon="lucide-calendar-clock"
            :count="followUpCount"
            :more="
              followUpQueue ? { label: __('See all'), to: followUpQueue } : null
            "
            :collapsed="followUpCollapsed"
            :failed="Boolean(data?.seguimiento?.failed)"
            @retry="refresh()"
          >
            <ul :aria-label="__('Deals without a next step')">
              <li v-for="row in followUps" :key="row.name">
                <RouterLink
                  :to="row.to"
                  class="flex min-h-12 items-center gap-3 px-4 py-1.5 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-blue-link sm:px-5"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="block text-base text-ink-gray-9 [text-wrap:balance]"
                      >{{ row.title }}</span
                    >
                    <span
                      v-if="row.status"
                      class="line-clamp-2 block text-sm text-ink-gray-6"
                      >{{ __(row.status) }}</span
                    >
                  </span>
                  <span class="shrink-0 text-sm text-ink-gray-7">{{
                    __('Schedule')
                  }}</span>
                </RouterLink>
              </li>
            </ul>
          </HoySection>
          <!-- 2c · Seguimientos vencidos del equipo (managers only) -->
          <HoySection
            v-if="data?.equipo?.available || data?.equipo?.failed"
            id="equipo"
            :title="__('Team follow-ups overdue')"
            icon="lucide-alarm-clock"
            :count="teamCount"
            :more="
              data?.equipo?.available
                ? { label: __('See all'), to: teamQueue }
                : null
            "
            :collapsed="teamCollapsed"
            :failed="Boolean(data?.equipo?.failed)"
            @retry="refresh()"
          >
            <ul :aria-label="__('Team follow-ups overdue')">
              <li v-for="row in teamRows" :key="row.owner || '-'">
                <RouterLink
                  :to="row.to"
                  class="flex min-h-12 items-center gap-3 px-4 py-1.5 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-blue-link sm:px-5"
                >
                  <span
                    class="min-w-0 flex-1 text-base text-ink-gray-9 [text-wrap:balance]"
                    >{{ row.owner ? row.name : __('No owner') }}</span
                  >
                  <span
                    class="shrink-0 rounded-full bg-surface-red-1 px-2 py-0.5 text-sm font-medium text-ink-red-7"
                    >{{ row.count }}</span
                  >
                </RouterLink>
              </li>
            </ul>
          </HoySection>
        </div>

        <!-- 2 · Agenda de hoy -->
        <HoySection
          v-if="!allClear"
          id="agenda"
          class="lg:col-start-2 lg:row-span-4 lg:row-start-1"
          :class="agendaCollapsed ? 'max-lg:order-last' : ''"
          :title="__('Today’s agenda')"
          icon="lucide-calendar-days"
          :count="plan.total ? String(plan.total) : ''"
          :more="
            agenda?.available
              ? {
                  label: __('Open Agenda'),
                  to: eventLink(null, today, agenda?.sources),
                }
              : null
          "
          :skeleton="skeleton"
          :skeleton-rows="4"
          :collapsed="agendaCollapsed"
          :failed="Boolean(agenda?.failed)"
          @retry="refresh()"
        >
          <p
            v-if="plan.earlier"
            class="px-4 pb-1 text-sm text-ink-gray-6 sm:px-5"
          >
            {{
              plan.earlier === 1
                ? __('1 earlier today')
                : __('{0} earlier today', [plan.earlier])
            }}
          </p>
          <ul :aria-label="__('Today’s agenda')">
            <li v-for="event in plan.rows" :key="event.source + event.id">
              <RouterLink
                :to="eventLink(event, today, agenda?.sources)"
                data-key-row
                class="flex min-h-12 items-center gap-3 px-4 py-1.5 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-blue-link sm:px-5"
              >
                <span
                  class="w-20 shrink-0 whitespace-nowrap text-sm tabular-nums text-ink-gray-7"
                >
                  {{
                    event.allDay
                      ? __('All day')
                      : timeText(event.start, timeZone, locale)
                  }}
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-base text-ink-gray-9 [text-wrap:balance]"
                    >{{ event.title }}</span
                  >
                  <span
                    v-if="eventMeta(event)"
                    class="line-clamp-2 block text-sm text-ink-gray-6"
                    >{{ eventMeta(event) }}</span
                  >
                </span>
                <span
                  v-if="event.state === 'now' || event.state === 'next'"
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="
                    event.state === 'now'
                      ? 'bg-surface-green-1 text-ink-green-8'
                      : 'bg-surface-blue-1 text-ink-blue-9'
                  "
                  >{{ event.state === 'now' ? __('Now') : __('Next') }}</span
                >
              </RouterLink>
            </li>
          </ul>
          <p
            v-for="item in agenda?.problems || []"
            :key="item.source"
            role="status"
            class="px-4 py-1 text-sm text-ink-gray-6 sm:px-5"
          >
            {{ item.message }}
          </p>
        </HoySection>

        <!-- 3 · Continuar -->
        <HoySection
          id="continuar"
          class="lg:col-start-1 lg:row-start-2"
          :title="__('Continue')"
          icon="lucide-history"
          :skeleton="skeleton"
          :skeleton-rows="2"
          :collapsed="continuarCollapsed"
          :failed="Boolean(data?.continuar?.failed)"
          @retry="refresh()"
        >
          <div class="pb-1">
            <template v-for="card in cards" :key="card.key">
              <!-- A source with documents: one quiet group line, then one row per document. -->
              <div
                v-if="card.rows.length"
                class="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-1 pt-3 sm:px-5"
              >
                <p class="min-w-0 text-sm font-medium text-ink-gray-7">
                  {{ card.title }}
                  <span class="font-normal text-ink-gray-6"
                    >· {{ card.detail }}</span
                  >
                </p>
                <RouterLink
                  v-if="card.to && card.action"
                  :to="card.to"
                  :class="MORE_LINK"
                  >{{ card.action
                  }}<span
                    class="lucide-chevron-right ml-0.5 size-4"
                    aria-hidden="true"
                /></RouterLink>
                <a
                  v-else-if="card.href && card.action"
                  :href="card.href"
                  :class="MORE_LINK"
                  >{{ card.action
                  }}<span
                    class="lucide-chevron-right ml-0.5 size-4"
                    aria-hidden="true"
                /></a>
              </div>
              <ListRow
                v-for="row in card.rows"
                :key="card.key + row.key"
                :title="row.title"
                :subtitle="rowSubtitle(card, row)"
                :meta="rowReference(card, row)"
                :subtitle-lines="2"
                :icon="card.icon"
                :to="card.source?.action ? undefined : row.to"
                :href="card.source?.action ? '' : row.href"
              >
                <template v-if="card.source?.action" #trailing>
                  <Button
                    v-if="choicesFor(card, row)"
                    variant="subtle"
                    class="min-h-11"
                    :label="card.source.action.label"
                    :disabled="!choicesFor(card, row).length"
                    @click="openAssign(card, row)"
                  />
                  <Button
                    v-else
                    variant="subtle"
                    class="min-h-11"
                    :label="card.source.action.label"
                    :loading="busy.has(card.key + row.key)"
                    @click="sourceAction(card, row)"
                  />
                </template>
              </ListRow>
              <!-- A card without documents is itself the row: it opens its app. -->
              <ListRow
                v-if="!card.rows.length"
                :title="card.title"
                :subtitle="card.detail"
                :subtitle-lines="2"
                :icon="card.icon"
                :to="card.to"
                :href="card.to ? '' : card.href"
              />
            </template>
          </div>
          <!-- The technician (or other choice) picker for a source action: a sheet, not a select. -->
          <BottomSheet
            v-model:open="assignOpen"
            :title="assignment?.row?.title || ''"
            :subtitle="assignField"
            flush
          >
            <ul class="px-2 pb-3" :aria-label="assignField">
              <li v-for="choice in assignChoices" :key="choice.value">
                <button
                  type="button"
                  class="flex min-h-12 w-full items-center rounded-xl px-4 text-left text-base hover:bg-surface-gray-1"
                  @click="pickAssign(choice.value)"
                >
                  {{ choice.label || choice.value }}
                </button>
              </li>
            </ul>
            <p
              v-if="!assignChoices.length"
              class="px-4 pb-4 text-sm text-ink-gray-6"
            >
              {{ __('No one to assign yet.') }}
            </p>
          </BottomSheet>
        </HoySection>

        <!-- 4 · Avisos que piden acción -->
        <HoySection
          id="avisos"
          class="lg:col-start-1 lg:row-start-3"
          :title="__('Avisos that need you')"
          icon="lucide-bell"
          :count="avisos?.total ? String(avisos.total) : ''"
          :more="
            avisos?.available ? { label: __('See all'), to: '/avisos' } : null
          "
          :skeleton="skeleton"
          :skeleton-rows="2"
          :collapsed="avisosCollapsed"
          :failed="Boolean(avisos?.failed)"
          @retry="refresh()"
        >
          <AvisosList
            :groups="avisos?.groups || []"
            :label="__('Avisos that need you')"
            compact
            @open="openAviso"
            @warm="avisoActions.warm"
            @read="readAviso"
            @mute="muteAviso"
          />
          <p
            v-if="avisoActions.status.value"
            role="status"
            class="mx-4 mt-1 flex items-center gap-2 text-sm text-ink-gray-7 sm:mx-5"
          >
            <span class="flex-1">{{ avisoActions.status.value.text }}</span>
            <Button
              v-if="avisoActions.status.value.undo"
              variant="ghost"
              :label="__('Undo')"
              @click="undoAviso"
            />
          </p>
        </HoySection>

        <!-- 5 · Accesos -->
        <HoySection
          id="accesos"
          class="lg:col-start-1 lg:row-start-4"
          :title="__('Shortcuts')"
          icon="lucide-zap"
          :skeleton="!shellBoot"
          :skeleton-rows="1"
          :collapsed="
            shortcuts.length ? '' : __('No quick actions for your puesto yet.')
          "
        >
          <div
            class="grid grid-cols-2 gap-2 px-4 pb-2 pt-1 sm:grid-cols-3 sm:px-5"
          >
            <RouterLink
              v-for="item in shortcuts"
              :key="item.key"
              :to="item.to"
              class="flex min-h-12 items-center gap-2 rounded-lg border border-outline-gray-2 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            >
              <span
                :class="item.icon"
                class="size-4 shrink-0 text-ink-gray-6"
                aria-hidden="true"
              />
              <span class="line-clamp-2 min-w-0 [text-wrap:balance]">{{
                item.label
              }}</span>
            </RouterLink>
          </div>
        </HoySection>
      </div>
      <!-- «Abrir Muelle en» lives in Más › Configuración (SHELL-S1.2), not on a work screen. -->
    </div>
    <CompleteDialog
      v-model="completeOpen"
      :row="selected"
      :today="today"
      :with-next="true"
      @done="afterComplete"
      @reload="refresh()"
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
import { Button, toast } from 'frappe-ui'
import HoySection from '@/components/hoy/HoySection.vue'
import HoyTask from '@/components/hoy/HoyTask.vue'
import AssistantSuggestion from '@/components/assistant/AssistantSuggestion.vue'
import { useListKeys } from '@/composables/pageKeys'
import AvisosList from '@/components/avisos/AvisosList.vue'
import CompleteDialog from '@/components/pendientes/CompleteDialog.vue'
import { isMobile } from '@/composables/breakpoint'
import { BottomSheet, ListRow } from '@/components/ui'
import { shellBoot } from '@/composables/muelleShell'
import {
  HOY_HOME,
  LIVE_DOCTYPES,
  accesos,
  agendaPlan,
  continuarCards,
  countLabel,
  createReadGate,
  dayTitle,
  dueMore,
  dueRows,
  eventLink,
  followUpQueueLink,
  followUpRows,
  greeting,
  hoyLive,
  loadHoy,
  runSourceAction,
  scanDrafts,
  teamOverdueRows,
  timeText,
  withReturn,
} from '@/composables/useHoy'
import { usePullRefresh } from '@/composables/usePullRefresh'
import {
  avisosVersion,
  startAvisosLive,
  useAvisosActions,
} from '@/composables/useAvisos'
import {
  pendienteError,
  pendientesApi,
  requestId,
} from '@/composables/usePendientes'
import { formatDay } from '@/utils/contactos'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'

const route = useRoute()
const router = useRouter()
// Keyboard standard: j/k walk every row of the day (pendientes, agenda,
// continuar, avisos) in reading order and Enter opens it. Hoy has no list
// search, selection or create of its own.
useListKeys({ page: 'hoy', rows: true, open: true })
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const phone = isMobile
const locale = globalThis.window?.lang || undefined

const data = ref(null)
const problem = ref('')
const loading = ref(false)
const skeleton = ref(false)
const slow = ref(false)
const busy = reactive(new Set())
const picks = reactive({})
const now = ref(Date.now())
const drafts = ref([])
const completeOpen = ref(false)
const selected = ref(null)
const scroller = ref(null)

const pendientes = computed(() => data.value?.pendientes)
const agenda = computed(() => data.value?.agenda)
const avisos = computed(() => data.value?.avisos)
const today = computed(() => data.value?.today || '')
const timeZone = computed(
  () => data.value?.time_zone || globalThis.window?.timezone?.system,
)

const hello = computed(() => {
  const name = String(
    data.value?.full_name || shellBoot.value?.user?.full_name || '',
  ).split(' ')[0]
  const words = greeting(new Date(now.value), timeZone.value)
  return name ? `${words}, ${name}` : words
})
const dateLine = computed(() => dayTitle(today.value, locale) || '')

const tasks = computed(() => dueRows(pendientes.value))
const moreTasks = computed(() => dueMore(pendientes.value))
const dueCount = computed(() => {
  const section = pendientes.value
  if (!section?.available) return ''
  const overdue = section.overdue?.count?.value || 0
  const due = section.today?.count?.value || 0
  const capped = section.overdue?.count?.capped || section.today?.count?.capped
  return overdue + due ? `${overdue + due}${capped ? '+' : ''}` : ''
})
const plan = computed(() =>
  agenda.value?.available
    ? agendaPlan(agenda.value.events, now.value)
    : { rows: [], earlier: 0, total: 0 },
)
const cards = computed(() =>
  data.value?.continuar?.available
    ? continuarCards(data.value.continuar, {
        drafts: drafts.value,
        timeZone: timeZone.value,
        locale,
      })
    : [],
)
const followUps = computed(() => followUpRows(data.value?.seguimiento))
const followUpQueue = computed(() => followUpQueueLink(data.value?.seguimiento))
const followUpCount = computed(() => {
  const count = data.value?.seguimiento?.count
  return count?.value ? countLabel(count) : ''
})
const followUpCollapsed = computed(() => {
  const section = data.value?.seguimiento
  if (!section?.available) return ''
  return followUps.value.length
    ? ''
    : __('Every open deal of yours has a next step.')
})
const teamRows = computed(() => teamOverdueRows(data.value?.equipo))
const teamQueue = withReturn('/deals?follow_up=overdue')
const teamCount = computed(() => {
  const count = data.value?.equipo?.count
  return count?.value ? countLabel(count) : ''
})
const teamCollapsed = computed(() =>
  data.value?.equipo?.available && !teamRows.value.length
    ? __('No follow-up of your team is overdue.')
    : '',
)
// Para ahora and Agenda both empty and both loaded: one «Al día» line instead.
const allClear = computed(
  () =>
    Boolean(data.value) &&
    pendientes.value?.available === true &&
    agenda.value?.available === true &&
    !pendientes.value?.failed &&
    !agenda.value?.failed &&
    !tasks.value.length &&
    !plan.value.rows.length,
)
const shortcuts = computed(() => accesos(shellBoot.value))

const summary = computed(() => {
  if (!data.value) return ''
  const parts = []
  const overdue = pendientes.value?.overdue?.count
  const due = pendientes.value?.today?.count
  const one = (count) => count.value === 1 && !count.capped
  if (overdue?.value)
    parts.push(
      one(overdue)
        ? __('1 overdue pendiente')
        : __('{0} overdue pendientes', [countLabel(overdue)]),
    )
  if (due?.value)
    parts.push(
      one(due) ? __('1 due today') : __('{0} due today', [countLabel(due)]),
    )
  const ahead = plan.value.rows.filter((row) => row.state !== 'allday').length
  if (ahead)
    parts.push(
      ahead === 1 ? __('1 event ahead') : __('{0} events ahead', [ahead]),
    )
  return parts.join(' · ')
})

function unavailable(section, label) {
  if (section?.failed) return __('This section could not load.')
  return section?.reason || __('{0} is not available for your puesto.', [label])
}
const dueCollapsed = computed(() => {
  const section = pendientes.value
  if (!section) return ''
  if (!section.available) return unavailable(section, 'Pendientes')
  return tasks.value.length
    ? ''
    : __('Nothing overdue or due today. You are up to date.')
})
const agendaCollapsed = computed(() => {
  const section = agenda.value
  if (!section) return ''
  if (!section.available) return unavailable(section, 'Agenda')
  if (plan.value.rows.length) return ''
  return plan.value.earlier
    ? __('Your agenda for today is done.')
    : __('Nothing on your agenda for today.')
})
const continuarCollapsed = computed(() => {
  const section = data.value?.continuar
  if (!section) return ''
  if (!section.available && !drafts.value.length)
    return section.failed
      ? __('This section could not load.')
      : __('Nothing in progress in other apps.')
  return cards.value.length ? '' : __('Nothing in progress in other apps.')
})
const avisosCollapsed = computed(() => {
  const section = avisos.value
  if (!section) return ''
  if (!section.available) return unavailable(section, 'Avisos')
  return section.groups?.length ? '' : __('No avisos waiting for you.')
})

// ── loading ────────────────────────────────────────────────────────────────

let sequence = 0
const gate = createReadGate()
async function refresh({ quiet = false, fresh = true } = {}) {
  const request = ++sequence
  gate.start()
  loading.value = true
  if (!quiet) problem.value = ''
  const skeletonTimer = setTimeout(() => {
    if (request === sequence && !data.value) skeleton.value = true
  }, 150)
  const slowTimer = setTimeout(() => {
    if (request === sequence) slow.value = true
  }, 8000)
  try {
    const answer = await loadHoy({ fresh })
    if (request !== sequence) return
    data.value = answer
    problem.value = ''
    drafts.value = scanDrafts(undefined, {
      user: answer?.user || shellBoot.value?.user?.name || '',
    })
  } catch (error) {
    if (request !== sequence) return
    const reason =
      error?.messages?.[0] ||
      (navigator.onLine === false
        ? __('You are offline. Reconnect and retry.')
        : __('Check your connection and retry.'))
    if (data.value && !quiet)
      toast.error(__('Hoy could not refresh. {0}', [reason]))
    else if (!data.value) problem.value = reason
  } finally {
    clearTimeout(skeletonTimer)
    clearTimeout(slowTimer)
    if (request === sequence) {
      loading.value = false
      skeleton.value = false
      slow.value = false
    }
    if (gate.end()) refresh({ quiet: true })
  }
}

const { pull, refreshing } = usePullRefresh(scroller, () => refresh())

// Live pushes go through the gate: one read per render (see createReadGate).
function liveRefresh(batch) {
  if (gate.admit(batch)) refresh({ quiet: true })
}
useLiveWatch(hoyLive(socket), [...LIVE_DOCTYPES], liveRefresh)
watch(avisosVersion, () => liveRefresh())

let clock
onMounted(() => {
  startAvisosLive(socket)
  refresh({ fresh: false })
  handleDone()
  // «Ahora» and «Siguiente» move with the clock.
  clock = setInterval(() => (now.value = Date.now()), 60000)
})
onBeforeUnmount(() => clearInterval(clock))

// A module that finished work started here comes back with ?done=.
function handleDone() {
  if (typeof route.query.done !== 'string') return
  toast.success(__('Saved. Back on Hoy.'))
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}
watch(() => route.query.done, handleDone)

// ── Para ahora: Pendientes' own endpoints ──────────────────────────────────

function patchTask(updated) {
  for (const group of ['overdue', 'today']) {
    const rows = pendientes.value?.[group]?.rows || []
    const index = rows.findIndex(
      (row) => row.doctype === updated.doctype && row.name === updated.name,
    )
    if (index >= 0) rows[index] = { ...rows[index], ...updated }
  }
}

async function complete(row) {
  const key = row.doctype + row.name
  if (busy.has(key) || row.status !== 'Open') return
  busy.add(key)
  patchTask({ ...row, status: 'Closed' })
  try {
    const response = await pendientesApi('complete', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      request_id: requestId(),
    })
    toast.success(__('Pendiente completed'), {
      duration: 8000,
      action: { label: __('Undo'), onClick: () => reopen(response.row) },
    })
    refresh({ quiet: true })
  } catch (error) {
    patchTask(row)
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action:
        reason.kind === 'conflict'
          ? { label: __('Refresh'), onClick: () => refresh() }
          : undefined,
    })
  } finally {
    busy.delete(key)
  }
}
async function reopen(row) {
  try {
    await pendientesApi('reopen', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      request_id: requestId(),
    })
    toast.success(__('Pendiente reopened'))
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  }
  refresh({ quiet: true })
}
async function reschedule(row, date) {
  const key = row.doctype + row.name
  busy.add(key)
  try {
    await pendientesApi('reschedule', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      date,
      request_id: requestId(),
    })
    toast.success(__('Moved to {0}', [formatDay(date)]))
    refresh({ quiet: true })
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action: { label: __('Refresh'), onClick: () => refresh() },
    })
  } finally {
    busy.delete(key)
  }
}
function openComplete(row) {
  selected.value = row
  completeOpen.value = true
}
function afterComplete(response) {
  toast.success(
    response?.created
      ? __('Done. Next pendiente scheduled.')
      : __('Pendiente completed'),
  )
  refresh({ quiet: true })
}

// ── Agenda ─────────────────────────────────────────────────────────────────

function eventMeta(event) {
  return [
    event.appointmentType,
    event.practitionerName,
    event.serviceUnitLabel,
    event.location,
  ]
    .filter(Boolean)
    .join(' · ')
}

// ── Continuar: the provider's own action ───────────────────────────────────

function choicesFor(card, row) {
  const choices = card.source?.action?.choices
  return choices ? choices[row.group] || [] : null
}
// Repair rows: the device and the job are the title, the repair order number is a
// small trailing reference (people quote it), and the detail line drops it, so it
// leads with the customer name taller puts first.
const REPAIR_SOURCE = 'taller.unassigned_repairs'
// The same «Ver todos ›» as HoySection's header link.
const MORE_LINK =
  'ml-auto flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8'
function rowReference(card, row) {
  return card.key === REPAIR_SOURCE && row.name ? String(row.name) : ''
}
function rowSubtitle(card, row) {
  const prefix = `${row.name} · `
  if (card.key !== REPAIR_SOURCE || !row.detail) return row.detail
  return row.detail.startsWith(prefix)
    ? row.detail.slice(prefix.length)
    : row.detail
}
// «Asignar» opens the choices (technicians) in a sheet; a pick is the action.
const assignment = ref(null)
const assignOpen = ref(false)
const assignChoices = computed(() =>
  assignment.value
    ? choicesFor(assignment.value.card, assignment.value.row) || []
    : [],
)
const assignField = computed(() => {
  const action = assignment.value?.card?.source?.action
  return action ? action.field_label || action.label : ''
})
function openAssign(card, row) {
  assignment.value = { card, row }
  assignOpen.value = true
}
function pickAssign(value) {
  const { card, row } = assignment.value
  picks[card.key + row.key] = value
  assignOpen.value = false
  sourceAction(card, row)
}
async function sourceAction(card, row) {
  const key = card.key + row.key
  if (busy.has(key)) return
  busy.add(key)
  try {
    const result = await runSourceAction(card.source, row, picks[key] || '')
    if (result?.ok === false) toast.error(result.message)
    else toast.success(result?.message || __('Done'))
    delete picks[key]
    refresh({ quiet: true })
  } catch (error) {
    toast.error(
      error?.messages?.[0] || __('That did not go through. Refresh and retry.'),
    )
  } finally {
    busy.delete(key)
  }
}

// ── Avisos: the Avisos module's own actions ────────────────────────────────

const avisoActions = useAvisosActions(router, {
  returnTo: () => HOY_HOME,
  returnLabel: 'Hoy',
})
async function openAviso(group) {
  await avisoActions.open(group)
}
async function readAviso(group) {
  if (await avisoActions.read(group)) refresh({ quiet: true })
}
async function muteAviso(group, muted) {
  if (await avisoActions.mute(group, muted)) refresh({ quiet: true })
}
async function undoAviso() {
  await avisoActions.undo()
  refresh({ quiet: true })
}
</script>
