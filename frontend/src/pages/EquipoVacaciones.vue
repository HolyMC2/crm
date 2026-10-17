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
      <h1 class="text-2xl font-semibold text-ink-gray-9">
        {{ __('Statutory vacations') }}
      </h1>
      <p class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'Vacation days by law for each year of service ({0}). Each person gets this year’s days; nothing is assigned backwards.',
            [config?.law || 'LFT'],
          )
        }}
      </p>

      <section v-if="failure" role="alert" class="space-y-3 py-4">
        <p class="text-base text-ink-gray-8">
          {{ failure.detail || failure.message }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Equipo')" @click="load" />
          <Button :label="__('Back to Equipo')" @click="goBack" />
        </div>
      </section>
      <div v-else-if="!config" role="status" class="py-10 text-sm">
        {{ __('Loading…', null, 'Equipo') }}
      </div>

      <template v-else>
        <FormControl
          v-if="companies.length > 1"
          class="mb-4 sm:max-w-xs"
          type="select"
          :label="__('Company', null, 'Equipo')"
          :model-value="company"
          :options="
            companies.map((c) => ({ label: c.company, value: c.company }))
          "
          @update:model-value="(value) => (company = value)"
        />
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
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ problem }}
        </div>

        <p
          v-if="config.limit"
          role="status"
          class="mb-4 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{ config.limit.message }}
          <RouterLink class="underline" to="/equipo">{{
            __('Back to Equipo')
          }}</RouterLink>
        </p>
        <!-- Setup that must exist first: which leave type is vacation. -->
        <section
          v-if="config.guard"
          class="mb-4 space-y-3 rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-4 text-sm"
        >
          <p class="text-ink-amber-8">{{ config.guard.message }}</p>
          <template
            v-if="leaveTypes.length && config.guard.code !== 'not_mexico'"
          >
            <FormControl
              v-model="leaveType"
              type="select"
              class="sm:max-w-xs"
              :label="__('Paid leave type used for vacations')"
              :placeholder="__('Choose an option')"
              :options="leaveTypes.map((t) => ({ label: t, value: t }))"
            />
            <Button
              variant="solid"
              :label="__('Save leave type')"
              :disabled="!leaveType"
              :loading="saving"
              @click="saveLeaveType"
            />
          </template>
        </section>

        <template v-else>
          <section
            class="mb-4 space-y-3 rounded-lg border border-outline-gray-2 p-4"
          >
            <label
              class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-8"
            >
              <input v-model="enabled" type="checkbox" class="rounded" />
              {{ __('Assign the new days automatically on each anniversary') }}
            </label>
            <FormControl
              v-model="expiry"
              type="number"
              class="sm:max-w-xs"
              :label="
                __(
                  'Unused days carry over and expire this many days after their year starts',
                )
              "
            />
            <p class="text-sm text-ink-amber-8">
              {{
                __(
                  'We suggest {0} days (six months to take them plus one year). Confirm it with your accountant.',
                  [config.default_expiry_days],
                )
              }}
            </p>
            <Button
              :label="__('Save', null, 'Equipo')"
              :loading="saving"
              @click="saveSettings"
            />
          </section>

          <section class="rounded-lg border border-outline-gray-2">
            <header
              class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 p-4"
            >
              <h2
                class="min-w-0 flex-1 text-base font-semibold text-ink-gray-9"
              >
                {{ __('Who gets days this year') }}
              </h2>
              <Button
                variant="solid"
                :label="__('Assign ({0})', [selected.length])"
                :disabled="!selected.length"
                :loading="applying"
                class="min-h-11 sm:min-h-8"
                @click="apply"
              />
            </header>
            <p v-if="!config.rows.length" class="p-4 text-sm text-ink-gray-6">
              {{ __('No active people in this company.') }}
            </p>
            <ul v-else class="divide-y divide-outline-gray-1">
              <li
                v-for="row in config.rows"
                :key="row.employee"
                class="flex min-h-14 items-start gap-3 px-4 py-3"
              >
                <input
                  type="checkbox"
                  class="mt-1 rounded"
                  :aria-label="row.employee_name"
                  :disabled="row.status !== 'ready'"
                  :checked="selected.includes(row.employee)"
                  @change="toggle(row.employee, $event.target.checked)"
                />
                <span class="min-w-0 flex-1">
                  <RouterLink
                    :to="personRoute(row.employee)"
                    class="block truncate font-medium text-ink-gray-9 hover:underline"
                    >{{ row.employee_name }}</RouterLink
                  >
                  <span class="block text-sm text-ink-gray-6">{{
                    row.message
                  }}</span>
                </span>
                <Badge
                  :theme="lftTheme(row.status)"
                  :label="lftLabel(row.status)"
                />
                <a
                  v-if="row.status === 'no_joining_date'"
                  class="min-h-11 text-sm text-ink-blue-link underline"
                  :href="`/app/employee/${encodeURIComponent(row.employee)}`"
                  >{{ __('Add start date') }}</a
                >
              </li>
            </ul>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl } from 'frappe-ui'
import {
  AUSENCIAS,
  LFT,
  equipoApi,
  lftLabel,
  lftTheme,
  personRoute,
  problemOf,
  readyEmployees,
  requestId,
} from '@/composables/useEquipo'

const route = useRoute()
const router = useRouter()
const companies = ref([])
const company = ref('')
const failure = ref(null)
const problem = ref('')
const notice = ref('')
const saving = ref(false)
const applying = ref(false)
const enabled = ref(false)
const expiry = ref(548)
const selected = ref([])
const leaveTypes = ref([])
const leaveType = ref('')
// One key per «Asignar» press; a retry after a lost answer reuses it.
let applyKey = null

const config = computed(
  () => companies.value.find((c) => c.company === company.value) || null,
)

function adopt(next) {
  enabled.value = Boolean(next?.enabled)
  expiry.value = next?.expiry_days || next?.default_expiry_days || 548
  const ready = readyEmployees(next?.rows)
  const only =
    typeof route.query.employee === 'string' ? route.query.employee : ''
  selected.value = only ? ready.filter((e) => e === only) : ready
}
function replaceConfig(next) {
  companies.value = companies.value.map((c) =>
    c.company === next.company ? next : c,
  )
  adopt(next)
}

async function load() {
  failure.value = null
  try {
    const answer = await equipoApi(`${LFT}.get_config`)
    if (!answer?.ok) {
      failure.value = answer
      return
    }
    // ERPNext's test companies start with «_» («_Test Company»): a worker never
    // works in one, so they are not offered as the default.
    companies.value = (answer.companies || []).filter(
      (c) => !String(c.company || '').startsWith('_'),
    )
    if (!companies.value.some((c) => c.company === company.value))
      company.value = companies.value[0]?.company || ''
    adopt(config.value)
    if (config.value?.guard) await loadLeaveTypes()
  } catch (error) {
    failure.value = problemOf(error)
  }
}
async function loadLeaveTypes() {
  const answer = await equipoApi(`${AUSENCIAS}.get_config`)
  leaveTypes.value = answer?.leave_types || []
  leaveType.value = config.value?.leave_type || ''
}
async function saveLeaveType() {
  saving.value = true
  problem.value = ''
  try {
    const current = await equipoApi(`${AUSENCIAS}.get_config`)
    const row = (current?.companies || []).find(
      (c) => c.company === company.value,
    )
    const answer = await equipoApi(`${AUSENCIAS}.save_config`, {
      company: company.value,
      leave_type: leaveType.value,
      enabled: row?.enabled ? 1 : 0,
    })
    if (!answer?.ok) problem.value = answer?.message
    await load()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    saving.value = false
  }
}
async function saveSettings() {
  saving.value = true
  problem.value = ''
  try {
    const answer = await equipoApi(`${LFT}.save_config`, {
      company: company.value,
      enabled: enabled.value ? 1 : 0,
      expiry_days: Number(expiry.value) || '',
    })
    if (!answer?.ok) problem.value = answer?.message
    else {
      notice.value = answer.message
      replaceConfig(answer)
    }
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    saving.value = false
  }
}
function toggle(employee, on) {
  selected.value = on
    ? [...new Set([...selected.value, employee])]
    : selected.value.filter((e) => e !== employee)
}
async function apply() {
  applying.value = true
  problem.value = ''
  applyKey ??= requestId()
  try {
    const answer = await equipoApi(`${LFT}.apply`, {
      company: company.value,
      employees: selected.value,
      key: applyKey,
    })
    applyKey = null
    if (!answer?.ok) {
      problem.value = answer?.message
      return
    }
    notice.value = answer.message
    replaceConfig(answer)
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    applying.value = false
  }
}
function goBack() {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  router.push(list.startsWith('/equipo') ? list : '/equipo')
}

watch(company, () => {
  adopt(config.value)
  if (config.value?.guard) loadLeaveTypes()
})
onMounted(load)
</script>
