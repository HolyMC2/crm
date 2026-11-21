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
          {{ __('Goals', null, 'Equipo') }}
        </h1>
        <div v-if="answer?.can_edit" class="flex flex-wrap gap-2">
          <Button
            :icon-left="LucideSparkles"
            :label="__('Suggested goals')"
            class="min-h-11 sm:min-h-8"
            data-testid="metas-sugeridas"
            @click="suggestOpen = true"
          />
          <Button
            variant="solid"
            :icon-left="LucidePlus"
            :label="__('Add a goal')"
            class="min-h-11 sm:min-h-8"
            data-testid="metas-agregar"
            @click="edit(null)"
          />
        </div>
      </div>
      <p class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'How far each person is from the shop’s goals, and their score from 0 to 100. Each person sees their own in Hoy.',
          )
        }}
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="w-full sm:w-80">
          <Segmented
            :label="__('Goal period')"
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
            data-testid="metas-range"
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
        <p
          v-if="answer.unavailable?.length"
          role="status"
          class="mb-3 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{
            __('{0}: this system can no longer measure it.', [
              answer.unavailable.join(', '),
            ])
          }}
        </p>

        <div
          v-if="!answer.goals.length"
          class="rounded-6 border border-outline-gray-2 p-4 text-sm"
          data-testid="metas-empty"
        >
          <p class="font-medium text-ink-gray-9">
            {{ __('There are no goals for this period yet.') }}
          </p>
          <p class="mt-1 text-ink-gray-6">
            {{
              answer.can_edit
                ? __(
                    'A goal measures sales, replies on WhatsApp, deals, repairs or tasks on time, for each person or the whole team. Start with the suggested ones: they come from your shop’s own numbers.',
                  )
                : __('The owner sets the goals.')
            }}
          </p>
          <div v-if="answer.can_edit" class="mt-3 flex flex-wrap gap-2">
            <Button
              variant="solid"
              class="min-h-11 sm:min-h-8"
              :label="__('See suggested goals')"
              @click="suggestOpen = true"
            />
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Add a goal')"
              @click="edit(null)"
            />
          </div>
        </div>

        <template v-else>
          <section v-if="answer.team.length" class="mb-5">
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('Team goals') }}
            </h2>
            <ul class="grid gap-2" data-list="metas-team">
              <li
                v-for="line in answer.team"
                :key="line.name"
                class="rounded-6 border border-outline-gray-2 p-3"
                :data-team="line.name"
              >
                <div class="flex items-baseline justify-between gap-3">
                  <p class="min-w-0 font-medium text-ink-gray-9">
                    {{ line.label }}
                  </p>
                  <span class="num shrink-0 text-sm text-ink-gray-8">{{
                    lineText(line)
                  }}</span>
                </div>
                <span
                  class="mt-2 block h-2 overflow-hidden rounded-full bg-surface-gray-2"
                  ><span
                    class="block h-full rounded-full"
                    :class="barClass(line)"
                    :style="{ width: barWidth(line) }"
                /></span>
              </li>
            </ul>
          </section>

          <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
            {{ __('Each person') }}
          </h2>
          <p
            v-if="!answer.people.length"
            class="py-6 text-sm text-ink-gray-6"
            data-testid="metas-nobody"
          >
            {{ __('Nobody has data for these goals in this period yet.') }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            data-list="metas-people"
          >
            <li
              v-for="person in answer.people"
              :key="person.key"
              :data-person="person.key"
            >
              <button
                type="button"
                class="press flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                :aria-expanded="open === person.key"
                @click="open = open === person.key ? null : person.key"
              >
                <span class="min-w-0">
                  <span class="block font-medium text-ink-gray-9">{{
                    person.name
                  }}</span>
                  <span class="block text-xs text-ink-gray-6">{{
                    [person.designation, metText(person)]
                      .filter(Boolean)
                      .join(' · ')
                  }}</span>
                </span>
                <span
                  class="num shrink-0 rounded-full px-3 py-1 text-base font-semibold"
                  :class="scoreClass(person.color)"
                  :aria-label="__('Score')"
                  data-testid="metas-score"
                  >{{ person.score ?? '—' }}</span
                >
              </button>
              <ul
                v-if="open === person.key"
                class="space-y-3 border-t border-outline-gray-1 px-3 pb-3 pt-3"
              >
                <li
                  v-for="line in person.goals"
                  :key="line.goal"
                  :data-goal="line.goal"
                >
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="min-w-0 text-sm font-medium text-ink-gray-8">
                      {{ line.label }}
                    </p>
                    <span class="num shrink-0 text-sm text-ink-gray-8">{{
                      lineText(line)
                    }}</span>
                  </div>
                  <span
                    class="mt-1 block h-2 overflow-hidden rounded-full bg-surface-gray-2"
                    ><span
                      class="block h-full rounded-full"
                      :class="barClass(line)"
                      :style="{ width: barWidth(line) }"
                  /></span>
                  <p v-if="line.detail" class="mt-1 text-xs text-ink-gray-6">
                    {{ line.detail }}
                  </p>
                </li>
              </ul>
            </li>
          </ul>

          <section v-if="answer.can_edit" class="mt-6">
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('The goals of this period') }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              data-list="metas-goals"
            >
              <li v-for="goal in answer.goals" :key="goal.name">
                <button
                  type="button"
                  class="press flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                  :data-edit="goal.name"
                  @click="edit(goal)"
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-ink-gray-9">{{
                      goal.label
                    }}</span>
                    <span class="block text-xs text-ink-gray-6">{{
                      goalLine(goal)
                    }}</span>
                  </span>
                  <LucidePencil class="h-4 w-4 shrink-0 text-ink-gray-6" />
                </button>
              </li>
            </ul>
          </section>
        </template>
        <!-- Facts to coach with, goal or no goal (doco.metas.acompanar). -->
        <PorPersona :period="wanted.period" :start="wanted.start || null" />
      </template>
    </div>

    <GoalSheet
      v-if="editing"
      :goal="editing.goal"
      :catalog="catalog"
      @close="editing = null"
      @saved="saved"
    />
    <SuggestedSheet
      v-if="suggestOpen"
      @close="suggestOpen = false"
      @saved="saved"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { Segmented } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { equipoApi, periodRange, problemOf } from '@/composables/useEquipo'
import {
  METAS,
  OWN,
  barClass,
  barWidth,
  lineText,
  metText,
  periodFromQuery,
  periodLabel,
  periodQuery,
  scoreClass,
} from '@/composables/useMetas'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucidePencil from '~icons/lucide/pencil'
import LucidePlus from '~icons/lucide/plus'
import LucideSparkles from '~icons/lucide/sparkles'

const GoalSheet = defineAsyncComponent(
  () => import('@/components/metas/GoalSheet.vue'),
)
const SuggestedSheet = defineAsyncComponent(
  () => import('@/components/metas/SuggestedSheet.vue'),
)
// «Datos por persona» reads on its own, under the goals.
const PorPersona = defineAsyncComponent(
  () => import('@/components/metas/PorPersona.vue'),
)

const route = useRoute()
const router = useRouter()
const answer = ref(null)
const failure = ref(null)
const open = ref(null)
const editing = ref(null)
const suggestOpen = ref(false)
const catalog = ref(null)

const wanted = computed(() => periodFromQuery(route.query))
const periodOptions = computed(() =>
  (
    answer.value?.periods || [
      { value: 'week', label: __('Week') },
      { value: 'fortnight', label: __('Fortnight') },
      { value: 'month', label: __('Month') },
    ]
  ).map((p) => ({ value: p.value, label: p.label })),
)

function goalLine(goal) {
  const who =
    goal.scope === OWN
      ? goal.puestos?.length
        ? goal.puestos.join(', ')
        : __('Each person')
      : __('The whole team')
  return [
    `${goal.better === 'lower' ? '≤' : '≥'} ${goal.target_text}`,
    periodLabel(goal.period),
    who,
    goal.weight > 1 ? __('weight {0}', [goal.weight]) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function go(period, start) {
  router.replace({ query: periodQuery(period, start) })
}

async function edit(goal) {
  try {
    catalog.value = catalog.value || (await equipoApi(`${METAS}.list_goals`))
    editing.value = { goal }
  } catch (error) {
    toast.error(problemOf(error).detail || __('Could not open the goal.'))
  }
}

function saved() {
  editing.value = null
  suggestOpen.value = false
  catalog.value = null
  load()
}

let asked = 0
async function load() {
  const ticket = ++asked
  failure.value = null
  try {
    const next = await equipoApi(`${METAS}.get_period`, {
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
