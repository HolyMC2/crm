<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ __('Back to Equipo') }}
        </button>
      </nav>

      <section
        v-if="failure"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ failure.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ failure.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Equipo')" @click="load" />
          <Button :label="__('Back to Equipo')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="!person" role="status" class="py-10 text-sm">
        {{ __('Loading person…') }}
      </div>

      <template v-else>
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <Avatar :label="person.full_name" size="3xl" />
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ person.full_name }}
            </h1>
            <p
              class="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
            >
              <Badge v-if="person.puesto" theme="gray" :label="person.puesto" />
              <Badge
                v-if="person.employment && person.employment !== 'Active'"
                theme="orange"
                :label="person.employment"
              />
              <Badge
                v-if="person.user && !person.enabled"
                theme="orange"
                :label="__('No access', null, 'Equipo')"
              />
              {{
                [person.designation, person.company].filter(Boolean).join(' · ')
              }}
            </p>
          </div>
          <Button
            icon-left="key"
            :label="__('Access and puesto')"
            class="min-h-11 sm:min-h-8"
            @click="openPersonSheet"
          />
        </header>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>{{ problem.message }}</p>
          <div class="flex flex-wrap gap-2">
            <Button :label="__('Refresh', null, 'Equipo')" @click="load" />
            <Button
              v-if="problem.request"
              :label="__('Open in Asistencia')"
              @click="openAsistencia(problem.request)"
            />
          </div>
        </div>

        <section
          v-if="!person.hr"
          role="status"
          class="mb-4 space-y-2 rounded-lg border border-outline-gray-2 p-4 text-sm"
        >
          <p class="text-ink-gray-8">{{ person.hr_reason }}</p>
          <div class="flex flex-wrap gap-2">
            <Button :label="__('Ask to turn it on')" @click="askHr" />
            <Button
              variant="ghost"
              :label="__('Continue with people and puestos')"
              @click="openPersonSheet"
            />
          </div>
          <p v-if="asked" class="text-ink-gray-7">{{ asked }}</p>
        </section>

        <template v-else>
          <!-- The request this page was opened for, with its one decision. -->
          <section
            v-if="current"
            class="mb-4 rounded-lg border border-outline-blue-2 bg-surface-blue-1 p-4"
          >
            <h2 class="text-base font-semibold text-ink-gray-9">
              {{ __('Vacation request: {0}', [current.label]) }}
            </h2>
            <p class="mt-1 text-sm text-ink-gray-7">
              {{
                [
                  __('{0} days', [current.days]),
                  current.state_label,
                  current.next,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
            <p v-if="current.reason" class="mt-1 text-sm text-ink-gray-8">
              {{ current.reason }}
            </p>
            <p v-if="vacationLine" class="mt-1 text-sm text-ink-gray-8">
              {{ vacationLine }}
            </p>
            <div
              v-if="decisions(current).length"
              class="mt-3 flex flex-wrap gap-2"
            >
              <Button
                v-if="decisions(current).includes('approve')"
                variant="solid"
                :label="__('Approve', null, 'Equipo')"
                :loading="deciding === 'approve'"
                class="min-h-11 sm:min-h-8"
                @click="decide('approve')"
              />
              <Button
                v-if="decisions(current).includes('reject')"
                :label="__('Reject', null, 'Equipo')"
                class="min-h-11 sm:min-h-8"
                @click="rejecting = true"
              />
            </div>
            <div v-if="rejecting" class="mt-3 space-y-2">
              <FormControl
                v-model="note"
                type="textarea"
                :label="__('Why it is not approved (they will see it)')"
              />
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="solid"
                  theme="red"
                  :label="__('Reject request')"
                  :disabled="!note.trim()"
                  :loading="deciding === 'reject'"
                  @click="decide('reject')"
                />
                <Button
                  :label="__('Cancel', null, 'Equipo')"
                  @click="rejecting = false"
                />
              </div>
            </div>
          </section>

          <div class="grid gap-4 sm:grid-cols-2">
            <section class="rounded-lg border border-outline-gray-2 p-4">
              <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
                {{ __('Vacations', null, 'Equipo') }}
              </h2>
              <template v-if="vacation">
                <p
                  v-if="vacationLine"
                  class="text-base font-medium text-ink-gray-9"
                >
                  {{ vacationLine }}
                </p>
                <p v-else class="text-base text-ink-gray-8">
                  {{ __('No vacation days assigned for this year.') }}
                </p>
                <p
                  v-if="vacation.year !== undefined"
                  class="mt-1 text-sm text-ink-gray-6"
                >
                  {{
                    __(
                      '{0} years of service · next anniversary {1}: {2} days',
                      [
                        vacation.year,
                        dayLabel(vacation.next_anniversary),
                        vacation.next_days,
                      ],
                    )
                  }}
                </p>
                <p
                  v-if="vacation.balance?.carried"
                  class="mt-1 text-sm text-ink-gray-6"
                >
                  {{
                    __('{0} days carried from last year, until {1}', [
                      vacation.balance.carried,
                      dayLabel(vacation.balance.carried_until),
                    ])
                  }}
                </p>
                <p
                  v-if="vacation.row?.message"
                  class="mt-1 text-sm text-ink-gray-7"
                >
                  <Badge
                    :theme="lftTheme(vacation.row.status)"
                    :label="lftLabel(vacation.row.status)"
                  />
                  {{ vacation.row.message }}
                </p>
                <Button
                  v-if="vacation.row?.status === 'ready' && caps.configure"
                  class="mt-3 min-h-11 sm:min-h-8"
                  :label="__('Assign statutory days')"
                  @click="
                    router.push({
                      name: 'EquipoVacaciones',
                      query: { employee, list: route.fullPath },
                    })
                  "
                />
                <p
                  v-if="!vacation.leave_type"
                  class="mt-1 text-sm text-ink-amber-8"
                >
                  {{
                    __(
                      'Choose which leave type counts as vacation in Statutory vacations.',
                    )
                  }}
                </p>
              </template>
            </section>

            <section class="rounded-lg border border-outline-gray-2 p-4">
              <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
                {{ __('This week', null, 'Equipo') }}
              </h2>
              <ul class="space-y-1">
                <li
                  v-for="day in person.week || []"
                  :key="day.date"
                  class="flex min-h-9 items-center gap-2 text-sm"
                >
                  <span class="w-24 shrink-0 text-ink-gray-7">{{
                    day.label
                  }}</span>
                  <Badge
                    :theme="weekTheme(day.status)"
                    :label="weekLabel(day.status)"
                  />
                  <span class="min-w-0 flex-1 truncate text-ink-gray-8">
                    {{
                      [day.shift_type, day.hours, day.holiday]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </span>
                  <Button
                    v-if="day.status === 'sin_confirmar' && canAssign"
                    size="sm"
                    :label="__('Assign shift')"
                    @click="openShift(day.date)"
                  />
                </li>
              </ul>
            </section>

            <section
              class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
            >
              <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
                {{ __('Vacation requests') }}
              </h2>
              <p
                v-if="!(person.requests || []).length"
                class="text-sm text-ink-gray-6"
              >
                {{ __('No vacation requests yet. They ask from Asistencia.') }}
              </p>
              <ul v-else class="divide-y divide-outline-gray-1">
                <li v-for="r in person.requests" :key="r.name">
                  <button
                    class="flex min-h-11 w-full items-center gap-2 text-left text-sm hover:bg-surface-gray-1"
                    @click="selectRequest(r.name)"
                  >
                    <span class="min-w-0 flex-1 truncate text-ink-gray-9">{{
                      r.label
                    }}</span>
                    <span class="text-ink-gray-6">{{
                      __('{0} days', [r.days])
                    }}</span>
                    <Badge theme="gray" :label="r.state_label" />
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Button, FeatherIcon, FormControl } from 'frappe-ui'
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
  loadEquipoBoot,
  loadSheet,
  nextRequest,
  personRoute,
  problemOf,
  requestId,
  weekLabel,
  weekTheme,
} from '@/composables/useEquipo'

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
// One key per decision the worker makes; a retry of the same click reuses it.
let decisionKey = null

const employee = computed(() => props.employee)
const vacation = computed(() => person.value?.vacation || null)
const vacationLine = computed(() => balanceLine(vacation.value))
const canAssign = computed(() => person.value?.asistencia?.can_assign !== false)
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
      problem.value = { message: answer?.message, request: current.value.name }
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
