<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <!-- On a phone the shell's app bar has the back arrow (meta.listParent). -->
      <nav v-if="!isPhone" class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="router.push('/equipo')"
        >
          <LucideArrowLeft class="h-4 w-4" />
          {{ __('Back to Equipo') }}
        </button>
      </nav>
      <h1
        class="break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
      >
        {{ __('Pre-payroll') }}
      </h1>
      <p class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'Days worked, vacations and open advances per person, before paying. Nothing here changes payroll.',
          )
        }}
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div v-if="periodOptions.length" class="w-full sm:w-64">
          <Segmented
            :label="__('Pay period')"
            :options="periodOptions"
            :model-value="wanted.period"
            @update:model-value="(value) => go(value, null)"
          />
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            class="min-h-11 sm:min-h-8"
            :aria-label="__('Previous period')"
            :disabled="!answer"
            @click="go(wanted.period, answer.period.previous)"
          >
            <LucideChevronLeft class="h-4 w-4" />
          </Button>
          <span class="min-w-0 text-sm font-medium text-ink-gray-8">{{
            periodRange(answer?.period)
          }}</span>
          <Button
            variant="ghost"
            class="min-h-11 sm:min-h-8"
            :aria-label="__('Next period')"
            :disabled="!answer"
            @click="go(wanted.period, answer.period.next)"
          >
            <LucideChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <section v-if="failure" role="alert" class="space-y-3 py-4">
        <p class="text-base text-ink-gray-8">
          {{ failure.detail || failure.message }}
        </p>
        <Button :label="__('Retry', null, 'Equipo')" @click="load" />
      </section>
      <div v-else-if="!answer" role="status" class="py-10 text-sm">
        {{ __('Loading…', null, 'Equipo') }}
      </div>

      <template v-else>
        <p
          v-if="notice"
          role="status"
          class="mb-4 rounded-6 bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
        </p>
        <p
          v-if="problem"
          role="alert"
          class="mb-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ problem }}
        </p>
        <p
          v-if="!answer.stamping?.enabled"
          role="status"
          class="mb-4 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{ answer.stamping?.message }}
        </p>
        <p
          v-if="!answer.hr"
          role="status"
          class="mb-4 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{ answer.hr_reason }}
        </p>
        <section
          v-if="answer.guard"
          role="status"
          class="mb-4 space-y-2 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          <p>{{ answer.guard.message }}</p>
          <div v-if="lift" class="flex flex-wrap gap-2">
            <Button
              v-if="!confirmingLift"
              :label="lift.label"
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

        <p
          v-else-if="answer.hr && !answer.rows.length"
          class="py-6 text-sm text-ink-gray-6"
        >
          {{ __('No active people to show.') }}
        </p>
        <div
          v-else-if="answer.rows.length"
          class="overflow-x-auto rounded-6 border border-outline-gray-2"
        >
          <table class="w-full min-w-[44rem] text-left text-sm">
            <thead class="border-b border-outline-gray-2 text-ink-gray-6">
              <tr>
                <th scope="col" class="p-3 font-medium">
                  {{ __('Person') }}
                </th>
                <th scope="col" class="p-3 text-right font-medium">
                  {{ __('Days present') }}
                </th>
                <th scope="col" class="p-3 text-right font-medium">
                  {{ __('Absent days') }}
                </th>
                <th scope="col" class="p-3 text-right font-medium">
                  {{ __('Vacation days') }}
                </th>
                <th scope="col" class="p-3 text-right font-medium">
                  {{ __('Open advances') }}
                </th>
                <th scope="col" class="p-3 font-medium">
                  {{ __('Missing to pay') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-gray-1">
              <tr
                v-for="row in answer.rows"
                :key="row.employee"
                class="align-top"
              >
                <th scope="row" class="p-3 font-normal">
                  <RouterLink
                    :to="personRoute(row.employee, { list: route.fullPath })"
                    class="block font-medium text-ink-gray-9 hover:underline"
                    >{{ row.employee_name }}</RouterLink
                  >
                  <span v-if="row.designation" class="block text-ink-gray-6">{{
                    row.designation
                  }}</span>
                </th>
                <td class="p-3 text-right tabular-nums text-ink-gray-9">
                  {{ daysText(row.days_present) }}
                  <span
                    v-if="row.days_from_checkins"
                    class="block text-xs text-ink-gray-6"
                    >{{
                      __('{0} from check-ins', [row.days_from_checkins])
                    }}</span
                  >
                </td>
                <td class="p-3 text-right tabular-nums text-ink-gray-9">
                  {{ daysText(row.days_absent) }}
                </td>
                <td class="p-3 text-right tabular-nums text-ink-gray-9">
                  {{ daysText(row.leave_days) }}
                </td>
                <td class="p-3 text-right tabular-nums text-ink-gray-9">
                  {{ advancesText(row.advances) }}
                </td>
                <td class="p-3">
                  <ul v-if="row.faltantes.length" class="space-y-1">
                    <li
                      v-for="item in row.faltantes"
                      :key="item.key"
                      class="text-ink-amber-8"
                    >
                      <span class="font-medium">{{ item.label }}</span>
                      <span class="block text-xs text-ink-gray-6">{{
                        item.detalle
                      }}</span>
                    </li>
                  </ul>
                  <span v-else class="text-ink-green-8">{{
                    __('Nothing missing')
                  }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot class="border-t border-outline-gray-2 text-ink-gray-8">
              <tr>
                <th scope="row" class="p-3 font-medium">
                  {{ __('Total') }}
                </th>
                <td class="p-3 text-right tabular-nums">
                  {{ daysText(answer.totals.days_present) }}
                </td>
                <td class="p-3" />
                <td class="p-3 text-right tabular-nums">
                  {{ daysText(answer.totals.leave_days) }}
                </td>
                <td class="p-3 text-right tabular-nums">
                  {{ advancesText(answer.totals.advances) }}
                </td>
                <td class="p-3">
                  {{
                    __('{0} of {1} people with something missing', [
                      answer.totals.with_faltantes,
                      answer.totals.people,
                    ])
                  }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { Segmented } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  PRENOMINA,
  advancesText,
  daysText,
  equipoApi,
  liftAction,
  periodFromQuery,
  periodQuery,
  periodRange,
  personRoute,
  problemOf,
} from '@/composables/useEquipo'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'

const route = useRoute()
const router = useRouter()
const answer = ref(null)
const failure = ref(null)
const notice = ref('')
const problem = ref('')
const confirmingLift = ref(false)
const lifting = ref(false)

const wanted = computed(() => periodFromQuery(route.query))
const periodOptions = computed(() =>
  (answer.value?.periods || []).map((p) => ({
    value: p.value,
    label: p.label,
  })),
)
const lift = computed(() => liftAction(answer.value?.guard))

function go(period, start) {
  router.replace({ query: periodQuery(period, start) })
}

let asked = 0
async function load() {
  const ticket = ++asked
  failure.value = null
  try {
    const next = await equipoApi(PRENOMINA, {
      period: wanted.value.period,
      start: wanted.value.start,
    })
    if (ticket === asked) answer.value = next
  } catch (error) {
    if (ticket === asked) failure.value = problemOf(error)
  }
}
async function liftLimit() {
  lifting.value = true
  problem.value = ''
  try {
    notice.value = (
      await equipoApi('lift_own_limit', { employee: lift.value.employee })
    ).message
    confirmingLift.value = false
    load()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    lifting.value = false
  }
}

watch(wanted, load, { immediate: true, deep: true })
</script>
