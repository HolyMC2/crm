<template>
  <ModuleLayout
    title="Equipo"
    :entries="entries"
    :active-key="segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Equipo is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button
          :label="__('Open Asistencia')"
          @click="openUrl('/app/asistencia')"
        />
      </div>
    </section>
    <template v-else>
      <header
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ segmentLabel(segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <Button
          v-if="caps.configure"
          icon-left="calendar"
          :label="__('Statutory vacations')"
          class="min-h-11 sm:min-h-8"
          @click="router.push({ name: 'EquipoVacaciones' })"
        />
        <Button
          v-if="caps.hire"
          variant="solid"
          icon-left="user-plus"
          :label="__('Add a person', null, 'Equipo')"
          class="min-h-11 sm:min-h-8"
          @click="openAlta"
        />
      </header>
      <section
        v-if="!caps.hr && !hrDismissed"
        role="status"
        class="mx-4 mb-3 space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8 sm:mx-6"
      >
        <p>
          {{
            boot?.hr_reason ||
            __(
              'Shifts, attendance and vacations need the staff module (HRMS), which this system does not have.',
            )
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            :label="__('Ask to turn it on')"
            :loading="asking"
            @click="askHr"
          />
          <Button
            variant="ghost"
            :label="__('Continue with people and puestos')"
            @click="hrDismissed = true"
          />
        </div>
        <p v-if="asked">{{ asked }}</p>
      </section>
      <section
        v-if="limit"
        role="status"
        class="mx-4 mb-3 space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8 sm:mx-6"
      >
        <p>{{ limit.message }}</p>
        <div v-if="limit.actions?.length" class="flex flex-wrap gap-2">
          <Button
            v-if="!confirmingLift"
            :label="limit.actions[0].label"
            @click="confirmingLift = true"
          />
          <template v-else>
            <p class="w-full">
              {{
                __(
                  'Your user permission limited to your own employee record will be removed. Continue?',
                )
              }}
            </p>
            <Button
              variant="solid"
              :label="__('Yes, remove the limit')"
              :loading="lifting"
              @click="liftLimit"
            />
            <Button
              :label="__('Cancel', null, 'Equipo')"
              @click="confirmingLift = false"
            />
          </template>
        </div>
      </section>
      <div class="px-4 pb-3 sm:hidden">
        <FormControl
          type="select"
          :aria-label="__('List', null, 'Equipo')"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
      </div>
      <div
        v-if="notice"
        role="status"
        class="mx-4 mb-3 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8 sm:mx-6"
      >
        {{ notice }}
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          class="ml-2"
          :label="__('Retry', null, 'Equipo')"
          @click="load()"
        />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto pb-6">
        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading the team…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <Button
            v-if="segment !== 'todos'"
            class="mt-4"
            :label="__('See everyone', null, 'Equipo')"
            @click="selectSegment('todos')"
          />
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li
            v-for="row in rows"
            :key="row.name || row.employee || row.user"
            class="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-gray-1 sm:px-6"
            :class="focus && row.name === focus ? 'bg-surface-gray-1' : ''"
          >
            <component
              :is="row.employee ? RouterLink : 'div'"
              v-bind="
                row.employee
                  ? { to: personRoute(row.employee, rowQuery(row)) }
                  : { role: 'button', tabindex: 0 }
              "
              class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
              @click="row.employee ? null : openPerson(row)"
              @keydown.enter="row.employee ? null : openPerson(row)"
            >
              <Avatar
                :label="row.full_name || row.employee_name"
                :image="row.image"
                size="lg"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.full_name || row.employee_name }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{ rowDetail(row) }}
                </span>
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="row.today"
                    :theme="todayTheme(row.today.status)"
                    :label="todayLabel(row.today.status)"
                  />
                  <Badge v-if="row.puesto" theme="gray" :label="row.puesto" />
                  <Badge
                    v-if="row.status === 'Suspended'"
                    theme="orange"
                    :label="__('Suspended', null, 'Equipo')"
                  />
                  <Badge
                    v-if="row.status === 'no_employee'"
                    theme="orange"
                    :label="__('No employee record')"
                  />
                  <Badge
                    v-if="row.state_label"
                    theme="blue"
                    :label="row.state_label"
                  />
                </span>
                <span
                  v-if="row.problem"
                  class="mt-1 block text-sm text-ink-amber-8"
                  >{{ row.problem }}</span
                >
              </span>
            </component>
            <Button
              v-if="segment === 'sin-horario' && row.employee"
              :label="__('Assign shift')"
              class="min-h-11 shrink-0 sm:min-h-8"
              @click="openShift(row)"
            />
          </li>
        </ul>
      </div>
    </template>
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Button, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  equipoApi,
  equipoBoot,
  loadEquipoBoot,
  loadSheet,
  normalizeSegment,
  personRoute,
  problemOf,
  segmentLabel,
  segmentsFor,
  todayLabel,
  todayTheme,
} from '@/composables/useEquipo'

const route = useRoute()
const router = useRouter()
const boot = equipoBoot
const caps = computed(() => boot.value?.capabilities || {})
const rows = ref([])
const counts = ref({})
const loading = ref(false)
const problem = ref(null)
const notice = ref('')
const asking = ref(false)
const asked = ref('')
const hrDismissed = ref(false)
const limit = ref(null)
const confirmingLift = ref(false)
const lifting = ref(false)
const segment = computed(() =>
  normalizeSegment(route.query.segment, Boolean(caps.value.hr)),
)
// The request just decided on a person's page comes back focused.
const focus = computed(() =>
  typeof route.query.focus === 'string' ? route.query.focus : '',
)
let ticket = 0

const entries = computed(() =>
  segmentsFor(Boolean(caps.value.hr)).map((s) => ({
    ...s,
    label:
      segmentLabel(s.value) +
      (counts.value[s.value] !== undefined
        ? ` (${counts.value[s.value]})`
        : ''),
  })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __(
        'Equipo is for the owner and managers. Your shifts and vacations are in Asistencia.',
      )
    : '',
)
const subtitle = computed(
  () =>
    ({
      hoy: __('Who has a shift today and whether they have arrived.'),
      'por-revisar': __('Vacation requests you decide, earliest first.'),
      'sin-horario': __('Active people without a shift this week.'),
      todos: __('Everyone who works here, with their puesto.'),
    })[segment.value],
)
const emptyTitle = computed(
  () =>
    ({
      hoy: __('Nobody has a shift today'),
      'por-revisar': __('Nothing to review'),
      'sin-horario': __('Everyone has a schedule'),
      todos: __('Nobody here yet'),
    })[segment.value],
)
const emptyBody = computed(
  () =>
    ({
      hoy: __('Assign shifts from a person, or check «No schedule».'),
      'por-revisar': __(
        'When someone asks for vacations in Asistencia, it shows up here.',
      ),
      'sin-horario': __(
        'Every active person has a shift or a rotation this week.',
      ),
      todos: __('Add the first person of the team to start.'),
    })[segment.value],
)

function rowDetail(row) {
  if (row.today)
    return [
      row.today.shift_type,
      row.today.shift_start?.slice(11, 16) &&
        `${row.today.shift_start.slice(11, 16)}–${(row.today.shift_end || '').slice(11, 16)}`,
      row.today.in_time && __('In at {0}', [row.today.in_time.slice(11, 16)]),
    ]
      .filter(Boolean)
      .join(' · ')
  if (row.label)
    return [row.label, __('{0} days', [row.days])].filter(Boolean).join(' · ')
  return [row.designation, row.company].filter(Boolean).join(' · ')
}
function rowQuery(row) {
  const query = { list: route.fullPath }
  if (row.label && row.name) query.request = row.name
  return query
}

async function load() {
  const current = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await equipoApi('list_people', { segment: segment.value })
    if (current !== ticket) return
    rows.value = page.rows || []
    counts.value = page.counts || {}
    limit.value = page.guard || null
  } catch (error) {
    if (current === ticket) problem.value = problemOf(error)
  } finally {
    if (current === ticket) loading.value = false
  }
}

function selectSegment(value) {
  const query = { ...route.query, segment: value }
  delete query.focus
  router.replace({ query })
}
function openUrl(url) {
  window.location.href = url
}

async function sheet(open) {
  problem.value = null
  try {
    open(await loadSheet())
  } catch (error) {
    problem.value = problemOf(error)
  }
}
function openAlta() {
  sheet((s) =>
    s.openAlta({
      draftKey: 'crm:equipo',
      onDone: () => {
        notice.value = __('Person added. They appear in the team list.')
        load()
      },
      onClose: load,
    }),
  )
}
function openPerson(row) {
  sheet((s) => s.openPerson({ user: row.user, onChange: load, onClose: load }))
}
function openShift(row) {
  sheet((s) =>
    s.openShift({
      employee: row.employee,
      onDone: () => {
        notice.value = __('Shift assigned to {0}.', [row.full_name])
        load()
      },
    }),
  )
}
async function liftLimit() {
  lifting.value = true
  try {
    notice.value = (
      await equipoApi('lift_own_limit', { employee: limit.value.employee })
    ).message
    confirmingLift.value = false
    load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    lifting.value = false
  }
}
async function askHr() {
  asking.value = true
  try {
    asked.value = (await equipoApi('ask_hr_module')).message
  } catch (error) {
    asked.value = problemOf(error).detail
  } finally {
    asking.value = false
  }
}
async function retryBoot() {
  await loadEquipoBoot({ refresh: true })
  if (boot.value?.enabled) load()
}

watch(
  () => route.query.segment,
  () => {
    if (route.name === 'Equipo' && boot.value?.enabled) load()
  },
)
onMounted(async () => {
  await loadEquipoBoot()
  if (!boot.value?.enabled) return
  if (typeof route.query.notice === 'string') {
    // A decision made on a person's page: say it once, keep the queue's URL clean.
    notice.value = route.query.notice.slice(0, 300)
    const query = { ...route.query }
    delete query.notice
    router.replace({ query })
  }
  load()
})
</script>
