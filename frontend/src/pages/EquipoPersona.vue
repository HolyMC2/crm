<template>
  <!-- A person on the team (Shell look, record-header): the bar names them
       with their state and puesto; the island reaches them, the bolt holds
       the next steps and «⋯» every tool. The hero is the vacation request
       this page was opened for with its one decision, or else their days
       left and access. Then their week, their requests and Actividad. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Back to Equipo')"
      :title="person?.full_name || ''"
      :bell="isPhone"
      @back="onBack"
    >
      <template v-if="person" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ person.full_name }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              v-if="chip"
              :label="chip.label"
              :tone="chip.tone"
              data-testid="equipo-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              kindLine
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="person"
          :reach="kit.record.value?.header?.reach || {}"
          :who="person.full_name || ''"
          :groups="boltGroups"
          :phone="isPhone"
          :subtitle="kit.scopeTitle.value"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="failure"
        role="alert"
        state="error"
        :title="failure.title"
        :message="failure.detail"
        :action="__('Retry', null, 'Equipo')"
        @action="load"
      />
      <EmptyState
        v-else-if="!person"
        role="status"
        state="loading"
        :title="__('Loading person…')"
      />

      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <div
            v-if="notice"
            role="status"
            class="mx-4 flex items-start gap-2 rounded-6 bg-surface-green-1 p-3 text-base text-ink-green-8"
          >
            <span
              class="lucide-circle-check size-5 flex-none"
              aria-hidden="true"
            />
            {{ notice }}
          </div>
          <div
            v-if="problem"
            role="alert"
            class="mx-4 space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
          >
            <p>{{ problem.message }}</p>
            <div v-if="problem.lift" class="flex flex-wrap gap-2">
              <button
                v-if="!confirmingLift"
                type="button"
                :class="['press', BTN.filled]"
                @click="confirmingLift = true"
              >
                {{ problem.lift.label }}
              </button>
              <template v-else>
                <p class="w-full">
                  {{
                    __(
                      'Your user permission limited to your own employee record will be removed. Continue?',
                    )
                  }}
                </p>
                <button
                  type="button"
                  :class="['press', BTN.filled]"
                  :disabled="lifting"
                  @click="liftLimit"
                >
                  <span
                    v-if="lifting"
                    class="lucide-loader-circle size-5 animate-spin"
                    aria-hidden="true"
                  />
                  {{ __('Yes, remove the limit') }}
                </button>
                <button
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="confirmingLift = false"
                >
                  {{ __('Cancel', null, 'Equipo') }}
                </button>
              </template>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="['press', BTN.tonal]" @click="load">
                <span class="lucide-refresh-cw size-5" aria-hidden="true" />
                {{ __('Refresh', null, 'Equipo') }}
              </button>
              <button
                v-if="problem.request"
                type="button"
                :class="['press', BTN.tonal]"
                @click="openAsistencia(problem.request)"
              >
                <span class="lucide-calendar-days size-5" aria-hidden="true" />
                {{ __('Open in Asistencia') }}
              </button>
            </div>
          </div>

          <!-- The hero: the request it was opened for and its one decision;
               else the days they have left. -->
          <section
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Next step', null, 'Compras')"
            data-testid="equipo-hero"
          >
            <template v-if="!person.hr">
              <p class="break-words text-base text-ink-gray-8">
                {{ person.hr_reason }}
              </p>
              <p v-if="asked" class="text-base text-ink-gray-7">{{ asked }}</p>
            </template>
            <template v-else-if="current">
              <h2
                class="title-face text-2xl font-semibold leading-tight text-ink-gray-9"
              >
                {{ __('Vacation request: {0}', [current.label]) }}
              </h2>
              <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
                <span class="num tabular-nums">{{
                  __('{0} days', [current.days])
                }}</span>
                <span v-if="current.state_label">{{
                  current.state_label
                }}</span>
                <span v-if="current.next">{{ current.next }}</span>
              </p>
              <p
                v-if="current.reason"
                class="break-words text-base text-ink-gray-8"
              >
                {{ current.reason }}
              </p>
              <p v-if="vacationLine" class="text-base text-ink-gray-8">
                {{ vacationLine }}
              </p>
            </template>
            <template v-else>
              <p
                class="title-face text-2xl font-semibold leading-tight text-ink-gray-9"
              >
                {{
                  vacationLine || __('No vacation days assigned for this year.')
                }}
              </p>
              <p
                v-if="vacation?.year !== undefined"
                class="text-base text-ink-gray-7"
              >
                {{
                  __('{0} years of service · next anniversary {1}: {2} days', [
                    vacation.year,
                    dayLabel(vacation.next_anniversary),
                    vacation.next_days,
                  ])
                }}
              </p>
            </template>
            <div
              v-if="nextSteps.length"
              class="flex flex-wrap gap-2 pt-2"
              data-testid="equipo-next"
            >
              <button
                v-for="step in nextSteps"
                :key="step.key"
                type="button"
                :class="['press', step.filled ? BTN.filled : BTN.tonal]"
                :disabled="!!deciding"
                :data-step="step.key"
                @click="step.run()"
              >
                <span
                  :class="[
                    deciding === step.key
                      ? 'lucide-loader-circle animate-spin'
                      : step.icon,
                    'size-5',
                  ]"
                  aria-hidden="true"
                />
                {{ step.label }}
              </button>
            </div>
            <div
              v-if="rejecting && current"
              class="space-y-2 rounded-6 bg-surface-gray-1 p-3"
              data-testid="equipo-reject"
            >
              <FormControl
                v-model="note"
                type="textarea"
                :label="__('Why it is not approved (they will see it)')"
              />
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  :class="['press', BTN.danger]"
                  :disabled="!note.trim() || !!deciding"
                  @click="decide('reject')"
                >
                  <span
                    :class="[
                      deciding === 'reject'
                        ? 'lucide-loader-circle animate-spin'
                        : 'lucide-x',
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ __('Reject request') }}
                </button>
                <button
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="rejecting = false"
                >
                  {{ __('Cancel', null, 'Equipo') }}
                </button>
              </div>
            </div>
          </section>

          <template v-if="person.hr">
            <!-- Vacations: what carries over, the law's row, what is missing. -->
            <section class="px-4" aria-labelledby="equipo-vacaciones">
              <h2
                id="equipo-vacaciones"
                class="pb-1 text-base font-semibold text-ink-gray-9"
              >
                {{ __('Vacations', null, 'Equipo') }}
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li
                  v-for="row in vacationRows"
                  :key="row.key"
                  class="flex min-h-14 items-center gap-3 py-2"
                >
                  <span
                    class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span :class="[row.icon, 'size-5']" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="break-words text-base text-ink-gray-9">{{
                      row.text
                    }}</span>
                  </span>
                  <StatusChip
                    v-if="row.chip"
                    :label="row.chip.label"
                    :tone="row.chip.tone"
                  />
                </li>
              </ul>
            </section>

            <!-- The week: each day's shift, and «Asignar turno» where none is set. -->
            <section class="px-4" aria-labelledby="equipo-semana">
              <h2
                id="equipo-semana"
                class="pb-1 text-base font-semibold text-ink-gray-9"
              >
                {{ __('This week', null, 'Equipo') }}
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li
                  v-for="day in person.week || []"
                  :key="day.date"
                  class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-base text-ink-gray-9">{{
                      day.label
                    }}</span>
                    <span
                      v-if="dayLine(day)"
                      class="block break-words text-sm text-ink-gray-6"
                      >{{ dayLine(day) }}</span
                    >
                  </span>
                  <StatusChip
                    :label="weekLabel(day.status)"
                    :tone="TONE[weekTheme(day.status)]"
                  />
                  <button
                    v-if="day.status === 'sin_confirmar' && canAssign"
                    type="button"
                    class="press flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 [@media(hover:hover)]:hover:bg-surface-gray-3"
                    :aria-label="`${__('Assign shift')} · ${day.label}`"
                    :title="__('Assign shift')"
                    @click="openShift(day.date)"
                  >
                    <span
                      class="lucide-calendar-plus size-5"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              </ul>
            </section>
          </template>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <section
            v-if="person.hr"
            class="px-4"
            aria-labelledby="equipo-solicitudes"
          >
            <h2
              id="equipo-solicitudes"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Vacation requests') }}
            </h2>
            <p
              v-if="!(person.requests || []).length"
              class="flex min-h-11 items-center text-base text-ink-gray-6"
            >
              {{ __('No vacation requests yet. They ask from Asistencia.') }}
            </p>
            <ul v-else class="divide-y divide-outline-gray-1">
              <li v-for="r in person.requests" :key="r.name">
                <button
                  type="button"
                  class="press flex min-h-14 w-full items-center gap-3 rounded-6 py-2 text-left [@media(hover:hover)]:hover:bg-surface-gray-1"
                  :aria-current="current?.name === r.name ? 'true' : undefined"
                  @click="selectRequest(r.name)"
                >
                  <span
                    class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span class="lucide-calendar-days size-5" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="break-words text-base text-ink-gray-9">{{
                      r.label
                    }}</span>
                    <span class="text-sm text-ink-gray-6">{{
                      [__('{0} days', [r.days]), r.state_label]
                        .filter(Boolean)
                        .join(' · ')
                    }}</span>
                  </span>
                  <span
                    class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                    aria-hidden="true"
                  />
                </button>
              </li>
            </ul>
          </section>
          <!-- Shell SPEC §6 DD2: Actividad of their Employee record and the «⋯» sheets. -->
          <RecordKit
            :kit="kit"
            :title="person.full_name || props.employee"
            :cadena="false"
          />
        </aside>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import {
  AUSENCIAS,
  PERSON,
  balanceLine,
  dayLabel,
  decisions,
  equipoApi,
  equipoBoot,
  lftLabel,
  lftTheme,
  liftAction,
  loadEquipoBoot,
  loadSheet,
  nextRequest,
  personRoute,
  problemOf,
  requestId,
  weekLabel,
  weekTheme,
} from '@/composables/useEquipo'
import { isMobile as isPhone } from '@/composables/breakpoint'

// The week's and the law row's Badge themes, as StatusChip tones.
const TONE = {
  green: 'success',
  blue: 'info',
  orange: 'warning',
  amber: 'warning',
  red: 'danger',
  gray: 'neutral',
}

const props = defineProps({ employee: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const caps = computed(() => equipoBoot.value?.capabilities || {})
const person = ref(null)
const failure = ref(null)
const problem = ref(null)
const notice = ref('')
const asked = ref('')
const current = ref(null)
const revision = ref(null)
const deciding = ref('')
const rejecting = ref(false)
const note = ref('')
const confirmingLift = ref(false)
const lifting = ref(false)
// One key per decision the worker makes; a retry of the same click reuses it.
let decisionKey = null

const employee = computed(() => props.employee)
const vacation = computed(() => person.value?.vacation || null)
const vacationLine = computed(() => balanceLine(vacation.value))
const canAssign = computed(() => person.value?.asistencia?.can_assign !== false)
// The engine's «⋯» tools, Conexiones and Actividad of their Employee record.
const kit = useRecordKit('Employee', {
  name: () => props.employee,
  title: () => person.value?.full_name || '',
  changed: () => load(),
})

// ── the bar: their name, whether they can work, their puesto ─────────────
const chip = computed(() => {
  const p = person.value || {}
  if (p.user && !p.enabled)
    return { label: __('No access', null, 'Equipo'), tone: 'warning' }
  if (p.employment && p.employment !== 'Active')
    return { label: p.employment, tone: 'warning' }
  return p.puesto ? { label: p.puesto, tone: 'neutral' } : null
})
const kindLine = computed(() => {
  const p = person.value || {}
  return [p.designation, p.company].filter(Boolean).join(' · ')
})

// ── the hero's steps: the decision (filled), then access and the law's days
const nextSteps = computed(() => {
  const p = person.value
  if (!p) return []
  const out = []
  if (!p.hr) {
    out.push({
      key: 'ask-hr',
      label: __('Ask to turn it on'),
      icon: 'lucide-send',
      filled: true,
      run: askHr,
    })
    out.push({
      key: 'access',
      label: __('Continue with people and puestos'),
      icon: 'lucide-key',
      run: openPersonSheet,
    })
    return out
  }
  const choices = current.value ? decisions(current.value) : []
  if (choices.includes('approve'))
    out.push({
      key: 'approve',
      label: __('Approve', null, 'Equipo'),
      icon: 'lucide-check',
      filled: true,
      run: () => decide('approve'),
    })
  if (choices.includes('reject'))
    out.push({
      key: 'reject',
      label: __('Reject', null, 'Equipo'),
      icon: 'lucide-x',
      run: () => (rejecting.value = true),
    })
  if (vacation.value?.row?.status === 'ready' && caps.value.configure)
    out.push({
      key: 'statutory',
      label: __('Assign statutory days'),
      icon: 'lucide-calendar-plus',
      filled: !out.length,
      run: () =>
        router.push({
          name: 'EquipoVacaciones',
          query: { employee: employee.value, list: route.fullPath },
        }),
    })
  out.push({
    key: 'access',
    label: __('Access and puesto'),
    icon: 'lucide-key',
    run: openPersonSheet,
  })
  return out
})

const vacationRows = computed(() => {
  const v = vacation.value
  if (!v) return []
  return [
    // The balance is the hero's line; here only what it is missing.
    !v.leave_type && {
      key: 'leave-type',
      icon: 'lucide-calendar-days',
      text: __(
        'Choose which leave type counts as vacation in Statutory vacations.',
      ),
    },
    v.balance?.carried && {
      key: 'carried',
      icon: 'lucide-history',
      text: __('{0} days carried from last year, until {1}', [
        v.balance.carried,
        dayLabel(v.balance.carried_until),
      ]),
    },
    v.row?.message && {
      key: 'law',
      icon: 'lucide-file-text',
      text: v.row.message,
      chip: {
        label: lftLabel(v.row.status),
        tone: TONE[lftTheme(v.row.status)],
      },
    },
  ].filter(Boolean)
})
function dayLine(day) {
  return [day.shift_type, day.hours, day.holiday].filter(Boolean).join(' · ')
}

// ── the bolt: the hero's steps; «⋯» keeps share, print and the rest ──────
const boltGroups = computed(() =>
  recordActionsFor({ steps: nextSteps.value, tools: kit.tools.value }),
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) nextSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}

const listPath = computed(() => {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  return list.startsWith('/equipo') ? list : '/equipo'
})

async function load() {
  failure.value = null
  try {
    person.value = await equipoApi(PERSON, { employee: props.employee })
    await loadRequest()
  } catch (error) {
    failure.value = problemOf(error)
  }
}

async function loadRequest() {
  current.value = null
  const name =
    typeof route.query.request === 'string' ? route.query.request : ''
  if (!name || !person.value?.hr) return
  const answer = await equipoApi(`${AUSENCIAS}.get_request`, { name })
  if (answer?.ok) {
    current.value = answer.request
    revision.value = answer.revision
  } else if (answer) {
    problem.value = { message: answer.message, request: name }
  }
}

function selectRequest(name) {
  router.replace({ query: { ...route.query, request: name } })
}

async function decide(decision) {
  if (!current.value) return
  deciding.value = decision
  problem.value = null
  decisionKey ??= requestId()
  try {
    const answer = await equipoApi(`${AUSENCIAS}.decide`, {
      name: current.value.name,
      decision,
      key: decisionKey,
      revision: revision.value,
      note: decision === 'reject' ? note.value.trim() : '',
    })
    if (!answer?.ok) {
      problem.value = {
        message: answer?.message,
        request: current.value.name,
        lift: liftAction(answer),
      }
      if (answer?.request) current.value = answer.request
      return
    }
    decisionKey = null
    rejecting.value = false
    note.value = ''
    await afterDecision(answer.message)
  } catch (error) {
    problem.value = {
      message: problemOf(error).detail,
      request: current.value?.name,
    }
  } finally {
    deciding.value = ''
  }
}

async function liftLimit() {
  lifting.value = true
  try {
    const answer = await equipoApi('lift_own_limit', {
      employee: problem.value.lift.employee,
    })
    problem.value = null
    confirmingLift.value = false
    notice.value = answer.message
    await loadRequest()
  } catch (error) {
    problem.value = { message: problemOf(error).detail }
  } finally {
    lifting.value = false
  }
}

/** Back to the queue's next request, or the queue itself when it is empty. */
async function afterDecision(message) {
  const decided = current.value.name
  let queue
  try {
    queue =
      (await equipoApi('list_people', { segment: 'por-revisar' })).rows || []
  } catch {
    queue = []
  }
  const next = nextRequest(queue, decided)
  if (next) {
    notice.value = message
    router.replace(
      personRoute(next.employee, { request: next.name, list: listPath.value }),
    )
    return
  }
  router.push({
    path: '/equipo',
    query: { segment: 'por-revisar', notice: message },
  })
}

async function openPersonSheet() {
  try {
    const sheet = await loadSheet()
    sheet.openPerson({
      user: person.value?.user,
      employee: props.employee,
      onChange: load,
      onClose: load,
    })
  } catch (error) {
    problem.value = { message: problemOf(error).detail }
  }
}
async function openShift(date) {
  try {
    const sheet = await loadSheet()
    sheet.openShift({ employee: props.employee, date, onDone: load })
  } catch (error) {
    problem.value = { message: problemOf(error).detail }
  }
}
async function askHr() {
  try {
    asked.value = (await equipoApi('ask_hr_module')).message
  } catch (error) {
    asked.value = problemOf(error).detail
  }
}
function openAsistencia(request) {
  window.location.href = `/app/asistencia?v=ausencias&request=${encodeURIComponent(request)}`
}
function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  router.push(listPath.value)
}

watch(
  () => [props.employee, route.query.request],
  ([emp], [before]) => (emp !== before ? load() : loadRequest()),
)
onMounted(async () => {
  await loadEquipoBoot()
  load()
})
</script>
