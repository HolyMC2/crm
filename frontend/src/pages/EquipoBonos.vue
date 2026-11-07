<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
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
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h1
          class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
        >
          {{ __('Bonuses') }}
        </h1>
        <Button
          :icon-left="LucideSlidersHorizontal"
          :label="__('Bonus rules')"
          class="min-h-11 sm:min-h-8"
          data-testid="bonos-reglas"
          @click="
            router.push({
              name: 'EquipoBonosReglas',
              query: { list: route.fullPath },
            })
          "
        />
      </div>
      <p class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'What each person earns from the shop’s bonus rules. The pre-payroll shows it in the pay period that holds the bonus’s last day.',
          )
        }}
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="w-full sm:w-80">
          <Segmented
            :label="__('Bonus period')"
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
          <span
            class="min-w-0 text-sm font-medium text-ink-gray-8"
            data-testid="bonos-range"
            >{{ periodRange(answer?.period) }}</span
          >
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
        <section
          v-for="fix in answer.to_fix"
          :key="fix.source"
          role="status"
          class="mb-3 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          :data-fix="fix.source"
        >
          <p>{{ fix.message }}</p>
          <a
            :href="fix.url"
            class="mt-1 inline-flex min-h-11 items-center font-medium underline"
            >{{ fix.action }}</a
          >
        </section>
        <p
          v-if="answer.unavailable?.length"
          role="status"
          class="mb-3 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{
            __('{0}: this system can no longer measure what it counts.', [
              answer.unavailable.join(', '),
            ])
          }}
        </p>

        <div
          v-if="!answer.rules.length"
          class="rounded-6 border border-outline-gray-2 p-4 text-sm"
          data-testid="bonos-empty"
        >
          <p class="font-medium text-ink-gray-9">
            {{ __('There are no bonuses for this period yet.') }}
          </p>
          <p class="mt-1 text-ink-gray-6">
            {{
              answer.can_edit
                ? __(
                    'A bonus measures repairs or sales, each person’s or the whole team’s, against a goal, and pays per piece, a percentage or a fixed amount.',
                  )
                : __('The owner creates the bonuses.')
            }}
          </p>
          <Button
            v-if="answer.can_edit"
            variant="solid"
            class="mt-3 min-h-11 sm:min-h-8"
            :label="__('Create a bonus')"
            @click="
              router.push({
                name: 'EquipoBonosReglas',
                query: { nuevo: 1, list: route.fullPath },
              })
            "
          />
        </div>

        <template v-else>
          <ul
            v-if="answer.team.length"
            class="mb-4 grid gap-2"
            data-list="bonos-team"
          >
            <li
              v-for="goal in answer.team"
              :key="goal.rule"
              class="rounded-6 border border-outline-gray-2 p-3"
              :data-team="goal.rule"
            >
              <div class="flex items-baseline justify-between gap-3">
                <p class="min-w-0 font-medium text-ink-gray-9">
                  {{ goal.bono_name }}
                </p>
                <span class="num shrink-0 text-sm text-ink-gray-8">{{
                  progressText(goal)
                }}</span>
              </div>
              <span
                class="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
                ><span
                  class="block h-full rounded-full bg-surface-gray-7"
                  :style="{ width: progressWidth(goal) }"
              /></span>
              <p class="mt-1 text-xs text-ink-gray-6">
                {{
                  !goal.reached
                    ? missingText(goal)
                    : goal.people === 1
                      ? __('Reached: {0} for one person', [money(goal.amount)])
                      : __('Reached: {0} for each of {1} people', [
                          money(goal.amount),
                          goal.people,
                        ])
                }}
              </p>
            </li>
          </ul>

          <p class="mb-2 text-sm text-ink-gray-7">
            {{ __('Total for the period') }}:
            <span
              class="num font-semibold text-ink-gray-9"
              data-testid="bonos-total"
              >{{ money(answer.total) }}</span
            >
          </p>
          <p
            v-if="!answer.people.length"
            class="py-6 text-sm text-ink-gray-6"
            data-testid="bonos-nobody"
          >
            {{ __('Nobody has work that counts in this period yet.') }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            data-list="bonos-people"
          >
            <li
              v-for="person in answer.people"
              :key="person.key"
              :data-person="person.key"
            >
              <button
                type="button"
                class="press flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
                :aria-expanded="open === person.key"
                @click="open = open === person.key ? null : person.key"
              >
                <span class="min-w-0">
                  <span class="block font-medium text-ink-gray-9">{{
                    person.name
                  }}</span>
                  <span
                    v-if="person.designation"
                    class="block text-xs text-ink-gray-6"
                    >{{ person.designation }}</span
                  >
                  <span
                    v-for="bono in person.bonos"
                    :key="bono.rule"
                    class="block text-xs"
                    :class="bono.paid ? 'text-ink-gray-8' : 'text-ink-gray-5'"
                    >{{ bonoLine(bono) }}</span
                  >
                  <span
                    v-if="!person.employee"
                    class="block text-xs text-ink-amber-8"
                    >{{
                      __('No record in Equipo: payroll cannot pay it yet.')
                    }}</span
                  >
                </span>
                <span
                  class="num shrink-0 text-lg font-semibold"
                  :class="
                    person.amount > 0 ? 'text-ink-gray-9' : 'text-ink-gray-5'
                  "
                  data-testid="bonos-amount"
                  >{{ money(person.amount) }}</span
                >
              </button>
              <div
                v-if="open === person.key"
                class="border-t border-outline-gray-1 px-3 pb-3"
              >
                <section
                  v-for="bono in person.bonos"
                  :key="bono.rule"
                  class="pt-3"
                >
                  <p class="text-sm font-medium text-ink-gray-8">
                    {{ bono.bono_name }}
                  </p>
                  <p v-if="!bono.lines" class="text-xs text-ink-gray-6">
                    {{ __('Measured with the whole team’s work.') }}
                  </p>
                  <p
                    v-else-if="!bono.lines.length"
                    class="text-xs text-ink-gray-6"
                  >
                    {{ __('Nothing in this period yet.') }}
                  </p>
                  <ul
                    v-else
                    class="mt-1 divide-y divide-outline-gray-1 text-sm"
                  >
                    <li
                      v-for="line in bono.lines"
                      :key="line.name"
                      class="flex items-center justify-between gap-2 py-2"
                    >
                      <a :href="line.url || undefined" class="min-w-0">
                        <span class="block truncate text-ink-gray-9">{{
                          line.label
                        }}</span>
                        <span class="block text-xs text-ink-gray-6"
                          >{{ line.name }},
                          {{ dayLabel(line.date.slice(0, 10)) }},
                          {{ money(line.amount) }}</span
                        >
                      </a>
                      <span
                        v-if="line.counts"
                        class="shrink-0 text-xs font-semibold text-ink-green-8"
                        >{{ __('Counts') }}</span
                      >
                      <span
                        v-else
                        class="shrink-0 text-right text-xs text-ink-gray-6"
                        >{{ line.reason }}</span
                      >
                    </li>
                  </ul>
                </section>
              </div>
            </li>
          </ul>
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
  dayLabel,
  equipoApi,
  periodRange,
  problemOf,
} from '@/composables/useEquipo'
import {
  BONOS,
  bonosPeriodFromQuery,
  bonosPeriodQuery,
  missingText,
  progressText,
  progressWidth,
} from '@/composables/useBonos'
import { money } from '@/utils/numberFormat'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideSlidersHorizontal from '~icons/lucide/sliders-horizontal'

const route = useRoute()
const router = useRouter()
const answer = ref(null)
const failure = ref(null)
const open = ref(null)

const wanted = computed(() => bonosPeriodFromQuery(route.query))
const periodOptions = computed(() =>
  (
    answer.value?.periods || [
      { value: 'week', label: __('Week') },
      { value: 'fortnight', label: __('Fortnight') },
      { value: 'month', label: __('Month') },
    ]
  ).map((p) => ({ value: p.value, label: p.label })),
)

function bonoLine(bono) {
  const missing = missingText(bono)
  const tail = bono.paid
    ? money(bono.amount)
    : missing || (bono.amount ? __('the other bonus pays more') : money(0))
  return `${bono.bono_name}: ${progressText(bono)}, ${tail}`
}

function go(period, start) {
  router.replace({ query: bonosPeriodQuery(period, start) })
}

let asked = 0
async function load() {
  const ticket = ++asked
  failure.value = null
  try {
    const next = await equipoApi(`${BONOS}.get_period`, {
      period: wanted.value.period,
      start: wanted.value.start,
    })
    if (ticket === asked) answer.value = next
  } catch (error) {
    if (ticket === asked) failure.value = problemOf(error)
  }
}

watch(wanted, load, { immediate: true, deep: true })
</script>
