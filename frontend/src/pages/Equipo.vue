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
    <!-- One scroller, the header inside it (Shell C5), and the page
         `relative` so the phone's «Dar de alta» FAB sits over the list. -->
    <div v-else class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="min-h-0 flex-1 overflow-y-auto"
        :class="fab ? 'pb-24' : 'pb-6'"
        data-equipo-scroller
      >
        <!-- A phone names the list once: the list picker is the title -->
        <PageHeader
          :title="isPhone ? '' : segmentLabel(segment)"
          :subtitle="isPhone ? '' : subtitle"
          :level="1"
        >
          <div v-if="isPhone" class="space-y-1">
            <h1 class="sr-only">{{ segmentLabel(segment) }}</h1>
            <select
              class="h-11 w-full rounded-4 border-transparent bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:border-outline-gray-4 focus:ring-0"
              :aria-label="__('List', null, 'Equipo')"
              :value="segment"
              @change="selectSegment($event.target.value)"
            >
              <option v-for="e in entries" :key="e.value" :value="e.value">
                {{ e.label }}
              </option>
            </select>
            <p v-if="subtitle" class="text-sm leading-snug text-ink-gray-6">
              {{ subtitle }}
            </p>
          </div>
          <template
            v-if="
              caps.hr ||
              caps.configure ||
              caps.hire ||
              caps.bonos ||
              caps.invite
            "
            #actions
          >
            <Button
              v-if="caps.hr"
              :icon-left="LucideWallet"
              :label="__('Pre-payroll')"
              class="min-h-11 sm:min-h-8"
              @click="router.push({ name: 'EquipoPrenomina' })"
            />
            <Button
              v-if="caps.bonos"
              :icon-left="LucideGift"
              :label="__('Bonuses')"
              class="min-h-11 sm:min-h-8"
              @click="router.push({ name: 'EquipoBonos' })"
            />
            <Button
              v-if="caps.configure"
              :icon-left="LucideCalendar"
              :label="__('Statutory vacations')"
              class="min-h-11 sm:min-h-8"
              @click="router.push({ name: 'EquipoVacaciones' })"
            />
            <!-- Every puesto but a technician: Abordo's invitation. On a phone
                 without «Agregar técnico» it is the page's one FAB instead. -->
            <Button
              v-if="caps.invite && (caps.hire || !isPhone)"
              :variant="caps.hire ? 'subtle' : 'solid'"
              :icon-left="LucideUserPlus"
              :label="__('Invite someone', null, 'Equipo')"
              class="min-h-11 sm:min-h-8"
              data-testid="equipo-invitar"
              @click="openInvite"
            />
            <Button
              v-if="caps.hire && !isPhone"
              variant="solid"
              :icon-left="LucideUserPlus"
              :label="__('Add a person', null, 'Equipo')"
              class="min-h-11 sm:min-h-8"
              @click="openAlta()"
            />
          </template>
        </PageHeader>
        <section
          v-if="!caps.hr && !hrDismissed"
          role="status"
          class="mx-4 mb-3 space-y-2 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8 sm:mx-6"
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
          v-if="noAccess"
          role="status"
          class="mx-4 mb-3 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8 sm:mx-6"
        >
          <p>
            {{
              __(
                'To see the team you need access to employee records. Ask whoever runs the shop to give it to you.',
                null,
                'Equipo',
              )
            }}
          </p>
        </section>
        <section
          v-if="limit"
          role="status"
          class="mx-4 mb-3 space-y-2 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8 sm:mx-6"
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
        <div
          v-if="notice"
          role="status"
          class="mx-4 mb-3 rounded-6 bg-surface-green-1 p-3 text-sm text-ink-green-8 sm:mx-6"
        >
          {{ notice }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mx-4 mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, 'Equipo')"
            @click="load()"
          />
        </div>
        <div>
          <div
            v-if="loading && !rows.length"
            role="status"
            class="px-6 py-8 text-sm text-ink-gray-6"
          >
            {{ __('Loading the team…') }}
          </div>
          <div
            v-else-if="!rows.length && !noAccess"
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
              :key="rowKey(row)"
              :data-fresh="live.fresh.value.has(rowKey(row)) ? '' : undefined"
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
                <!-- Nobody named it: a person icon, not the «S» of «Sin nombre». -->
                <Avatar :label="rowName(row)" :image="row.image" size="lg">
                  <template v-if="!hasName(row)" #default>
                    <span class="lucide-user-round size-4" aria-hidden="true" />
                  </template>
                </Avatar>
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate font-medium text-ink-gray-9"
                    data-testid="equipo-row-name"
                  >
                    {{ rowName(row) }}
                  </span>
                  <span class="block truncate text-sm text-ink-gray-6">
                    {{ rowDetail(row) }}
                  </span>
                  <span
                    v-if="!hasName(row)"
                    class="block text-sm text-ink-gray-6"
                    data-testid="equipo-row-unnamed"
                  >
                    {{ __('They can write their name in My profile.') }}
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
                    <!-- Read-only, for the owner: who signs in with a code. -->
                    <Badge
                      v-if="row.two_step"
                      theme="gray"
                      :label="__('Two-step verification', null, 'Equipo')"
                    >
                      <template #prefix>
                        <span
                          class="lucide-shield-check size-3"
                          aria-hidden="true"
                        />
                      </template>
                    </Badge>
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
      </div>
      <Fab
        v-if="fab"
        :label="
          caps.hire
            ? __('Add a person', null, 'Equipo')
            : __('Invite someone', null, 'Equipo')
        "
        icon="lucide-user-plus"
        @click="caps.hire ? openAlta() : openInvite()"
      />
    </div>
    <SeatStepSheet v-if="seatStep" :step="seatStep" />
    <InvitarSheet
      v-if="inviteMounted"
      :open="inviteOpen"
      @close="inviteOpen = false"
      @invited="afterInvite"
      @tecnico="tecnicoFromInvite"
    />
  </ModuleLayout>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Button } from 'frappe-ui'
import { Fab, PageHeader } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  equipoApi,
  equipoBoot,
  lazySeatStep,
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
import LucideCalendar from '~icons/lucide/calendar'
import LucideGift from '~icons/lucide/gift'
import LucideUserPlus from '~icons/lucide/user-plus'
import LucideWallet from '~icons/lucide/wallet'
import { createListCache } from '@/utils/listCache'
import { useLiveList } from '@/composables/liveList'
import { shellBoot } from '@/composables/muelleShell'
import { safeReturnPath } from '@/utils/returnPath'
import { cuentaAllowed } from '@/utils/shellRoutes'

// Mi cuenta's quote sheet, on the first alta the plan's cap refuses.
const SeatStepSheet = defineAsyncComponent(
  () => import('@/components/cuenta/SeatStepSheet.vue'),
)
// Abordo's invitation, for every puesto but a technician; mounts on its first open.
const InvitarSheet = defineAsyncComponent(
  () => import('@/components/primeros/InvitarSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const boot = equipoBoot
const caps = computed(() => boot.value?.capabilities || {})
// The one create action of the list: a FAB on a phone, a header button else.
const rows = ref([])
const counts = ref({})
const loading = ref(false)
const problem = ref(null)
const notice = ref('')
const asking = ref(false)
const asked = ref('')
const hrDismissed = ref(false)
const limit = ref(null)
const noAccess = ref(false)
// Without access to the team the banner is the whole answer: no FAB.
const fab = computed(
  () =>
    isPhone.value &&
    Boolean(caps.value.hire || caps.value.invite) &&
    !noAccess.value,
)
const inviteMounted = ref(false)
const inviteOpen = ref(false)
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
// A full plan in the alta: the owner adds one user in place (seatStep.js).
const {
  step: seatStep,
  offer: seatOffer,
  dispose: disposeSeatStep,
} = lazySeatStep({
  allowed: () => cuentaAllowed(shellBoot.value),
  navigate: (to) => router.push(to),
})
onBeforeUnmount(disposeSeatStep)

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

// A person by name; an account nobody named yet reads «Sin nombre», never its login.
function hasName(row) {
  return Boolean(row.full_name || row.employee_name)
}
function rowName(row) {
  return row.full_name || row.employee_name || __('No name', null, 'Equipo')
}
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

// The list's last answer paints at once on a visit or a segment change. The
// URL's segment names it: the normalized one waits for the boot.
const listCache = createListCache('equipo', () => [
  String(route.query.segment || ''),
])
function showPage(page) {
  rows.value = page.rows || []
  counts.value = page.counts || {}
  // No access to employee records: the backend guard is an English role name
  // and admin copy. The page says it in worker words instead (see noAccess).
  noAccess.value = page.guard?.code === 'no_employee_access'
  limit.value = noAccess.value ? null : page.guard || null
}
function paintCached() {
  listCache.paint(showPage)
}

// `quiet` (a live refresh): no spinner, and a failed read keeps the list.
async function load({ quiet = false } = {}) {
  const current = ++ticket
  const listAt = listCache.key()
  loading.value = !quiet
  if (!quiet) problem.value = null
  try {
    const page = await equipoApi('list_people', { segment: segment.value })
    if (current !== ticket) return
    showPage(page)
    listCache.save(listAt, page)
  } catch (error) {
    if (current === ticket && !quiet) problem.value = problemOf(error)
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
// `back`: the screen that sent the worker here (Hoy's «Agregar técnico»). The
// sheet's receipt carries the access link to share, so the way back waits for
// «Listo» (the sheet's close), and says the alta is done when it is.
function openAlta(back = '') {
  let added = false
  sheet((s) =>
    s.openAlta({
      draftKey: 'crm:equipo',
      seatStep: seatOffer,
      onDone: () => {
        added = true
        if (back) return
        notice.value = __('Person added. They appear in the team list.')
        load()
      },
      onClose: () => {
        if (!back) return load()
        const url = new URL(back, 'https://muelle.invalid')
        if (added) url.searchParams.set('done', 'tecnico')
        router.replace(url.pathname.slice(4) + url.search)
      },
    }),
  )
}
function openInvite() {
  inviteMounted.value = true
  inviteOpen.value = true
}
function afterInvite() {
  notice.value = __('Invitation ready. They appear in the team list.')
  load()
}
function tecnicoFromInvite() {
  inviteOpen.value = false
  if (caps.value.hire) openAlta()
}
// ?alta=tecnico (Hoy's «Agregar técnico»): the alta opens at once, and the
// query leaves so a reload or back does not open it again.
function followAlta() {
  if (route.query.alta !== 'tecnico') return
  const back = safeReturnPath(route.query.return_to)
  const query = { ...route.query }
  for (const name of ['alta', 'return_to', 'return_label']) delete query[name]
  router.replace({ query })
  if (caps.value.hire) openAlta(back.startsWith('/crm/') ? back : '')
}
function openPerson(row) {
  sheet((s) =>
    s.openPerson({
      user: row.user,
      seatStep: seatOffer,
      onChange: load,
      onClose: load,
    }),
  )
}
function openShift(row) {
  sheet((s) =>
    s.openShift({
      employee: row.employee,
      onDone: () => {
        notice.value = __('Shift assigned to {0}.', [rowName(row)])
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

// A person added, a leave approved or a shift assigned elsewhere shows
// without a reload; a new person is marked for a moment.
const rowKey = (row) => row.name || row.employee || row.user
const live = useLiveList(
  () =>
    boot.value?.enabled
      ? ['Employee', 'Leave Application', 'Shift Assignment']
      : '',
  async () => {
    if (route.name !== 'Equipo') return
    const before = rows.value.map(rowKey)
    await load({ quiet: true })
    live.mark(before, rows.value.map(rowKey))
  },
)

watch(
  () => route.query.segment,
  () => {
    if (route.name !== 'Equipo' || !boot.value?.enabled) return
    paintCached()
    load()
  },
)
onMounted(async () => {
  // The last answer shows before the boot and the read even start.
  paintCached()
  await loadEquipoBoot()
  if (!boot.value?.enabled) return
  if (typeof route.query.notice === 'string') {
    // A decision made on a person's page: say it once, keep the queue's URL clean.
    notice.value = route.query.notice.slice(0, 300)
    const query = { ...route.query }
    delete query.notice
    router.replace({ query })
  }
  followAlta()
  load()
})
</script>
