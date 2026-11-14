<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div
      class="mx-auto w-full px-4 pb-28 pt-4 sm:px-6 sm:pb-10"
      :class="paid ? 'max-w-7xl' : 'max-w-5xl'"
    >
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
      <p
        v-if="paid"
        class="mb-4 text-sm text-ink-gray-6"
        data-testid="prenomina-subtitulo"
      >
        {{
          __(
            'Lo que trabajó cada quien en el periodo, lo que ya se le dio y lo que falta.',
          )
        }}
      </p>
      <p v-else class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'Days and hours worked, vacations and open advances per person, before paying. Nothing here changes payroll.',
          )
        }}
      </p>

      <!-- «¿Cómo pagas a tu equipo?»: only where doco offers the setup and to
           whom may save it (prenominaDoor); otherwise nothing renders here. -->
      <RouterLink
        v-if="door === 'card'"
        :to="comoPagoTo"
        class="press mb-4 flex min-h-16 items-center gap-3 rounded-8 border border-outline-gray-2 p-3 hover:bg-surface-gray-1"
        data-testid="prenomina-como-pago-card"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base font-semibold text-ink-gray-9">{{
            __('¿Cómo pagas a tu equipo?')
          }}</span>
          <span class="block text-sm text-ink-gray-6">{{
            __(
              'Contesta 4 preguntas para que Muelle te diga cuánto le toca a cada quien.',
            )
          }}</span>
        </span>
        <span
          class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
          aria-hidden="true"
        />
      </RouterLink>
      <RouterLink
        v-else-if="door === 'link'"
        :to="comoPagoTo"
        class="press mb-3 flex min-h-11 w-fit items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
        data-testid="prenomina-como-pago-link"
      >
        {{ __('Cómo pagas a tu equipo') }}
      </RouterLink>

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
        <template v-else-if="answer.rows.length">
          <dl
            v-if="paid"
            class="mb-4 flex flex-wrap gap-x-6 gap-y-2"
            data-testid="prenomina-totales"
          >
            <div v-if="owed" data-testid="prenomina-total-le-toca">
              <dt class="text-sm text-ink-gray-6">{{ __('Le toca') }}</dt>
              <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
                {{ money(totals.le_toca) }}
              </dd>
            </div>
            <div data-testid="prenomina-total-pagado">
              <dt class="text-sm text-ink-gray-6">{{ __('Ya se le dio') }}</dt>
              <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
                {{ money(totals.pagado) }}
              </dd>
              <dd class="text-xs text-ink-gray-6">
                {{
                  totals.pagos === 1
                    ? __('1 pago')
                    : __('{0} pagos', [totals.pagos])
                }}
              </dd>
            </div>
            <div v-if="owed" data-testid="prenomina-total-le-falta">
              <dt class="text-sm text-ink-gray-6">{{ __('Le falta') }}</dt>
              <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
                {{ money(totals.le_falta) }}
              </dd>
            </div>
          </dl>

          <!-- Phone with «Ya se le dio»: one person per row, the money first. -->
          <ul
            v-if="paid && isPhone"
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            data-testid="prenomina-personas"
          >
            <li
              v-for="row in answer.rows"
              :key="row.employee"
              class="space-y-2 p-3"
              data-testid="prenomina-persona"
              :data-employee="row.employee"
            >
              <div>
                <RouterLink
                  :to="personRoute(row.employee, { list: route.fullPath })"
                  class="block text-base font-medium text-ink-gray-9 hover:underline"
                  >{{ row.employee_name }}</RouterLink
                >
                <span
                  v-if="row.designation"
                  class="block text-sm text-ink-gray-6"
                  >{{ row.designation }}</span
                >
              </div>
              <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                <template v-if="rowAmount(row, 'le_toca') !== null">
                  <dt class="text-ink-gray-7">{{ __('Le toca') }}</dt>
                  <dd
                    class="text-right tabular-nums text-ink-gray-9"
                    data-testid="prenomina-le-toca"
                  >
                    {{ money(row.le_toca) }}
                  </dd>
                  <dd
                    v-for="line in reasons(row)"
                    :key="line"
                    class="col-span-2 text-xs text-ink-gray-6"
                  >
                    {{ line }}
                  </dd>
                </template>
                <dt class="text-ink-gray-7">{{ __('Ya se le dio') }}</dt>
                <dd
                  class="text-right tabular-nums text-ink-gray-9"
                  data-testid="prenomina-pagado"
                >
                  {{ money(row.pagado || 0) }}
                </dd>
                <dd
                  v-for="pago in row.pagos || []"
                  :key="pago.name"
                  class="col-span-2 text-xs text-ink-gray-6"
                >
                  {{ conceptoLabel(pago.concepto) }}: {{ pagoLine(pago) }}
                </dd>
                <template v-if="rowAmount(row, 'le_falta') !== null">
                  <dt class="font-medium text-ink-gray-8">
                    {{ __('Le falta') }}
                  </dt>
                  <dd
                    class="text-right font-semibold tabular-nums"
                    :class="FALTA_TONE[falta(row).tone]"
                    data-testid="prenomina-le-falta"
                  >
                    {{ falta(row).text }}
                  </dd>
                </template>
              </dl>
              <p class="text-xs text-ink-gray-6">
                {{ workedLine(row) }}
              </p>
              <ul v-if="row.faltantes.length" class="space-y-1 text-sm">
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
            </li>
          </ul>

          <div
            v-else
            class="overflow-x-auto rounded-6 border border-outline-gray-2"
            data-testid="prenomina-tabla"
          >
            <table class="w-full text-left text-sm" :class="tableWidth">
              <thead class="border-b border-outline-gray-2 text-ink-gray-6">
                <tr>
                  <th scope="col" class="p-3 font-medium">
                    {{ __('Person') }}
                  </th>
                  <th scope="col" class="p-3 text-right font-medium">
                    {{ __('Days present') }}
                  </th>
                  <th scope="col" class="p-3 text-right font-medium">
                    {{ __('Hours worked') }}
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
                  <th
                    v-if="answer.bonuses"
                    scope="col"
                    class="p-3 text-right font-medium"
                  >
                    <RouterLink
                      :to="{ name: 'EquipoBonos', query: bonosQuery }"
                      class="underline"
                      >{{ __('Bonuses') }}</RouterLink
                    >
                  </th>
                  <th
                    v-if="owed"
                    scope="col"
                    class="p-3 text-right font-medium"
                    data-testid="prenomina-col-le-toca"
                  >
                    {{ __('Le toca') }}
                  </th>
                  <th
                    v-if="paid"
                    scope="col"
                    class="p-3 text-right font-medium"
                    data-testid="prenomina-col-pagado"
                  >
                    {{ __('Ya se le dio') }}
                  </th>
                  <th
                    v-if="owed"
                    scope="col"
                    class="p-3 text-right font-medium"
                    data-testid="prenomina-col-le-falta"
                  >
                    {{ __('Le falta') }}
                  </th>
                  <th scope="col" class="p-3 font-medium">
                    {{ paid ? __('Por revisar') : __('Missing to pay') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-gray-1">
                <tr
                  v-for="row in answer.rows"
                  :key="row.employee"
                  class="align-top"
                  data-testid="prenomina-fila"
                  :data-employee="row.employee"
                >
                  <th scope="row" class="p-3 font-normal">
                    <RouterLink
                      :to="personRoute(row.employee, { list: route.fullPath })"
                      class="block font-medium text-ink-gray-9 hover:underline"
                      >{{ row.employee_name }}</RouterLink
                    >
                    <span
                      v-if="row.designation"
                      class="block text-ink-gray-6"
                      >{{ row.designation }}</span
                    >
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
                  <td
                    class="p-3 text-right tabular-nums text-ink-gray-9"
                    :data-hours="row.employee"
                  >
                    {{ hoursText(row.hours) }}
                    <span
                      v-for="line in overtimeLines(row.hours)"
                      :key="line"
                      class="block text-xs text-ink-gray-6"
                      >{{ line }}</span
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
                  <td
                    v-if="answer.bonuses"
                    class="p-3 text-right tabular-nums text-ink-gray-9"
                    :data-bonus="row.employee"
                  >
                    {{ money(row.bonus?.amount || 0) }}
                    <span
                      v-for="bono in row.bonus?.bonos || []"
                      :key="`${bono.bono_name}-${bono.start}`"
                      class="block text-xs text-ink-gray-6"
                      >{{ bono.bono_name }}: {{ money(bono.amount) }}</span
                    >
                  </td>
                  <td
                    v-if="owed"
                    class="p-3 text-right tabular-nums text-ink-gray-9"
                    data-testid="prenomina-le-toca"
                  >
                    {{
                      rowAmount(row, 'le_toca') === null
                        ? '—'
                        : money(row.le_toca)
                    }}
                    <span
                      v-for="line in reasons(row)"
                      :key="line"
                      class="block whitespace-nowrap text-xs text-ink-gray-6"
                      >{{ line }}</span
                    >
                  </td>
                  <td
                    v-if="paid"
                    class="p-3 text-right tabular-nums text-ink-gray-9"
                    data-testid="prenomina-pagado"
                  >
                    {{ money(row.pagado || 0) }}
                    <span
                      v-for="pago in row.pagos || []"
                      :key="pago.name"
                      class="block whitespace-nowrap text-xs text-ink-gray-6"
                      >{{ pagoLine(pago) }}</span
                    >
                  </td>
                  <td
                    v-if="owed"
                    class="p-3 text-right font-semibold tabular-nums"
                    :class="FALTA_TONE[falta(row).tone] || 'text-ink-gray-9'"
                    data-testid="prenomina-le-falta"
                  >
                    {{ falta(row).text }}
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
                  <td class="p-3 text-right tabular-nums">
                    {{
                      answer.totals.hours_worked === undefined
                        ? '—'
                        : hoursText({ worked: answer.totals.hours_worked })
                    }}
                  </td>
                  <td class="p-3" />
                  <td class="p-3 text-right tabular-nums">
                    {{ daysText(answer.totals.leave_days) }}
                  </td>
                  <td class="p-3 text-right tabular-nums">
                    {{ advancesText(answer.totals.advances) }}
                  </td>
                  <td
                    v-if="answer.bonuses"
                    class="p-3 text-right tabular-nums"
                    data-testid="prenomina-bonus-total"
                  >
                    {{ money(answer.totals.bonus || 0) }}
                  </td>
                  <td v-if="owed" class="p-3 text-right tabular-nums">
                    {{ money(totals.le_toca) }}
                  </td>
                  <td v-if="paid" class="p-3 text-right tabular-nums">
                    {{ money(totals.pagado) }}
                  </td>
                  <td v-if="owed" class="p-3 text-right tabular-nums">
                    {{ money(totals.le_falta) }}
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

          <section
            v-if="paid"
            class="mt-6 max-w-3xl"
            aria-labelledby="prenomina-pagos-titulo"
            data-testid="prenomina-pagos"
          >
            <h2
              id="prenomina-pagos-titulo"
              class="mb-2 text-lg font-semibold text-ink-gray-9"
            >
              {{ paymentsTitle(answer.period?.kind) }}
            </h2>
            <p
              v-if="!payments.length"
              class="text-sm text-ink-gray-6"
              data-testid="prenomina-pagos-vacio"
            >
              {{
                __(
                  'Aquí aparecen los pagos de la caja, la caja fuerte y Muelle desde que contestaste «¿Cómo pagas a tu equipo?». Lo que pagaste antes no se cuenta.',
                )
              }}
            </p>
            <ul
              v-else
              class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            >
              <li
                v-for="pago in payments"
                :key="pago.name"
                class="flex items-start gap-3 p-3 text-sm"
                data-testid="prenomina-pago"
                :data-employee="pago.employee"
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-medium text-ink-gray-9">{{
                    pago.employee_name
                  }}</span>
                  <span class="block text-ink-gray-6"
                    >{{ conceptoLabel(pago.concepto) }},
                    {{ origenLabel(pago.origen) }}</span
                  >
                </span>
                <span class="flex-none text-right">
                  <span
                    class="block font-medium tabular-nums text-ink-gray-9"
                    >{{ money(pago.monto) }}</span
                  >
                  <span class="block text-ink-gray-6">{{
                    payDay(pago.fecha)
                  }}</span>
                </span>
              </li>
            </ul>
          </section>
        </template>
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
  AJUSTES_GET,
  COMO_PAGO_ROUTE,
  advancesText,
  daysText,
  equipoApi,
  hoursText,
  liftAction,
  conceptoLabel,
  faltaText,
  origenLabel,
  overtimeLines,
  owedShown,
  pagoLine,
  paidShown,
  payDay,
  payTotals,
  paymentsTitle,
  periodPayments,
  rowAmount,
  periodFromQuery,
  periodQuery,
  periodRange,
  personRoute,
  prenominaDoor,
  problemOf,
} from '@/composables/useEquipo'
import { bonosPeriodQuery } from '@/composables/useBonos'
import { money } from '@/utils/numberFormat'
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
// The bonuses column opens Bonos on the same pay period's first day.
const bonosQuery = computed(() =>
  bonosPeriodQuery(wanted.value.period, answer.value?.period?.start || null),
)

// «Ya se le dio» and «Le toca / Le falta»: only when doco's read carries them.
const paid = computed(() => paidShown(answer.value))
const owed = computed(() => paid.value && owedShown(answer.value))
const totals = computed(() => payTotals(answer.value))
const payments = computed(() =>
  paid.value ? periodPayments(answer.value.rows) : [],
)
// Literal classes so the build keeps them: one step per extra column. With the
// money columns the page widens to max-w-7xl, so four extra still fit at 1280 px.
const WIDTHS = [
  'min-w-[50rem]',
  'min-w-[56rem]',
  'min-w-[61rem]',
  'min-w-[66rem]',
  'min-w-[71rem]',
]
const tableWidth = computed(() => {
  const extra =
    (answer.value?.bonuses ? 1 : 0) +
    (paid.value ? 1 : 0) +
    (owed.value ? 2 : 0)
  return WIDTHS[extra]
})
const FALTA_TONE = {
  due: 'text-ink-gray-9',
  done: 'text-ink-green-8',
  over: 'text-ink-amber-8',
}
function falta(row) {
  return faltaText(rowAmount(row, 'le_falta'))
}
/** The «porque» lines behind «Le toca», when doco sends them. */
function reasons(row) {
  return Array.isArray(row.porque)
    ? row.porque.filter((line) => typeof line === 'string' && line)
    : []
}
/** The phone row's second line: what the table's other columns say. */
function workedLine(row) {
  const parts = []
  if (row.days_present !== null && row.days_present !== undefined)
    parts.push(window.__('{0} días', [daysText(row.days_present)]))
  if (row.hours) parts.push(hoursText(row.hours))
  if (Number(row.days_absent) > 0)
    parts.push(window.__('{0} de falta', [daysText(row.days_absent)]))
  if (Number(row.leave_days) > 0)
    parts.push(window.__('{0} de vacaciones', [daysText(row.leave_days)]))
  if (row.advances?.length)
    parts.push(window.__('adelantos {0}', [advancesText(row.advances)]))
  if (answer.value?.bonuses && row.bonus?.amount)
    parts.push(window.__('bonos {0}', [money(row.bonus.amount)]))
  return parts.join(', ')
}

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

// The pay setup's door: a site without doco.nomina, or a refusal, leaves it null.
const ajustes = ref(null)
const door = computed(() => prenominaDoor(ajustes.value))
const comoPagoTo = computed(() => ({
  ...COMO_PAGO_ROUTE,
  query: { list: route.fullPath },
}))
equipoApi(AJUSTES_GET)
  .then((next) => (ajustes.value = next))
  .catch(() => (ajustes.value = null))

watch(wanted, load, { immediate: true, deep: true })
</script>
